"""
CAS PDF Analysis Service
Parses Consolidated Account Statement PDFs and generates Gap Sheet reports
"""
import fitz  # PyMuPDF
import re
import requests
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple
from collections import defaultdict
import io
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
import logging

logger = logging.getLogger(__name__)

# MFapi.in base URL for NAV data
MFAPI_BASE_URL = "https://api.mfapi.in"


class CASParser:
    """Parser for Consolidated Account Statement PDFs"""
    
    def __init__(self, pdf_bytes: bytes, password: str):
        self.pdf_bytes = pdf_bytes
        self.password = password
        self.transactions = []
        self.folios = {}
        self.portfolio_summary = {}
        
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
            self._parse_portfolio_summary(full_text)
            self._parse_transactions(full_text)
            
            return {
                "portfolio_summary": self.portfolio_summary,
                "folios": self.folios,
                "transactions": self.transactions,
                "total_transactions": len(self.transactions)
            }
            
        except Exception as e:
            logger.error(f"Error parsing CAS PDF: {e}")
            raise
    
    def _parse_portfolio_summary(self, text: str):
        """Extract portfolio summary from the first page"""
        # Extract AMC-wise summary
        amc_pattern = r'^\s{6}([A-Za-z\s]+(?:Mutual Fund|MF))\s*\n?\s*([\d,]+\.\d+)\s*\n?\s*([\d,]+\.\d+)'
        
        lines = text.split('\n')
        in_summary = False
        
        for i, line in enumerate(lines):
            if 'PORTFOLIO SUMMARY' in line:
                in_summary = True
                continue
            
            if in_summary and 'Total' in line:
                # Extract total
                total_match = re.search(r'Total\s*([\d,]+\.\d+)\s*([\d,]+\.\d+)', line)
                if total_match:
                    self.portfolio_summary['total_cost'] = float(total_match.group(1).replace(',', ''))
                    self.portfolio_summary['total_value'] = float(total_match.group(2).replace(',', ''))
                break
            
            if in_summary:
                # Match AMC line
                match = re.match(r'\s*([A-Za-z\s]+(?:Mutual Fund|MF))\s*([\d,]+\.\d+)\s*([\d,]+\.\d+)', line)
                if match:
                    amc_name = match.group(1).strip()
                    cost = float(match.group(2).replace(',', ''))
                    value = float(match.group(3).replace(',', ''))
                    if cost > 0 or value > 0:
                        self.portfolio_summary[amc_name] = {
                            'cost': cost,
                            'value': value
                        }
    
    def _parse_transactions(self, text: str):
        """Extract all transaction details from the PDF"""
        # Pattern for folio header with scheme info
        folio_pattern = r'([A-Z0-9]+-[A-Za-z0-9\s\-\(\)]+)\s*-\s*ISIN:\s*([A-Z0-9]+).*?Folio No:\s*([\d\s/]+)'
        
        # Pattern for transaction line
        # Date, Amount, Price, Units, Transaction Type, Balance
        trans_pattern = r'(\d{2}-[A-Za-z]{3}-\d{4})\s+([\d,]+\.\d+)\s+([\d.]+)\s+([\d,]+\.\d+)\s+([A-Za-z\s\-]+)\s+([\d,]+\.\d+)'
        
        current_folio = None
        current_scheme = None
        current_isin = None
        current_pan = None
        
        lines = text.split('\n')
        
        for i, line in enumerate(lines):
            # Check for PAN
            pan_match = re.search(r'PAN:\s*([A-Z]{5}\d{4}[A-Z])', line)
            if pan_match:
                current_pan = pan_match.group(1)
            
            # Check for folio and scheme
            folio_match = re.search(r'Folio No:\s*([\d\s/]+)', line)
            if folio_match:
                current_folio = folio_match.group(1).strip()
            
            # Check for ISIN
            isin_match = re.search(r'ISIN:\s*([A-Z0-9]+)', line)
            if isin_match:
                current_isin = isin_match.group(1)
            
            # Check for scheme name (line before ISIN usually)
            scheme_match = re.match(r'^([A-Z0-9]+-[A-Za-z0-9\s\-\(\)]+(?:Growth|IDCW|Dividend|Regular|Direct)[A-Za-z\s\-\(\)]*)', line)
            if scheme_match:
                current_scheme = scheme_match.group(1).strip()
            
            # Check for transaction
            trans_match = re.match(r'(\d{2}-[A-Za-z]{3}-\d{4})\s+([\d,]+\.\d+)\s+([\d.]+)\s+([\d,]+\.\d+)\s+(.+?)\s*-?\s*([\d,]+\.\d+)?$', line)
            if trans_match and current_folio:
                date_str = trans_match.group(1)
                amount = float(trans_match.group(2).replace(',', ''))
                nav = float(trans_match.group(3))
                units = float(trans_match.group(4).replace(',', ''))
                trans_type = trans_match.group(5).strip()
                balance = float(trans_match.group(6).replace(',', '')) if trans_match.group(6) else 0
                
                # Skip stamp duty entries
                if 'Stamp Duty' in trans_type:
                    continue
                
                transaction = {
                    'date': date_str,
                    'amount': amount,
                    'nav': nav,
                    'units': units,
                    'transaction_type': trans_type,
                    'balance': balance,
                    'folio': current_folio,
                    'scheme': current_scheme,
                    'isin': current_isin,
                    'pan': current_pan
                }
                
                self.transactions.append(transaction)
                
                # Store in folios dict
                if current_folio not in self.folios:
                    self.folios[current_folio] = {
                        'scheme': current_scheme,
                        'isin': current_isin,
                        'pan': current_pan,
                        'transactions': []
                    }
                self.folios[current_folio]['transactions'].append(transaction)
        
        return self.transactions


class NAVService:
    """Service to fetch NAV data from MFapi.in"""
    
    @staticmethod
    def search_scheme(query: str) -> List[Dict]:
        """Search for mutual fund schemes"""
        try:
            response = requests.get(f"{MFAPI_BASE_URL}/mf/search", params={"q": query}, timeout=10)
            if response.status_code == 200:
                return response.json()
            return []
        except Exception as e:
            logger.error(f"Error searching scheme: {e}")
            return []
    
    @staticmethod
    def get_latest_nav(scheme_code: str) -> Optional[Dict]:
        """Get latest NAV for a scheme"""
        try:
            response = requests.get(f"{MFAPI_BASE_URL}/mf/{scheme_code}/latest", timeout=10)
            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            logger.error(f"Error fetching NAV for {scheme_code}: {e}")
            return None
    
    @staticmethod
    def get_nav_history(scheme_code: str, start_date: str = None, end_date: str = None) -> Optional[Dict]:
        """Get historical NAV data for a scheme"""
        try:
            url = f"{MFAPI_BASE_URL}/mf/{scheme_code}"
            if start_date and end_date:
                url += f"?startDate={start_date}&endDate={end_date}"
            response = requests.get(url, timeout=15)
            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            logger.error(f"Error fetching NAV history for {scheme_code}: {e}")
            return None


class SchemeMapper:
    """Maps ISIN/scheme names to MF API scheme codes using scheme master data"""
    
    def __init__(self, scheme_master_data: List[Dict]):
        self.scheme_master = scheme_master_data
        self._build_index()
    
    def _build_index(self):
        """Build lookup indices for fast searching"""
        self.isin_index = {}
        self.name_index = {}
        
        for scheme in self.scheme_master:
            if scheme.get('isin'):
                self.isin_index[scheme['isin']] = scheme
            if scheme.get('scheme_name'):
                # Create normalized name for matching
                normalized = scheme['scheme_name'].lower().replace(' ', '').replace('-', '')
                self.name_index[normalized] = scheme
    
    def get_scheme_code(self, isin: str = None, scheme_name: str = None) -> Optional[str]:
        """Get MF API scheme code from ISIN or scheme name"""
        if isin and isin in self.isin_index:
            return self.isin_index[isin].get('scheme_code')
        
        if scheme_name:
            normalized = scheme_name.lower().replace(' ', '').replace('-', '')
            if normalized in self.name_index:
                return self.name_index[normalized].get('scheme_code')
            
            # Fuzzy match
            for key, scheme in self.name_index.items():
                if normalized in key or key in normalized:
                    return scheme.get('scheme_code')
        
        return None


class GapSheetGenerator:
    """Generates Gap Sheet Excel report from parsed CAS data"""
    
    def __init__(self, parsed_data: Dict, nav_service: NAVService, scheme_mapper: SchemeMapper = None):
        self.parsed_data = parsed_data
        self.nav_service = nav_service
        self.scheme_mapper = scheme_mapper
        self.current_navs = {}
    
    def _fetch_current_navs(self):
        """Fetch current NAVs for all schemes"""
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            isin = folio_data.get('isin')
            scheme_name = folio_data.get('scheme')
            
            if isin and isin not in self.current_navs:
                # Try to get scheme code and fetch NAV
                scheme_code = None
                if self.scheme_mapper:
                    scheme_code = self.scheme_mapper.get_scheme_code(isin=isin, scheme_name=scheme_name)
                
                if scheme_code:
                    nav_data = self.nav_service.get_latest_nav(scheme_code)
                    if nav_data and nav_data.get('data'):
                        self.current_navs[isin] = float(nav_data['data'][0]['nav'])
    
    def generate(self) -> bytes:
        """Generate the Gap Sheet Excel file"""
        wb = Workbook()
        
        # Fetch current NAVs
        self._fetch_current_navs()
        
        # Create sheets
        self._create_portfolio_performance_sheet(wb)
        self._create_holdings_sheet(wb)
        self._create_transactions_sheet(wb)
        self._create_advisor_view_sheet(wb)
        
        # Remove default sheet if exists
        if 'Sheet' in wb.sheetnames:
            del wb['Sheet']
        
        # Save to bytes
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output.getvalue()
    
    def _create_portfolio_performance_sheet(self, wb: Workbook):
        """Create Portfolio Performance sheet"""
        ws = wb.create_sheet("Portfolio Performance", 0)
        
        # Header styling
        header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        
        headers = [
            "PAN", "Folio No.", "Instrument Name", "ISIN", 
            "Amount Invested", "Current NAV", "Current Units", 
            "Valuation", "Absolute Gains", "Absolute Return %"
        ]
        
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center")
        
        row = 2
        total_invested = 0
        total_valuation = 0
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            transactions = folio_data.get('transactions', [])
            if not transactions:
                continue
            
            # Calculate totals for this folio
            invested = sum(t['amount'] for t in transactions if 'Purchase' in t.get('transaction_type', ''))
            redeemed = sum(t['amount'] for t in transactions if 'Redemption' in t.get('transaction_type', ''))
            net_invested = invested - redeemed
            
            # Get current units (last balance)
            current_units = transactions[-1].get('balance', 0) if transactions else 0
            
            # Get current NAV
            isin = folio_data.get('isin')
            current_nav = self.current_navs.get(isin, transactions[-1].get('nav', 0) if transactions else 0)
            
            # Calculate valuation
            valuation = current_units * current_nav
            gains = valuation - net_invested
            return_pct = (gains / net_invested * 100) if net_invested > 0 else 0
            
            ws.cell(row=row, column=1, value=folio_data.get('pan', ''))
            ws.cell(row=row, column=2, value=folio_id)
            ws.cell(row=row, column=3, value=folio_data.get('scheme', ''))
            ws.cell(row=row, column=4, value=isin)
            ws.cell(row=row, column=5, value=round(net_invested, 2))
            ws.cell(row=row, column=6, value=round(current_nav, 4))
            ws.cell(row=row, column=7, value=round(current_units, 3))
            ws.cell(row=row, column=8, value=round(valuation, 2))
            ws.cell(row=row, column=9, value=round(gains, 2))
            ws.cell(row=row, column=10, value=round(return_pct, 2))
            
            total_invested += net_invested
            total_valuation += valuation
            row += 1
        
        # Add totals row
        total_gains = total_valuation - total_invested
        total_return = (total_gains / total_invested * 100) if total_invested > 0 else 0
        
        ws.cell(row=row, column=1, value="TOTAL")
        ws.cell(row=row, column=1).font = Font(bold=True)
        ws.cell(row=row, column=5, value=round(total_invested, 2))
        ws.cell(row=row, column=8, value=round(total_valuation, 2))
        ws.cell(row=row, column=9, value=round(total_gains, 2))
        ws.cell(row=row, column=10, value=round(total_return, 2))
        
        # Auto-adjust column widths
        for col in range(1, len(headers) + 1):
            ws.column_dimensions[get_column_letter(col)].width = 18
    
    def _create_holdings_sheet(self, wb: Workbook):
        """Create Mutual Fund Holding sheet"""
        ws = wb.create_sheet("MF Holdings")
        
        header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        
        headers = ["PAN", "Folio No.", "Scheme Name", "ISIN", "Units", "NAV", "Value"]
        
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.fill = header_fill
            cell.font = header_font
        
        row = 2
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            transactions = folio_data.get('transactions', [])
            if not transactions:
                continue
            
            current_units = transactions[-1].get('balance', 0)
            if current_units <= 0:
                continue
            
            isin = folio_data.get('isin')
            current_nav = self.current_navs.get(isin, transactions[-1].get('nav', 0))
            value = current_units * current_nav
            
            ws.cell(row=row, column=1, value=folio_data.get('pan', ''))
            ws.cell(row=row, column=2, value=folio_id)
            ws.cell(row=row, column=3, value=folio_data.get('scheme', ''))
            ws.cell(row=row, column=4, value=isin)
            ws.cell(row=row, column=5, value=round(current_units, 3))
            ws.cell(row=row, column=6, value=round(current_nav, 4))
            ws.cell(row=row, column=7, value=round(value, 2))
            row += 1
        
        for col in range(1, len(headers) + 1):
            ws.column_dimensions[get_column_letter(col)].width = 20
    
    def _create_transactions_sheet(self, wb: Workbook):
        """Create MF Transactions sheet"""
        ws = wb.create_sheet("MF Transactions")
        
        header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        
        headers = ["Date", "PAN", "Folio No.", "Scheme Name", "Transaction Type", "Amount", "NAV", "Units", "Balance"]
        
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.fill = header_fill
            cell.font = header_font
        
        row = 2
        for transaction in self.parsed_data.get('transactions', []):
            ws.cell(row=row, column=1, value=transaction.get('date', ''))
            ws.cell(row=row, column=2, value=transaction.get('pan', ''))
            ws.cell(row=row, column=3, value=transaction.get('folio', ''))
            ws.cell(row=row, column=4, value=transaction.get('scheme', ''))
            ws.cell(row=row, column=5, value=transaction.get('transaction_type', ''))
            ws.cell(row=row, column=6, value=transaction.get('amount', 0))
            ws.cell(row=row, column=7, value=transaction.get('nav', 0))
            ws.cell(row=row, column=8, value=transaction.get('units', 0))
            ws.cell(row=row, column=9, value=transaction.get('balance', 0))
            row += 1
        
        for col in range(1, len(headers) + 1):
            ws.column_dimensions[get_column_letter(col)].width = 18
    
    def _create_advisor_view_sheet(self, wb: Workbook):
        """Create Advisor View sheet"""
        ws = wb.create_sheet("Advisor View")
        
        header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        
        headers = ["Advisor", "Amount Invested", "Valuation", "Absolute Gains", "Return %"]
        
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.fill = header_fill
            cell.font = header_font
        
        # Group by advisor (extracted from scheme names if present)
        advisor_data = defaultdict(lambda: {'invested': 0, 'valuation': 0})
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            transactions = folio_data.get('transactions', [])
            if not transactions:
                continue
            
            # Try to extract advisor from transaction type or use default
            advisor = "KINNTEGRAA"  # Default advisor
            
            invested = sum(t['amount'] for t in transactions if 'Purchase' in t.get('transaction_type', ''))
            redeemed = sum(t['amount'] for t in transactions if 'Redemption' in t.get('transaction_type', ''))
            net_invested = invested - redeemed
            
            current_units = transactions[-1].get('balance', 0)
            isin = folio_data.get('isin')
            current_nav = self.current_navs.get(isin, transactions[-1].get('nav', 0))
            valuation = current_units * current_nav
            
            advisor_data[advisor]['invested'] += net_invested
            advisor_data[advisor]['valuation'] += valuation
        
        row = 2
        for advisor, data in advisor_data.items():
            gains = data['valuation'] - data['invested']
            return_pct = (gains / data['invested'] * 100) if data['invested'] > 0 else 0
            
            ws.cell(row=row, column=1, value=advisor)
            ws.cell(row=row, column=2, value=round(data['invested'], 2))
            ws.cell(row=row, column=3, value=round(data['valuation'], 2))
            ws.cell(row=row, column=4, value=round(gains, 2))
            ws.cell(row=row, column=5, value=round(return_pct, 2))
            row += 1
        
        for col in range(1, len(headers) + 1):
            ws.column_dimensions[get_column_letter(col)].width = 20


def parse_scheme_master_file(file_content: str) -> List[Dict]:
    """Parse the BSE scheme master file (pipe-delimited)"""
    schemes = []
    lines = file_content.strip().split('\n')
    
    if not lines:
        return schemes
    
    # First line is header
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
