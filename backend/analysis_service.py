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
                        
                        # Skip STT Paid transactions - add them as investment costs too
                        # STT is tax paid during redemption, but Gap Sheet treats it as investment cost
                        if '*** STT Paid ***' in nav_str:
                            try:
                                stt_amount = float(amount_str.replace(',', '').replace('(', '-').replace(')', ''))
                                if stt_amount > 0:
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
                                        'is_redemption': False  # Treat as investment cost per Gap Sheet
                                    }
                                    self.transactions.append(transaction)
                                    if current_key in self.folios:
                                        self.folios[current_key]['transactions'].append(transaction)
                            except ValueError:
                                pass
                            i += 1
                            continue
                        
                        if '***' in amount_str or 'KYC' in amount_str:
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
                        
                        # Skip rejection transactions (these are reversals, not real transactions)
                        if 'Rejection' in trans_type_line:
                            i += 1
                            continue
                        
                        trans_type = trans_type_line.split('-')[0].strip() if '-' in trans_type_line else trans_type_line
                        
                        balance = 0
                        if i + 5 < len(lines):
                            balance_line = lines[i + 5].strip().replace(',', '')
                            try:
                                balance = float(balance_line)
                            except ValueError:
                                pass
                        
                        is_redemption = amount < 0 or 'Redemption' in trans_type_line or 'Switch Over Out' in trans_type_line or 'Lateral Shift Out' in trans_type_line
                        
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
            column = col[0].column_letter
            for cell in col:
                try:
                    if cell.value:
                        max_length = max(max_length, len(str(cell.value)))
                except:
                    pass
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
        
        # Create all sheets
        self._create_portfolio_performance_sheet(wb)
        self._create_tax_view_sheet(wb)
        self._create_advisor_view_sheet(wb)
        self._create_pan_view_sheet(wb)
        self._create_mf_ageing_sheet(wb)
        self._create_mutual_fund_holding_sheet(wb)
        self._create_mf_transactions_sheet(wb)
        self._create_accounts_sheet(wb)
        self._create_exit_loads_sheet(wb)
        self._create_other_details_sheet(wb)
        self._create_nft_sheet(wb)
        self._create_xirr_report_sheet(wb)
        
        if 'Sheet' in wb.sheetnames:
            del wb['Sheet']
        
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output.getvalue()
    
    def generate_by_pan(self) -> bytes:
        """Generate separate files for different PANs as a ZIP"""
        # Group folios by PAN
        pan_data = defaultdict(lambda: {'folios': {}, 'transactions': []})
        
        for key, folio in self.parsed_data.get('folios', {}).items():
            pan = folio.get('pan', 'UNKNOWN')
            pan_data[pan]['folios'][key] = folio
        
        for trans in self.parsed_data.get('transactions', []):
            pan = trans.get('pan', 'UNKNOWN')
            pan_data[pan]['transactions'].append(trans)
        
        # Create ZIP file with separate workbooks
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for pan, data in pan_data.items():
                # Create subset parsed data
                subset_data = {
                    'investor_info': self.parsed_data.get('investor_info', {}),
                    'portfolio_summary': self.parsed_data.get('portfolio_summary', {}),
                    'folios': data['folios'],
                    'transactions': data['transactions'],
                    'nft_entries': [n for n in self.parsed_data.get('nft_entries', [])],
                    'report_date': self.parsed_data.get('report_date')
                }
                
                # Generate workbook for this PAN
                generator = GapSheetGenerator(subset_data, self.nav_service, self.scheme_mapper)
                wb_bytes = generator.generate()
                
                # Add to ZIP
                zip_file.writestr(f"GapSheet_{pan}.xlsx", wb_bytes)
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()
    
    def _create_portfolio_performance_sheet(self, wb: Workbook):
        """Sheet 1: Portfolio Performance"""
        ws = wb.create_sheet("Portfolio Performance", 0)
        
        headers = [
            "Group Name", "PAN", "Asset Class", "Advisor", "Folio No.", "Instrument Name",
            "Instrument Type", "From Date", "To Date", "Amount Invested", "Cash Withdrawal",
            "Dividend Paid", "Valuation", "Absolute Gains", "Absolute Return %", "CAGR %",
            "3 Yr %", "Inception Date", "Cost Value", "Cost price", "Closing Units",
            "Realized GL", "Unrealized GL", "Remarks"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        row = 2
        total_invested = 0
        total_withdrawn = 0
        total_valuation = 0
        
        equity_data = []
        debt_data = []
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            closing_balance = folio_data.get('closing_balance', 0)
            cost_value = folio_data.get('cost_value', 0)
            market_value = folio_data.get('market_value', 0)
            
            transactions = folio_data.get('transactions', [])
            # Always use sum of transactions for invested/withdrawn (as per Gap Sheet)
            invested = sum(t['amount'] for t in transactions if not t.get('is_redemption', False))
            withdrawn = sum(t['amount'] for t in transactions if t.get('is_redemption', False))
            
            inception_date = ''
            if transactions:
                inception_date = transactions[0].get('date', '')
            
            # Calculate gains based on whether position is open or closed
            if closing_balance > 0 and market_value > 0:
                # Open position: unrealized gains
                gains = market_value - (invested - withdrawn) if invested > 0 else 0
                return_pct = (gains / (invested - withdrawn) * 100) if (invested - withdrawn) > 0 else 0
                unrealized_gl = gains
                realized_gl = 0
            else:
                # Closed position: realized gains  
                gains = withdrawn - invested
                return_pct = (gains / invested * 100) if invested > 0 else 0
                unrealized_gl = 0
                realized_gl = gains
            
            scheme_name = folio_data.get('scheme', '') or ''
            asset_class = 'EQUITY'
            if any(x in scheme_name.lower() for x in ['liquid', 'debt', 'bond', 'gilt', 'money market', 'overnight', 'ultra short']):
                asset_class = 'DEBT'
            
            advisor = self._get_advisor_name(folio_data.get('advisor', ''))
            
            entry = {
                'group_name': self.parsed_data.get('investor_info', {}).get('name', ''),
                'pan': folio_data.get('pan', ''),
                'asset_class': asset_class,
                'advisor': advisor,
                'folio': folio_data.get('folio', folio_id),
                'scheme': scheme_name,
                'type': 'MutualFund',
                'invested': invested,
                'withdrawn': withdrawn,
                'valuation': market_value,
                'gains': gains,
                'return_pct': return_pct,
                'inception_date': inception_date,
                'cost_value': cost_value,
                'closing_units': closing_balance,
                'realized_gl': realized_gl,
                'unrealized_gl': unrealized_gl
            }
            
            if asset_class == 'EQUITY':
                equity_data.append(entry)
            else:
                debt_data.append(entry)
            
            total_invested += invested
            total_withdrawn += withdrawn
            total_valuation += market_value
        
        # Grand Total
        total_gains = total_valuation - (total_invested - total_withdrawn)
        total_return = (total_gains / (total_invested - total_withdrawn) * 100) if (total_invested - total_withdrawn) > 0 else 0
        
        ws.cell(row=row, column=3, value="GRAND TOTAL")
        ws.cell(row=row, column=10, value=round(total_invested, 2))
        ws.cell(row=row, column=11, value=round(total_withdrawn, 2))
        ws.cell(row=row, column=13, value=round(total_valuation, 2))
        ws.cell(row=row, column=14, value=round(total_gains, 2))
        ws.cell(row=row, column=15, value=round(total_return, 4))
        row += 1
        
        # Sub Total - EQUITY
        eq_invested = sum(e['invested'] for e in equity_data)
        eq_withdrawn = sum(e['withdrawn'] for e in equity_data)
        eq_valuation = sum(e['valuation'] for e in equity_data)
        eq_gains = eq_valuation - (eq_invested - eq_withdrawn)
        eq_return = (eq_gains / (eq_invested - eq_withdrawn) * 100) if (eq_invested - eq_withdrawn) > 0 else 0
        
        ws.cell(row=row, column=3, value="Sub Total - EQUITY")
        ws.cell(row=row, column=10, value=round(eq_invested, 2))
        ws.cell(row=row, column=11, value=round(eq_withdrawn, 2))
        ws.cell(row=row, column=13, value=round(eq_valuation, 2))
        ws.cell(row=row, column=14, value=round(eq_gains, 2))
        ws.cell(row=row, column=15, value=round(eq_return, 4))
        row += 1
        
        # Sub Total - DEBT
        debt_invested = sum(e['invested'] for e in debt_data)
        debt_withdrawn = sum(e['withdrawn'] for e in debt_data)
        debt_valuation = sum(e['valuation'] for e in debt_data)
        debt_gains = debt_valuation - (debt_invested - debt_withdrawn)
        debt_return = (debt_gains / (debt_invested - debt_withdrawn) * 100) if (debt_invested - debt_withdrawn) > 0 else 0
        
        ws.cell(row=row, column=3, value="Sub Total - DEBT")
        ws.cell(row=row, column=10, value=round(debt_invested, 2))
        ws.cell(row=row, column=11, value=round(debt_withdrawn, 2))
        ws.cell(row=row, column=13, value=round(debt_valuation, 2))
        ws.cell(row=row, column=14, value=round(debt_gains, 2))
        ws.cell(row=row, column=15, value=round(debt_return, 4))
        row += 1
        
        # Individual entries
        for entry in equity_data + debt_data:
            ws.cell(row=row, column=2, value=entry['pan'])
            ws.cell(row=row, column=3, value=entry['asset_class'])
            ws.cell(row=row, column=4, value=entry['advisor'])
            ws.cell(row=row, column=5, value=entry['folio'])
            ws.cell(row=row, column=6, value=entry['scheme'])
            ws.cell(row=row, column=7, value=entry['type'])
            ws.cell(row=row, column=10, value=round(entry['invested'], 2))
            ws.cell(row=row, column=11, value=round(entry['withdrawn'], 2))
            ws.cell(row=row, column=12, value=0)
            ws.cell(row=row, column=13, value=round(entry['valuation'], 2))
            ws.cell(row=row, column=14, value=round(entry['gains'], 2))
            ws.cell(row=row, column=15, value=round(entry['return_pct'], 4))
            ws.cell(row=row, column=18, value=entry['inception_date'])
            ws.cell(row=row, column=19, value=round(entry['cost_value'], 4))
            ws.cell(row=row, column=21, value=round(entry['closing_units'], 3))
            ws.cell(row=row, column=22, value=round(entry['realized_gl'], 2))
            ws.cell(row=row, column=23, value=round(entry['unrealized_gl'], 2))
            row += 1
        
        self._auto_width(ws)
    
    def _create_tax_view_sheet(self, wb: Workbook):
        """Sheet 2: Tax View"""
        ws = wb.create_sheet("Tax View")
        
        headers = [
            "Folio Number", "Instrument Name", "Financial Year", "SchemeType",
            "Active LT Units", "Active LT (Gain/Loss)", "Active LT Tax",
            "Active ST Units", "Active ST (Gain/Loss)", "Active ST Tax",
            "Sold LT Units", "Sold LT (Gain/Loss)", "Sold LT Tax",
            "Sold ST Units", "Sold ST (Gain/Loss)", "Sold ST Tax"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        row = 2
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            scheme_name = folio_data.get('scheme', '') or ''
            asset_class = 'EQUITY'
            if any(x in scheme_name.lower() for x in ['liquid', 'debt', 'bond']):
                asset_class = 'LIQUID' if 'liquid' in scheme_name.lower() else 'DEBT'
            
            # Calculate LT/ST units based on transaction age
            transactions = folio_data.get('transactions', [])
            lt_units = 0
            st_units = 0
            lt_gain = 0
            st_gain = 0
            current_nav = folio_data.get('current_nav', 0)
            
            for trans in transactions:
                if trans.get('is_redemption'):
                    continue
                try:
                    trans_date = datetime.strptime(trans['date'], '%d-%b-%Y')
                    age_days = (self.report_date - trans_date).days
                    units = trans.get('units', 0)
                    purchase_nav = trans.get('nav', 0)
                    
                    gain_per_unit = current_nav - purchase_nav if current_nav and purchase_nav else 0
                    
                    if age_days > 365:
                        lt_units += units
                        lt_gain += units * gain_per_unit
                    else:
                        st_units += units
                        st_gain += units * gain_per_unit
                except ValueError:
                    pass
            
            ws.cell(row=row, column=1, value=folio_data.get('folio', folio_id))
            ws.cell(row=row, column=2, value=scheme_name[:50])
            ws.cell(row=row, column=3, value="2025 - 2026")
            ws.cell(row=row, column=4, value=asset_class)
            ws.cell(row=row, column=5, value=round(lt_units, 3))
            ws.cell(row=row, column=6, value=round(lt_gain, 2))
            ws.cell(row=row, column=7, value=round(lt_gain * 0.125, 2) if lt_gain > 0 else 0)
            ws.cell(row=row, column=8, value=round(st_units, 3))
            ws.cell(row=row, column=9, value=round(st_gain, 2))
            ws.cell(row=row, column=10, value=round(st_gain * 0.2, 2) if st_gain > 0 else 0)
            row += 1
        
        self._auto_width(ws)
    
    def _create_advisor_view_sheet(self, wb: Workbook):
        """Sheet 3: Advisor View with Longevity"""
        ws = wb.create_sheet("Advisor View")
        
        headers = [
            "Group Name", "PAN", "Advisor", "Advisor Longevity", "Asset Class", 
            "From Date", "To Date", "Amount Invested", "Cash Withdrawal", "Dividend Paid", 
            "Valuation", "Absolute Gains", "Absolute Return %", "CAGR %", "3 Yr %", "Remarks"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        # Group by advisor
        advisor_data = defaultdict(lambda: {'invested': 0, 'withdrawn': 0, 'valuation': 0, 'first_date': None})
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            arn = folio_data.get('advisor', '') or 'ARN-145633'
            transactions = folio_data.get('transactions', [])
            
            invested = sum(t['amount'] for t in transactions if not t.get('is_redemption', False))
            withdrawn = sum(t['amount'] for t in transactions if t.get('is_redemption', False))
            valuation = folio_data.get('market_value', 0)
            
            advisor_data[arn]['invested'] += invested
            advisor_data[arn]['withdrawn'] += withdrawn
            advisor_data[arn]['valuation'] += valuation
            
            # Track earliest transaction
            for trans in transactions:
                try:
                    trans_date = datetime.strptime(trans['date'], '%d-%b-%Y')
                    if advisor_data[arn]['first_date'] is None or trans_date < advisor_data[arn]['first_date']:
                        advisor_data[arn]['first_date'] = trans_date
                except ValueError:
                    pass
        
        row = 2
        for arn, data in advisor_data.items():
            gains = data['valuation'] - (data['invested'] - data['withdrawn'])
            return_pct = (gains / (data['invested'] - data['withdrawn']) * 100) if (data['invested'] - data['withdrawn']) > 0 else 0
            
            # Calculate longevity
            longevity = "N/A"
            if data['first_date']:
                days = (self.report_date - data['first_date']).days
                years = days // 365
                months = (days % 365) // 30
                if years > 0:
                    longevity = f"{years} years {months} months"
                else:
                    longevity = f"{months} months"
            
            ws.cell(row=row, column=3, value=self._get_advisor_name(arn))
            ws.cell(row=row, column=4, value=longevity)
            ws.cell(row=row, column=8, value=round(data['invested'], 2))
            ws.cell(row=row, column=9, value=round(data['withdrawn'], 2))
            ws.cell(row=row, column=10, value=0)
            ws.cell(row=row, column=11, value=round(data['valuation'], 2))
            ws.cell(row=row, column=12, value=round(gains, 2))
            ws.cell(row=row, column=13, value=round(return_pct, 4))
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
        """Sheet 7: MF Transactions"""
        ws = wb.create_sheet("MF Transactions")
        
        headers = [
            "Group Name", "Service Provider Name", "Advisor ARN", "PAN",
            "Account Identifier Type", "Account Identifier", "Scheme ID",
            "Instrument Name", "ISIN", "Instrument Type", "Transaction Date",
            "Transaction Details", "Opening Units", "Units (Debit)", "Units (Credit)",
            "Closing Units", "Price", "Transaction Amount", "STT", "Stamp Duty"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        row = 2
        for trans in self.parsed_data.get('transactions', []):
            ws.cell(row=row, column=3, value=trans.get('advisor', ''))
            ws.cell(row=row, column=4, value=trans.get('pan', ''))
            ws.cell(row=row, column=5, value="Folio Number")
            ws.cell(row=row, column=6, value=trans.get('folio', ''))
            ws.cell(row=row, column=8, value=trans.get('scheme', '')[:50])
            ws.cell(row=row, column=9, value=trans.get('isin', ''))
            ws.cell(row=row, column=10, value="Mutual Fund")
            ws.cell(row=row, column=11, value=trans.get('date', ''))
            ws.cell(row=row, column=12, value=trans.get('transaction_type', ''))
            
            if trans.get('is_redemption'):
                ws.cell(row=row, column=14, value=trans.get('units', 0))
            else:
                ws.cell(row=row, column=15, value=trans.get('units', 0))
            
            ws.cell(row=row, column=16, value=trans.get('balance', 0))
            ws.cell(row=row, column=17, value=trans.get('nav', 0))
            ws.cell(row=row, column=18, value=trans.get('amount', 0))
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
        """Sheet 9: Exit Loads"""
        ws = wb.create_sheet("Exit Loads ")
        
        headers = [
            "Folio Number", "Scheme ID", "Scheme Description",
            "Service Provider Name", "Fund Name", "Load Structure Details"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        row = 2
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            ws.cell(row=row, column=1, value=folio_data.get('folio', folio_id))
            ws.cell(row=row, column=3, value=folio_data.get('scheme', '')[:50])
            ws.cell(row=row, column=4, value=folio_data.get('amc', ''))
            ws.cell(row=row, column=6, value="Entry Load is NIL ; Exit Load - Please refer scheme document")
            row += 1
        
        self._auto_width(ws)
    
    def _create_other_details_sheet(self, wb: Workbook):
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
        """Sheet 11: NFT (Non-Financial Transactions)"""
        ws = wb.create_sheet("NFT")
        
        headers = [
            "Date", "Folio Number", "Scheme Name", "Transaction Description"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        row = 2
        for nft in self.parsed_data.get('nft_entries', []):
            ws.cell(row=row, column=1, value=nft.get('date', ''))
            ws.cell(row=row, column=2, value=nft.get('folio', ''))
            ws.cell(row=row, column=3, value=nft.get('scheme', '')[:50] if nft.get('scheme') else '')
            ws.cell(row=row, column=4, value=nft.get('description', ''))
            row += 1
        
        self._auto_width(ws)
    
    def _create_xirr_report_sheet(self, wb: Workbook):
        """Sheet 12: XIRR Report"""
        ws = wb.create_sheet("XIRR Report")
        
        # Overall XIRR
        headers_overall = ["Category", "XIRR %", "Total Invested", "Total Redeemed", "Current Value"]
        for col, header in enumerate(headers_overall, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers_overall))
        
        # Calculate overall XIRR
        cashflows = []
        total_invested = 0
        total_redeemed = 0
        total_value = 0
        
        for trans in self.parsed_data.get('transactions', []):
            try:
                trans_date = datetime.strptime(trans['date'], '%d-%b-%Y')
                amount = trans['amount']
                if trans.get('is_redemption'):
                    cashflows.append((trans_date, amount))  # Positive for redemption
                    total_redeemed += amount
                else:
                    cashflows.append((trans_date, -amount))  # Negative for purchase
                    total_invested += amount
            except ValueError:
                pass
        
        # Add current value as final cashflow
        for folio_data in self.parsed_data.get('folios', {}).values():
            total_value += folio_data.get('market_value', 0)
        
        if total_value > 0:
            cashflows.append((self.report_date, total_value))
        
        overall_xirr = calculate_xirr(cashflows) * 100
        
        ws.cell(row=2, column=1, value="Overall Portfolio")
        ws.cell(row=2, column=2, value=round(overall_xirr, 2))
        ws.cell(row=2, column=3, value=round(total_invested, 2))
        ws.cell(row=2, column=4, value=round(total_redeemed, 2))
        ws.cell(row=2, column=5, value=round(total_value, 2))
        
        # XIRR by Advisor
        row = 5
        ws.cell(row=row, column=1, value="XIRR by Advisor")
        ws.cell(row=row, column=1).font = Font(bold=True, size=12)
        row += 1
        
        headers_advisor = ["Advisor", "Longevity", "XIRR %", "Invested", "Redeemed", "Current Value"]
        for col, header in enumerate(headers_advisor, 1):
            ws.cell(row=row, column=col, value=header)
        self._style_header(ws, row, len(headers_advisor))
        row += 1
        
        # Group by advisor
        advisor_cashflows = defaultdict(list)
        advisor_values = defaultdict(float)
        advisor_first_date = {}
        
        for trans in self.parsed_data.get('transactions', []):
            advisor = trans.get('advisor', '') or 'ARN-145633'
            try:
                trans_date = datetime.strptime(trans['date'], '%d-%b-%Y')
                amount = trans['amount']
                if trans.get('is_redemption'):
                    advisor_cashflows[advisor].append((trans_date, amount))
                else:
                    advisor_cashflows[advisor].append((trans_date, -amount))
                
                if advisor not in advisor_first_date or trans_date < advisor_first_date[advisor]:
                    advisor_first_date[advisor] = trans_date
            except ValueError:
                pass
        
        for folio_data in self.parsed_data.get('folios', {}).values():
            advisor = folio_data.get('advisor', '') or 'ARN-145633'
            advisor_values[advisor] += folio_data.get('market_value', 0)
        
        for advisor, cf in advisor_cashflows.items():
            if advisor_values[advisor] > 0:
                cf.append((self.report_date, advisor_values[advisor]))
            
            xirr = calculate_xirr(cf) * 100
            invested = sum(-c[1] for c in cf if c[1] < 0)
            redeemed = sum(c[1] for c in cf if c[1] > 0 and c[0] != self.report_date)
            
            # Calculate longevity
            longevity = "N/A"
            if advisor in advisor_first_date:
                days = (self.report_date - advisor_first_date[advisor]).days
                years = days // 365
                months = (days % 365) // 30
                longevity = f"{years}y {months}m" if years > 0 else f"{months}m"
            
            ws.cell(row=row, column=1, value=self._get_advisor_name(advisor))
            ws.cell(row=row, column=2, value=longevity)
            ws.cell(row=row, column=3, value=round(xirr, 2))
            ws.cell(row=row, column=4, value=round(invested, 2))
            ws.cell(row=row, column=5, value=round(redeemed, 2))
            ws.cell(row=row, column=6, value=round(advisor_values[advisor], 2))
            row += 1
        
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
