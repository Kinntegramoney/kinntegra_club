"""
CAS PDF Analysis Service
Parses Consolidated Account Statement PDFs and generates Gap Sheet reports
"""
import fitz  # PyMuPDF
import re
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional, Tuple
from collections import defaultdict
import io
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
import logging
from scipy.optimize import brentq
import zipfile

logger = logging.getLogger(__name__)

MFAPI_BASE_URL = "https://api.mfapi.in"


def calculate_xirr(cashflows: List[Tuple[datetime, float]], guess: float = 0.1) -> float:
    """
    Calculate XIRR (Extended Internal Rate of Return)
    cashflows: List of (date, amount) tuples. Negative = outflow, Positive = inflow
    Returns annual rate as decimal (e.g., 0.12 for 12%)
    """
    if not cashflows or len(cashflows) < 2:
        return 0.0
    
    # Sort by date
    cashflows = sorted(cashflows, key=lambda x: x[0])
    
    # Check if there's at least one positive and one negative
    has_positive = any(cf[1] > 0 for cf in cashflows)
    has_negative = any(cf[1] < 0 for cf in cashflows)
    if not (has_positive and has_negative):
        return 0.0
    
    dates = [cf[0] for cf in cashflows]
    amounts = [cf[1] for cf in cashflows]
    
    # Base date for day count
    base_date = dates[0]
    
    def npv(rate):
        """Net Present Value at given rate"""
        total = 0.0
        for i, (date, amount) in enumerate(cashflows):
            days = (date - base_date).days
            if rate == -1:
                return float('inf')
            total += amount / ((1 + rate) ** (days / 365.0))
        return total
    
    try:
        # Find rate where NPV = 0
        rate = brentq(npv, -0.99, 10.0, maxiter=1000)
        return rate
    except (ValueError, RuntimeError):
        return 0.0


class CASParser:
    """Parser for Consolidated Account Statement PDFs"""
    
    def __init__(self, pdf_bytes: bytes, password: str):
        self.pdf_bytes = pdf_bytes
        self.password = password
        self.transactions = []
        self.folios = {}
        self.portfolio_summary = {}
        self.investor_info = {}
        self.nft_entries = []  # Non-Financial Transactions
        self.report_date = None
        
    def parse(self) -> Dict:
        """Parse the CAS PDF and extract all transaction data"""
        try:
            doc = fitz.open(stream=self.pdf_bytes, filetype="pdf")
            
            if doc.is_encrypted:
                if not doc.authenticate(self.password):
                    raise ValueError("Invalid PDF password")
            
            full_text = ""
            for page_num in range(doc.page_count):
                page = doc[page_num]
                full_text += page.get_text() + "\n"
            
            doc.close()
            
            # Parse the extracted text
            self._parse_investor_info(full_text)
            self._parse_report_date(full_text)
            self._parse_portfolio_summary(full_text)
            self._parse_folios_and_transactions(full_text)
            self._parse_nft(full_text)
            
            return {
                "investor_info": self.investor_info,
                "portfolio_summary": self.portfolio_summary,
                "folios": self.folios,
                "transactions": self.transactions,
                "nft_entries": self.nft_entries,
                "report_date": self.report_date,
                "total_transactions": len(self.transactions)
            }
            
        except Exception as e:
            logger.error(f"Error parsing CAS PDF: {e}")
            raise
    
    def _parse_investor_info(self, text: str):
        """Extract investor information"""
        name_match = re.search(r'Dear\s+([A-Za-z\s]+),', text)
        if name_match:
            self.investor_info['name'] = name_match.group(1).strip()
        
        email_match = re.search(r'Email Id:\s*([^\s]+@[^\s]+)', text)
        if email_match:
            self.investor_info['email'] = email_match.group(1).strip()
        
        mobile_match = re.search(r'Mobile:\s*(\d+)', text)
        if mobile_match:
            self.investor_info['mobile'] = mobile_match.group(1)
        
        pan_match = re.search(r'PAN:\s*([A-Z]{5}\d{4}[A-Z])', text)
        if pan_match:
            self.investor_info['pan'] = pan_match.group(1)
        
        # Extract address
        addr_match = re.search(r'Address:\s*([^\n]+)', text)
        if addr_match:
            self.investor_info['address'] = addr_match.group(1).strip()
    
    def _parse_report_date(self, text: str):
        """Extract report date from PDF"""
        # Look for "NAV on DD-MMM-YYYY" or "Market Value on DD-MMM-YYYY"
        date_match = re.search(r'(?:NAV on|Market Value on|as on)\s*(\d{2}-[A-Za-z]{3}-\d{4})', text)
        if date_match:
            try:
                self.report_date = datetime.strptime(date_match.group(1), '%d-%b-%Y')
            except ValueError:
                self.report_date = datetime.now()
        else:
            self.report_date = datetime.now()
    
    def _parse_portfolio_summary(self, text: str):
        """Extract portfolio summary from the first page"""
        lines = text.split('\n')
        in_summary = False
        i = 0
        
        while i < len(lines):
            line = lines[i].strip()
            
            if 'PORTFOLIO SUMMARY' in line:
                in_summary = True
                i += 1
                continue
            
            if in_summary:
                if line.startswith('Total') and i + 2 < len(lines):
                    try:
                        cost_line = lines[i + 1].strip().replace(',', '')
                        value_line = lines[i + 2].strip().replace(',', '')
                        self.portfolio_summary['total_cost'] = float(cost_line)
                        self.portfolio_summary['total_value'] = float(value_line)
                    except (ValueError, IndexError):
                        pass
                    break
                
                if 'Mutual Fund' in line or 'MF' in line:
                    amc_name = line.strip()
                    if i + 2 < len(lines):
                        try:
                            cost = float(lines[i + 1].strip().replace(',', ''))
                            value = float(lines[i + 2].strip().replace(',', ''))
                            if cost > 0 or value > 0:
                                self.portfolio_summary[amc_name] = {'cost': cost, 'value': value}
                            i += 2
                        except (ValueError, IndexError):
                            pass
            i += 1
    
    def _parse_nft(self, text: str):
        """Parse Non-Financial Transactions"""
        nft_markers = ['***Change of', '***Updation of', '***Registration', '***Nomination', 
                       '***Address Update', '***Bank', '***Email', '***Mobile']
        
        lines = text.split('\n')
        current_folio = None
        current_scheme = None
        
        for i, line in enumerate(lines):
            # Track current folio
            folio_match = re.search(r'Folio No:\s*([\d\s/]+)', line)
            if folio_match:
                current_folio = folio_match.group(1).strip()
            
            # Track current scheme
            isin_match = re.search(r'ISIN:\s*([A-Z0-9]{12})', line)
            if isin_match:
                scheme_match = re.match(r'^([A-Z0-9]+)-(.+?)\s*-\s*ISIN:', line)
                if scheme_match:
                    current_scheme = scheme_match.group(2).strip()
            
            # Check for NFT markers
            stripped = line.strip()
            for marker in nft_markers:
                if marker in stripped:
                    # Get date if available (previous line or same line)
                    date_str = None
                    if i > 0:
                        prev_line = lines[i-1].strip()
                        date_match = re.match(r'^(\d{2}-[A-Za-z]{3}-\d{4})$', prev_line)
                        if date_match:
                            date_str = date_match.group(1)
                    
                    self.nft_entries.append({
                        'date': date_str,
                        'folio': current_folio,
                        'scheme': current_scheme,
                        'description': stripped.replace('***', '').strip()
                    })
                    break
    
    def _parse_folios_and_transactions(self, text: str):
        """Extract folio and transaction details"""
        lines = text.split('\n')
        
        current_pan = None
        current_folio = None
        current_scheme = None
        current_scheme_full = None
        current_isin = None
        current_amc = None
        current_advisor = None
        current_key = None
        pending_scheme_line = None
        first_trans_date = {}  # Track first transaction date per advisor
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # Detect AMC header
            if re.match(r'^[A-Z0-9].*Mutual Fund$', line) or ('Mutual Fund' in line and len(line) < 50):
                current_amc = line.strip()
            
            # Detect PAN
            pan_match = re.search(r'PAN:\s*([A-Z]{5}\d{4}[A-Z])', line)
            if pan_match:
                current_pan = pan_match.group(1)
            
            # Check for scheme line (may span multiple lines)
            # Scheme codes are typically 4+ alphanumeric characters ending in letters
            # Skip PDF headers like "CAMSCASWS-101225161136" and date patterns
            scheme_code_match = re.match(r'^([A-Z0-9]{4,})-(.+)', line)
            if scheme_code_match and 'ISIN' not in line and '-Demat' not in line:
                first_part = scheme_code_match.group(1)
                rest_part = scheme_code_match.group(2)
                # Exclude:
                # 1. Date patterns like "Jan-2000", "Nov-2025"
                # 2. PDF headers like "CAMSCASWS-101225161136 Version"
                # 3. Lines that don't look like fund names (should contain "Fund" or similar keywords)
                is_date_pattern = re.match(r'^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$', first_part, re.IGNORECASE)
                is_pdf_header = 'Version' in rest_part or 'CAMSCASWS' in first_part
                has_fund_keywords = any(kw in rest_part for kw in ['Fund', 'Plan', 'Growth', 'IDCW', 'Dividend'])
                
                if not is_date_pattern and not is_pdf_header and has_fund_keywords:
                    pending_scheme_line = line
            
            # Detect ISIN
            isin_match = re.search(r'ISIN:\s*([A-Z0-9]{12})', line)
            if isin_match:
                current_isin = isin_match.group(1)
                
                advisor_match = re.search(r'\(Advisor:\s*([A-Z0-9\-]+)\)', line)
                if advisor_match:
                    current_advisor = advisor_match.group(1)
                
                full_line = line
                if pending_scheme_line and 'ISIN' not in pending_scheme_line:
                    full_line = pending_scheme_line + ' ' + line
                
                # Extract scheme name - everything between scheme code and " - ISIN:"
                scheme_match = re.match(r'^([A-Z0-9]+)-(.+?)\s*-\s*ISIN:', full_line)
                if scheme_match:
                    scheme_code = scheme_match.group(1)
                    scheme_name = scheme_match.group(2).strip()
                    # Keep the full scheme name including (Non-Demat) and (formerly...) 
                    # Only remove trailing " - Reinvest" patterns if present
                    scheme_name = re.sub(r'\s*-\s*Reinvest.*$', '', scheme_name)
                    current_scheme_full = f"{scheme_code}-{scheme_name}"
                    current_scheme = scheme_name
                
                pending_scheme_line = None
            
            # Detect Folio No
            folio_match = re.search(r'Folio No:\s*([\d\s/]+)', line)
            if folio_match:
                current_folio = folio_match.group(1).strip()
                
                if current_isin:
                    current_key = f"{current_folio}_{current_isin}"
                else:
                    current_key = current_folio
                
                if current_key and current_key not in self.folios:
                    self.folios[current_key] = {
                        'folio': current_folio,
                        'scheme': current_scheme,
                        'scheme_code': current_scheme_full,
                        'isin': current_isin,
                        'pan': current_pan,
                        'amc': current_amc,
                        'advisor': current_advisor,
                        'transactions': [],
                        'closing_balance': 0,
                        'cost_value': 0,
                        'current_nav': 0,
                        'market_value': 0,
                        'opening_balance': 0
                    }
            
            # Detect opening balance
            if 'Opening Unit Balance:' in line:
                balance_match = re.search(r'Opening Unit Balance:\s*([\d,]+\.\d+)', line)
                if balance_match and current_key and current_key in self.folios:
                    self.folios[current_key]['opening_balance'] = float(balance_match.group(1).replace(',', ''))
            
            # Detect closing balance
            if 'Closing Unit Balance:' in line:
                balance_match = re.search(r'Closing Unit Balance:\s*([\d,]+\.\d+)', line)
                if balance_match and current_key and current_key in self.folios:
                    self.folios[current_key]['closing_balance'] = float(balance_match.group(1).replace(',', ''))
            
            # Detect cost value
            if 'Total Cost Value:' in line:
                cost_match = re.search(r'Total Cost Value:\s*([\d,]+\.\d+)', line)
                if cost_match and current_key and current_key in self.folios:
                    self.folios[current_key]['cost_value'] = float(cost_match.group(1).replace(',', ''))
            
            # Detect current NAV
            if 'NAV on' in line:
                nav_match = re.search(r'NAV on [^:]+:\s*INR\s*([\d.]+)', line)
                if nav_match and current_key and current_key in self.folios:
                    self.folios[current_key]['current_nav'] = float(nav_match.group(1))
            
            # Detect Market Value
            if 'Market Value on' in line:
                mv_match = re.search(r'Market Value on [^:]+:\s*INR\s*([\d,]+\.\d+)', line)
                if mv_match and current_key and current_key in self.folios:
                    self.folios[current_key]['market_value'] = float(mv_match.group(1).replace(',', ''))
            
            # Detect Exit Load structure
            if 'Exit Load' in line or 'Entry Load' in line or 'Load Structure' in line:
                # Capture the full exit load text
                exit_load_text = line
                # Sometimes exit load info spans multiple lines
                j = i + 1
                while j < len(lines) and j < i + 5:
                    next_line = lines[j].strip()
                    if next_line and not re.match(r'^\d{2}-[A-Za-z]{3}-\d{4}', next_line) and 'Unit Balance' not in next_line:
                        # Check if this is continuation of exit load info
                        if any(x in next_line.lower() for x in ['load', 'redemption', 'switch', 'allotment', 'nil', '%']):
                            exit_load_text += ' ' + next_line
                            j += 1
                        else:
                            break
                    else:
                        break
                
                if current_key and current_key in self.folios:
                    # Clean up the exit load text
                    exit_load_text = exit_load_text.replace('\n', ' ').strip()
                    self.folios[current_key]['exit_load'] = exit_load_text
            
            # Detect transaction lines
            trans_match = re.match(r'^(\d{2}-[A-Za-z]{3}-\d{4})\s*$', line)
            if trans_match and current_key:
                date_str = trans_match.group(1)
                
                if i + 4 < len(lines):
                    try:
                        amount_str = lines[i + 1].strip()
                        nav_str = lines[i + 2].strip()
                        units_str = lines[i + 3].strip()
                        trans_type_line = lines[i + 4].strip()
                        
                        # Check if this is a Stamp Duty transaction (special format)
                        # These have: Date, Amount, *** Stamp Duty ***
                        if '*** Stamp Duty ***' in nav_str:
                            # Parse the amount and add as investment cost
                            try:
                                stamp_amount = float(amount_str.replace(',', '').replace('(', '-').replace(')', ''))
                                if stamp_amount > 0:
                                    transaction = {
                                        'date': date_str,
                                        'amount': abs(stamp_amount),
                                        'nav': 0,
                                        'units': 0,
                                        'transaction_type': 'Stamp Duty',
                                        'balance': 0,
                                        'folio': current_folio,
                                        'scheme': current_scheme,
                                        'isin': current_isin,
                                        'pan': current_pan,
                                        'amc': current_amc,
                                        'advisor': current_advisor,
                                        'is_redemption': False  # Stamp duty is always an investment cost
                                    }
                                    self.transactions.append(transaction)
                                    if current_key in self.folios:
                                        self.folios[current_key]['transactions'].append(transaction)
                            except ValueError:
                                pass
                            i += 1
                            continue
                        
                        # STT Paid transactions - add them as investment costs
                        # STT appears as a cost associated with transactions
                        if '*** STT Paid ***' in nav_str:
                            try:
                                stt_amount = float(amount_str.replace(',', '').replace('(', '-').replace(')', ''))
                                if abs(stt_amount) > 0:  # Accept both positive and negative
                                    transaction = {
                                        'date': date_str,
                                        'amount': abs(stt_amount),
                                        'nav': 0,
                                        'units': 0,
                                        'transaction_type': 'STT Paid',
                                        'balance': 0,
                                        'folio': current_folio,
                                        'scheme': current_scheme,
                                        'isin': current_isin,
                                        'pan': current_pan,
                                        'amc': current_amc,
                                        'advisor': current_advisor,
                                        'is_redemption': False  # STT goes to Amount Invested
                                    }
                                    self.transactions.append(transaction)
                                    if current_key in self.folios:
                                        self.folios[current_key]['transactions'].append(transaction)
                            except ValueError:
                                pass
                            i += 1
                            continue
                        
                        # Handle Non-Financial Transactions (NFTs) like KYC updates, Nominee registration
                        # These have format: Date, ***Description***, next date, etc.
                        # Some NFTs span multiple lines: ***Description on amount_str and closing *** on nav_str
                        if '***' in amount_str:
                            # First try single line format: ***Description***
                            nft_match = re.search(r'\*\*\*(.+?)\*\*\*', amount_str)
                            if nft_match:
                                nft_type = nft_match.group(1).strip()
                            else:
                                # Multi-line format: ***Description on amount_str, closing *** on nav_str
                                # Combine amount_str and nav_str
                                combined = amount_str + nav_str
                                nft_match = re.search(r'\*\*\*(.+?)\*\*\*', combined)
                                if nft_match:
                                    nft_type = nft_match.group(1).strip()
                                else:
                                    # Fallback: extract text between *** markers
                                    nft_type = amount_str.replace('***', '').strip()
                            
                            transaction = {
                                'date': date_str,
                                'amount': 0,
                                'nav': 0,
                                'units': 0,
                                'transaction_type': nft_type,
                                'balance': 0,
                                'folio': current_folio,
                                'scheme': current_scheme,
                                'isin': current_isin,
                                'pan': current_pan,
                                'amc': current_amc,
                                'advisor': current_advisor,
                                'is_redemption': False,
                                'is_nft': True  # Mark as non-financial transaction
                            }
                            self.transactions.append(transaction)
                            if current_key in self.folios:
                                self.folios[current_key]['transactions'].append(transaction)
                            i += 1
                            continue
                        
                        # Handle Pledge/Unpledge transactions
                        # These have format: Date, "Pledged..." or "Unpledge...", units, next date
                        if amount_str.startswith('Pledged') or amount_str.startswith('Unpledge'):
                            pledge_type = 'Pledge' if amount_str.startswith('Pledged') else 'Unpledge'
                            # Try to extract units from nav_str (which contains the units for pledge)
                            try:
                                pledge_units = float(nav_str.replace(',', ''))
                            except ValueError:
                                pledge_units = 0
                            
                            transaction = {
                                'date': date_str,
                                'amount': 0,
                                'nav': 0,
                                'units': pledge_units,
                                'transaction_type': pledge_type,
                                'balance': pledge_units,
                                'folio': current_folio,
                                'scheme': current_scheme,
                                'isin': current_isin,
                                'pan': current_pan,
                                'amc': current_amc,
                                'advisor': current_advisor,
                                'is_redemption': False,
                                'is_pledge': True  # Mark as pledge transaction
                            }
                            self.transactions.append(transaction)
                            if current_key in self.folios:
                                self.folios[current_key]['transactions'].append(transaction)
                            i += 1
                            continue
                        
                        amount_str = amount_str.replace('(', '-').replace(')', '').replace(',', '')
                        units_str = units_str.replace('(', '-').replace(')', '').replace(',', '')
                        
                        try:
                            amount = float(amount_str)
                        except ValueError:
                            i += 1
                            continue
                        
                        try:
                            nav = float(nav_str.replace(',', ''))
                        except ValueError:
                            nav = 0
                        
                        try:
                            units = float(units_str)
                        except ValueError:
                            units = 0
                        
                        if 'STT Paid' in trans_type_line or amount == 0:
                            i += 1
                            continue
                        
                        # Note: Rejection transactions are handled like redemptions
                        # They represent reversals of failed SIPs
                        
                        trans_type = trans_type_line.split('-')[0].strip() if '-' in trans_type_line else trans_type_line
                        
                        balance = 0
                        if i + 5 < len(lines):
                            balance_line = lines[i + 5].strip().replace(',', '')
                            try:
                                balance = float(balance_line)
                            except ValueError:
                                pass
                        
                        is_redemption = amount < 0 or 'Redemption' in trans_type_line or 'Rejection' in trans_type_line or 'Switch Over Out' in trans_type_line or 'Lateral Shift Out' in trans_type_line
                        
                        # Track first transaction date per advisor
                        if current_advisor:
                            try:
                                trans_date = datetime.strptime(date_str, '%d-%b-%Y')
                                if current_advisor not in first_trans_date or trans_date < first_trans_date[current_advisor]:
                                    first_trans_date[current_advisor] = trans_date
                            except ValueError:
                                pass
                        
                        transaction = {
                            'date': date_str,
                            'amount': abs(amount),
                            'nav': nav,
                            'units': abs(units),
                            'transaction_type': trans_type,
                            'balance': balance,
                            'folio': current_folio,
                            'scheme': current_scheme,
                            'isin': current_isin,
                            'pan': current_pan,
                            'amc': current_amc,
                            'advisor': current_advisor,
                            'is_redemption': is_redemption
                        }
                        
                        self.transactions.append(transaction)
                        
                        if current_key and current_key in self.folios:
                            self.folios[current_key]['transactions'].append(transaction)
                        
                    except Exception:
                        pass
            
            i += 1
        
        # Store first transaction dates
        self.advisor_first_trans = first_trans_date


class NAVService:
    """Service to fetch NAV data"""
    
    @staticmethod
    def get_latest_nav(scheme_code: str) -> Optional[Dict]:
        try:
            response = requests.get(f"{MFAPI_BASE_URL}/mf/{scheme_code}/latest", timeout=10)
            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            logger.error(f"Error fetching NAV for {scheme_code}: {e}")
            return None


class SchemeMapper:
    """Maps ISIN/scheme names to MF API scheme codes"""
    
    def __init__(self, scheme_master_data: List[Dict]):
        self.scheme_master = scheme_master_data
        self._build_index()
    
    def _build_index(self):
        self.isin_index = {}
        self.name_index = {}
        
        for scheme in self.scheme_master:
            if scheme.get('isin'):
                self.isin_index[scheme['isin']] = scheme
            if scheme.get('scheme_name'):
                normalized = scheme['scheme_name'].lower().replace(' ', '').replace('-', '')
                self.name_index[normalized] = scheme
    
    def get_scheme_code(self, isin: str = None, scheme_name: str = None) -> Optional[str]:
        if isin and isin in self.isin_index:
            return self.isin_index[isin].get('scheme_code')
        if scheme_name:
            normalized = scheme_name.lower().replace(' ', '').replace('-', '')
            if normalized in self.name_index:
                return self.name_index[normalized].get('scheme_code')
        return None


class GapSheetGenerator:
    """Generates Gap Sheet Excel reports"""
    
    # Advisor name mapping
    ADVISOR_NAMES = {
        'ARN-145633': 'KINNTEGRAWEALTHPRIVATELIMITED',
        'ARN-104917': 'HUMFAUJIFINANCIALSERVICESPVTLTD',
    }
    
    def __init__(self, parsed_data: Dict, nav_service: NAVService = None, scheme_mapper: SchemeMapper = None):
        self.parsed_data = parsed_data
        self.nav_service = nav_service or NAVService()
        self.scheme_mapper = scheme_mapper
        self.current_navs = {}
        self.report_date = parsed_data.get('report_date') or datetime.now()
        
        # Styling
        self.header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        self.header_font = Font(color="FFFFFF", bold=True, size=10)
        self.data_font = Font(size=10)
        self.thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
    
    def _style_header(self, ws, row, num_cols):
        for col in range(1, num_cols + 1):
            cell = ws.cell(row=row, column=col)
            cell.fill = self.header_fill
            cell.font = self.header_font
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = self.thin_border
    
    def _auto_width(self, ws, min_width=10, max_width=40):
        for col in ws.columns:
            max_length = 0
            column = None
            for cell in col:
                # Skip merged cells
                if hasattr(cell, 'column_letter'):
                    if column is None:
                        column = cell.column_letter
                    try:
                        if cell.value:
                            max_length = max(max_length, len(str(cell.value)))
                    except:
                        pass
            if column:
                adjusted_width = min(max(max_length + 2, min_width), max_width)
                ws.column_dimensions[column].width = adjusted_width
    
    def _get_advisor_name(self, arn: str) -> str:
        if not arn:
            return 'KINNTEGRAWEALTHPRIVATELIMITED'
        return self.ADVISOR_NAMES.get(arn, arn)
    
    def _get_advisor_longevity(self, arn: str) -> str:
        """Calculate how long advisor has been servicing"""
        advisor_first_trans = getattr(self.parsed_data.get('_parser', {}), 'advisor_first_trans', {})
        if not advisor_first_trans:
            # Try to calculate from transactions
            first_date = None
            for trans in self.parsed_data.get('transactions', []):
                if trans.get('advisor') == arn:
                    try:
                        trans_date = datetime.strptime(trans['date'], '%d-%b-%Y')
                        if first_date is None or trans_date < first_date:
                            first_date = trans_date
                    except ValueError:
                        pass
            if first_date:
                advisor_first_trans = {arn: first_date}
        
        if arn in advisor_first_trans:
            first_date = advisor_first_trans[arn]
            days = (self.report_date - first_date).days
            years = days // 365
            months = (days % 365) // 30
            if years > 0:
                return f"{years} years {months} months"
            else:
                return f"{months} months"
        return "N/A"
    
    def generate(self) -> bytes:
        """Generate the Gap Sheet Excel file with all sheets"""
        wb = Workbook()
        
        # Sheet order:
        # 1. Summary (NEW)
        # 2. Portfolio Performance
        # 3. MF Transactions
        # 4. NFT
        # 5. Advisor View
        # 6. Tax View
        # 7. Exit Load
        # 8. XIRR
        self._create_summary_sheet(wb)
        self._create_portfolio_performance_sheet(wb)
        self._create_mf_transactions_sheet(wb)
        self._create_nft_sheet(wb)
        self._create_advisor_view_sheet(wb)
        self._create_tax_view_sheet(wb)
        self._create_exit_loads_sheet(wb)
        self._create_xirr_sheet(wb)
        
        if 'Sheet' in wb.sheetnames:
            del wb['Sheet']
        
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output.getvalue()
    
    def generate_all_reports(self) -> bytes:
        """Generate all reports as a ZIP file containing:
        - Main consolidated report
        - Separate files by PAN
        """
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # 1. Main consolidated report
            main_report = self.generate()
            zip_file.writestr("GapSheet_Consolidated.xlsx", main_report)
            
            # 2. Generate reports by PAN
            pan_reports = self._generate_by_pan()
            for pan, report_bytes in pan_reports.items():
                safe_pan = pan.replace('/', '_').replace(' ', '')
                zip_file.writestr(f"By_PAN/GapSheet_{safe_pan}.xlsx", report_bytes)
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()
    
    def _generate_by_pan(self) -> Dict[str, bytes]:
        """Generate separate reports for each PAN"""
        # Group folios by PAN
        pan_folios = defaultdict(dict)
        pan_transactions = defaultdict(list)
        
        for key, folio in self.parsed_data.get('folios', {}).items():
            pan = folio.get('pan', 'UNKNOWN')
            pan_folios[pan][key] = folio
        
        for trans in self.parsed_data.get('transactions', []):
            pan = trans.get('pan', 'UNKNOWN')
            pan_transactions[pan].append(trans)
        
        results = {}
        for pan in pan_folios.keys():
            subset_data = {
                'investor_info': self.parsed_data.get('investor_info', {}),
                'portfolio_summary': self.parsed_data.get('portfolio_summary', {}),
                'folios': pan_folios[pan],
                'transactions': pan_transactions[pan],
                'nft_entries': [n for n in self.parsed_data.get('nft_entries', []) if n.get('pan') == pan],
                'report_date': self.parsed_data.get('report_date'),
                'total_transactions': len(pan_transactions[pan])
            }
            
            generator = GapSheetGenerator(subset_data, self.nav_service, self.scheme_mapper)
            results[pan] = generator.generate()
        
        return results
    
    def _create_portfolio_performance_sheet(self, wb: Workbook):
        """Sheet 2: Portfolio Performance"""
        ws = wb.create_sheet("Portfolio Performance")
        
        # Column order as per user's template:
        # Folio No., Instrument Name, Valuation, Cash Withdrawal, Dividend Paid, 
        # Amount Invested, Absolute Gains, Absolute Return %, CAGR %, Closing Units, PAN, Adviser ARN
        headers = [
            "Folio No.", "Instrument Name", "Valuation", "Cash Withdrawal",
            "Dividend Paid", "Amount Invested", "Absolute Gains", "Absolute Return %", 
            "CAGR %", "Closing Units", "PAN", "Adviser ARN"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        all_entries = []
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            closing_balance = folio_data.get('closing_balance', 0)
            cost_value = folio_data.get('cost_value', 0)
            market_value = folio_data.get('market_value', 0)
            
            transactions = folio_data.get('transactions', [])
            # Always use sum of transactions for invested/withdrawn (as per Gap Sheet)
            # Handle rejections: when a SIP is rejected, both the original SIP and rejection should be excluded
            
            # Find rejection transactions
            rejections = {}
            for t in transactions:
                if 'Rejection' in t.get('transaction_type', ''):
                    key = (t['date'], t['amount'])
                    rejections[key] = rejections.get(key, 0) + 1
            
            # Filter out rejection transactions and their corresponding original SIPs
            valid_trans = []
            used_rejections = {}
            for t in transactions:
                ttype = t.get('transaction_type', '')
                if 'Rejection' in ttype:
                    continue  # Skip rejection entries
                
                # Check if there's a matching rejection for this transaction
                key = (t['date'], t['amount'])
                if key in rejections:
                    # Check if we've already matched this rejection
                    matched = used_rejections.get(key, 0)
                    if matched < rejections[key]:
                        used_rejections[key] = matched + 1
                        continue  # Skip this transaction as it has a matching rejection
                
                valid_trans.append(t)
            
            invested = sum(t['amount'] for t in valid_trans if not t.get('is_redemption', False))
            withdrawn = sum(t['amount'] for t in valid_trans if t.get('is_redemption', False))
            
            # Calculate Absolute Gains and Return
            # For open positions: gains = valuation - (invested - withdrawn)
            # For closed positions: gains = withdrawn - invested
            if closing_balance > 0 and market_value > 0:
                gains = market_value - (invested - withdrawn) if invested > 0 else 0
            else:
                gains = withdrawn - invested
            
            # Absolute Return % = Absolute Gains / Amount Invested * 100
            return_pct = (gains / invested * 100) if invested > 0 else 0
            
            # Calculate CAGR using XIRR (proper method for multiple cash flows)
            cagr = 0
            if valid_trans:
                # Prepare cash flows for XIRR
                # Investments are negative (outflows), redemptions/valuation are positive (inflows)
                cashflows = []
                for t in valid_trans:
                    try:
                        t_date = datetime.strptime(t['date'], '%d-%b-%Y')
                        amount = t['amount']
                        # Skip Stamp Duty and STT for CAGR calculation (they're costs, not investments)
                        if t.get('transaction_type') in ['Stamp Duty', 'STT Paid']:
                            continue
                        if t.get('is_redemption'):
                            cashflows.append((t_date, amount))  # Positive for redemptions
                        else:
                            cashflows.append((t_date, -amount))  # Negative for investments
                    except:
                        pass
                
                # Add current valuation as final positive cash flow (if position is open)
                if market_value > 0:
                    cashflows.append((self.report_date, market_value))
                
                # Calculate XIRR
                if cashflows:
                    xirr_rate = calculate_xirr(cashflows)
                    cagr = xirr_rate * 100  # Convert to percentage
            
            scheme_name = folio_data.get('scheme', '') or ''
            advisor_arn = folio_data.get('advisor', '')  # Raw ARN from PDF
            
            entry = {
                'folio': folio_data.get('folio', folio_id),
                'scheme': scheme_name,
                'invested': invested,
                'withdrawn': withdrawn,
                'dividend': 0,  # Dividend tracking not in CAS
                'valuation': market_value,
                'gains': gains,
                'return_pct': return_pct,
                'cagr': cagr,
                'closing_units': closing_balance,
                'pan': folio_data.get('pan', ''),
                'advisor_arn': advisor_arn
            }
            
            all_entries.append(entry)
        
        # Sort by Valuation (highest first)
        all_entries.sort(key=lambda x: x['valuation'], reverse=True)
        
        # Write data rows - new column order matching template
        row = 2
        for entry in all_entries:
            ws.cell(row=row, column=1, value=entry['folio'])
            ws.cell(row=row, column=2, value=entry['scheme'])
            
            # Valuation (Column 3)
            cell = ws.cell(row=row, column=3, value=round(entry['valuation'], 2))
            cell.number_format = '₹#,##0.00'
            
            # Cash Withdrawal (Column 4)
            cell = ws.cell(row=row, column=4, value=round(entry['withdrawn'], 2))
            cell.number_format = '₹#,##0.00'
            
            # Dividend Paid (Column 5)
            cell = ws.cell(row=row, column=5, value=round(entry['dividend'], 2))
            cell.number_format = '₹#,##0.00'
            
            # Amount Invested (Column 6)
            cell = ws.cell(row=row, column=6, value=round(entry['invested'], 2))
            cell.number_format = '₹#,##0.00'
            
            # Absolute Gains (Column 7)
            cell = ws.cell(row=row, column=7, value=round(entry['gains'], 2))
            cell.number_format = '₹#,##0.00'
            
            # Absolute Return % (Column 8)
            cell = ws.cell(row=row, column=8, value=round(entry['return_pct'], 2))
            cell.number_format = '0.00"%"'
            
            # CAGR % (Column 9)
            cell = ws.cell(row=row, column=9, value=round(entry['cagr'], 4))
            cell.number_format = '0.0000"%"'
            
            # Closing Units (Column 10)
            cell = ws.cell(row=row, column=10, value=round(entry['closing_units'], 3))
            cell.number_format = '#,##0.000'
            
            # PAN (Column 11)
            ws.cell(row=row, column=11, value=entry['pan'])
            
            # Adviser ARN (Column 12)
            ws.cell(row=row, column=12, value=entry['advisor_arn'])
            row += 1
        
        self._auto_width(ws)
    
    def _create_tax_view_sheet(self, wb: Workbook):
        """Sheet 5: Tax View - Matching template format with FY-wise LT/ST breakdown"""
        ws = wb.create_sheet("Tax View")
        
        # Headers matching the template - added PAN
        headers = [
            "PAN", "Folio Number", "Instrument Name", "Financial Year", "SchemeType",
            "Active LT Units", "Active LT (Gain/Loss)",
            "Active ST Units", "Active ST (Gain/Loss)",
            "Sold LT Units", "Sold LT (Gain/Loss)",
            "Sold ST Units", "Sold ST (Gain/Loss)",
            "NAV 31JAN2018", "Grandfathering Triggered"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        # Grandfathering cutoff date: January 31, 2018
        GRANDFATHER_DATE = datetime(2018, 1, 31)
        
        def get_financial_year(date):
            """Get Indian financial year (April to March) for a given date"""
            if date.month >= 4:  # April onwards
                return f"{date.year} - {date.year + 1}"
            else:  # January to March
                return f"{date.year - 1} - {date.year}"
        
        def get_fund_type(scheme_name):
            """Determine fund type based on scheme name"""
            scheme_lower = scheme_name.lower() if scheme_name else ''
            if any(x in scheme_lower for x in ['liquid', 'money market', 'overnight']):
                return 'LIQUID'
            elif any(x in scheme_lower for x in ['debt', 'bond', 'gilt', 'income', 'credit risk', 'dynamic bond', 'corporate bond']):
                return 'DEBT'
            elif any(x in scheme_lower for x in ['arbitrage']):
                return 'ARBITRAGE'
            elif any(x in scheme_lower for x in ['hybrid', 'balanced', 'aggressive', 'conservative', 'dynamic asset']):
                return 'HYBRID'
            else:
                return 'EQUITY'
        
        def is_long_term(fund_type, holding_days, trans_date):
            """Determine if investment qualifies as Long Term"""
            if fund_type in ['EQUITY', 'ARBITRAGE', 'HYBRID']:
                return holding_days > 365
            else:  # Debt, Liquid
                if trans_date < datetime(2023, 4, 1):
                    return holding_days > 1095  # 3 years
                else:
                    return False
        
        # Aggregate data by folio + FY
        tax_data = {}
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            scheme_name = folio_data.get('scheme', '') or ''
            fund_type = get_fund_type(scheme_name)
            current_nav = folio_data.get('current_nav', 0)
            closing_balance = folio_data.get('closing_balance', 0)
            folio_num = folio_data.get('folio', folio_id)
            
            transactions = folio_data.get('transactions', [])
            
            # Get PAN from first transaction, fallback to investor_info
            pan = ''
            for trans in transactions:
                if trans.get('pan'):
                    pan = trans.get('pan')
                    break
            if not pan:
                pan = self.parsed_data.get('investor_info', {}).get('pan', '')
            
            # Find last redemption date
            last_redemption_date = None
            if closing_balance <= 0:
                for trans in transactions:
                    if trans.get('is_redemption'):
                        try:
                            redemption_date = datetime.strptime(trans['date'], '%d-%b-%Y')
                            if last_redemption_date is None or redemption_date > last_redemption_date:
                                last_redemption_date = redemption_date
                        except:
                            pass
            
            for trans in transactions:
                if trans.get('is_redemption') or trans.get('is_nft') or trans.get('is_pledge'):
                    continue
                if trans.get('transaction_type') in ['STT Paid', 'Stamp Duty']:
                    continue
                
                try:
                    trans_date = datetime.strptime(trans['date'], '%d-%b-%Y')
                    
                    # Calculate holding period
                    if closing_balance <= 0 and last_redemption_date:
                        holding_days = (last_redemption_date - trans_date).days
                    else:
                        holding_days = (self.report_date - trans_date).days
                    
                    units = trans.get('units', 0)
                    if units <= 0:
                        continue
                    
                    purchase_nav = trans.get('nav', 0)
                    purchase_value = units * purchase_nav if purchase_nav else trans.get('amount', 0)
                    current_value = units * current_nav if (current_nav and closing_balance > 0) else 0
                    gain_loss = current_value - purchase_value if closing_balance > 0 else 0
                    
                    # Check grandfathering
                    gf_triggered = "NO"
                    nav_31jan2018 = "N.A"
                    
                    if trans_date < GRANDFATHER_DATE and fund_type in ['EQUITY', 'HYBRID', 'ARBITRAGE']:
                        gf_triggered = "YES" if (current_nav and purchase_nav and current_nav > purchase_nav) else "NO : No gain to grandfather"
                        if current_nav and purchase_nav and current_nav > purchase_nav:
                            gf_nav = purchase_nav + (current_nav - purchase_nav) * 0.3
                            nav_31jan2018 = round(gf_nav, 4)
                            gf_value = units * gf_nav
                            gain_loss = current_value - gf_value
                    else:
                        gf_triggered = "NO : Date of Purchase after 31-Jan-2018"
                    
                    # Get FY
                    fy = get_financial_year(trans_date)
                    
                    # Determine LT/ST
                    lt_status = is_long_term(fund_type, holding_days, trans_date)
                    
                    # Create key for aggregation - include PAN
                    key = (pan, folio_num, scheme_name[:50], fy, fund_type)
                    
                    if key not in tax_data:
                        tax_data[key] = {
                            'pan': pan,
                            'folio': folio_num,
                            'scheme': scheme_name[:50],
                            'fy': fy,
                            'fund_type': fund_type,
                            'active_lt_units': 0, 'active_lt_gain': 0,
                            'active_st_units': 0, 'active_st_gain': 0,
                            'sold_lt_units': 0, 'sold_lt_gain': 0,
                            'sold_st_units': 0, 'sold_st_gain': 0,
                            'nav_31jan2018': nav_31jan2018,
                            'gf_triggered': gf_triggered
                        }
                    
                    if closing_balance > 0:  # Active
                        if lt_status:
                            tax_data[key]['active_lt_units'] += units
                            tax_data[key]['active_lt_gain'] += gain_loss
                        else:
                            tax_data[key]['active_st_units'] += units
                            tax_data[key]['active_st_gain'] += gain_loss
                    else:  # Sold
                        if lt_status:
                            tax_data[key]['sold_lt_units'] += units
                            tax_data[key]['sold_lt_gain'] += gain_loss
                        else:
                            tax_data[key]['sold_st_units'] += units
                            tax_data[key]['sold_st_gain'] += gain_loss
                
                except:
                    pass
        
        # Sort by FY and write data
        def get_fy_sort_key(fy_str):
            try:
                return int(fy_str.split(' - ')[0])
            except:
                return 9999
        
        sorted_data = sorted(tax_data.values(), key=lambda x: (get_fy_sort_key(x['fy']), x['scheme']))
        
        row = 2
        for data in sorted_data:
            ws.cell(row=row, column=1, value=data['pan'])
            ws.cell(row=row, column=2, value=data['folio'])
            ws.cell(row=row, column=3, value=data['scheme'])
            ws.cell(row=row, column=4, value=data['fy'])
            ws.cell(row=row, column=5, value=data['fund_type'])
            ws.cell(row=row, column=6, value=round(data['active_lt_units'], 3) if data['active_lt_units'] else '')
            ws.cell(row=row, column=7, value=round(data['active_lt_gain'], 2) if data['active_lt_gain'] else '')
            ws.cell(row=row, column=8, value=round(data['active_st_units'], 3) if data['active_st_units'] else '')
            ws.cell(row=row, column=9, value=round(data['active_st_gain'], 2) if data['active_st_gain'] else '')
            ws.cell(row=row, column=10, value=round(data['sold_lt_units'], 3) if data['sold_lt_units'] else '')
            ws.cell(row=row, column=11, value=round(data['sold_lt_gain'], 2) if data['sold_lt_gain'] else '')
            ws.cell(row=row, column=12, value=round(data['sold_st_units'], 3) if data['sold_st_units'] else '')
            ws.cell(row=row, column=13, value=round(data['sold_st_gain'], 2) if data['sold_st_gain'] else '')
            ws.cell(row=row, column=14, value=data['nav_31jan2018'])
            ws.cell(row=row, column=15, value=data['gf_triggered'])
            row += 1
        
        self._auto_width(ws)
    
    def _create_advisor_view_sheet(self, wb: Workbook):
        """Sheet 3: Advisor View with XIRR Performance and Longevity"""
        ws = wb.create_sheet("Advisor View")
        
        headers = [
            "Adviser ARN", "Adviser Name", "Total AUM", "Amount Invested", "Cash Withdrawal",
            "Absolute Gains", "XIRR %", "Active Folios", "Closed Folios",
            "First Transaction", "Last Transaction", "Active Longevity", "Past Longevity", 
            "Total Longevity", "Status"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        # Group data by advisor
        advisor_data = defaultdict(lambda: {
            'invested': 0, 'withdrawn': 0, 'valuation': 0,
            'first_date': None, 'last_date': None,
            'last_active_date': None,  # Last transaction date for active folios
            'cashflows': [],  # For XIRR calculation
            'active_folios': 0, 'closed_folios': 0,
            'folios': []
        })
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            arn = folio_data.get('advisor', '') or 'NO_ARN'
            transactions = folio_data.get('transactions', [])
            closing_balance = folio_data.get('closing_balance', 0)
            market_value = folio_data.get('market_value', 0)
            
            # Filter out rejections for calculations
            rejections = {}
            for t in transactions:
                if 'Rejection' in t.get('transaction_type', ''):
                    key = (t['date'], t['amount'])
                    rejections[key] = rejections.get(key, 0) + 1
            
            valid_trans = []
            used_rejections = {}
            for t in transactions:
                if 'Rejection' in t.get('transaction_type', ''):
                    continue
                key = (t['date'], t['amount'])
                if key in rejections:
                    matched = used_rejections.get(key, 0)
                    if matched < rejections[key]:
                        used_rejections[key] = matched + 1
                        continue
                valid_trans.append(t)
            
            invested = sum(t['amount'] for t in valid_trans if not t.get('is_redemption', False))
            withdrawn = sum(t['amount'] for t in valid_trans if t.get('is_redemption', False))
            
            advisor_data[arn]['invested'] += invested
            advisor_data[arn]['withdrawn'] += withdrawn
            advisor_data[arn]['valuation'] += market_value
            
            # Track active vs closed folios
            if closing_balance > 0 and market_value > 0:
                advisor_data[arn]['active_folios'] += 1
            else:
                advisor_data[arn]['closed_folios'] += 1
            
            # Track transaction dates and build cashflows for XIRR
            for trans in valid_trans:
                try:
                    trans_date = datetime.strptime(trans['date'], '%d-%b-%Y')
                    amount = trans['amount']
                    
                    # Track first/last dates
                    if advisor_data[arn]['first_date'] is None or trans_date < advisor_data[arn]['first_date']:
                        advisor_data[arn]['first_date'] = trans_date
                    if advisor_data[arn]['last_date'] is None or trans_date > advisor_data[arn]['last_date']:
                        advisor_data[arn]['last_date'] = trans_date
                    
                    # Track last active date (for active folios)
                    if closing_balance > 0:
                        if advisor_data[arn]['last_active_date'] is None or trans_date > advisor_data[arn]['last_active_date']:
                            advisor_data[arn]['last_active_date'] = trans_date
                    
                    # Skip Stamp Duty/STT for XIRR
                    if trans.get('transaction_type') in ['Stamp Duty', 'STT Paid']:
                        continue
                    
                    # Add to cashflows for XIRR
                    if trans.get('is_redemption'):
                        advisor_data[arn]['cashflows'].append((trans_date, amount))
                    else:
                        advisor_data[arn]['cashflows'].append((trans_date, -amount))
                except ValueError:
                    pass
            
            # Add current valuation to cashflows if position is active
            if market_value > 0:
                advisor_data[arn]['cashflows'].append((self.report_date, market_value))
        
        row = 2
        for arn, data in sorted(advisor_data.items()):
            total_aum = data['valuation']
            gains = total_aum - (data['invested'] - data['withdrawn'])
            
            # Calculate XIRR
            xirr_pct = 0
            if data['cashflows']:
                xirr_rate = calculate_xirr(data['cashflows'])
                xirr_pct = xirr_rate * 100
            
            # Determine status
            if data['active_folios'] > 0:
                status = "Active"
            else:
                status = "Exited"  # All positions closed
            
            # Calculate longevity
            first_date_str = data['first_date'].strftime('%d-%b-%Y') if data['first_date'] else 'N/A'
            last_date_str = data['last_date'].strftime('%d-%b-%Y') if data['last_date'] else 'N/A'
            
            # Active Longevity: Time from first transaction to report date (if still active)
            active_longevity = "N/A"
            if status == "Active" and data['first_date']:
                days = (self.report_date - data['first_date']).days
                years = days // 365
                months = (days % 365) // 30
                active_longevity = f"{years}y {months}m" if years > 0 else f"{months}m"
            
            # Past Longevity: For exited clients, time from first to last transaction
            past_longevity = "N/A"
            if status == "Exited" and data['first_date'] and data['last_date']:
                days = (data['last_date'] - data['first_date']).days
                years = days // 365
                months = (days % 365) // 30
                past_longevity = f"{years}y {months}m" if years > 0 else f"{months}m"
            
            # Total Longevity: Full history
            total_longevity = "N/A"
            if data['first_date']:
                end_date = self.report_date if status == "Active" else data['last_date']
                if end_date:
                    days = (end_date - data['first_date']).days
                    years = days // 365
                    months = (days % 365) // 30
                    total_longevity = f"{years}y {months}m" if years > 0 else f"{months}m"
            
            # Write row with formatting
            ws.cell(row=row, column=1, value=arn)
            ws.cell(row=row, column=2, value=self._get_advisor_name(arn))
            
            cell = ws.cell(row=row, column=3, value=round(total_aum, 2))
            cell.number_format = '₹#,##0.00'
            
            cell = ws.cell(row=row, column=4, value=round(data['invested'], 2))
            cell.number_format = '₹#,##0.00'
            
            cell = ws.cell(row=row, column=5, value=round(data['withdrawn'], 2))
            cell.number_format = '₹#,##0.00'
            
            cell = ws.cell(row=row, column=6, value=round(gains, 2))
            cell.number_format = '₹#,##0.00'
            
            cell = ws.cell(row=row, column=7, value=round(xirr_pct, 4))
            cell.number_format = '0.0000"%"'
            
            ws.cell(row=row, column=8, value=data['active_folios'])
            ws.cell(row=row, column=9, value=data['closed_folios'])
            ws.cell(row=row, column=10, value=first_date_str)
            ws.cell(row=row, column=11, value=last_date_str)
            ws.cell(row=row, column=12, value=active_longevity)
            ws.cell(row=row, column=13, value=past_longevity)
            ws.cell(row=row, column=14, value=total_longevity)
            ws.cell(row=row, column=15, value=status)
            row += 1
        
        self._auto_width(ws)
    
    def _create_pan_view_sheet(self, wb: Workbook):
        """Sheet 4: PAN View"""
        ws = wb.create_sheet("PAN View")
        
        headers = [
            "Group Name", "PAN", "Advisor", "Asset Class", "From Date", "To Date",
            "Amount Invested", "Cash Withdrawal", "Dividend Paid", "Valuation",
            "Absolute Gains", "Absolute Return %", "CAGR %", "3 Yr %", "Remarks"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        # Group by PAN and asset class
        pan_data = defaultdict(lambda: defaultdict(lambda: {'invested': 0, 'withdrawn': 0, 'valuation': 0}))
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            pan = folio_data.get('pan', 'UNKNOWN')
            scheme_name = folio_data.get('scheme', '') or ''
            asset_class = 'EQUITY'
            if any(x in scheme_name.lower() for x in ['liquid', 'debt', 'bond']):
                asset_class = 'DEBT'
            
            transactions = folio_data.get('transactions', [])
            invested = sum(t['amount'] for t in transactions if not t.get('is_redemption', False))
            withdrawn = sum(t['amount'] for t in transactions if t.get('is_redemption', False))
            valuation = folio_data.get('market_value', 0)
            
            pan_data[pan][asset_class]['invested'] += invested
            pan_data[pan][asset_class]['withdrawn'] += withdrawn
            pan_data[pan][asset_class]['valuation'] += valuation
        
        row = 2
        
        # Grand Total
        total_invested = sum(sum(ac['invested'] for ac in pan.values()) for pan in pan_data.values())
        total_withdrawn = sum(sum(ac['withdrawn'] for ac in pan.values()) for pan in pan_data.values())
        total_valuation = sum(sum(ac['valuation'] for ac in pan.values()) for pan in pan_data.values())
        total_gains = total_valuation - (total_invested - total_withdrawn)
        total_return = (total_gains / (total_invested - total_withdrawn) * 100) if (total_invested - total_withdrawn) > 0 else 0
        
        ws.cell(row=row, column=1, value="GRAND TOTAL")
        ws.cell(row=row, column=7, value=round(total_invested, 2))
        ws.cell(row=row, column=8, value=round(total_withdrawn, 2))
        ws.cell(row=row, column=10, value=round(total_valuation, 2))
        ws.cell(row=row, column=11, value=round(total_gains, 2))
        ws.cell(row=row, column=12, value=round(total_return, 4))
        row += 1
        
        for pan, asset_classes in pan_data.items():
            pan_invested = sum(ac['invested'] for ac in asset_classes.values())
            pan_withdrawn = sum(ac['withdrawn'] for ac in asset_classes.values())
            pan_valuation = sum(ac['valuation'] for ac in asset_classes.values())
            pan_gains = pan_valuation - (pan_invested - pan_withdrawn)
            pan_return = (pan_gains / (pan_invested - pan_withdrawn) * 100) if (pan_invested - pan_withdrawn) > 0 else 0
            
            ws.cell(row=row, column=1, value="SUB TOTAL")
            ws.cell(row=row, column=2, value=pan)
            ws.cell(row=row, column=7, value=round(pan_invested, 2))
            ws.cell(row=row, column=8, value=round(pan_withdrawn, 2))
            ws.cell(row=row, column=10, value=round(pan_valuation, 2))
            ws.cell(row=row, column=11, value=round(pan_gains, 2))
            ws.cell(row=row, column=12, value=round(pan_return, 4))
            row += 1
            
            for asset_class, data in asset_classes.items():
                gains = data['valuation'] - (data['invested'] - data['withdrawn'])
                return_pct = (gains / (data['invested'] - data['withdrawn']) * 100) if (data['invested'] - data['withdrawn']) > 0 else 0
                
                ws.cell(row=row, column=2, value=pan)
                ws.cell(row=row, column=4, value=asset_class)
                ws.cell(row=row, column=7, value=round(data['invested'], 2))
                ws.cell(row=row, column=8, value=round(data['withdrawn'], 2))
                ws.cell(row=row, column=10, value=round(data['valuation'], 2))
                ws.cell(row=row, column=11, value=round(gains, 2))
                ws.cell(row=row, column=12, value=round(return_pct, 4))
                row += 1
        
        self._auto_width(ws)
    
    def _create_mf_ageing_sheet(self, wb: Workbook):
        """Sheet 5: MF Ageing"""
        ws = wb.create_sheet("MF Ageing")
        
        headers = [
            "Folio Number", "SchemeId", "ISIN", "Date Of Purchase", "Scheme Name",
            "Transaction Details", "Purchase Price", "Purchase Units", "Units Unsold",
            "Date Of Sale", "Sale Price", "Units Sold", "Units Squared", "Age of Units",
            "SchemeType", "Category", "Type", "NAV 31JAN2018", "Gain(Loss)",
            "Grandfathering Triggered", "Financial Year", "ExitLoadApplicable",
            "ExitLoad %", "ExitLoadvalue", "DaystoUnlocking"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        row = 2
        for trans in self.parsed_data.get('transactions', []):
            if trans.get('is_redemption'):
                continue
            
            try:
                purchase_date = datetime.strptime(trans.get('date', ''), '%d-%b-%Y')
                age_days = (self.report_date - purchase_date).days
                category = 'LONGTERM' if age_days > 365 else 'SHORTTERM'
            except:
                age_days = 0
                category = 'SHORTTERM'
            
            scheme_name = trans.get('scheme', '') or ''
            scheme_type = 'EQUITY'
            if any(x in scheme_name.lower() for x in ['liquid', 'debt', 'bond']):
                scheme_type = 'LIQUID' if 'liquid' in scheme_name.lower() else 'DEBT'
            
            ws.cell(row=row, column=1, value=trans.get('folio', ''))
            ws.cell(row=row, column=3, value=trans.get('isin', ''))
            ws.cell(row=row, column=4, value=trans.get('date', ''))
            ws.cell(row=row, column=5, value=scheme_name[:50])
            ws.cell(row=row, column=6, value=trans.get('transaction_type', ''))
            ws.cell(row=row, column=7, value=trans.get('nav', 0))
            ws.cell(row=row, column=8, value=trans.get('units', 0))
            ws.cell(row=row, column=14, value=age_days)
            ws.cell(row=row, column=15, value=scheme_type)
            ws.cell(row=row, column=16, value=category)
            ws.cell(row=row, column=17, value='ACTIVE')
            ws.cell(row=row, column=21, value='2025 - 2026')
            row += 1
        
        self._auto_width(ws)
    
    def _create_mutual_fund_holding_sheet(self, wb: Workbook):
        """Sheet 6: Mutual Fund Holding"""
        ws = wb.create_sheet("Mutual Fund Holding")
        
        headers = [
            "Group Name", "Service Provider Name", "Fund Name", "Account Identifier Type",
            "Account Identifier", "Scheme ID", "Symbol", "ISIN", "Instrument Name",
            "Instrument Type", "Local Currency", "Opening Units Date", "Opening Units",
            "Closing Units", "NAV", "Valuation", "Date", "Amount Invested",
            "Amount WithDrawn", "Face Value / Avg Cost Price", "Dividend Paid",
            "Dividend Reinvested", "Unrealized Gains", "Absolute Return %", "CAGR %"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        row = 2
        investor_name = self.parsed_data.get('investor_info', {}).get('name', '')
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            closing_balance = folio_data.get('closing_balance', 0)
            if closing_balance <= 0:
                continue
            
            transactions = folio_data.get('transactions', [])
            invested = sum(t['amount'] for t in transactions if not t.get('is_redemption', False))
            
            ws.cell(row=row, column=1, value=investor_name)
            ws.cell(row=row, column=2, value=folio_data.get('amc', ''))
            ws.cell(row=row, column=4, value="Folio Number")
            ws.cell(row=row, column=5, value=folio_data.get('folio', folio_id))
            ws.cell(row=row, column=8, value=folio_data.get('isin', ''))
            ws.cell(row=row, column=9, value=folio_data.get('scheme', '')[:50])
            ws.cell(row=row, column=10, value="Mutual Fund")
            ws.cell(row=row, column=13, value=folio_data.get('opening_balance', 0))
            ws.cell(row=row, column=14, value=closing_balance)
            ws.cell(row=row, column=15, value=folio_data.get('current_nav', 0))
            ws.cell(row=row, column=16, value=folio_data.get('market_value', 0))
            ws.cell(row=row, column=17, value=self.report_date.strftime('%d-%b-%Y'))
            ws.cell(row=row, column=18, value=invested)
            row += 1
        
        self._auto_width(ws)
    
    def _create_mf_transactions_sheet(self, wb: Workbook):
        """Sheet 2: MF Transactions - aligned with template"""
        ws = wb.create_sheet("MF Transactions")
        
        # Headers matching the template image + MF Ageing
        headers = [
            "Account Identifier", "Instrument Name", "ISIN", "Transaction Date",
            "Transaction Details", "Opening Units", "Units (Debit)", "Units (Credit)",
            "Closing Units", "Price", "Transaction Amount", "STT", "Stamp Duty",
            "Total Amount", "Balance Units", "Current NAV", "Current Market Value",
            "MF Ageing", "XIRR", "Advisor ARN", "Advisor Name"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        # Build STT lookup: key = (date, folio, isin) -> STT amount
        stt_lookup = {}
        for trans in self.parsed_data.get('transactions', []):
            if trans.get('transaction_type') == 'STT Paid':
                key = (trans.get('date'), trans.get('folio'), trans.get('isin'))
                stt_lookup[key] = stt_lookup.get(key, 0) + trans.get('amount', 0)
        
        # Build Stamp Duty lookup: key = (date, folio, isin) -> Stamp Duty amount
        stamp_lookup = {}
        for trans in self.parsed_data.get('transactions', []):
            if trans.get('transaction_type') == 'Stamp Duty':
                key = (trans.get('date'), trans.get('folio'), trans.get('isin'))
                stamp_lookup[key] = stamp_lookup.get(key, 0) + trans.get('amount', 0)
        
        # Build folio data lookup for current NAV and market value
        folio_lookup = {}
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            folio_lookup[folio_id] = folio_data
        
        # Filter and sort transactions (oldest to newest)
        filtered_trans = []
        for trans in self.parsed_data.get('transactions', []):
            # Skip NFT, Pledge, STT, Stamp Duty entries
            if trans.get('is_nft') or trans.get('is_pledge'):
                continue
            if trans.get('transaction_type') in ['STT Paid', 'Stamp Duty']:
                continue
            filtered_trans.append(trans)
        
        # Sort by date (oldest to newest)
        def parse_date(date_str):
            try:
                return datetime.strptime(date_str, '%d-%b-%Y')
            except:
                return datetime.min
        
        filtered_trans.sort(key=lambda x: parse_date(x.get('date', '')))
        
        row = 2
        for trans in filtered_trans:
            folio = trans.get('folio', '')
            isin = trans.get('isin', '')
            folio_key = f"{folio}_{isin}" if isin else folio
            folio_data = folio_lookup.get(folio_key, {})
            
            # Column 1: Account Identifier (Folio)
            ws.cell(row=row, column=1, value=folio)
            # Column 2: Instrument Name (Scheme)
            ws.cell(row=row, column=2, value=trans.get('scheme', '')[:50] if trans.get('scheme') else '')
            # Column 3: ISIN
            ws.cell(row=row, column=3, value=isin)
            # Column 4: Transaction Date
            ws.cell(row=row, column=4, value=trans.get('date', ''))
            # Column 5: Transaction Details
            ws.cell(row=row, column=5, value=trans.get('transaction_type', ''))
            # Column 6: Opening Units (leave blank as per template)
            # Column 7: Units (Debit) - for redemptions
            if trans.get('is_redemption'):
                ws.cell(row=row, column=7, value=trans.get('units', 0))
            # Column 8: Units (Credit) - for purchases
            else:
                ws.cell(row=row, column=8, value=trans.get('units', 0))
            # Column 9: Closing Units (balance after transaction)
            ws.cell(row=row, column=9, value=trans.get('balance', 0))
            # Column 10: Price (NAV)
            ws.cell(row=row, column=10, value=trans.get('nav', 0))
            
            # Column 11: Transaction Amount
            trans_amount = trans.get('amount', 0)
            ws.cell(row=row, column=11, value=trans_amount)
            
            # Column 12: STT
            key = (trans.get('date'), folio, isin)
            stt_amount = stt_lookup.get(key, 0)
            if stt_amount > 0:
                ws.cell(row=row, column=12, value=stt_amount)
            
            # Column 13: Stamp Duty
            stamp_amount = stamp_lookup.get(key, 0)
            if stamp_amount > 0:
                ws.cell(row=row, column=13, value=stamp_amount)
            
            # Column 14: Total Amount
            total_amount = trans_amount + stt_amount + stamp_amount
            ws.cell(row=row, column=14, value=total_amount)
            
            # Get folio closing balance to determine if this folio has active holdings
            folio_closing_balance = folio_data.get('closing_balance', 0)
            has_balance = folio_closing_balance > 0
            
            # Column 15: Balance Units - only show if folio has current balance
            if has_balance and not trans.get('is_redemption'):
                ws.cell(row=row, column=15, value=folio_closing_balance)
            
            # Column 16: Current NAV - only show if folio has balance
            current_nav = folio_data.get('current_nav', 0)
            if has_balance and current_nav > 0:
                ws.cell(row=row, column=16, value=current_nav)
            
            # Column 17: Current Market Value - only show if folio has balance
            if has_balance and not trans.get('is_redemption') and current_nav > 0:
                market_value = folio_closing_balance * current_nav
                ws.cell(row=row, column=17, value=market_value)
            
            # Column 18: MF Ageing - absolute number of days for folios with balance
            if has_balance and not trans.get('is_redemption'):
                trans_date = parse_date(trans.get('date', ''))
                if trans_date != datetime.min:
                    days_held = (self.report_date - trans_date).days
                    ws.cell(row=row, column=18, value=days_held)
            
            # Column 19: XIRR - only calculate for folios with balance
            # XIRR uses transaction dates and report date NAV
            if has_balance and not trans.get('is_redemption'):
                # Calculate XIRR for this specific folio
                folio_cashflows = []
                for ft in folio_data.get('transactions', []):
                    if ft.get('is_nft') or ft.get('is_pledge'):
                        continue
                    if ft.get('transaction_type') in ['STT Paid', 'Stamp Duty']:
                        continue
                    try:
                        ft_date = datetime.strptime(ft['date'], '%d-%b-%Y')
                        ft_amount = ft.get('amount', 0)
                        if ft.get('is_redemption'):
                            folio_cashflows.append((ft_date, ft_amount))
                        else:
                            folio_cashflows.append((ft_date, -ft_amount))
                    except:
                        pass
                
                # Add current value as final cashflow
                if current_nav > 0 and folio_closing_balance > 0:
                    final_value = folio_closing_balance * current_nav
                    folio_cashflows.append((self.report_date, final_value))
                    
                    if len(folio_cashflows) >= 2:
                        try:
                            xirr_value = calculate_xirr(folio_cashflows) * 100
                            if -100 < xirr_value < 500:  # Reasonable XIRR range
                                ws.cell(row=row, column=19, value=f"{xirr_value:.2f}%")
                        except:
                            pass
            
            # Column 20: Advisor ARN
            ws.cell(row=row, column=20, value=trans.get('advisor', ''))
            # Column 21: Advisor Name (leave blank - not available in CAS)
            
            row += 1
        
        self._auto_width(ws)
    
    def _create_accounts_sheet(self, wb: Workbook):
        """Sheet 8: Accounts"""
        ws = wb.create_sheet("Accounts")
        
        headers = [
            "Group Name", "Identifier", "Identifier Type", "Despository / RTA",
            "Account Type", "Mode of Holding", "Tax Status", "Distributor/AMC Name"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        row = 2
        investor_name = self.parsed_data.get('investor_info', {}).get('name', '')
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            ws.cell(row=row, column=1, value=investor_name)
            ws.cell(row=row, column=2, value=folio_data.get('folio', folio_id))
            ws.cell(row=row, column=3, value="Folio Number")
            ws.cell(row=row, column=4, value="CAMS")
            ws.cell(row=row, column=8, value=folio_data.get('amc', ''))
            row += 1
        
        self._auto_width(ws)
    
    def _create_exit_loads_sheet(self, wb: Workbook):
        """Sheet 8: Exit Loads - parsed from CAS PDF"""
        ws = wb.create_sheet("Exit Loads")
        
        headers = [
            "Folio Number", "Scheme Name", "ISIN", "AMC", "Exit Load Structure"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        row = 2
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            # Only show active holdings
            if folio_data.get('closing_balance', 0) <= 0:
                continue
                
            ws.cell(row=row, column=1, value=folio_data.get('folio', folio_id))
            ws.cell(row=row, column=2, value=folio_data.get('scheme', '')[:60])
            ws.cell(row=row, column=3, value=folio_data.get('isin', ''))
            ws.cell(row=row, column=4, value=folio_data.get('amc', ''))
            
            # Use parsed exit load or provide default message
            exit_load = folio_data.get('exit_load', '')
            if not exit_load:
                exit_load = "Exit load information not found in CAS - Please refer to scheme document"
            ws.cell(row=row, column=5, value=exit_load)
            
            row += 1
        
        # Add note about exit loads
        ws.cell(row=row + 2, column=1, value="Note: Exit load information is extracted from CAS PDF. For latest exit load structure, please refer to the scheme information document or AMC website.")
        ws.merge_cells(f'A{row+2}:E{row+2}')
        
        self._auto_width(ws)
    
    def _create_xirr_sheet(self, wb: Workbook):
        """Sheet 9: XIRR - Calculate XIRR for each folio based on unit credits/debits"""
        ws = wb.create_sheet("XIRR")
        
        headers = [
            "PAN", "Folio No.", "Instrument Name", "Purchase Date", "Purchase Units",
            "Purchase NAV", "Purchase Amount", "Redemption Date", "Redemption Units",
            "Redemption NAV", "Redemption Amount", "Balance Units", "Current NAV",
            "Current Value", "XIRR %"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        all_entries = []
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            scheme_name = folio_data.get('scheme', '') or ''
            folio_num = folio_data.get('folio', folio_id)
            closing_balance = folio_data.get('closing_balance', 0)
            current_nav = folio_data.get('current_nav', 0)
            market_value = folio_data.get('market_value', 0)
            
            transactions = folio_data.get('transactions', [])
            
            # Get PAN from transactions or investor_info
            pan = ''
            for trans in transactions:
                if trans.get('pan'):
                    pan = trans.get('pan')
                    break
            if not pan:
                pan = self.parsed_data.get('investor_info', {}).get('pan', '')
            
            # Separate purchases (unit credit) and redemptions (unit debit)
            purchases = []
            redemptions = []
            cashflows = []  # For XIRR calculation
            
            for trans in transactions:
                # Skip NFT, Pledge, STT, Stamp Duty
                if trans.get('is_nft') or trans.get('is_pledge'):
                    continue
                if trans.get('transaction_type') in ['STT Paid', 'Stamp Duty']:
                    continue
                
                units = trans.get('units', 0)
                if units is None or units == 0:
                    continue
                
                try:
                    trans_date = datetime.strptime(trans['date'], '%d-%b-%Y')
                except:
                    continue
                
                nav = trans.get('nav', 0)
                amount = trans.get('amount', 0)
                
                if trans.get('is_redemption'):
                    # Unit debit = redemption (positive cashflow - money received)
                    redemptions.append({
                        'date': trans['date'],
                        'units': abs(units),
                        'nav': nav,
                        'amount': amount
                    })
                    cashflows.append((trans_date, amount))  # Positive
                else:
                    # Unit credit = purchase (negative cashflow - money spent)
                    purchases.append({
                        'date': trans['date'],
                        'units': units,
                        'nav': nav,
                        'amount': amount
                    })
                    cashflows.append((trans_date, -amount))  # Negative
            
            # Add current value as final cashflow (balance units * current NAV)
            if closing_balance > 0 and current_nav > 0:
                cashflows.append((self.report_date, closing_balance * current_nav))
            
            # Calculate XIRR
            xirr_pct = 0.0
            if cashflows and len(cashflows) >= 2:
                xirr_pct = calculate_xirr(cashflows) * 100
            
            # Aggregate purchase and redemption totals
            total_purchase_units = sum(p['units'] for p in purchases)
            total_purchase_amount = sum(p['amount'] for p in purchases)
            total_redemption_units = sum(r['units'] for r in redemptions)
            total_redemption_amount = sum(r['amount'] for r in redemptions)
            
            # Get first purchase date and last redemption date
            first_purchase_date = purchases[0]['date'] if purchases else ''
            first_purchase_nav = purchases[0]['nav'] if purchases else 0
            last_redemption_date = redemptions[-1]['date'] if redemptions else ''
            last_redemption_nav = redemptions[-1]['nav'] if redemptions else 0
            
            entry = {
                'pan': pan,
                'folio': folio_num,
                'scheme': scheme_name,
                'purchase_date': first_purchase_date,
                'purchase_units': total_purchase_units,
                'purchase_nav': first_purchase_nav,
                'purchase_amount': total_purchase_amount,
                'redemption_date': last_redemption_date,
                'redemption_units': total_redemption_units,
                'redemption_nav': last_redemption_nav,
                'redemption_amount': total_redemption_amount,
                'balance_units': closing_balance,
                'current_nav': current_nav,
                'current_value': market_value,
                'xirr': xirr_pct
            }
            
            all_entries.append(entry)
        
        # Sort by current value (highest first)
        all_entries.sort(key=lambda x: x['current_value'], reverse=True)
        
        # Write data rows
        row = 2
        for entry in all_entries:
            ws.cell(row=row, column=1, value=entry['pan'])
            ws.cell(row=row, column=2, value=entry['folio'])
            ws.cell(row=row, column=3, value=entry['scheme'])
            ws.cell(row=row, column=4, value=entry['purchase_date'])
            
            cell = ws.cell(row=row, column=5, value=round(entry['purchase_units'], 3) if entry['purchase_units'] else '')
            cell.number_format = '#,##0.000'
            
            cell = ws.cell(row=row, column=6, value=round(entry['purchase_nav'], 4) if entry['purchase_nav'] else '')
            cell.number_format = '#,##0.0000'
            
            cell = ws.cell(row=row, column=7, value=round(entry['purchase_amount'], 2) if entry['purchase_amount'] else '')
            cell.number_format = '₹#,##0.00'
            
            ws.cell(row=row, column=8, value=entry['redemption_date'] if entry['redemption_date'] else '')
            
            cell = ws.cell(row=row, column=9, value=round(entry['redemption_units'], 3) if entry['redemption_units'] else '')
            cell.number_format = '#,##0.000'
            
            cell = ws.cell(row=row, column=10, value=round(entry['redemption_nav'], 4) if entry['redemption_nav'] else '')
            cell.number_format = '#,##0.0000'
            
            cell = ws.cell(row=row, column=11, value=round(entry['redemption_amount'], 2) if entry['redemption_amount'] else '')
            cell.number_format = '₹#,##0.00'
            
            cell = ws.cell(row=row, column=12, value=round(entry['balance_units'], 3) if entry['balance_units'] else 0)
            cell.number_format = '#,##0.000'
            
            cell = ws.cell(row=row, column=13, value=round(entry['current_nav'], 4) if entry['current_nav'] else '')
            cell.number_format = '#,##0.0000'
            
            cell = ws.cell(row=row, column=14, value=round(entry['current_value'], 2) if entry['current_value'] else 0)
            cell.number_format = '₹#,##0.00'
            
            cell = ws.cell(row=row, column=15, value=f"{entry['xirr']:.2f}%" if entry['xirr'] else 'N/A')
            
            row += 1
        
        # Add summary row
        ws.cell(row=row + 2, column=1, value="XIRR Calculation Methodology:")
        ws.merge_cells(f'A{row+2}:O{row+2}')
        ws.cell(row=row + 3, column=1, value="• Unit Credit (Purchase) = Negative Cashflow (Money Spent)")
        ws.cell(row=row + 4, column=1, value="• Unit Debit (Redemption) = Positive Cashflow (Money Received)")
        ws.cell(row=row + 5, column=1, value="• Balance Units × Current NAV = Final Positive Cashflow (as of Statement Date)")
        
        self._auto_width(ws)
        """Sheet 10: Other Details"""
        ws = wb.create_sheet("Other Details")
        
        headers = [
            "Customer ID", "CasId", "Name", "Phone Number", "Email Address",
            "Address", "Document Date", "Start Date", "End Date",
            "Document Format", "Reporting Currency"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        investor_info = self.parsed_data.get('investor_info', {})
        
        ws.cell(row=2, column=3, value=investor_info.get('name', ''))
        ws.cell(row=2, column=4, value=investor_info.get('mobile', ''))
        ws.cell(row=2, column=5, value=investor_info.get('email', ''))
        ws.cell(row=2, column=6, value=investor_info.get('address', ''))
        ws.cell(row=2, column=8, value="01-Jan-2000")
        ws.cell(row=2, column=9, value=self.report_date.strftime('%d-%b-%Y'))
        ws.cell(row=2, column=10, value="CAMS")
        
        self._auto_width(ws)
    
    def _create_nft_sheet(self, wb: Workbook):
        """Sheet 3: NFT (Non-Financial Transactions) - sorted oldest to newest"""
        ws = wb.create_sheet("NFT")
        
        headers = [
            "Date", "PAN", "Folio Number", "Scheme Name", "ISIN", "Transaction Type", "Units"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        # Collect all NFT entries
        nft_list = []
        
        # Add NFT entries from transactions (is_nft=True or is_pledge=True)
        for trans in self.parsed_data.get('transactions', []):
            if trans.get('is_nft') or trans.get('is_pledge'):
                nft_list.append({
                    'date': trans.get('date', ''),
                    'pan': trans.get('pan', ''),
                    'folio': trans.get('folio', ''),
                    'scheme': trans.get('scheme', '')[:50] if trans.get('scheme') else '',
                    'isin': trans.get('isin', ''),
                    'type': trans.get('transaction_type', ''),
                    'units': trans.get('units', 0) if trans.get('units') else ''
                })
        
        # Also add original nft_entries
        for nft in self.parsed_data.get('nft_entries', []):
            nft_list.append({
                'date': nft.get('date', ''),
                'pan': '',
                'folio': nft.get('folio', ''),
                'scheme': nft.get('scheme', '')[:50] if nft.get('scheme') else '',
                'isin': '',
                'type': nft.get('description', ''),
                'units': ''
            })
        
        # Sort by date (oldest to newest)
        def parse_date(date_str):
            try:
                return datetime.strptime(date_str, '%d-%b-%Y')
            except:
                return datetime.min
        
        nft_list.sort(key=lambda x: parse_date(x.get('date', '')))
        
        # Write sorted data
        row = 2
        for nft in nft_list:
            ws.cell(row=row, column=1, value=nft['date'])
            ws.cell(row=row, column=2, value=nft['pan'])
            ws.cell(row=row, column=3, value=nft['folio'])
            ws.cell(row=row, column=4, value=nft['scheme'])
            ws.cell(row=row, column=5, value=nft['isin'])
            ws.cell(row=row, column=6, value=nft['type'])
            ws.cell(row=row, column=7, value=nft['units'])
            row += 1
        
        self._auto_width(ws)
    
    def _create_summary_sheet(self, wb: Workbook):
        """Sheet 1: Summary - Overview of portfolio with category-wise breakdown"""
        ws = wb.create_sheet("Summary", 0)  # Position 0 to make it first
        
        # Portfolio Summary Section
        ws.cell(row=1, column=1, value="PORTFOLIO SUMMARY")
        ws.merge_cells('A1:F1')
        self._style_header(ws, 1, 6)
        
        # Calculate totals
        total_invested = 0
        total_current_value = 0
        total_withdrawn = 0
        
        # Category-wise breakdown with withdrawals and cashflows for XIRR
        category_data = {
            'Large Cap': {'invested': 0, 'current': 0, 'withdrawn': 0, 'schemes': 0, 'cashflows': []},
            'Mid Cap': {'invested': 0, 'current': 0, 'withdrawn': 0, 'schemes': 0, 'cashflows': []},
            'Small Cap': {'invested': 0, 'current': 0, 'withdrawn': 0, 'schemes': 0, 'cashflows': []},
            'Flexi Cap': {'invested': 0, 'current': 0, 'withdrawn': 0, 'schemes': 0, 'cashflows': []},
            'Multi Cap': {'invested': 0, 'current': 0, 'withdrawn': 0, 'schemes': 0, 'cashflows': []},
            'ELSS': {'invested': 0, 'current': 0, 'withdrawn': 0, 'schemes': 0, 'cashflows': []},
            'Hybrid': {'invested': 0, 'current': 0, 'withdrawn': 0, 'schemes': 0, 'cashflows': []},
            'Debt': {'invested': 0, 'current': 0, 'withdrawn': 0, 'schemes': 0, 'cashflows': []},
            'Liquid': {'invested': 0, 'current': 0, 'withdrawn': 0, 'schemes': 0, 'cashflows': []},
            'Arbitrage': {'invested': 0, 'current': 0, 'withdrawn': 0, 'schemes': 0, 'cashflows': []},
            'Index Fund': {'invested': 0, 'current': 0, 'withdrawn': 0, 'schemes': 0, 'cashflows': []},
            'Sectoral/Thematic': {'invested': 0, 'current': 0, 'withdrawn': 0, 'schemes': 0, 'cashflows': []},
            'Other': {'invested': 0, 'current': 0, 'withdrawn': 0, 'schemes': 0, 'cashflows': []}
        }
        
        def classify_scheme(scheme_name):
            """Classify scheme into category based on name"""
            name_lower = scheme_name.lower() if scheme_name else ''
            
            if 'large cap' in name_lower or 'largecap' in name_lower or 'bluechip' in name_lower:
                return 'Large Cap'
            elif 'mid cap' in name_lower or 'midcap' in name_lower:
                return 'Mid Cap'
            elif 'small cap' in name_lower or 'smallcap' in name_lower:
                return 'Small Cap'
            elif 'flexi' in name_lower or 'flexicap' in name_lower:
                return 'Flexi Cap'
            elif 'multi cap' in name_lower or 'multicap' in name_lower:
                return 'Multi Cap'
            elif 'elss' in name_lower or 'tax' in name_lower:
                return 'ELSS'
            elif 'hybrid' in name_lower or 'balanced' in name_lower or 'aggressive' in name_lower or 'conservative' in name_lower:
                return 'Hybrid'
            elif 'liquid' in name_lower or 'money market' in name_lower or 'overnight' in name_lower:
                return 'Liquid'
            elif 'debt' in name_lower or 'bond' in name_lower or 'gilt' in name_lower or 'income' in name_lower or 'credit' in name_lower:
                return 'Debt'
            elif 'arbitrage' in name_lower:
                return 'Arbitrage'
            elif 'index' in name_lower or 'nifty' in name_lower or 'sensex' in name_lower or 'etf' in name_lower:
                return 'Index Fund'
            elif any(x in name_lower for x in ['pharma', 'bank', 'infra', 'technology', 'consumption', 'manufacturing', 'thematic', 'sector']):
                return 'Sectoral/Thematic'
            else:
                return 'Other'
        
        # Process folios
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            scheme_name = folio_data.get('scheme', '')
            category = classify_scheme(scheme_name)
            market_value = folio_data.get('market_value', 0)
            closing_balance = folio_data.get('closing_balance', 0)
            
            # Only include funds with active balance (units > 0) in category breakdown
            is_active_fund = closing_balance > 0 and market_value > 0
            
            if is_active_fund:
                category_data[category]['current'] += market_value
                category_data[category]['schemes'] += 1
                total_current_value += market_value
            
            # Calculate invested amount and withdrawals from transactions
            for trans in folio_data.get('transactions', []):
                if trans.get('is_nft') or trans.get('is_pledge'):
                    continue
                if trans.get('transaction_type') in ['STT Paid', 'Stamp Duty']:
                    continue
                
                amount = trans.get('amount', 0)
                trans_date = None
                try:
                    trans_date = datetime.strptime(trans['date'], '%d-%b-%Y')
                except:
                    pass
                
                if trans.get('is_redemption'):
                    total_withdrawn += amount
                    if is_active_fund:
                        category_data[category]['withdrawn'] += amount
                        # Redemption is positive cashflow (money received)
                        if trans_date:
                            category_data[category]['cashflows'].append((trans_date, amount))
                else:
                    total_invested += amount
                    if is_active_fund:
                        category_data[category]['invested'] += amount
                        # Investment is negative cashflow (money spent)
                        if trans_date:
                            category_data[category]['cashflows'].append((trans_date, -amount))
            
            # Add current value as final positive cashflow for XIRR (if active)
            if is_active_fund and market_value > 0:
                category_data[category]['cashflows'].append((self.report_date, market_value))
        
        # Summary headers
        summary_headers = ["Metric", "Value"]
        ws.cell(row=3, column=1, value="Metric")
        ws.cell(row=3, column=2, value="Value")
        self._style_header(ws, 3, 2)
        
        # Helper function to format currency with ₹ and Indian number system (lakhs, crores)
        def format_inr(amount):
            """Format amount in Indian numbering system: X,XX,XX,XXX"""
            is_negative = amount < 0
            amount = abs(amount)
            
            # Split into integer and decimal parts
            int_part = int(amount)
            dec_part = round((amount - int_part) * 100)
            
            # Format integer part in Indian system
            s = str(int_part)
            if len(s) <= 3:
                formatted = s
            else:
                # Last 3 digits
                formatted = s[-3:]
                s = s[:-3]
                # Then groups of 2
                while s:
                    formatted = s[-2:] + ',' + formatted
                    s = s[:-2]
            
            result = f"₹ {formatted}.{dec_part:02d}"
            if is_negative:
                result = f"-{result}"
            return result
        
        ws.cell(row=4, column=1, value="Total Amount Invested")
        ws.cell(row=4, column=2, value=format_inr(total_invested))
        ws.cell(row=5, column=1, value="Total Amount Withdrawn")
        ws.cell(row=5, column=2, value=format_inr(total_withdrawn))
        ws.cell(row=6, column=1, value="Current Portfolio Value")
        ws.cell(row=6, column=2, value=format_inr(total_current_value))
        ws.cell(row=7, column=1, value="Absolute Gain/Loss")
        ws.cell(row=7, column=2, value=format_inr(total_current_value + total_withdrawn - total_invested))
        
        # Category-wise breakdown section
        ws.cell(row=9, column=1, value="CATEGORY-WISE BREAKDOWN (Active Funds Only)")
        ws.merge_cells('A9:H9')
        self._style_header(ws, 9, 8)
        
        cat_headers = ["Category", "No. of Schemes", "Amount Invested", "Withdrawn/Dividend", "Current Value", "Gain/Loss", "XIRR %", "Allocation %"]
        for col, header in enumerate(cat_headers, 1):
            ws.cell(row=11, column=col, value=header)
        self._style_header(ws, 11, len(cat_headers))
        
        row = 12
        for category, data in category_data.items():
            if data['current'] > 0 or data['invested'] > 0:
                # Gain/Loss = (Current Value + Withdrawals) - Invested
                gain_loss = (data['current'] + data['withdrawn']) - data['invested']
                allocation = (data['current'] / total_current_value * 100) if total_current_value > 0 else 0
                
                # Calculate XIRR for this category
                xirr_pct = 0.0
                if data['cashflows'] and len(data['cashflows']) >= 2:
                    xirr_pct = calculate_xirr(data['cashflows']) * 100
                
                ws.cell(row=row, column=1, value=category)
                ws.cell(row=row, column=2, value=data['schemes'])
                ws.cell(row=row, column=3, value=format_inr(data['invested']))
                ws.cell(row=row, column=4, value=format_inr(data['withdrawn']))
                ws.cell(row=row, column=5, value=format_inr(data['current']))
                ws.cell(row=row, column=6, value=format_inr(gain_loss))
                ws.cell(row=row, column=7, value=f"{xirr_pct:.2f}%" if xirr_pct else "N/A")
                ws.cell(row=row, column=8, value=f"{allocation:.1f}%")
                row += 1
        
        # Asset Class Summary (Equity vs Debt vs Hybrid)
        ws.cell(row=row + 2, column=1, value="ASSET CLASS SUMMARY")
        ws.merge_cells(f'A{row+2}:F{row+2}')
        self._style_header(ws, row + 2, 6)
        
        equity_total = sum(category_data[c]['current'] for c in ['Large Cap', 'Mid Cap', 'Small Cap', 'Flexi Cap', 'Multi Cap', 'ELSS', 'Index Fund', 'Sectoral/Thematic'])
        debt_total = sum(category_data[c]['current'] for c in ['Debt', 'Liquid'])
        hybrid_total = sum(category_data[c]['current'] for c in ['Hybrid', 'Arbitrage'])
        other_total = category_data['Other']['current']
        
        asset_headers = ["Asset Class", "Current Value", "Allocation %"]
        for col, header in enumerate(asset_headers, 1):
            ws.cell(row=row + 4, column=col, value=header)
        self._style_header(ws, row + 4, len(asset_headers))
        
        asset_row = row + 5
        for asset_class, value in [('Equity', equity_total), ('Debt', debt_total), ('Hybrid', hybrid_total), ('Other', other_total)]:
            if value > 0:
                allocation = (value / total_current_value * 100) if total_current_value > 0 else 0
                ws.cell(row=asset_row, column=1, value=asset_class)
                ws.cell(row=asset_row, column=2, value=format_inr(value))
                ws.cell(row=asset_row, column=3, value=f"{allocation:.1f}%")
                asset_row += 1
        
        # FY-wise Long Term / Short Term Summary
        fy_summary_row = asset_row + 3
        ws.cell(row=fy_summary_row, column=1, value="FINANCIAL YEAR WISE LT/ST SUMMARY")
        ws.merge_cells(f'A{fy_summary_row}:H{fy_summary_row}')
        self._style_header(ws, fy_summary_row, 8)
        
        # Calculate FY-wise LT/ST breakdown
        fy_lt_st_data = {}
        
        GRANDFATHER_DATE = datetime(2018, 1, 31)
        
        def get_financial_year_for_summary(date):
            if date.month >= 4:
                return f"{date.year} - {date.year + 1}"
            else:
                return f"{date.year - 1} - {date.year}"
        
        def is_long_term(fund_type, holding_days, trans_date):
            """Determine if investment qualifies as Long Term based on fund type and holding period"""
            if fund_type in ['EQUITY', 'ARBITRAGE', 'HYBRID']:
                return holding_days > 365
            else:  # Debt, Liquid
                # Pre-April 2023 debt had 3-year rule
                if trans_date < datetime(2023, 4, 1):
                    return holding_days > 1095  # 3 years
                else:
                    return False  # Post-April 2023, no LT for debt
        
        def get_fund_type_for_summary(scheme_name):
            name_lower = scheme_name.lower() if scheme_name else ''
            if any(x in name_lower for x in ['liquid', 'money market', 'overnight']):
                return 'LIQUID'
            elif any(x in name_lower for x in ['debt', 'bond', 'gilt', 'income', 'credit']):
                return 'DEBT'
            elif 'arbitrage' in name_lower:
                return 'ARBITRAGE'
            elif any(x in name_lower for x in ['hybrid', 'balanced']):
                return 'HYBRID'
            else:
                return 'EQUITY'
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            scheme_name = folio_data.get('scheme', '') or ''
            fund_type = get_fund_type_for_summary(scheme_name)
            current_nav = folio_data.get('current_nav', 0)
            closing_balance = folio_data.get('closing_balance', 0)
            
            transactions = folio_data.get('transactions', [])
            
            # Find last redemption date for sold investments
            last_redemption_date = None
            if closing_balance <= 0:
                for trans in transactions:
                    if trans.get('is_redemption'):
                        try:
                            redemption_date = datetime.strptime(trans['date'], '%d-%b-%Y')
                            if last_redemption_date is None or redemption_date > last_redemption_date:
                                last_redemption_date = redemption_date
                        except:
                            pass
            
            for trans in transactions:
                if trans.get('is_redemption') or trans.get('is_nft') or trans.get('is_pledge'):
                    continue
                if trans.get('transaction_type') in ['STT Paid', 'Stamp Duty']:
                    continue
                
                try:
                    trans_date = datetime.strptime(trans['date'], '%d-%b-%Y')
                    
                    # Calculate holding period
                    if closing_balance <= 0 and last_redemption_date:
                        holding_days = (last_redemption_date - trans_date).days
                    else:
                        holding_days = (self.report_date - trans_date).days
                    
                    units = trans.get('units', 0)
                    if units <= 0:
                        continue
                    
                    purchase_nav = trans.get('nav', 0)
                    purchase_value = units * purchase_nav if purchase_nav else trans.get('amount', 0)
                    
                    # Calculate current/sale value
                    if closing_balance > 0:
                        current_value = units * current_nav if current_nav else 0
                    else:
                        # For sold, use purchase value (actual gain would need sale NAV)
                        current_value = purchase_value
                    
                    gain_loss = current_value - purchase_value
                    
                    # Apply grandfathering for pre-2018 equity
                    if trans_date < GRANDFATHER_DATE and fund_type in ['EQUITY', 'HYBRID', 'ARBITRAGE']:
                        # Grandfathering could reduce gains
                        if current_nav and purchase_nav and current_nav > purchase_nav:
                            gf_nav = purchase_nav + (current_nav - purchase_nav) * 0.3
                            gf_value = units * gf_nav
                            gain_loss = current_value - gf_value
                    
                    # Determine LT/ST
                    lt_status = is_long_term(fund_type, holding_days, trans_date)
                    
                    # Get FY of transaction
                    fy = get_financial_year_for_summary(trans_date)
                    
                    if fy not in fy_lt_st_data:
                        fy_lt_st_data[fy] = {
                            'active_lt_units': 0, 'active_lt_purchase': 0, 'active_lt_current': 0, 'active_lt_gain': 0,
                            'active_st_units': 0, 'active_st_purchase': 0, 'active_st_current': 0, 'active_st_gain': 0,
                            'sold_lt_units': 0, 'sold_lt_purchase': 0, 'sold_lt_sale': 0, 'sold_lt_gain': 0,
                            'sold_st_units': 0, 'sold_st_purchase': 0, 'sold_st_sale': 0, 'sold_st_gain': 0
                        }
                    
                    if closing_balance > 0:  # Active holding
                        if lt_status:
                            fy_lt_st_data[fy]['active_lt_units'] += units
                            fy_lt_st_data[fy]['active_lt_purchase'] += purchase_value
                            fy_lt_st_data[fy]['active_lt_current'] += current_value
                            fy_lt_st_data[fy]['active_lt_gain'] += gain_loss
                        else:
                            fy_lt_st_data[fy]['active_st_units'] += units
                            fy_lt_st_data[fy]['active_st_purchase'] += purchase_value
                            fy_lt_st_data[fy]['active_st_current'] += current_value
                            fy_lt_st_data[fy]['active_st_gain'] += gain_loss
                    else:  # Sold
                        if lt_status:
                            fy_lt_st_data[fy]['sold_lt_units'] += units
                            fy_lt_st_data[fy]['sold_lt_purchase'] += purchase_value
                            fy_lt_st_data[fy]['sold_lt_sale'] += current_value
                            fy_lt_st_data[fy]['sold_lt_gain'] += gain_loss
                        else:
                            fy_lt_st_data[fy]['sold_st_units'] += units
                            fy_lt_st_data[fy]['sold_st_purchase'] += purchase_value
                            fy_lt_st_data[fy]['sold_st_sale'] += current_value
                            fy_lt_st_data[fy]['sold_st_gain'] += gain_loss
                
                except:
                    pass
        
        # Write FY-wise LT/ST summary headers - with purchase/sale values
        fy_headers = ["Financial Year", 
                      "Active LT Purchase", "Active LT Current Value", "Active LT Gain/Loss",
                      "Active ST Purchase", "Active ST Current Value", "Active ST Gain/Loss",
                      "Sold LT Purchase", "Sold LT Sale Value", "Sold LT Gain/Loss",
                      "Sold ST Purchase", "Sold ST Sale Value", "Sold ST Gain/Loss"]
        
        header_row = fy_summary_row + 2
        for col, header in enumerate(fy_headers, 1):
            ws.cell(row=header_row, column=col, value=header)
        self._style_header(ws, header_row, len(fy_headers))
        
        # Sort FYs and filter to last 5 years only
        def get_fy_sort_key(fy_str):
            try:
                return int(fy_str.split(' - ')[0])
            except:
                return 9999
        
        sorted_fys = sorted(fy_lt_st_data.keys(), key=get_fy_sort_key, reverse=True)
        last_5_fys = sorted_fys[:5]  # Get last 5 FYs
        last_5_fys.reverse()  # Display oldest first
        
        data_row = header_row + 1
        for fy in last_5_fys:
            data = fy_lt_st_data[fy]
            ws.cell(row=data_row, column=1, value=fy)
            # Active LT
            ws.cell(row=data_row, column=2, value=format_inr(data['active_lt_purchase']) if data['active_lt_purchase'] else '')
            ws.cell(row=data_row, column=3, value=format_inr(data['active_lt_current']) if data['active_lt_current'] else '')
            ws.cell(row=data_row, column=4, value=format_inr(data['active_lt_gain']) if data['active_lt_gain'] else '')
            # Active ST
            ws.cell(row=data_row, column=5, value=format_inr(data['active_st_purchase']) if data['active_st_purchase'] else '')
            ws.cell(row=data_row, column=6, value=format_inr(data['active_st_current']) if data['active_st_current'] else '')
            ws.cell(row=data_row, column=7, value=format_inr(data['active_st_gain']) if data['active_st_gain'] else '')
            # Sold LT
            ws.cell(row=data_row, column=8, value=format_inr(data['sold_lt_purchase']) if data['sold_lt_purchase'] else '')
            ws.cell(row=data_row, column=9, value=format_inr(data['sold_lt_sale']) if data['sold_lt_sale'] else '')
            ws.cell(row=data_row, column=10, value=format_inr(data['sold_lt_gain']) if data['sold_lt_gain'] else '')
            # Sold ST
            ws.cell(row=data_row, column=11, value=format_inr(data['sold_st_purchase']) if data['sold_st_purchase'] else '')
            ws.cell(row=data_row, column=12, value=format_inr(data['sold_st_sale']) if data['sold_st_sale'] else '')
            ws.cell(row=data_row, column=13, value=format_inr(data['sold_st_gain']) if data['sold_st_gain'] else '')
            data_row += 1
        
        # Add totals row for last 5 years only
        total_active_lt_purchase = sum(fy_lt_st_data[fy]['active_lt_purchase'] for fy in last_5_fys)
        total_active_lt_current = sum(fy_lt_st_data[fy]['active_lt_current'] for fy in last_5_fys)
        total_active_lt_gain = sum(fy_lt_st_data[fy]['active_lt_gain'] for fy in last_5_fys)
        total_active_st_purchase = sum(fy_lt_st_data[fy]['active_st_purchase'] for fy in last_5_fys)
        total_active_st_current = sum(fy_lt_st_data[fy]['active_st_current'] for fy in last_5_fys)
        total_active_st_gain = sum(fy_lt_st_data[fy]['active_st_gain'] for fy in last_5_fys)
        total_sold_lt_purchase = sum(fy_lt_st_data[fy]['sold_lt_purchase'] for fy in last_5_fys)
        total_sold_lt_sale = sum(fy_lt_st_data[fy]['sold_lt_sale'] for fy in last_5_fys)
        total_sold_lt_gain = sum(fy_lt_st_data[fy]['sold_lt_gain'] for fy in last_5_fys)
        total_sold_st_purchase = sum(fy_lt_st_data[fy]['sold_st_purchase'] for fy in last_5_fys)
        total_sold_st_sale = sum(fy_lt_st_data[fy]['sold_st_sale'] for fy in last_5_fys)
        total_sold_st_gain = sum(fy_lt_st_data[fy]['sold_st_gain'] for fy in last_5_fys)
        
        ws.cell(row=data_row + 1, column=1, value="TOTAL (Last 5 FYs)")
        ws.cell(row=data_row + 1, column=2, value=format_inr(total_active_lt_purchase))
        ws.cell(row=data_row + 1, column=3, value=format_inr(total_active_lt_current))
        ws.cell(row=data_row + 1, column=4, value=format_inr(total_active_lt_gain))
        ws.cell(row=data_row + 1, column=5, value=format_inr(total_active_st_purchase))
        ws.cell(row=data_row + 1, column=6, value=format_inr(total_active_st_current))
        ws.cell(row=data_row + 1, column=7, value=format_inr(total_active_st_gain))
        ws.cell(row=data_row + 1, column=8, value=format_inr(total_sold_lt_purchase))
        ws.cell(row=data_row + 1, column=9, value=format_inr(total_sold_lt_sale))
        ws.cell(row=data_row + 1, column=10, value=format_inr(total_sold_lt_gain))
        ws.cell(row=data_row + 1, column=11, value=format_inr(total_sold_st_purchase))
        ws.cell(row=data_row + 1, column=12, value=format_inr(total_sold_st_sale))
        ws.cell(row=data_row + 1, column=13, value=format_inr(total_sold_st_gain))
        
        # Add note about grandfathering
        note_row = data_row + 4
        ws.cell(row=note_row, column=1, value="Note: Long Term gains for pre-31-Jan-2018 equity investments are calculated after grandfathering adjustment. Showing last 5 financial years only.")
        ws.merge_cells(f'A{note_row}:M{note_row}')
        
        self._auto_width(ws)
    
    def _create_underlying_holdings_sheet(self, wb: Workbook):
        """Sheet 7: Underlying Holdings - Classification of MF holdings by market cap"""
        ws = wb.create_sheet("Underlying Holdings")
        
        headers = [
            "Scheme Name", "ISIN", "Fund Category", "Market Cap Classification",
            "Estimated Equity %", "Estimated Debt %", "Estimated Cash %",
            "Large Cap %", "Mid Cap %", "Small Cap %",
            "Current Value", "Folio Number"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        def get_fund_classification(scheme_name):
            """
            Classify fund and estimate underlying asset allocation.
            Note: Actual holdings should come from fund factsheet/API.
            These are typical allocations based on fund category.
            """
            name_lower = scheme_name.lower() if scheme_name else ''
            
            # Default values
            classification = {
                'category': 'Unknown',
                'market_cap': 'Mixed',
                'equity_pct': 0,
                'debt_pct': 0,
                'cash_pct': 0,
                'large_cap_pct': 0,
                'mid_cap_pct': 0,
                'small_cap_pct': 0
            }
            
            # Large Cap funds
            if 'large cap' in name_lower or 'largecap' in name_lower or 'bluechip' in name_lower:
                classification = {
                    'category': 'Large Cap Equity',
                    'market_cap': 'Large Cap',
                    'equity_pct': 95, 'debt_pct': 0, 'cash_pct': 5,
                    'large_cap_pct': 85, 'mid_cap_pct': 10, 'small_cap_pct': 5
                }
            # Mid Cap funds
            elif 'mid cap' in name_lower or 'midcap' in name_lower:
                classification = {
                    'category': 'Mid Cap Equity',
                    'market_cap': 'Mid Cap',
                    'equity_pct': 95, 'debt_pct': 0, 'cash_pct': 5,
                    'large_cap_pct': 15, 'mid_cap_pct': 70, 'small_cap_pct': 15
                }
            # Small Cap funds
            elif 'small cap' in name_lower or 'smallcap' in name_lower:
                classification = {
                    'category': 'Small Cap Equity',
                    'market_cap': 'Small Cap',
                    'equity_pct': 95, 'debt_pct': 0, 'cash_pct': 5,
                    'large_cap_pct': 5, 'mid_cap_pct': 20, 'small_cap_pct': 75
                }
            # Flexi Cap
            elif 'flexi' in name_lower or 'flexicap' in name_lower:
                classification = {
                    'category': 'Flexi Cap Equity',
                    'market_cap': 'Multi Cap',
                    'equity_pct': 95, 'debt_pct': 0, 'cash_pct': 5,
                    'large_cap_pct': 50, 'mid_cap_pct': 30, 'small_cap_pct': 20
                }
            # Multi Cap
            elif 'multi cap' in name_lower or 'multicap' in name_lower:
                classification = {
                    'category': 'Multi Cap Equity',
                    'market_cap': 'Multi Cap',
                    'equity_pct': 95, 'debt_pct': 0, 'cash_pct': 5,
                    'large_cap_pct': 40, 'mid_cap_pct': 35, 'small_cap_pct': 25
                }
            # ELSS
            elif 'elss' in name_lower or ('tax' in name_lower and 'saver' in name_lower):
                classification = {
                    'category': 'ELSS (Tax Saver)',
                    'market_cap': 'Multi Cap',
                    'equity_pct': 95, 'debt_pct': 0, 'cash_pct': 5,
                    'large_cap_pct': 55, 'mid_cap_pct': 30, 'small_cap_pct': 15
                }
            # Index Funds
            elif 'index' in name_lower or 'nifty 50' in name_lower or 'sensex' in name_lower:
                if 'nifty 50' in name_lower or 'sensex' in name_lower:
                    classification = {
                        'category': 'Index Fund - Large Cap',
                        'market_cap': 'Large Cap',
                        'equity_pct': 99, 'debt_pct': 0, 'cash_pct': 1,
                        'large_cap_pct': 100, 'mid_cap_pct': 0, 'small_cap_pct': 0
                    }
                elif 'midcap' in name_lower or 'mid cap' in name_lower:
                    classification = {
                        'category': 'Index Fund - Mid Cap',
                        'market_cap': 'Mid Cap',
                        'equity_pct': 99, 'debt_pct': 0, 'cash_pct': 1,
                        'large_cap_pct': 0, 'mid_cap_pct': 100, 'small_cap_pct': 0
                    }
                else:
                    classification = {
                        'category': 'Index Fund',
                        'market_cap': 'Large Cap',
                        'equity_pct': 99, 'debt_pct': 0, 'cash_pct': 1,
                        'large_cap_pct': 80, 'mid_cap_pct': 15, 'small_cap_pct': 5
                    }
            # Hybrid - Aggressive
            elif 'aggressive' in name_lower or 'equity hybrid' in name_lower:
                classification = {
                    'category': 'Hybrid - Aggressive',
                    'market_cap': 'Multi Cap',
                    'equity_pct': 70, 'debt_pct': 25, 'cash_pct': 5,
                    'large_cap_pct': 50, 'mid_cap_pct': 35, 'small_cap_pct': 15
                }
            # Hybrid - Balanced/Conservative
            elif 'balanced' in name_lower or 'conservative' in name_lower or 'hybrid' in name_lower:
                classification = {
                    'category': 'Hybrid - Balanced',
                    'market_cap': 'Multi Cap',
                    'equity_pct': 50, 'debt_pct': 45, 'cash_pct': 5,
                    'large_cap_pct': 60, 'mid_cap_pct': 30, 'small_cap_pct': 10
                }
            # Arbitrage
            elif 'arbitrage' in name_lower:
                classification = {
                    'category': 'Arbitrage Fund',
                    'market_cap': 'N/A (Hedged)',
                    'equity_pct': 65, 'debt_pct': 30, 'cash_pct': 5,
                    'large_cap_pct': 0, 'mid_cap_pct': 0, 'small_cap_pct': 0
                }
            # Liquid
            elif 'liquid' in name_lower or 'money market' in name_lower or 'overnight' in name_lower:
                classification = {
                    'category': 'Liquid Fund',
                    'market_cap': 'N/A (Debt)',
                    'equity_pct': 0, 'debt_pct': 95, 'cash_pct': 5,
                    'large_cap_pct': 0, 'mid_cap_pct': 0, 'small_cap_pct': 0
                }
            # Debt funds
            elif any(x in name_lower for x in ['debt', 'bond', 'gilt', 'income', 'credit', 'corporate bond', 'dynamic bond']):
                classification = {
                    'category': 'Debt Fund',
                    'market_cap': 'N/A (Debt)',
                    'equity_pct': 0, 'debt_pct': 95, 'cash_pct': 5,
                    'large_cap_pct': 0, 'mid_cap_pct': 0, 'small_cap_pct': 0
                }
            # Sectoral/Thematic
            elif any(x in name_lower for x in ['pharma', 'bank', 'financial', 'infra', 'technology', 'consumption', 'manufacturing', 'thematic']):
                classification = {
                    'category': 'Sectoral/Thematic',
                    'market_cap': 'Multi Cap',
                    'equity_pct': 95, 'debt_pct': 0, 'cash_pct': 5,
                    'large_cap_pct': 60, 'mid_cap_pct': 30, 'small_cap_pct': 10
                }
            else:
                # Default to diversified equity
                classification = {
                    'category': 'Diversified Equity',
                    'market_cap': 'Multi Cap',
                    'equity_pct': 90, 'debt_pct': 5, 'cash_pct': 5,
                    'large_cap_pct': 50, 'mid_cap_pct': 30, 'small_cap_pct': 20
                }
            
            return classification
        
        row = 2
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            scheme_name = folio_data.get('scheme', '')
            market_value = folio_data.get('market_value', 0)
            
            # Only include active holdings
            if market_value <= 0:
                continue
            
            classification = get_fund_classification(scheme_name)
            
            ws.cell(row=row, column=1, value=scheme_name[:60] if scheme_name else '')
            ws.cell(row=row, column=2, value=folio_data.get('isin', ''))
            ws.cell(row=row, column=3, value=classification['category'])
            ws.cell(row=row, column=4, value=classification['market_cap'])
            ws.cell(row=row, column=5, value=f"{classification['equity_pct']}%")
            ws.cell(row=row, column=6, value=f"{classification['debt_pct']}%")
            ws.cell(row=row, column=7, value=f"{classification['cash_pct']}%")
            ws.cell(row=row, column=8, value=f"{classification['large_cap_pct']}%")
            ws.cell(row=row, column=9, value=f"{classification['mid_cap_pct']}%")
            ws.cell(row=row, column=10, value=f"{classification['small_cap_pct']}%")
            ws.cell(row=row, column=11, value=round(market_value, 2))
            ws.cell(row=row, column=12, value=folio_data.get('folio', folio_id))
            
            row += 1
        
        # Add data source notes
        note_row = row + 2
        ws.cell(row=note_row, column=1, value="DATA SOURCE & METHODOLOGY:")
        ws.merge_cells(f'A{note_row}:L{note_row}')
        
        ws.cell(row=note_row + 2, column=1, value="• Fund Category: Derived from scheme name analysis (Large Cap, Mid Cap, Small Cap, Flexi Cap, etc.)")
        ws.cell(row=note_row + 3, column=1, value="• Market Cap Classification: Based on SEBI mutual fund categorization norms")
        ws.cell(row=note_row + 4, column=1, value="• Asset Allocation %: Estimated based on typical allocations for each fund category as per SEBI norms")
        ws.cell(row=note_row + 5, column=1, value="• Large/Mid/Small Cap %: Estimated percentages based on fund category (Large Cap >80% large, Mid Cap >65% mid, etc.)")
        ws.cell(row=note_row + 7, column=1, value="IMPORTANT NOTES:")
        ws.cell(row=note_row + 8, column=1, value="• Actual underlying stock holdings are NOT available in CAS PDF")
        ws.cell(row=note_row + 9, column=1, value="• For actual portfolio composition, refer to:")
        ws.cell(row=note_row + 10, column=1, value="  - Monthly Fund Factsheets (available on AMC websites)")
        ws.cell(row=note_row + 11, column=1, value="  - AMFI website: www.amfiindia.com")
        ws.cell(row=note_row + 12, column=1, value="  - Value Research: www.valueresearchonline.com")
        ws.cell(row=note_row + 13, column=1, value="  - Morningstar India: www.morningstar.in")
        ws.cell(row=note_row + 14, column=1, value="• ISIN can be used to look up exact portfolio on above sources")
        
        self._auto_width(ws)


def parse_scheme_master_file(file_content: str) -> List[Dict]:
    """Parse the BSE scheme master file"""
    schemes = []
    lines = file_content.strip().split('\n')
    
    if not lines:
        return schemes
    
    headers = lines[0].split('|')
    header_map = {h.strip().lower().replace(' ', '_'): i for i, h in enumerate(headers)}
    
    for line in lines[1:]:
        fields = line.split('|')
        if len(fields) < len(headers):
            continue
        
        scheme = {
            'unique_no': fields[header_map.get('unique_no', 0)] if 'unique_no' in header_map else '',
            'scheme_code': fields[header_map.get('scheme_code', 1)] if 'scheme_code' in header_map else '',
            'rta_scheme_code': fields[header_map.get('rta_scheme_code', 2)] if 'rta_scheme_code' in header_map else '',
            'isin': fields[header_map.get('isin', 4)] if 'isin' in header_map else '',
            'amc_code': fields[header_map.get('amc_code', 5)] if 'amc_code' in header_map else '',
            'scheme_type': fields[header_map.get('scheme_type', 6)] if 'scheme_type' in header_map else '',
            'scheme_plan': fields[header_map.get('scheme_plan', 7)] if 'scheme_plan' in header_map else '',
            'scheme_name': fields[header_map.get('scheme_name', 8)] if 'scheme_name' in header_map else '',
        }
        schemes.append(scheme)
    
    return schemes
