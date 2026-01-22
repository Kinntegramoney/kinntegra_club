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
        self.tds_entries = []  # TDS (Tax Deducted at Source) entries
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
            self._parse_tds(full_text)
            
            return {
                "investor_info": self.investor_info,
                "portfolio_summary": self.portfolio_summary,
                "folios": self.folios,
                "transactions": self.transactions,
                "nft_entries": self.nft_entries,
                "tds_entries": self.tds_entries,
                "report_date": self.report_date,
                "total_transactions": len(self.transactions)
            }
            
        except Exception as e:
            logger.error(f"Error parsing CAS PDF: {e}")
            raise
    
    def _parse_investor_info(self, text: str):
        """Extract investor information"""
        # Try "Dear <Name>," pattern first
        name_match = re.search(r'Dear\s+([A-Za-z\s]+),', text)
        if name_match:
            self.investor_info['name'] = name_match.group(1).strip()
        
        email_match = re.search(r'Email Id:\s*([^\s]+@[^\s]+)', text)
        if email_match:
            self.investor_info['email'] = email_match.group(1).strip()
            
            # Try to extract name from line after Email Id (CAMS format)
            # Pattern: "Email Id: email@domain.com\nName Here\nAddress..."
            if 'name' not in self.investor_info:
                lines = text.split('\n')
                for i, line in enumerate(lines):
                    if 'Email Id:' in line and i + 1 < len(lines):
                        # Next line should be the name
                        potential_name = lines[i + 1].strip()
                        # Validate it looks like a name (only letters and spaces, not too long)
                        if potential_name and len(potential_name) < 50:
                            if re.match(r'^[A-Za-z\s\.]+$', potential_name):
                                self.investor_info['name'] = potential_name
                        break
        
        mobile_match = re.search(r'Mobile:\s*(\d+)', text)
        if mobile_match:
            self.investor_info['mobile'] = mobile_match.group(1)
        
        # Also try Phone Off pattern (CAMS format)
        if 'mobile' not in self.investor_info:
            phone_match = re.search(r'Phone Off:\s*(\d+)', text)
            if phone_match:
                self.investor_info['mobile'] = phone_match.group(1)
        
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
                
                # Check for advisor on same line
                advisor_match = re.search(r'\(Advisor:\s*([A-Z0-9\-]+)\)', line)
                if advisor_match:
                    current_advisor = advisor_match.group(1)
                else:
                    # Check if advisor info is split across lines (common in CAS PDFs)
                    # Look at next line for ARN
                    if i + 1 < len(lines):
                        next_line = lines[i + 1].strip()
                        # Pattern: "ARN-XXXXX)" at start of line
                        arn_match = re.match(r'^(ARN-[A-Z0-9\-]+)\)', next_line)
                        if arn_match:
                            current_advisor = arn_match.group(1)
                        # Also check for full pattern on next line
                        elif re.match(r'^[A-Z0-9\-]+\)', next_line):
                            # Could be PCASON) or similar
                            arn_only = re.match(r'^([A-Z0-9\-]+)\)', next_line)
                            if arn_only:
                                current_advisor = arn_only.group(1)
                
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
                nav_match = re.search(r'NAV on [^:]+:\s*INR\s*([\d,.]+)', line)
                if nav_match and current_key and current_key in self.folios:
                    self.folios[current_key]['current_nav'] = float(nav_match.group(1).replace(',', ''))
            
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
                        
                        # Handle TDS on Above - skip these as they're informational, not transactions
                        # After *** TDS on Above ***, the next line is often a total payout amount like (6,975.00)
                        # which should not be parsed as a transaction
                        if '*** TDS on Above ***' in nav_str or '*** TDS on Above ***' in units_str:
                            i += 1
                            continue
                        
                        # Handle Transaction charges - these are fees paid to distributors
                        # Format: Date, Amount (25.00), *** Transaction charges ***
                        # Skip these as they're not investment transactions
                        if '*** Transaction charges ***' in nav_str or 'Transaction charges' in nav_str:
                            i += 1
                            continue
                        
                        # Check if amount_str looks like a TDS total payout (amount in parentheses)
                        # These appear after TDS entries and look like: (6,975.00), (99,808.00), etc.
                        # BUT amounts in parentheses are also valid for redemptions and dishonoured transactions!
                        # Only skip if the trans_type_line (4 lines ahead) does NOT contain relevant keywords
                        if re.match(r'^\(\d{1,3}(?:,\d{3})*\.\d{2}\)$', amount_str):
                            # Check if this is a valid transaction or a TDS payout line
                            # Valid transactions include: Redemption, Switch, dishonoured, not realised
                            trans_keywords = ['Redemption', 'Switch', 'dishonoured', 'not realised', 'Purchase']
                            if not any(kw.lower() in trans_type_line.lower() for kw in trans_keywords):
                                # This is likely a TDS-related payout amount line, not a real transaction
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
                        
                        # Treat as redemption/reversal if:
                        # - Amount is negative (in parentheses)
                        # - Contains 'Redemption', 'Rejection', 'Switch Over Out', 'Lateral Shift Out'
                        # - Contains 'dishonoured' or 'not realised' (bounced/reversed transactions)
                        is_redemption = (amount < 0 or 
                                        'Redemption' in trans_type_line or 
                                        'Rejection' in trans_type_line or 
                                        'Switch Over Out' in trans_type_line or 
                                        'Lateral Shift Out' in trans_type_line or
                                        'dishonoured' in trans_type_line.lower() or
                                        'not realised' in trans_type_line.lower())
                        
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

    def _parse_tds(self, text: str):
        """Parse TDS (Tax Deducted at Source) entries from CAS"""
        lines = text.split('\n')
        
        # Track current context
        current_folio = None
        current_scheme = None
        current_isin = None
        current_pan = None
        current_amc = None
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # Track PAN
            pan_match = re.search(r'PAN:\s*([A-Z]{5}\d{4}[A-Z])', line)
            if pan_match:
                current_pan = pan_match.group(1)
            
            # Track AMC
            amc_match = re.search(r'^([A-Za-z\s]+(?:Mutual Fund|MF))$', line)
            if amc_match:
                current_amc = amc_match.group(1).strip()
            
            # Track Folio
            folio_match = re.search(r'Folio No:\s*([\d\s/]+)', line)
            if folio_match:
                current_folio = folio_match.group(1).strip()
            
            # Track Scheme - look for ISIN pattern
            isin_match = re.search(r'(INF[A-Z0-9]{9})', line)
            if isin_match:
                current_isin = isin_match.group(1)
                # Get scheme name from line above or current line
                if i > 0 and not lines[i-1].strip().startswith('Folio'):
                    scheme_line = lines[i-1].strip()
                    if scheme_line and not re.match(r'^\d', scheme_line):
                        current_scheme = scheme_line[:100]
            
            # Detect TDS entry: "*** TDS on Above ***"
            if '*** TDS on Above ***' in line:
                # TDS structure:
                # Line i-4: Transaction description (e.g., "Redemption - Instalment 1/916...")
                # Line i-3: Balance after transaction
                # Line i-2: Date (DD-MMM-YYYY)
                # Line i-1: TDS Amount
                # Line i: *** TDS on Above ***
                
                if i >= 2:
                    try:
                        tds_amount_str = lines[i-1].strip()
                        date_str = lines[i-2].strip()
                        
                        # Get transaction description if available
                        trans_desc = ''
                        if i >= 4:
                            trans_desc = lines[i-4].strip()
                            if not trans_desc or trans_desc.isdigit() or re.match(r'^[\d,\.]+$', trans_desc):
                                trans_desc = lines[i-5].strip() if i >= 5 else ''
                        
                        # Parse TDS amount
                        tds_amount = float(tds_amount_str.replace(',', ''))
                        
                        # Validate date format
                        if re.match(r'\d{2}-[A-Za-z]{3}-\d{4}', date_str) and tds_amount > 0:
                            # Determine Financial Year
                            from datetime import datetime
                            tds_date = datetime.strptime(date_str, '%d-%b-%Y')
                            if tds_date.month >= 4:
                                fy = f"FY {tds_date.year}-{str(tds_date.year + 1)[2:]}"
                            else:
                                fy = f"FY {tds_date.year - 1}-{str(tds_date.year)[2:]}"
                            
                            tds_entry = {
                                'date': date_str,
                                'amount': tds_amount,
                                'transaction_desc': trans_desc,
                                'folio': current_folio,
                                'scheme': current_scheme,
                                'isin': current_isin,
                                'pan': current_pan,
                                'amc': current_amc,
                                'financial_year': fy
                            }
                            self.tds_entries.append(tds_entry)
                    except (ValueError, IndexError):
                        pass
            
            i += 1


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
    
    @staticmethod
    def get_nav_for_date(scheme_code: str, target_date: datetime) -> Optional[float]:
        """
        Fetch NAV for a specific date or the closest available date before it.
        MF API returns historical data, so we fetch all and find the right date.
        """
        try:
            response = requests.get(f"{MFAPI_BASE_URL}/mf/{scheme_code}", timeout=15)
            if response.status_code == 200:
                data = response.json()
                nav_data = data.get('data', [])
                
                if not nav_data:
                    return None
                
                # NAV data is sorted with most recent first
                # Find the NAV for target_date or the closest date before it
                target_str = target_date.strftime('%d-%m-%Y')
                
                for entry in nav_data:
                    try:
                        entry_date_str = entry.get('date', '')
                        entry_nav = float(entry.get('nav', 0))
                        
                        # Parse the date from API (format: DD-MM-YYYY)
                        entry_date = datetime.strptime(entry_date_str, '%d-%m-%Y')
                        
                        # If this entry is on or before target date, use it
                        if entry_date <= target_date:
                            return entry_nav
                    except (ValueError, TypeError):
                        continue
                
                # If no date found before target, return the oldest available
                if nav_data:
                    try:
                        return float(nav_data[-1].get('nav', 0))
                    except:
                        pass
            return None
        except Exception as e:
            logger.error(f"Error fetching historical NAV for {scheme_code}: {e}")
            return None


class SchemeMapper:
    """Maps ISIN/scheme names to MF API scheme codes and scheme types"""
    
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
    
    def get_scheme_type(self, isin: str = None, scheme_name: str = None) -> Optional[str]:
        """Get the scheme type from scheme master"""
        scheme_data = None
        if isin and isin in self.isin_index:
            scheme_data = self.isin_index[isin]
        elif scheme_name:
            normalized = scheme_name.lower().replace(' ', '').replace('-', '')
            if normalized in self.name_index:
                scheme_data = self.name_index[normalized]
        
        if scheme_data:
            return scheme_data.get('scheme_type', '')
        return None
    
    def get_asset_category(self, isin: str = None, scheme_name: str = None) -> str:
        """Categorize scheme into Equity, Debt, Hybrid, or Other based on scheme_type from master"""
        scheme_type = self.get_scheme_type(isin, scheme_name)
        
        if not scheme_type:
            # Fallback to name-based detection if scheme type not found
            name_lower = (scheme_name or '').lower()
            if any(k in name_lower for k in ['equity', 'index', 'nifty', 'sensex', 'midcap', 'smallcap', 
                                              'large cap', 'flexi cap', 'bluechip', 'elss', 'tax saver']):
                return 'Equity'
            elif any(k in name_lower for k in ['debt', 'liquid', 'money market', 'overnight', 'gilt', 
                                                'bond', 'income', 'credit risk', 'fmp']):
                return 'Debt'
            elif any(k in name_lower for k in ['hybrid', 'balanced', 'arbitrage', 'multi asset']):
                return 'Hybrid'
            return 'Other'
        
        # Map scheme_type to category
        scheme_type_lower = scheme_type.lower()
        
        # Equity types
        if any(t in scheme_type_lower for t in ['equity', 'elss', 'index', 'etf', 'growth']):
            return 'Equity'
        
        # Debt types
        if any(t in scheme_type_lower for t in ['debt', 'liquid', 'money market', 'income', 'gilt', 
                                                 'bond', 'credit', 'overnight', 'fmp', 'floating']):
            return 'Debt'
        
        # Hybrid types  
        if any(t in scheme_type_lower for t in ['hybrid', 'balanced', 'arbitrage', 'aggressive', 
                                                 'conservative', 'dynamic']):
            return 'Hybrid'
        
        return 'Other'


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
    
    def _style_header(self, ws, row, num_cols, start_col=1):
        for col in range(start_col, start_col + num_cols):
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
    
    def _fetch_missing_navs(self):
        """Fetch NAV from MF API for folios where NAV is missing or invalid.
        
        NAV is fetched for one day BEFORE the report date, since CAS reports
        show data as of the previous day's closing NAV.
        """
        if not self.scheme_mapper:
            logger.warning("No scheme mapper available, cannot fetch NAVs")
            return
        
        # Calculate the NAV date (one day before report date)
        from datetime import timedelta
        nav_date = self.report_date - timedelta(days=1)
        logger.info(f"Fetching NAVs for date: {nav_date.strftime('%d-%b-%Y')} (report date: {self.report_date.strftime('%d-%b-%Y')})")
        
        for folio_key, folio_data in self.parsed_data.get('folios', {}).items():
            current_nav = folio_data.get('current_nav', 0)
            
            # Skip if NAV is already valid (greater than 1 and less than 100000)
            # NAV of 1 or less is invalid for mutual funds
            if current_nav and current_nav > 1 and current_nav < 100000:
                continue
            
            # Try to get scheme code from ISIN or scheme name
            isin = folio_data.get('isin', '')
            scheme_name = folio_data.get('scheme', '')
            
            scheme_code = self.scheme_mapper.get_scheme_code(isin=isin, scheme_name=scheme_name)
            
            if scheme_code:
                # Fetch NAV for the day before report date
                nav_value = self.nav_service.get_nav_for_date(scheme_code, nav_date)
                if nav_value and nav_value > 1:
                    folio_data['current_nav'] = nav_value
                    folio_data['nav_fetched_from_api'] = True
                    folio_data['nav_date'] = nav_date.strftime('%d-%b-%Y')
                    logger.info(f"Fetched NAV {nav_value} for {scheme_name[:30]} for date {nav_date.strftime('%d-%b-%Y')}")
                else:
                    # Fallback to latest NAV if historical not available
                    nav_data = self.nav_service.get_latest_nav(scheme_code)
                    if nav_data and nav_data.get('data'):
                        try:
                            latest_nav = float(nav_data['data'][0].get('nav', 0))
                            if latest_nav > 1:
                                folio_data['current_nav'] = latest_nav
                                folio_data['nav_fetched_from_api'] = True
                                folio_data['nav_date'] = 'latest'
                                logger.info(f"Fetched latest NAV {latest_nav} for {scheme_name[:30]} (historical not available)")
                        except (IndexError, KeyError, ValueError) as e:
                            logger.warning(f"Failed to parse NAV response for {scheme_name[:30]}: {e}")
            
            # If still no valid NAV, try to calculate from market value and units
            if folio_data.get('current_nav', 0) <= 1:
                market_value = folio_data.get('market_value', 0)
                closing_balance = folio_data.get('closing_balance', 0)
                
                if market_value > 0 and closing_balance > 0:
                    calculated_nav = market_value / closing_balance
                    if calculated_nav > 1 and calculated_nav < 100000:  # Sanity check
                        folio_data['current_nav'] = round(calculated_nav, 4)
                        folio_data['nav_calculated_from_mv'] = True
                        logger.info(f"Calculated NAV {calculated_nav:.4f} for {scheme_name[:30]} from market value")

    def generate(self) -> bytes:
        """Generate the Gap Sheet Excel file with all sheets"""
        # First, try to fetch missing NAVs
        self._fetch_missing_navs()
        
        wb = Workbook()
        
        # Sheet order:
        # 1. Summary (Portfolio Summary + TDS Summary if TDS exists)
        # 2. Portfolio Performance
        # 3. MF Transactions (remaining/held units only)
        # 4. Sold Units (all redeemed/sold transactions with profit calculation)
        # 5. NFT
        # 6. Advisor View (with XIRR, sorted by AUM)
        # 7. XIRR (Broker-wise)
        # 8. TDS Details (only if TDS entries exist)
        self._create_summary_sheet(wb)
        self._create_portfolio_performance_sheet(wb)
        self._create_mf_transactions_sheet(wb)
        self._create_sold_units_sheet(wb)  # New sheet for sold units
        self._create_nft_sheet(wb)
        self._create_advisor_view_sheet(wb)
        self._create_xirr_sheet(wb)
        self._create_tds_sheet(wb)  # Only creates if TDS entries exist
        
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
        - Dashboard summary PDF
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
            
            # 3. Generate Dashboard Summary PDF
            dashboard_pdf = self._generate_dashboard_pdf()
            if dashboard_pdf:
                zip_file.writestr("Dashboard_Summary.pdf", dashboard_pdf)
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()
    
    def _generate_dashboard_pdf(self) -> Optional[bytes]:
        """Generate a PDF with portfolio dashboard summary"""
        try:
            # Create a PDF document
            doc = fitz.open()
            
            # A4 size
            page = doc.new_page(width=595, height=842)
            
            # Colors
            header_color = (0.267, 0.447, 0.769)  # Blue
            text_color = (0.2, 0.2, 0.2)
            accent_color = (0.922, 0.588, 0.094)  # Amber
            green_color = (0.133, 0.545, 0.133)
            red_color = (0.698, 0.133, 0.133)
            
            y_pos = 40
            
            # Title
            page.insert_text(
                (40, y_pos),
                "Portfolio Analysis Dashboard",
                fontsize=20,
                fontname="helv",
                color=header_color
            )
            y_pos += 35
            
            # Report date
            report_date_str = self.report_date.strftime('%d-%b-%Y') if self.report_date else 'N/A'
            page.insert_text(
                (40, y_pos),
                f"Report Date: {report_date_str}",
                fontsize=10,
                fontname="helv",
                color=text_color
            )
            y_pos += 30
            
            # Calculate metrics
            folios = self.parsed_data.get('folios', {})
            total_investment = 0
            total_market_value = 0
            total_redemptions = 0
            holdings_by_type = {'Equity': 0, 'Debt': 0, 'Hybrid': 0, 'Other': 0}
            
            for folio_key, folio_data in folios.items():
                scheme_name = folio_data.get('scheme', '')
                isin = folio_data.get('isin', '')
                market_value = folio_data.get('market_value', 0)
                cost_value = folio_data.get('cost_value', 0)
                
                total_market_value += market_value
                total_investment += cost_value
                
                # Use scheme mapper to get asset category from scheme master
                if self.scheme_mapper:
                    category = self.scheme_mapper.get_asset_category(isin=isin, scheme_name=scheme_name)
                else:
                    # Fallback to keyword matching if no scheme mapper
                    name_lower = scheme_name.lower()
                    if any(k in name_lower for k in ['equity', 'index', 'nifty', 'sensex', 'midcap', 'smallcap', 
                                                      'large cap', 'flexi cap', 'bluechip', 'elss', 'tax saver']):
                        category = 'Equity'
                    elif any(k in name_lower for k in ['debt', 'liquid', 'money market', 'overnight', 'gilt', 
                                                        'bond', 'income', 'credit risk', 'fmp']):
                        category = 'Debt'
                    elif any(k in name_lower for k in ['hybrid', 'balanced', 'arbitrage', 'multi asset']):
                        category = 'Hybrid'
                    else:
                        category = 'Other'
                
                holdings_by_type[category] += market_value
            
            total_gains = total_market_value - total_investment
            gain_percentage = (total_gains / total_investment * 100) if total_investment > 0 else 0
            
            # Summary Box
            page.draw_rect(fitz.Rect(40, y_pos, 555, y_pos + 100), color=(0.95, 0.95, 0.95), fill=(0.95, 0.95, 0.95))
            page.draw_rect(fitz.Rect(40, y_pos, 555, y_pos + 100), color=(0.8, 0.8, 0.8), width=0.5)
            
            # Summary metrics
            metrics = [
                ("Total Investment", f"₹{total_investment:,.0f}"),
                ("Current Value", f"₹{total_market_value:,.0f}"),
                ("Total Gains", f"₹{total_gains:,.0f}"),
                ("Return %", f"{gain_percentage:.2f}%")
            ]
            
            box_width = (555 - 40) / 4
            for i, (label, value) in enumerate(metrics):
                x = 40 + (i * box_width) + 10
                page.insert_text(
                    (x, y_pos + 25),
                    label,
                    fontsize=9,
                    fontname="helv",
                    color=(0.5, 0.5, 0.5)
                )
                value_color = green_color if 'Gains' in label and total_gains >= 0 else red_color if 'Gains' in label else text_color
                if 'Return' in label:
                    value_color = green_color if gain_percentage >= 0 else red_color
                page.insert_text(
                    (x, y_pos + 50),
                    value,
                    fontsize=14,
                    fontname="helv",
                    color=value_color
                )
            
            y_pos += 120
            
            # Asset Allocation Section
            page.insert_text(
                (40, y_pos),
                "Asset Allocation",
                fontsize=14,
                fontname="helv",
                color=header_color
            )
            y_pos += 25
            
            allocation_colors = {
                'Equity': (0.2, 0.4, 0.8),
                'Debt': (0.2, 0.6, 0.3),
                'Hybrid': (0.5, 0.3, 0.7),
                'Other': (0.6, 0.6, 0.6)
            }
            
            total_value = sum(holdings_by_type.values())
            for asset_type, value in holdings_by_type.items():
                if value > 0:
                    pct = (value / total_value * 100) if total_value > 0 else 0
                    bar_width = (pct / 100) * 400
                    
                    page.insert_text(
                        (40, y_pos),
                        f"{asset_type}:",
                        fontsize=10,
                        fontname="helv",
                        color=text_color
                    )
                    
                    # Draw bar
                    page.draw_rect(
                        fitz.Rect(110, y_pos - 10, 110 + bar_width, y_pos + 2),
                        color=allocation_colors.get(asset_type, (0.5, 0.5, 0.5)),
                        fill=allocation_colors.get(asset_type, (0.5, 0.5, 0.5))
                    )
                    
                    page.insert_text(
                        (520, y_pos),
                        f"{pct:.1f}%",
                        fontsize=10,
                        fontname="helv",
                        color=text_color
                    )
                    y_pos += 25
            
            y_pos += 20
            
            # Top Holdings Section
            page.insert_text(
                (40, y_pos),
                "Top 10 Holdings",
                fontsize=14,
                fontname="helv",
                color=header_color
            )
            y_pos += 25
            
            # Sort folios by market value
            sorted_folios = sorted(
                folios.items(),
                key=lambda x: x[1].get('market_value', 0),
                reverse=True
            )[:10]
            
            # Table headers
            headers = ["Scheme Name", "Units", "Value"]
            col_widths = [300, 80, 100]
            x_pos = 40
            for header, width in zip(headers, col_widths):
                page.insert_text(
                    (x_pos, y_pos),
                    header,
                    fontsize=9,
                    fontname="helv",
                    color=(0.4, 0.4, 0.4)
                )
                x_pos += width
            y_pos += 15
            
            # Draw line
            page.draw_line(fitz.Point(40, y_pos - 5), fitz.Point(520, y_pos - 5), color=(0.8, 0.8, 0.8), width=0.5)
            
            for folio_key, folio_data in sorted_folios:
                scheme_name = folio_data.get('scheme', 'Unknown')[:45]
                units = folio_data.get('closing_balance', 0)
                value = folio_data.get('market_value', 0)
                
                x_pos = 40
                page.insert_text(
                    (x_pos, y_pos),
                    scheme_name,
                    fontsize=9,
                    fontname="helv",
                    color=text_color
                )
                page.insert_text(
                    (x_pos + 300, y_pos),
                    f"{units:,.2f}",
                    fontsize=9,
                    fontname="helv",
                    color=text_color
                )
                page.insert_text(
                    (x_pos + 380, y_pos),
                    f"₹{value:,.0f}",
                    fontsize=9,
                    fontname="helv",
                    color=text_color
                )
                y_pos += 18
                
                if y_pos > 780:  # Page overflow
                    break
            
            # Footer
            page.insert_text(
                (40, 820),
                f"Generated by Kinntegraa | {datetime.now().strftime('%d-%b-%Y %H:%M')}",
                fontsize=8,
                fontname="helv",
                color=(0.6, 0.6, 0.6)
            )
            
            # Save PDF to bytes
            pdf_bytes = doc.tobytes()
            doc.close()
            return pdf_bytes
            
        except Exception as e:
            logger.error(f"Error generating dashboard PDF: {e}")
            return None
    
    def _generate_by_pan(self) -> Dict[str, bytes]:
        """Generate separate reports for each PAN"""
        # Group folios by PAN
        pan_folios = defaultdict(dict)
        pan_transactions = defaultdict(list)
        pan_tds = defaultdict(list)
        
        for key, folio in self.parsed_data.get('folios', {}).items():
            pan = folio.get('pan', 'UNKNOWN')
            pan_folios[pan][key] = folio
        
        for trans in self.parsed_data.get('transactions', []):
            pan = trans.get('pan', 'UNKNOWN')
            pan_transactions[pan].append(trans)
        
        for tds in self.parsed_data.get('tds_entries', []):
            pan = tds.get('pan', 'UNKNOWN')
            pan_tds[pan].append(tds)
        
        results = {}
        for pan in pan_folios.keys():
            subset_data = {
                'investor_info': self.parsed_data.get('investor_info', {}),
                'portfolio_summary': self.parsed_data.get('portfolio_summary', {}),
                'folios': pan_folios[pan],
                'transactions': pan_transactions[pan],
                'nft_entries': [n for n in self.parsed_data.get('nft_entries', []) if n.get('pan') == pan],
                'tds_entries': pan_tds[pan],
                'report_date': self.parsed_data.get('report_date'),
                'total_transactions': len(pan_transactions[pan])
            }
            
            generator = GapSheetGenerator(subset_data, self.nav_service, self.scheme_mapper)
            results[pan] = generator.generate()
        
        return results
    
    def _create_portfolio_performance_sheet(self, wb: Workbook):
        """Sheet 2: Portfolio Performance - Matching CAMS Gap Sheet format"""
        ws = wb.create_sheet("Portfolio Performance")
        
        # Column order matching CAMS Gap Sheet format (24 columns):
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
            
            # Classify scheme into category
            def classify_scheme(name):
                name_lower = name.lower() if name else ''
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
                elif 'elss' in name_lower or 'tax saver' in name_lower:
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
            
            # Get asset class using scheme mapper or keyword matching
            asset_class = 'Other'
            if self.scheme_mapper:
                asset_class = self.scheme_mapper.get_asset_category(
                    isin=folio_data.get('isin', ''), 
                    scheme_name=scheme_name
                )
            else:
                asset_class = classify_scheme(scheme_name)
            
            # Map to CAMS asset class names
            asset_class_map = {
                'Equity': 'EQUITY', 'Large Cap': 'EQUITY', 'Mid Cap': 'EQUITY',
                'Small Cap': 'EQUITY', 'Flexi Cap': 'EQUITY', 'Multi Cap': 'EQUITY',
                'ELSS': 'EQUITY', 'Index Fund': 'EQUITY', 'Sectoral/Thematic': 'EQUITY',
                'Debt': 'DEBT', 'Liquid': 'DEBT', 'Hybrid': 'HYBRID', 
                'Arbitrage': 'HYBRID', 'Other': 'EQUITY'
            }
            asset_class = asset_class_map.get(asset_class, 'EQUITY')
            
            # Get inception date (first transaction date)
            inception_date = ''
            first_trans = None
            for t in valid_trans:
                if not t.get('is_redemption'):
                    try:
                        t_date = datetime.strptime(t['date'], '%d-%b-%Y')
                        if first_trans is None or t_date < first_trans:
                            first_trans = t_date
                            inception_date = t['date']
                    except:
                        pass
            
            # Calculate cost price (average)
            cost_price = cost_value / closing_balance if closing_balance > 0 else 0
            
            # Calculate realized and unrealized gains
            realized_gl = withdrawn - sum(t['amount'] for t in valid_trans 
                                          if t.get('is_redemption', False)) if withdrawn > 0 else 0
            unrealized_gl = gains if closing_balance > 0 else 0
            
            # Get advisor name from ARN
            advisor_name = self._get_advisor_name(advisor_arn)
            
            # Get investor name (Group Name)
            investor_name = self.parsed_data.get('investor_info', {}).get('name', '')
            
            entry = {
                'group_name': investor_name,
                'pan': folio_data.get('pan', ''),
                'asset_class': asset_class,
                'advisor': advisor_name,
                'folio': folio_data.get('folio', folio_id),
                'scheme': scheme_name,
                'instrument_type': 'MutualFund',
                'from_date': inception_date,
                'to_date': self.report_date.strftime('%d-%b-%Y') if self.report_date else '',
                'invested': invested,
                'withdrawn': withdrawn,
                'dividend': 0,
                'valuation': market_value,
                'gains': gains,
                'return_pct': return_pct,
                'cagr': cagr,
                'three_yr_pct': cagr,  # Use CAGR as 3 yr % approximation
                'inception_date': inception_date,
                'cost_value': cost_value,
                'cost_price': cost_price,
                'closing_units': closing_balance,
                'realized_gl': realized_gl,
                'unrealized_gl': unrealized_gl,
                'remarks': ''
            }
            
            # Only include folios with actual data (skip empty folios with only NFT transactions)
            if invested > 0 or withdrawn > 0 or market_value > 0 or closing_balance > 0:
                all_entries.append(entry)
        
        # Sort by Valuation (highest first)
        all_entries.sort(key=lambda x: x['valuation'], reverse=True)
        
        # Write data rows - column order matching CAMS Gap Sheet format (24 columns)
        row = 2
        for entry in all_entries:
            # Column 1: Group Name
            ws.cell(row=row, column=1, value=entry['group_name'])
            
            # Column 2: PAN
            ws.cell(row=row, column=2, value=entry['pan'])
            
            # Column 3: Asset Class
            ws.cell(row=row, column=3, value=entry['asset_class'])
            
            # Column 4: Advisor
            ws.cell(row=row, column=4, value=entry['advisor'])
            
            # Column 5: Folio No.
            ws.cell(row=row, column=5, value=entry['folio'])
            
            # Column 6: Instrument Name
            ws.cell(row=row, column=6, value=entry['scheme'])
            
            # Column 7: Instrument Type
            ws.cell(row=row, column=7, value=entry['instrument_type'])
            
            # Column 8: From Date
            ws.cell(row=row, column=8, value=entry['from_date'])
            
            # Column 9: To Date
            ws.cell(row=row, column=9, value=entry['to_date'])
            
            # Column 10: Amount Invested
            cell = ws.cell(row=row, column=10, value=round(entry['invested'], 2))
            cell.number_format = '#,##0.00'
            
            # Column 11: Cash Withdrawal
            cell = ws.cell(row=row, column=11, value=round(entry['withdrawn'], 2))
            cell.number_format = '#,##0.00'
            
            # Column 12: Dividend Paid
            cell = ws.cell(row=row, column=12, value=round(entry['dividend'], 2))
            cell.number_format = '#,##0.00'
            
            # Column 13: Valuation (Current Market Value)
            cell = ws.cell(row=row, column=13, value=round(entry['valuation'], 2))
            cell.number_format = '#,##0.00'
            
            # Column 14: Absolute Gains
            cell = ws.cell(row=row, column=14, value=round(entry['gains'], 2))
            cell.number_format = '#,##0.00'
            
            # Column 15: Absolute Return %
            cell = ws.cell(row=row, column=15, value=round(entry['return_pct'], 4))
            cell.number_format = '0.0000'
            
            # Column 16: CAGR %
            cell = ws.cell(row=row, column=16, value=round(entry['cagr'], 4))
            cell.number_format = '0.0000'
            
            # Column 17: 3 Yr %
            cell = ws.cell(row=row, column=17, value=round(entry['three_yr_pct'], 4))
            cell.number_format = '0.0000'
            
            # Column 18: Inception Date
            ws.cell(row=row, column=18, value=entry['inception_date'])
            
            # Column 19: Cost Value
            cell = ws.cell(row=row, column=19, value=round(entry['cost_value'], 4))
            cell.number_format = '#,##0.0000'
            
            # Column 20: Cost price
            cell = ws.cell(row=row, column=20, value=round(entry['cost_price'], 6))
            cell.number_format = '#,##0.000000'
            
            # Column 21: Closing Units
            cell = ws.cell(row=row, column=21, value=round(entry['closing_units'], 3))
            cell.number_format = '#,##0.000'
            
            # Column 22: Realized GL
            cell = ws.cell(row=row, column=22, value=round(entry['realized_gl'], 2))
            cell.number_format = '#,##0.00'
            
            # Column 23: Unrealized GL
            cell = ws.cell(row=row, column=23, value=round(entry['unrealized_gl'], 2))
            cell.number_format = '#,##0.00'
            
            # Column 24: Remarks
            ws.cell(row=row, column=24, value=entry['remarks'])
            
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
            """Determine fund type based on scheme name - Arbitrage and Hybrid treated as EQUITY for tax"""
            scheme_lower = scheme_name.lower() if scheme_name else ''
            if any(x in scheme_lower for x in ['liquid', 'money market', 'overnight']):
                return 'LIQUID'
            elif any(x in scheme_lower for x in ['debt', 'bond', 'gilt', 'income', 'credit risk', 'dynamic bond', 'corporate bond']):
                return 'DEBT'
            elif any(x in scheme_lower for x in ['arbitrage']):
                return 'EQUITY'  # Arbitrage treated as EQUITY for tax purposes
            elif any(x in scheme_lower for x in ['hybrid', 'balanced', 'aggressive', 'conservative', 'dynamic asset']):
                return 'EQUITY'  # Hybrid treated as EQUITY for tax purposes
            else:
                return 'EQUITY'
        
        def is_long_term(fund_type, holding_days, trans_date):
            """Determine if investment qualifies as Long Term"""
            if fund_type == 'EQUITY':  # Includes Arbitrage and Hybrid
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
        
        # Sort by AUM (Total AUM descending)
        sorted_advisors = sorted(advisor_data.items(), key=lambda x: x[1]['valuation'], reverse=True)
        
        row = 2
        for arn, data in sorted_advisors:
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
        # Added "Cost Value" column after "Balance Units" to show cost of remaining units
        headers = [
            "Account Identifier", "Instrument Name", "ISIN", "Transaction Date",
            "Transaction Details", "Opening Units", "Units (Debit)", "Units (Credit)",
            "Closing Units", "Price", "Transaction Amount", "STT", "Stamp Duty",
            "Total Amount", "Balance Units", "Cost Value", "Current NAV", "Current Market Value",
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
        
        # Filter transactions (excluding NFT, Pledge, STT, Stamp Duty)
        filtered_trans = []
        for trans in self.parsed_data.get('transactions', []):
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
        
        # Calculate remaining units for each purchase using FIFO (First In First Out)
        # Group transactions by folio+isin
        folio_transactions = defaultdict(list)
        for trans in filtered_trans:
            folio = trans.get('folio', '')
            isin = trans.get('isin', '')
            key = f"{folio}_{isin}" if isin else folio
            folio_transactions[key].append(trans)
        
        # For each folio, calculate remaining units per purchase (FIFO)
        purchase_remaining_units = {}  # key = (folio_key, trans_index) -> remaining_units
        
        for folio_key, transactions in folio_transactions.items():
            # Sort transactions by date
            sorted_trans = sorted(transactions, key=lambda x: parse_date(x.get('date', '')))
            
            # Track purchases with their remaining units
            purchases = []  # List of {'index': original_index, 'units': remaining_units, 'date': date}
            
            for idx, trans in enumerate(sorted_trans):
                trans_units = trans.get('units', 0)
                
                if trans.get('is_redemption'):
                    # Redemption: deplete oldest purchases first (FIFO)
                    units_to_redeem = trans_units
                    for purchase in purchases:
                        if units_to_redeem <= 0:
                            break
                        if purchase['units'] > 0:
                            deducted = min(purchase['units'], units_to_redeem)
                            purchase['units'] -= deducted
                            units_to_redeem -= deducted
                else:
                    # Purchase: add to the list
                    purchases.append({
                        'index': idx,
                        'units': trans_units,
                        'date': trans.get('date', ''),
                        'original_units': trans_units
                    })
            
            # Store remaining units for each purchase
            for purchase in purchases:
                # Find the original transaction index in filtered_trans
                for i, trans in enumerate(filtered_trans):
                    t_folio = trans.get('folio', '')
                    t_isin = trans.get('isin', '')
                    t_key = f"{t_folio}_{t_isin}" if t_isin else t_folio
                    if t_key == folio_key and trans.get('date') == purchase['date'] and trans.get('units') == purchase['original_units'] and not trans.get('is_redemption'):
                        purchase_remaining_units[(folio_key, i)] = purchase['units']
                        break
        
        row = 2
        for trans_idx, trans in enumerate(filtered_trans):
            folio = trans.get('folio', '')
            isin = trans.get('isin', '')
            folio_key = f"{folio}_{isin}" if isin else folio
            folio_data = folio_lookup.get(folio_key, {})
            
            # Get remaining units for this transaction (for purchases)
            remaining_units = purchase_remaining_units.get((folio_key, trans_idx), 0)
            
            # Skip ALL redemption transactions - they appear in the Sold Units tab
            if trans.get('is_redemption'):
                continue
            
            # Skip purchase transactions with zero balance units (fully sold)
            if remaining_units <= 0:
                trans_units = trans.get('units', 0)
                if trans_units > 0:
                    # This was a purchase but has 0 remaining - skip it
                    continue
            
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
            
            # Get folio closing balance and current NAV
            folio_closing_balance = folio_data.get('closing_balance', 0)
            current_nav = folio_data.get('current_nav', 0)
            has_balance = folio_closing_balance > 0
            
            # Get remaining units for this specific purchase transaction (FIFO calculated)
            remaining_units = purchase_remaining_units.get((folio_key, trans_idx), 0)
            has_remaining = remaining_units > 0
            
            # Validate current_nav - NAV of 1 or very small values are likely parsing errors
            # Most mutual fund NAVs range from 10 to 10000
            valid_nav = current_nav > 1 and current_nav < 100000
            
            # Column 15: Balance Units - remaining units from THIS purchase (FIFO)
            # Only for purchase transactions with remaining units
            if not trans.get('is_redemption') and has_remaining:
                ws.cell(row=row, column=15, value=round(remaining_units, 3))
            
            # Column 16: Cost Value - cost of remaining balance units
            # Cost Value = (Remaining Units / Original Units) * Transaction Amount
            if not trans.get('is_redemption') and has_remaining and trans_amount > 0:
                original_units = trans.get('units', 0)
                if original_units > 0:
                    cost_value = (remaining_units / original_units) * trans_amount
                    ws.cell(row=row, column=16, value=round(cost_value, 2))
            
            # Column 17: Current NAV - only show for purchases with remaining units and valid NAV
            if not trans.get('is_redemption') and has_remaining and valid_nav:
                ws.cell(row=row, column=17, value=current_nav)
            
            # Column 18: Current Market Value - value of remaining units from THIS purchase
            if not trans.get('is_redemption') and has_remaining and valid_nav:
                market_value = remaining_units * current_nav
                ws.cell(row=row, column=18, value=round(market_value, 2))
            
            # Column 19: MF Ageing - days held for purchases with remaining units
            trans_date = parse_date(trans.get('date', ''))
            if not trans.get('is_redemption') and has_remaining and trans_date != datetime.min:
                days_held = (self.report_date - trans_date).days
                ws.cell(row=row, column=19, value=days_held)
            
            # Column 20: XIRR - Per-transaction XIRR calculation
            # Only calculate for purchase transactions where units from THIS purchase are still held
            # XIRR = annualized return from purchase date to report date
            # Cost = (Remaining Units / Original Units) * Transaction Amount (proportional cost)
            # Current Value = Remaining Units * Current NAV on report date
            xirr_value = None
            if not trans.get('is_redemption') and has_remaining and valid_nav and trans_amount > 0:
                original_units = trans.get('units', 0)
                if original_units > 0 and trans_date != datetime.min:
                    # Calculate proportional cost for remaining units
                    proportional_cost = (remaining_units / original_units) * trans_amount
                    # Calculate current value of remaining units
                    current_value = remaining_units * current_nav
                    
                    # XIRR calculation: 
                    # Cashflow 1: -proportional_cost on trans_date (investment/outflow)
                    # Cashflow 2: +current_value on report_date (current value/inflow)
                    cashflows = [
                        (trans_date, -proportional_cost),  # Investment (outflow)
                        (self.report_date, current_value)  # Current value (inflow)
                    ]
                    
                    try:
                        xirr_rate = calculate_xirr(cashflows) * 100
                        if -100 < xirr_rate < 1000:  # Reasonable XIRR range
                            xirr_value = f"{xirr_rate:.2f}%"
                    except:
                        pass
            
            if xirr_value:
                ws.cell(row=row, column=20, value=xirr_value)
            
            # Column 21: Advisor ARN
            ws.cell(row=row, column=21, value=trans.get('advisor', ''))
            # Column 22: Advisor Name (leave blank - not available in CAS)
            
            row += 1
        
        self._auto_width(ws)
    
    def _create_sold_units_sheet(self, wb: Workbook):
        """Sheet: Sold Units - Shows all redeemed/sold transactions with profit calculation"""
        ws = wb.create_sheet("Sold Units")
        
        # Headers for sold units - added Financial Year and Capital Gain Treatment
        headers = [
            "Account Identifier", "Instrument Name", "ISIN", 
            "Purchase Date", "Purchase NAV", "Units Purchased", "Purchase Amount",
            "Sale Date", "Sale NAV", "Units Sold", "Sale Amount",
            "Holding Days", "Financial Year", "Capital Gain Treatment",
            "Profit/Loss", "Profit %", "Annualized Return %",
            "Advisor ARN"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        # Helper function to get Financial Year from sale date
        def get_financial_year(sale_date):
            """Returns financial year string like 'FY 2024-25' based on sale date"""
            if not sale_date:
                return "N/A"
            # Indian FY runs from April 1 to March 31
            if sale_date.month >= 4:
                return f"FY {sale_date.year}-{str(sale_date.year + 1)[2:]}"
            else:
                return f"FY {sale_date.year - 1}-{str(sale_date.year)[2:]}"
        
        # Helper function to determine capital gain treatment
        def get_capital_gain_treatment(holding_days, scheme_name):
            """
            Determine if capital gain is Long Term or Short Term.
            For Equity MFs: >12 months (365 days) = LTCG
            For Debt MFs: >36 months (1095 days) = LTCG (pre-2023 rule)
            """
            if holding_days <= 0:
                return "N/A"
            
            # Check if it's an equity fund (rough heuristic based on scheme name)
            equity_keywords = ['equity', 'index', 'nifty', 'sensex', 'midcap', 'smallcap', 
                               'large cap', 'multi cap', 'flexi cap', 'bluechip', 'elss', 
                               'tax saver', 'focused', 'growth', 'value']
            debt_keywords = ['debt', 'liquid', 'money market', 'ultra short', 'overnight',
                             'gilt', 'bond', 'income', 'credit risk', 'banking', 'corporate bond',
                             'dynamic bond', 'fixed maturity', 'fmp']
            
            scheme_lower = (scheme_name or '').lower()
            
            is_equity = any(kw in scheme_lower for kw in equity_keywords)
            is_debt = any(kw in scheme_lower for kw in debt_keywords)
            
            # Default to equity if can't determine (more common)
            if is_debt and not is_equity:
                # Debt fund: LTCG after 36 months
                return "Long Term" if holding_days > 1095 else "Short Term"
            else:
                # Equity fund: LTCG after 12 months
                return "Long Term" if holding_days > 365 else "Short Term"
        
        # Collect all redemption transactions
        redemptions = []
        purchases_by_folio = {}  # folio_key -> list of purchases
        
        # First pass: collect all purchases by folio
        for folio_key, folio_data in self.parsed_data.get('folios', {}).items():
            purchases = []
            for trans in folio_data.get('transactions', []):
                if trans.get('is_nft') or trans.get('is_pledge'):
                    continue
                if trans.get('transaction_type') in ['STT Paid', 'Stamp Duty']:
                    continue
                if not trans.get('is_redemption'):
                    purchases.append(trans)
            
            # Sort purchases by date (oldest first) for FIFO matching
            def parse_date(date_str):
                try:
                    return datetime.strptime(date_str, '%d-%b-%Y')
                except:
                    return datetime.min
            
            purchases.sort(key=lambda x: parse_date(x.get('date', '')))
            purchases_by_folio[folio_key] = purchases
        
        # Second pass: match redemptions to purchases using FIFO
        sold_entries = []
        
        for folio_key, folio_data in self.parsed_data.get('folios', {}).items():
            scheme_name = folio_data.get('scheme', '')
            isin = folio_data.get('isin', '')
            folio_num = folio_data.get('folio', folio_key)
            
            # Get purchases for this folio
            available_purchases = []
            for p in purchases_by_folio.get(folio_key, []):
                available_purchases.append({
                    'date': p.get('date'),
                    'nav': p.get('nav', 0),
                    'units': p.get('units', 0),
                    'amount': p.get('amount', 0),
                    'remaining_units': p.get('units', 0),
                    'advisor': p.get('advisor', '')
                })
            
            # Process redemptions
            for trans in folio_data.get('transactions', []):
                if not trans.get('is_redemption'):
                    continue
                if trans.get('is_nft') or trans.get('is_pledge'):
                    continue
                
                sale_date_str = trans.get('date', '')
                sale_nav = trans.get('nav', 0)
                units_to_sell = abs(trans.get('units', 0))
                sale_amount = abs(trans.get('amount', 0))
                
                try:
                    sale_date = datetime.strptime(sale_date_str, '%d-%b-%Y')
                except:
                    sale_date = None
                
                # Match with purchases using FIFO
                remaining_to_sell = units_to_sell
                
                for purchase in available_purchases:
                    if remaining_to_sell <= 0:
                        break
                    if purchase['remaining_units'] <= 0:
                        continue
                    
                    # Calculate how many units from this purchase are sold
                    units_from_this_purchase = min(remaining_to_sell, purchase['remaining_units'])
                    
                    if units_from_this_purchase > 0:
                        # Calculate purchase details for these units
                        purchase_nav = purchase['nav']
                        purchase_amount = (units_from_this_purchase / purchase['units']) * purchase['amount'] if purchase['units'] > 0 else 0
                        
                        # Calculate sale amount for these units
                        sale_amount_portion = (units_from_this_purchase / units_to_sell) * sale_amount if units_to_sell > 0 else 0
                        
                        # Calculate holding period
                        try:
                            purchase_date = datetime.strptime(purchase['date'], '%d-%b-%Y')
                            holding_days = (sale_date - purchase_date).days if sale_date else 0
                        except:
                            purchase_date = None
                            holding_days = 0
                        
                        # Calculate profit/loss
                        profit_loss = sale_amount_portion - purchase_amount
                        profit_pct = (profit_loss / purchase_amount * 100) if purchase_amount > 0 else 0
                        
                        # Calculate annualized return
                        annualized_return = 0
                        if holding_days > 0 and purchase_amount > 0:
                            try:
                                annualized_return = ((sale_amount_portion / purchase_amount) ** (365 / holding_days) - 1) * 100
                            except:
                                pass
                        
                        sold_entries.append({
                            'folio': folio_num,
                            'scheme': scheme_name,
                            'isin': isin,
                            'purchase_date': purchase['date'],
                            'purchase_nav': purchase_nav,
                            'units_purchased': units_from_this_purchase,
                            'purchase_amount': purchase_amount,
                            'sale_date': sale_date_str,
                            'sale_date_obj': sale_date,
                            'sale_nav': sale_nav,
                            'units_sold': units_from_this_purchase,
                            'sale_amount': sale_amount_portion,
                            'holding_days': holding_days,
                            'financial_year': get_financial_year(sale_date),
                            'capital_gain_treatment': get_capital_gain_treatment(holding_days, scheme_name),
                            'profit_loss': profit_loss,
                            'profit_pct': profit_pct,
                            'annualized_return': annualized_return,
                            'advisor': purchase['advisor']
                        })
                        
                        # Update remaining units
                        purchase['remaining_units'] -= units_from_this_purchase
                        remaining_to_sell -= units_from_this_purchase
        
        # Sort entries by sale date
        def parse_date(date_str):
            try:
                return datetime.strptime(date_str, '%d-%b-%Y')
            except:
                return datetime.min
        
        sold_entries.sort(key=lambda x: parse_date(x.get('sale_date', '')))
        
        # Write data
        row = 2
        total_profit = 0
        total_purchase = 0
        total_sale = 0
        
        # Styling for profit/loss
        profit_fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
        loss_fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
        profit_font = Font(color="006100")
        loss_font = Font(color="9C0006")
        
        for entry in sold_entries:
            ws.cell(row=row, column=1, value=entry['folio'])
            ws.cell(row=row, column=2, value=entry['scheme'][:50] if entry['scheme'] else '')
            ws.cell(row=row, column=3, value=entry['isin'])
            ws.cell(row=row, column=4, value=entry['purchase_date'])
            ws.cell(row=row, column=5, value=entry['purchase_nav'])
            ws.cell(row=row, column=6, value=round(entry['units_purchased'], 3))
            ws.cell(row=row, column=7, value=round(entry['purchase_amount'], 2))
            ws.cell(row=row, column=8, value=entry['sale_date'])
            ws.cell(row=row, column=9, value=entry['sale_nav'])
            ws.cell(row=row, column=10, value=round(entry['units_sold'], 3))
            ws.cell(row=row, column=11, value=round(entry['sale_amount'], 2))
            ws.cell(row=row, column=12, value=entry['holding_days'])
            ws.cell(row=row, column=13, value=entry['financial_year'])
            
            # Capital Gain Treatment with color coding
            cg_cell = ws.cell(row=row, column=14, value=entry['capital_gain_treatment'])
            if entry['capital_gain_treatment'] == 'Long Term':
                cg_cell.fill = PatternFill(start_color="E2EFDA", end_color="E2EFDA", fill_type="solid")
                cg_cell.font = Font(color="375623")
            elif entry['capital_gain_treatment'] == 'Short Term':
                cg_cell.fill = PatternFill(start_color="FCE4D6", end_color="FCE4D6", fill_type="solid")
                cg_cell.font = Font(color="974706")
            
            # Profit/Loss with conditional formatting
            profit_cell = ws.cell(row=row, column=15, value=round(entry['profit_loss'], 2))
            pct_cell = ws.cell(row=row, column=16, value=f"{entry['profit_pct']:.2f}%")
            
            if entry['profit_loss'] >= 0:
                profit_cell.fill = profit_fill
                profit_cell.font = profit_font
                pct_cell.fill = profit_fill
                pct_cell.font = profit_font
            else:
                profit_cell.fill = loss_fill
                profit_cell.font = loss_font
                pct_cell.fill = loss_fill
                pct_cell.font = loss_font
            
            ws.cell(row=row, column=17, value=f"{entry['annualized_return']:.2f}%")
            ws.cell(row=row, column=18, value=entry['advisor'])
            
            # Accumulate totals
            total_profit += entry['profit_loss']
            total_purchase += entry['purchase_amount']
            total_sale += entry['sale_amount']
            
            row += 1
        
        # Add summary row
        if sold_entries:
            row += 1
            ws.cell(row=row, column=1, value="TOTAL")
            ws.cell(row=row, column=1).font = Font(bold=True)
            ws.cell(row=row, column=7, value=round(total_purchase, 2))
            ws.cell(row=row, column=7).font = Font(bold=True)
            ws.cell(row=row, column=11, value=round(total_sale, 2))
            ws.cell(row=row, column=11).font = Font(bold=True)
            
            total_profit_cell = ws.cell(row=row, column=15, value=round(total_profit, 2))
            total_profit_cell.font = Font(bold=True)
            if total_profit >= 0:
                total_profit_cell.fill = profit_fill
            else:
                total_profit_cell.fill = loss_fill
            
            if total_purchase > 0:
                total_pct_cell = ws.cell(row=row, column=16, value=f"{(total_profit / total_purchase * 100):.2f}%")
                total_pct_cell.font = Font(bold=True)
        
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
        """Sheet 6: XIRR - Broker/Adviser wise with Date, Description, Amount columns"""
        ws = wb.create_sheet("XIRR")
        
        # Group transactions by Adviser ARN
        adviser_data = defaultdict(lambda: {
            'transactions': [],  # List of (date, description, amount)
            'cashflows': [],     # For XIRR calculation
            'current_value': 0
        })
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            adviser_arn = folio_data.get('advisor', '') or 'NO_ARN'
            closing_balance = folio_data.get('closing_balance', 0)
            current_nav = folio_data.get('current_nav', 0)
            market_value = folio_data.get('market_value', 0)
            
            transactions = folio_data.get('transactions', [])
            
            for trans in transactions:
                # Skip NFT, Pledge, STT, Stamp Duty
                if trans.get('is_nft') or trans.get('is_pledge'):
                    continue
                if trans.get('transaction_type') in ['STT Paid', 'Stamp Duty']:
                    continue
                
                amount = trans.get('amount', 0)
                units = trans.get('units', 0)
                if amount == 0 or units == 0:
                    continue
                
                try:
                    trans_date = datetime.strptime(trans['date'], '%d-%b-%Y')
                except:
                    continue
                
                if trans.get('is_redemption'):
                    # Unit debit = Sell (positive cashflow - money received)
                    adviser_data[adviser_arn]['transactions'].append({
                        'date': trans['date'],
                        'date_obj': trans_date,
                        'description': 'Sell',
                        'amount': amount
                    })
                    adviser_data[adviser_arn]['cashflows'].append((trans_date, amount))
                else:
                    # Unit credit = Purchase (negative cashflow - money spent)
                    adviser_data[adviser_arn]['transactions'].append({
                        'date': trans['date'],
                        'date_obj': trans_date,
                        'description': 'Purchase',
                        'amount': -amount  # Negative for outflow
                    })
                    adviser_data[adviser_arn]['cashflows'].append((trans_date, -amount))
            
            # Add current value for XIRR calculation (but not as a row)
            # Validate NAV - must be greater than 1 to be considered valid
            valid_nav = current_nav > 1 and current_nav < 100000
            if closing_balance > 0 and valid_nav:
                adviser_data[adviser_arn]['current_value'] += market_value
                adviser_data[adviser_arn]['cashflows'].append((self.report_date, market_value))
        
        # Write data - each adviser in separate columns
        col_offset = 0
        
        for adviser_arn, data in adviser_data.items():
            if not data['transactions']:
                continue
            
            # Sort transactions by date
            data['transactions'].sort(key=lambda x: x['date_obj'])
            
            # Calculate XIRR for this adviser
            xirr_pct = 0.0
            if data['cashflows'] and len(data['cashflows']) >= 2:
                xirr_pct = calculate_xirr(data['cashflows']) * 100
            
            # Write adviser header: Adviser Name (ARN)
            start_col = col_offset + 1
            ws.cell(row=1, column=start_col, value=f"Adviser Name ({adviser_arn})")
            ws.merge_cells(start_row=1, start_column=start_col, end_row=1, end_column=start_col + 2)
            self._style_header(ws, 1, 3, start_col=start_col)
            
            # Column headers: Date, Description, Amount
            headers = ["Date", "Description", "Amount"]
            for i, header in enumerate(headers):
                ws.cell(row=2, column=start_col + i, value=header)
            self._style_header(ws, 2, 3, start_col=start_col)
            
            # Write transactions (only Purchase and Sell)
            data_row = 3
            for trans in data['transactions']:
                ws.cell(row=data_row, column=start_col, value=trans['date'])
                ws.cell(row=data_row, column=start_col + 1, value=trans['description'])
                cell = ws.cell(row=data_row, column=start_col + 2, value=round(trans['amount'], 2))
                cell.number_format = '₹#,##0.00'
                data_row += 1
            
            # Add XIRR at the end
            data_row += 1
            ws.cell(row=data_row, column=start_col, value="XIRR %")
            ws.cell(row=data_row, column=start_col + 2, value=f"{xirr_pct:.2f}%" if xirr_pct else "N/A")
            
            # Move to next adviser columns (3 columns + 1 gap)
            col_offset += 4
        
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
    
    def _create_tds_sheet(self, wb: Workbook):
        """Sheet: TDS Details - Only created if TDS entries exist"""
        tds_entries = self.parsed_data.get('tds_entries', [])
        
        # Only create sheet if there are TDS entries
        if not tds_entries:
            return
        
        ws = wb.create_sheet("TDS Details")
        
        # Headers
        headers = [
            "Date", "PAN", "Folio Number", "Scheme Name", "ISIN",
            "Transaction Description", "TDS Amount", "Financial Year"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        # Sort TDS entries by date (oldest first)
        def parse_date(date_str):
            try:
                return datetime.strptime(date_str, '%d-%b-%Y')
            except:
                return datetime.min
        
        sorted_tds = sorted(tds_entries, key=lambda x: parse_date(x.get('date', '')))
        
        # Write TDS data
        row = 2
        for tds in sorted_tds:
            ws.cell(row=row, column=1, value=tds.get('date', ''))
            ws.cell(row=row, column=2, value=tds.get('pan', ''))
            ws.cell(row=row, column=3, value=tds.get('folio', ''))
            ws.cell(row=row, column=4, value=tds.get('scheme', '')[:50] if tds.get('scheme') else '')
            ws.cell(row=row, column=5, value=tds.get('isin', ''))
            ws.cell(row=row, column=6, value=tds.get('transaction_desc', '')[:60] if tds.get('transaction_desc') else '')
            ws.cell(row=row, column=7, value=tds.get('amount', 0))
            ws.cell(row=row, column=8, value=tds.get('financial_year', ''))
            row += 1
        
        # Add FY-wise summary at the bottom
        if sorted_tds:
            row += 2  # Skip a row
            ws.cell(row=row, column=1, value="TDS SUMMARY BY FINANCIAL YEAR")
            ws.merge_cells(f'A{row}:H{row}')
            self._style_header(ws, row, 8)
            
            row += 1
            ws.cell(row=row, column=1, value="Financial Year")
            ws.cell(row=row, column=2, value="Total TDS Amount")
            ws.cell(row=row, column=3, value="Number of Transactions")
            self._style_header(ws, row, 3)
            
            # Calculate FY-wise totals
            tds_by_fy = {}
            for tds in sorted_tds:
                fy = tds.get('financial_year', 'Unknown')
                if fy not in tds_by_fy:
                    tds_by_fy[fy] = {'amount': 0, 'count': 0}
                tds_by_fy[fy]['amount'] += tds.get('amount', 0)
                tds_by_fy[fy]['count'] += 1
            
            # Sort FYs chronologically
            sorted_fys = sorted(tds_by_fy.keys(), key=lambda x: x.split()[1] if len(x.split()) > 1 else x)
            
            total_amount = 0
            total_count = 0
            for fy in sorted_fys:
                row += 1
                ws.cell(row=row, column=1, value=fy)
                ws.cell(row=row, column=2, value=tds_by_fy[fy]['amount'])
                ws.cell(row=row, column=3, value=tds_by_fy[fy]['count'])
                total_amount += tds_by_fy[fy]['amount']
                total_count += tds_by_fy[fy]['count']
            
            # Grand total row
            row += 1
            ws.cell(row=row, column=1, value="GRAND TOTAL")
            ws.cell(row=row, column=1).font = Font(bold=True)
            ws.cell(row=row, column=2, value=total_amount)
            ws.cell(row=row, column=2).font = Font(bold=True)
            ws.cell(row=row, column=3, value=total_count)
            ws.cell(row=row, column=3).font = Font(bold=True)
        
        self._auto_width(ws)
    
    def _create_summary_sheet(self, wb: Workbook):
        """Sheet 1: Summary - Portfolio Summary only"""
        ws = wb.create_sheet("Summary", 0)  # Position 0 to make it first
        
        # Portfolio Summary Section
        ws.cell(row=1, column=1, value="PORTFOLIO SUMMARY")
        ws.merge_cells('A1:B1')
        self._style_header(ws, 1, 2)
        
        # Calculate totals
        total_invested = 0
        total_current_value = 0
        total_withdrawn = 0
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            market_value = folio_data.get('market_value', 0)
            closing_balance = folio_data.get('closing_balance', 0)
            
            if closing_balance > 0 and market_value > 0:
                total_current_value += market_value
            
            # Calculate invested amount and withdrawals from transactions
            for trans in folio_data.get('transactions', []):
                if trans.get('is_nft') or trans.get('is_pledge'):
                    continue
                if trans.get('transaction_type') in ['STT Paid', 'Stamp Duty']:
                    continue
                
                amount = trans.get('amount', 0)
                if trans.get('is_redemption'):
                    total_withdrawn += amount
                else:
                    total_invested += amount
        
        # Summary headers
        ws.cell(row=3, column=1, value="Metric")
        ws.cell(row=3, column=2, value="Value")
        self._style_header(ws, 3, 2)
        
        # Helper function to format currency with ₹ and Indian number system
        def format_inr(amount):
            """Format amount in Indian numbering system: X,XX,XX,XXX"""
            is_negative = amount < 0
            amount = abs(amount)
            
            int_part = int(amount)
            dec_part = round((amount - int_part) * 100)
            
            s = str(int_part)
            if len(s) <= 3:
                formatted = s
            else:
                formatted = s[-3:]
                s = s[:-3]
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
        
        # TDS Summary Section - Only show if TDS entries exist
        tds_entries = self.parsed_data.get('tds_entries', [])
        if tds_entries:
            # Calculate TDS by Financial Year
            tds_by_fy = {}
            total_tds = 0
            for tds in tds_entries:
                fy = tds.get('financial_year', 'Unknown')
                amount = tds.get('amount', 0)
                tds_by_fy[fy] = tds_by_fy.get(fy, 0) + amount
                total_tds += amount
            
            # Add TDS Summary section starting at row 9
            row = 9
            ws.cell(row=row, column=1, value="TDS SUMMARY (Year-wise)")
            ws.merge_cells(f'A{row}:B{row}')
            self._style_header(ws, row, 2)
            
            row += 2
            ws.cell(row=row, column=1, value="Financial Year")
            ws.cell(row=row, column=2, value="TDS Deducted")
            self._style_header(ws, row, 2)
            
            # Sort FYs chronologically
            sorted_fys = sorted(tds_by_fy.keys(), key=lambda x: x.split()[1] if len(x.split()) > 1 else x)
            
            for fy in sorted_fys:
                row += 1
                ws.cell(row=row, column=1, value=fy)
                ws.cell(row=row, column=2, value=format_inr(tds_by_fy[fy]))
            
            # Total TDS row
            row += 1
            ws.cell(row=row, column=1, value="Total TDS")
            ws.cell(row=row, column=1).font = Font(bold=True)
            ws.cell(row=row, column=2, value=format_inr(total_tds))
            ws.cell(row=row, column=2).font = Font(bold=True)
        
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
