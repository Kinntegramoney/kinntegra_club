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
from pymongo import MongoClient
import os

logger = logging.getLogger(__name__)

MFAPI_BASE_URL = "https://api.mfapi.in"
GRANDFATHERING_DATE = datetime(2018, 1, 31)
GRANDFATHERING_DATE_STR = "31-01-2018"

# MongoDB connection for grandfathered NAV cache
_mongo_client = None
_db = None

def get_db():
    """Get MongoDB database connection"""
    global _mongo_client, _db
    if _db is None:
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/investmentdb')
        _mongo_client = MongoClient(mongo_url)
        _db = _mongo_client['investmentdb']
    return _db


class NAVFetcher:
    """
    Fetches historical NAV data from mfapi.in for grandfathering calculations.
    First checks MongoDB cache, then falls back to API calls.
    """
    
    # Class-level cache for ISIN -> scheme_code mapping (in-memory)
    _isin_to_scheme_code: Dict[str, Optional[int]] = {}
    # Class-level cache for scheme_code -> NAV on grandfathering date (in-memory)
    _grandfathered_nav_cache: Dict[int, Optional[float]] = {}
    # Track ISINs we've already tried to fetch (to avoid repeated failed lookups)
    _failed_isin_lookups: set = set()
    # All scheme list (schemeCode -> basic info)
    _all_schemes_list: List[Dict] = []
    _schemes_loaded: bool = False
    # Flag to indicate if we've loaded from DB
    _db_cache_loaded: bool = False
    
    @classmethod
    def _load_from_db_cache(cls):
        """Load all grandfathered NAVs from MongoDB into memory cache"""
        if cls._db_cache_loaded:
            return
        
        try:
            db = get_db()
            nav_records = list(db.grandfathered_navs.find({}))
            
            for record in nav_records:
                isin = record.get('isin', '').upper()
                scheme_code = record.get('scheme_code')
                nav_value = record.get('nav_value')
                
                if isin and scheme_code:
                    cls._isin_to_scheme_code[isin] = scheme_code
                if scheme_code and nav_value is not None:
                    cls._grandfathered_nav_cache[scheme_code] = nav_value
            
            cls._db_cache_loaded = True
            logger.info(f"Loaded {len(nav_records)} grandfathered NAVs from database cache")
        except Exception as e:
            logger.error(f"Error loading grandfathered NAVs from database: {e}")
    
    @classmethod
    def get_nav_from_db(cls, isin: str) -> Optional[float]:
        """Get grandfathered NAV from database by ISIN"""
        if not isin:
            return None
        
        isin = isin.strip().upper()
        
        # Load DB cache if not already loaded
        cls._load_from_db_cache()
        
        # Check in-memory cache first (populated from DB)
        if isin in cls._isin_to_scheme_code:
            scheme_code = cls._isin_to_scheme_code[isin]
            if scheme_code in cls._grandfathered_nav_cache:
                return cls._grandfathered_nav_cache[scheme_code]
        
        # Direct DB lookup if not in memory cache
        try:
            db = get_db()
            record = db.grandfathered_navs.find_one({'isin': isin})
            if record and record.get('nav_value') is not None:
                # Update in-memory cache
                cls._isin_to_scheme_code[isin] = record.get('scheme_code')
                cls._grandfathered_nav_cache[record.get('scheme_code')] = record.get('nav_value')
                return record.get('nav_value')
        except Exception as e:
            logger.error(f"Error fetching NAV from DB for ISIN {isin}: {e}")
        
        return None
    
    @classmethod
    def _load_all_schemes(cls) -> bool:
        """Load list of all schemes from mfapi.in (lightweight - just codes and names)"""
        if cls._schemes_loaded:
            return True
        
        try:
            logger.info("Loading all scheme codes from mfapi.in...")
            all_schemes_url = f"{MFAPI_BASE_URL}/mf"
            response = requests.get(all_schemes_url, timeout=30)
            
            if response.status_code == 200:
                cls._all_schemes_list = response.json()
                cls._schemes_loaded = True
                logger.info(f"Loaded {len(cls._all_schemes_list)} scheme codes")
                return True
        except Exception as e:
            logger.error(f"Failed to load scheme list: {e}")
        
        return False
    
    @classmethod
    def _fetch_scheme_code_by_isin(cls, isin: str, scheme_name_hint: str = None) -> Optional[int]:
        """
        Fetch the AMFI scheme code for a given ISIN.
        Strategy:
        1. Check cache
        2. Use scheme name hint to narrow search
        3. Check schemes matching the hint
        """
        if not isin:
            return None
        
        isin = isin.strip().upper()
        
        # Check cache first
        if isin in cls._isin_to_scheme_code:
            return cls._isin_to_scheme_code[isin]
        
        # Skip if we already failed to find this ISIN
        if isin in cls._failed_isin_lookups:
            return None
        
        try:
            # Load scheme list if not loaded
            if not cls._load_all_schemes():
                cls._failed_isin_lookups.add(isin)
                return None
            
            # Extract AMC name from ISIN prefix for filtering
            isin_prefix = isin[:7] if len(isin) >= 7 else isin
            
            # Build list of schemes to check based on hints
            schemes_to_check = []
            
            # If we have a scheme name hint, filter by it
            if scheme_name_hint:
                # Extract key words from scheme name (e.g., "HDFC", "Large Cap", "Growth")
                hint_words = []
                hint_lower = scheme_name_hint.lower()
                
                # Extract AMC name
                amc_patterns = ['hdfc', 'sbi', 'icici', 'kotak', 'axis', 'mirae', 'nippon', 
                               'aditya birla', 'tata', 'dsp', 'uti', 'sundaram', 'motilal']
                for amc in amc_patterns:
                    if amc in hint_lower:
                        hint_words.append(amc.upper() if amc != 'aditya birla' else 'Aditya Birla')
                        break
                
                # Extract fund type keywords
                fund_types = ['large cap', 'mid cap', 'small cap', 'flexi cap', 'multi cap',
                             'index', 'nifty', 'balanced', 'equity', 'liquid', 'gilt']
                for ft in fund_types:
                    if ft in hint_lower:
                        hint_words.append(ft.title())
                        break
                
                # Filter schemes by hint words
                if hint_words:
                    for scheme in cls._all_schemes_list:
                        scheme_name = scheme.get('schemeName', '')
                        if all(word.lower() in scheme_name.lower() for word in hint_words):
                            schemes_to_check.append(scheme.get('schemeCode'))
            
            # If no hint or no matches, use ISIN prefix to identify AMC
            if not schemes_to_check:
                # Map ISIN prefixes to AMC search terms
                isin_amc_map = {
                    'INF179K': 'HDFC',
                    'INF200K': 'SBI',
                    'INF109K': 'ICICI',
                    'INF174K': 'Kotak',
                    'INF846K': 'Axis',
                    'INF769K': 'Mirae',
                    'INF204K': 'Nippon',
                    'INF209K': 'Aditya Birla',
                    'INF277K': 'Tata',
                    'INF740K': 'DSP',
                    'INF789F': 'UTI',
                    'INF903J': 'Sundaram',
                    'INF247L': 'Motilal',
                }
                
                amc_search = isin_amc_map.get(isin_prefix, '')
                if amc_search:
                    for scheme in cls._all_schemes_list:
                        if amc_search.upper() in scheme.get('schemeName', '').upper():
                            schemes_to_check.append(scheme.get('schemeCode'))
            
            # Limit search to avoid too many API calls
            max_schemes_to_check = min(len(schemes_to_check), 100)
            logger.info(f"Searching {max_schemes_to_check} schemes for ISIN {isin}")
            
            # Check schemes
            for scheme_code in schemes_to_check[:max_schemes_to_check]:
                if not scheme_code:
                    continue
                    
                try:
                    meta_url = f"{MFAPI_BASE_URL}/mf/{scheme_code}/latest"
                    meta_response = requests.get(meta_url, timeout=5)
                    
                    if meta_response.status_code == 200:
                        meta_data = meta_response.json()
                        meta = meta_data.get('meta', {})
                        
                        # Check all ISIN variants
                        for isin_key in ['isin_growth', 'isin_div_payout', 'isin_div_reinvestment']:
                            found_isin = (meta.get(isin_key) or '').strip().upper()
                            if found_isin:
                                cls._isin_to_scheme_code[found_isin] = scheme_code
                                
                                # Check if we found our target
                                if found_isin == isin:
                                    logger.info(f"Found scheme code {scheme_code} for ISIN {isin}")
                                    return scheme_code
                except Exception:
                    continue
            
            # If not found after search, mark as failed
            cls._failed_isin_lookups.add(isin)
            logger.warning(f"Could not find scheme code for ISIN {isin}")
            return None
            
        except Exception as e:
            logger.error(f"Error fetching scheme code for ISIN {isin}: {e}")
            cls._failed_isin_lookups.add(isin)
            return None
    
    @classmethod
    def get_grandfathered_nav(cls, isin: str, scheme_name_hint: str = None) -> Optional[float]:
        """
        Get the NAV for a scheme on 31-Jan-2018 (grandfathering date).
        First checks database cache, then falls back to API.
        Returns None if scheme didn't exist or data unavailable.
        """
        if not isin:
            return None
        
        isin = isin.strip().upper()
        
        # STEP 1: Check database cache first (fastest)
        db_nav = cls.get_nav_from_db(isin)
        if db_nav is not None:
            return db_nav
        
        # STEP 2: Check in-memory cache
        if isin in cls._isin_to_scheme_code:
            scheme_code = cls._isin_to_scheme_code[isin]
            if scheme_code in cls._grandfathered_nav_cache:
                return cls._grandfathered_nav_cache[scheme_code]
        
        # STEP 3: If not in database, return None (skip API calls for performance)
        # The database should be pre-populated with all relevant NAVs
        # API fallback is only used if explicitly enabled
        cls._failed_isin_lookups.add(isin)
        return None
    
    @classmethod
    def calculate_grandfathered_cost(cls, isin: str, purchase_date: datetime, 
                                      units: float, original_cost: float,
                                      scheme_name_hint: str = None) -> Tuple[Optional[float], Optional[float]]:
        """
        Calculate the grandfathered NAV and cost basis for a pre-2018 equity purchase.
        
        For equity funds purchased before 31-Jan-2018, the cost basis for LTCG tax is:
        max(original_purchase_price, min(31-Jan-2018_NAV, sale_NAV)) * units
        
        This simplified version calculates:
        - Grandfathered NAV: NAV on 31-Jan-2018
        - Grandfathered Cost: max(original_cost, units * grandfathered_nav)
        
        Returns (grandfathered_nav, grandfathered_cost) or (None, None) if not applicable.
        """
        if not isin or not purchase_date:
            return None, None
        
        # Grandfathering only applies to purchases before 31-Jan-2018
        if purchase_date >= GRANDFATHERING_DATE:
            return None, None
        
        # Get grandfathered NAV
        gf_nav = cls.get_grandfathered_nav(isin, scheme_name_hint)
        if not gf_nav:
            return None, None
        
        # Calculate grandfathered cost
        # For tax purposes: max(original_cost, units * grandfathered_nav)
        gf_cost = units * gf_nav
        grandfathered_cost = max(original_cost, gf_cost)
        
        return gf_nav, grandfathered_cost
    
    @classmethod
    def is_equity_fund(cls, scheme_name: str) -> bool:
        """
        Determine if a scheme is an equity fund (grandfathering applies to equity funds only).
        """
        if not scheme_name:
            return False
        
        scheme_lower = scheme_name.lower()
        
        # Equity fund keywords
        equity_keywords = ['equity', 'index', 'nifty', 'sensex', 'midcap', 'smallcap', 
                          'large cap', 'largecap', 'multi cap', 'multicap', 'flexi cap', 
                          'flexicap', 'bluechip', 'elss', 'tax saver', 'focused', 
                          'value fund', 'contra', 'dividend yield', 'arbitrage',
                          'balanced advantage', 'aggressive hybrid', 'dynamic asset']
        
        # Debt/non-equity keywords (exclusions)
        debt_keywords = ['debt', 'liquid', 'money market', 'ultra short', 'overnight',
                        'gilt', 'bond', 'income fund', 'credit risk', 'banking psu',
                        'corporate bond', 'dynamic bond', 'fixed maturity', 'fmp',
                        'conservative hybrid', 'floating rate']
        
        # Check for debt indicators first (to exclude)
        if any(kw in scheme_lower for kw in debt_keywords):
            return False
        
        # Check for equity indicators
        if any(kw in scheme_lower for kw in equity_keywords):
            return True
        
        # Default: assume equity for growth plans without explicit indicators
        # (most retail MF investments are equity)
        return 'growth' in scheme_lower
    
    @classmethod
    def bulk_download_grandfathered_navs(cls, progress_callback=None) -> Dict:
        """
        Bulk download all grandfathered NAVs (31-Jan-2018) from mfapi.in and store in MongoDB.
        This is a one-time operation to populate the database cache.
        
        Returns a summary dict with counts and any errors.
        """
        db = get_db()
        
        # Create index for fast lookups
        db.grandfathered_navs.create_index('isin', unique=True)
        db.grandfathered_navs.create_index('scheme_code')
        
        summary = {
            'total_schemes': 0,
            'processed': 0,
            'saved': 0,
            'skipped_no_nav': 0,
            'skipped_no_isin': 0,
            'errors': 0,
            'error_details': []
        }
        
        try:
            # Load all schemes
            logger.info("Fetching all scheme codes from mfapi.in...")
            response = requests.get(f"{MFAPI_BASE_URL}/mf", timeout=60)
            if response.status_code != 200:
                summary['error_details'].append(f"Failed to fetch scheme list: HTTP {response.status_code}")
                return summary
            
            all_schemes = response.json()
            summary['total_schemes'] = len(all_schemes)
            logger.info(f"Found {len(all_schemes)} schemes to process")
            
            # Process each scheme
            batch_size = 100
            batch_records = []
            
            for idx, scheme in enumerate(all_schemes):
                scheme_code = scheme.get('schemeCode')
                scheme_name = scheme.get('schemeName', '')
                
                if not scheme_code:
                    continue
                
                summary['processed'] += 1
                
                # Progress callback every 100 schemes
                if progress_callback and idx % 100 == 0:
                    progress_callback(idx, len(all_schemes), scheme_name[:50])
                
                try:
                    # Fetch scheme metadata for ISINs
                    meta_url = f"{MFAPI_BASE_URL}/mf/{scheme_code}/latest"
                    meta_response = requests.get(meta_url, timeout=10)
                    
                    if meta_response.status_code != 200:
                        continue
                    
                    meta_data = meta_response.json()
                    meta = meta_data.get('meta', {})
                    
                    # Get all ISIN variants
                    isins = []
                    for isin_key in ['isin_growth', 'isin_div_payout', 'isin_div_reinvestment']:
                        isin_val = (meta.get(isin_key) or '').strip().upper()
                        if isin_val:
                            isins.append(isin_val)
                    
                    if not isins:
                        summary['skipped_no_isin'] += 1
                        continue
                    
                    # Fetch historical NAV data
                    nav_url = f"{MFAPI_BASE_URL}/mf/{scheme_code}"
                    nav_response = requests.get(nav_url, timeout=15)
                    
                    if nav_response.status_code != 200:
                        continue
                    
                    nav_data = nav_response.json()
                    nav_history = nav_data.get('data', [])
                    
                    # Find NAV on or closest to 31-Jan-2018
                    target_date = GRANDFATHERING_DATE
                    closest_nav = None
                    closest_diff = float('inf')
                    nav_date_found = None
                    
                    for entry in nav_history:
                        try:
                            nav_date_str = entry.get('date', '')
                            nav_value = float(entry.get('nav', 0))
                            
                            # Parse date (format: DD-MM-YYYY)
                            nav_date = datetime.strptime(nav_date_str, '%d-%m-%Y')
                            
                            # Check if this is on or before 31-Jan-2018
                            if nav_date <= target_date:
                                diff = (target_date - nav_date).days
                                if diff < closest_diff:
                                    closest_diff = diff
                                    closest_nav = nav_value
                                    nav_date_found = nav_date_str
                                # If we found exact date or very close, use it
                                if diff <= 5:
                                    break
                        except (ValueError, TypeError):
                            continue
                    
                    if closest_nav is None:
                        summary['skipped_no_nav'] += 1
                        continue
                    
                    # Save record for each ISIN
                    for isin in isins:
                        record = {
                            'isin': isin,
                            'scheme_code': scheme_code,
                            'scheme_name': scheme_name,
                            'nav_value': closest_nav,
                            'nav_date': nav_date_found,
                            'updated_at': datetime.now(timezone.utc)
                        }
                        batch_records.append(record)
                    
                    # Bulk insert in batches
                    if len(batch_records) >= batch_size:
                        for record in batch_records:
                            try:
                                db.grandfathered_navs.update_one(
                                    {'isin': record['isin']},
                                    {'$set': record},
                                    upsert=True
                                )
                                summary['saved'] += 1
                            except Exception as e:
                                summary['errors'] += 1
                        batch_records = []
                        
                except Exception as e:
                    summary['errors'] += 1
                    if len(summary['error_details']) < 10:
                        summary['error_details'].append(f"Scheme {scheme_code}: {str(e)[:100]}")
                    continue
            
            # Save remaining batch
            for record in batch_records:
                try:
                    db.grandfathered_navs.update_one(
                        {'isin': record['isin']},
                        {'$set': record},
                        upsert=True
                    )
                    summary['saved'] += 1
                except Exception as e:
                    summary['errors'] += 1
            
            logger.info(f"Bulk download complete: {summary['saved']} NAVs saved to database")
            
        except Exception as e:
            summary['error_details'].append(f"Fatal error: {str(e)}")
            logger.error(f"Bulk download failed: {e}")
        
        return summary


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
    
    @staticmethod
    def extract_pans_from_cas(pdf_bytes: bytes, password: str) -> dict:
        """Extract ALL PANs, investor names, and country of residency from CAS PDF.
        A CAS can contain multiple PANs (joint accounts, family CAS, etc.)
        
        Returns:
            dict with:
                'pans': list of all PANs found
                'names': list of investor names found
                'pan_name_map': dict mapping PAN to name (where identifiable)
                'country_of_residency': extracted country (defaults to 'India' for Indian CAS)
                'investor_status': 'Resident' or 'NRI' if detected
        """
        import fitz
        result = {'pans': [], 'names': [], 'pan_name_map': {}, 'country_of_residency': None, 'investor_status': None}
        
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            
            if doc.is_encrypted:
                if not doc.authenticate(password):
                    raise ValueError("Invalid PDF password")
            
            # Read all pages to find all PANs
            text = ""
            first_page_text = ""
            for page_num in range(doc.page_count):
                page = doc[page_num]
                page_text = page.get_text()
                text += page_text + "\n"
                if page_num == 0:
                    first_page_text = page_text
            
            doc.close()
            
            # Extract all PANs (PAN format: 5 letters + 4 digits + 1 letter)
            pan_matches = re.findall(r'PAN:\s*([A-Z]{5}\d{4}[A-Z])', text)
            result['pans'] = list(set(pan_matches))  # Unique PANs
            
            # Also try to find PANs in folio headers (format: "Folio No: XXX PAN: ABCDE1234F")
            folio_pan_matches = re.findall(r'Folio No[:\s]+[\w/]+\s+PAN[:\s]+([A-Z]{5}\d{4}[A-Z])', text)
            for pan in folio_pan_matches:
                if pan not in result['pans']:
                    result['pans'].append(pan)
            
            # Extract names
            name_matches = re.findall(r'Dear\s+([A-Za-z\s]+),', text)
            result['names'] = list(set([n.strip() for n in name_matches]))
            
            # Try to map PANs to names from folio sections
            # Pattern: "Name\nPAN: XXXXX" or similar
            lines = text.split('\n')
            for i, line in enumerate(lines):
                pan_match = re.search(r'PAN:\s*([A-Z]{5}\d{4}[A-Z])', line)
                if pan_match:
                    pan = pan_match.group(1)
                    # Look at previous lines for name
                    for j in range(max(0, i-3), i):
                        potential_name = lines[j].strip()
                        if potential_name and len(potential_name) < 60:
                            if re.match(r'^[A-Za-z\s\.]+$', potential_name) and len(potential_name) > 3:
                                result['pan_name_map'][pan] = potential_name
                                break
            
            # Extract country of residency from first page
            # Look for explicit status indicators first
            first_page_upper = first_page_text.upper()
            
            # Check for explicit NRI/Resident status
            if 'NRI' in first_page_upper or 'NON-RESIDENT' in first_page_upper or 'NON RESIDENT' in first_page_upper:
                result['investor_status'] = 'NRI'
            elif 'RESIDENT INDIVIDUAL' in first_page_upper or 'STATUS: RESIDENT' in first_page_upper:
                result['investor_status'] = 'Resident'
            
            # Extract address to determine country
            # Common patterns: "Address: XXX" or address after name section
            address_match = re.search(r'Address[:\s]+([^\n]+(?:\n[^\n]+){0,3})', first_page_text, re.IGNORECASE)
            if address_match:
                address_text = address_match.group(1).strip()
                result['address'] = address_text
                
                # Try to extract country from address
                # Check for common country patterns at end of address
                address_upper = address_text.upper()
                
                # List of countries to check (add more as needed)
                country_patterns = [
                    (r'INDIA\b', 'India'),
                    (r'UAE\b|UNITED ARAB EMIRATES', 'United Arab Emirates'),
                    (r'DUBAI\b', 'United Arab Emirates'),
                    (r'USA\b|UNITED STATES', 'United States'),
                    (r'UK\b|UNITED KINGDOM', 'United Kingdom'),
                    (r'SINGAPORE\b', 'Singapore'),
                    (r'CANADA\b', 'Canada'),
                    (r'AUSTRALIA\b', 'Australia'),
                    (r'GERMANY\b', 'Germany'),
                    (r'OMAN\b', 'Oman'),
                    (r'QATAR\b', 'Qatar'),
                    (r'SAUDI ARABIA\b|KSA\b', 'Saudi Arabia'),
                    (r'BAHRAIN\b', 'Bahrain'),
                    (r'KUWAIT\b', 'Kuwait'),
                ]
                
                for pattern, country_name in country_patterns:
                    if re.search(pattern, address_upper):
                        result['country_of_residency'] = country_name
                        break
                
                # If no specific country found, check for Indian pin code pattern (6 digits)
                if not result['country_of_residency']:
                    indian_pincode = re.search(r'\b[1-9]\d{5}\b', address_text)
                    if indian_pincode:
                        result['country_of_residency'] = 'India'
            
            # If still no country but we have NRI status, leave it as None (user can select)
            # If investor_status is Resident, default to India
            if not result['country_of_residency'] and result['investor_status'] == 'Resident':
                result['country_of_residency'] = 'India'
            
            # If this is a CAMS CAS (Indian mutual funds), default to India if nothing found
            if not result['country_of_residency']:
                # Check if this is a CAMS/KFintech CAS
                if 'CAMS' in text.upper() or 'KFINTECH' in text.upper() or 'CONSOLIDATED ACCOUNT STATEMENT' in text.upper():
                    result['country_of_residency'] = 'India'  # Default for Indian MF CAS
            
            logger.info(f"Extracted {len(result['pans'])} unique PANs from CAS: {result['pans']}, Country: {result['country_of_residency']}")
            return result
            
        except Exception as e:
            logger.error(f"Error extracting PANs from CAS: {e}")
            raise
    
    @staticmethod
    def merge_parsed_data(parsed_data_list: list) -> dict:
        """Merge multiple parsed CAS data into a single combined dataset.
        
        Args:
            parsed_data_list: List of parsed_data dicts from multiple CAS files
            
        Returns:
            Combined parsed_data dict with merged folios and transactions
        """
        if not parsed_data_list:
            return {}
        
        if len(parsed_data_list) == 1:
            return parsed_data_list[0]
        
        merged = {
            'investor_info': {},
            'portfolio_summary': {},
            'folios': {},
            'transactions': [],
            'nft_entries': [],
            'tds_entries': [],
            'report_date': None,
            'total_transactions': 0,
            'source_files': len(parsed_data_list)
        }
        
        # Merge investor info (combine unique names)
        all_names = set()
        all_pans = set()
        
        for parsed in parsed_data_list:
            inv_info = parsed.get('investor_info', {})
            if inv_info.get('name'):
                all_names.add(inv_info.get('name'))
            if inv_info.get('pan'):
                all_pans.add(inv_info.get('pan'))
            
            # Use the latest report date
            if parsed.get('report_date'):
                if not merged['report_date'] or parsed['report_date'] > merged['report_date']:
                    merged['report_date'] = parsed['report_date']
        
        merged['investor_info']['names'] = list(all_names)
        merged['investor_info']['pans'] = list(all_pans)
        
        # Merge folios (use folio_id + isin as key to avoid duplicates)
        for parsed in parsed_data_list:
            for folio_key, folio_data in parsed.get('folios', {}).items():
                if folio_key not in merged['folios']:
                    merged['folios'][folio_key] = folio_data
                else:
                    # Update with latest data if existing
                    existing = merged['folios'][folio_key]
                    # Keep higher closing balance (more recent)
                    if (folio_data.get('closing_balance') or 0) > (existing.get('closing_balance') or 0):
                        merged['folios'][folio_key] = folio_data
        
        # Merge transactions (avoid duplicates by checking date+folio+amount+units)
        seen_transactions = set()
        for parsed in parsed_data_list:
            for trans in parsed.get('transactions', []):
                # Create a unique key for this transaction
                trans_key = (
                    trans.get('date', ''),
                    trans.get('folio', ''),
                    trans.get('isin', ''),
                    round(trans.get('amount', 0) or 0, 2),
                    round(trans.get('units', 0) or 0, 4)
                )
                if trans_key not in seen_transactions:
                    seen_transactions.add(trans_key)
                    merged['transactions'].append(trans)
        
        # Merge NFT and TDS entries
        for parsed in parsed_data_list:
            merged['nft_entries'].extend(parsed.get('nft_entries', []))
            merged['tds_entries'].extend(parsed.get('tds_entries', []))
        
        merged['total_transactions'] = len(merged['transactions'])
        
        # Calculate merged portfolio summary
        total_investment = 0
        total_current_value = 0
        for folio_data in merged['folios'].values():
            total_investment += folio_data.get('cost_value', 0) or 0
            closing = folio_data.get('closing_balance', 0) or 0
            nav = folio_data.get('current_nav', 0) or 0
            if closing > 0 and nav > 0:
                total_current_value += closing * nav
        
        merged['portfolio_summary'] = {
            'total_investment': total_investment,
            'total_current_value': total_current_value,
            'total_folios': len(merged['folios']),
            'source_files_count': len(parsed_data_list)
        }
        
        logger.info(f"Merged {len(parsed_data_list)} CAS files: {len(merged['folios'])} folios, {merged['total_transactions']} transactions")
        return merged
    
    def _normalize_advisor(self, advisor: str) -> str:
        """Normalize advisor codes to standard format.
        - ARN codes: Always format as 'ARN-XXXX' (with dash)
        - ARN0155 -> ARN-0155, ARN9992 -> ARN-9992
        - DIRECT, SCBONLINE, etc. remain unchanged
        """
        if not advisor:
            return advisor
        
        advisor = advisor.strip()
        
        # Check if it's an ARN code without dash: ARN0155, ARN9992, etc.
        import re
        arn_no_dash = re.match(r'^ARN(\d+)$', advisor, re.IGNORECASE)
        if arn_no_dash:
            return f"ARN-{arn_no_dash.group(1)}"
        
        # Already has dash or is not an ARN code
        return advisor
        
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
            
            # Store raw text for debugging (save to temp file)
            with open('/tmp/cas_raw_text.txt', 'w') as f:
                f.write(full_text)
            logger.info("Raw CAS text saved to /tmp/cas_raw_text.txt for debugging")
            
            # Parse the extracted text
            self._parse_investor_info(full_text)
            self._parse_report_date(full_text)
            self._parse_portfolio_summary(full_text)
            self._parse_folios_and_transactions(full_text)
            self._parse_nft(full_text)
            self._parse_tds(full_text)
            
            # Log parsing summary for debugging
            logger.info(f"Parsed {len(self.folios)} unique folio/ISIN combinations")
            for folio_key, folio_data in self.folios.items():
                scheme = folio_data.get('scheme') or 'Unknown'
                logger.debug(f"Folio: {folio_key} -> Scheme: {scheme[:50]}")
            
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
            import traceback
            logger.error(f"Error parsing CAS PDF: {e}")
            logger.error(f"Traceback: {traceback.format_exc()}")
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
                       '***Address Update', '***Bank', '***Email', '***Mobile', '***One Time',
                       '***Open Mandate', '***SIP', '***Additional', '***Terminated', '***Cancelled']
        
        lines = text.split('\n')
        current_folio = None
        current_scheme = None
        current_isin = None
        
        i = 0
        while i < len(lines):
            line = lines[i]
            
            # Track current folio
            folio_match = re.search(r'Folio No\s*:\s*([\d\s/]+)', line)
            if folio_match:
                current_folio = folio_match.group(1).strip()
            
            # Track current scheme and ISIN
            isin_match = re.search(r'ISIN:\s*([A-Z0-9]{12})', line)
            if isin_match:
                current_isin = isin_match.group(1)
                scheme_match = re.match(r'^([A-Z0-9]+)-(.+?)\s*-\s*ISIN:', line)
                if scheme_match:
                    current_scheme = scheme_match.group(2).strip()
            
            # Check for NFT markers
            stripped = line.strip()
            for marker in nft_markers:
                if marker in stripped:
                    # Extract date from the line
                    date_match = re.match(r'^(\d{2}-[A-Za-z]{3}-\d{4})', stripped)
                    date_str = date_match.group(1) if date_match else None
                    
                    # Extract the NFT description
                    # Handle split lines: if line doesn't end with ***, combine with next line
                    description = stripped
                    
                    if '***' in description and not description.strip().endswith('***'):
                        # Description continues on next line
                        if i + 1 < len(lines):
                            next_line = lines[i + 1].strip()
                            if '***' in next_line:
                                description = description + ' ' + next_line
                                i += 1  # Skip next line since we consumed it
                    
                    # Clean up the description
                    nft_desc = description.replace('***', '').strip()
                    # Remove date from description
                    if date_str:
                        nft_desc = nft_desc.replace(date_str, '').strip()
                    
                    self.nft_entries.append({
                        'date': date_str,
                        'folio': current_folio,
                        'scheme': current_scheme,
                        'isin': current_isin,
                        'description': nft_desc
                    })
                    break
            
            i += 1
    
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
        
        # Additional data for card format
        current_registrar = None
        current_kyc_status = None
        current_pan_status = None
        current_holder_name = None
        current_nominees = ['', '', '']  # Nominee 1, 2, 3
        
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
            
            # Detect KYC and PAN status - format: "KYC: OK  PAN: OK"
            kyc_match = re.search(r'KYC:\s*(OK|NOT OK|PENDING)', line, re.IGNORECASE)
            pan_status_match = re.search(r'PAN:\s*(OK|NOT OK|PENDING)', line, re.IGNORECASE)
            if kyc_match:
                current_kyc_status = kyc_match.group(1).upper()
            if pan_status_match and 'KYC' in line:  # Only set if it's on the KYC line
                current_pan_status = pan_status_match.group(1).upper()
            
            # Detect Registrar - format: "Registrar : CAMS" or "Registrar : KFINTECH"
            registrar_match = re.search(r'Registrar\s*:\s*(\w+)', line)
            if registrar_match:
                current_registrar = registrar_match.group(1).strip()
            
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
            
            # Detect ISIN - can be on same line or next line after "ISIN:"
            # Multiple patterns to handle various PDF text extraction formats
            isin_match = re.search(r'ISIN:\s*([A-Z0-9]{12})', line)
            
            # Also try without space after colon
            if not isin_match:
                isin_match = re.search(r'ISIN:([A-Z0-9]{12})', line)
            
            # Try to find standalone ISIN pattern (12 char alphanumeric starting with INF)
            if not isin_match:
                isin_match = re.search(r'\b(INF[A-Z0-9]{9})\b', line)
            
            # Handle split ISIN across lines (two-column PDF layout)
            # Pattern 1: "ISIN: INF204KB13T Registrar :" then "1 KFINTECH" (11+1 chars)
            # Pattern 2: "ISIN: INF917K" then "01QA1(Advisor: DIRECT)" (7+5 chars)
            # Pattern 3: "ISIN: INF174K01LS" then "2(Advisor: DIRECT)" (11+1 chars)
            if not isin_match and 'ISIN:' in line and i + 1 < len(lines):
                # Try to extract partial ISIN - can be 7-11 chars at end of line
                partial_isin = re.search(r'ISIN:\s*([A-Z0-9]{7,11})$', line) or re.search(r'ISIN:\s*([A-Z0-9]{7,11})\s*$', line)
                if partial_isin:
                    partial = partial_isin.group(1)
                    next_line = lines[i + 1].strip()
                    chars_needed = 12 - len(partial)
                    # Check if next line starts with the remaining ISIN character(s)
                    # Pattern can be: "01QA1(Advisor: DIRECT)" or "1 KFINTECH" or "2(Advisor:"
                    remaining_pattern = rf'^([A-Z0-9]{{{chars_needed}}})[\s\(\)]' if chars_needed > 0 else None
                    remaining_match = re.match(remaining_pattern, next_line) if remaining_pattern else None
                    # Also try exact match at start
                    if not remaining_match and chars_needed > 0:
                        remaining_match = re.match(rf'^([A-Z0-9]{{{chars_needed}}})', next_line)
                        if remaining_match:
                            # Verify it's followed by non-alphanumeric or end
                            rest = next_line[chars_needed:]
                            if rest and rest[0].isalnum():
                                remaining_match = None  # Not a valid continuation
                    if remaining_match:
                        full_isin = partial + remaining_match.group(1)
                        if len(full_isin) == 12:
                            current_isin = full_isin
                            logger.info(f"Parsed split ISIN: {current_isin} (was {len(partial)}+{chars_needed})")
                            
                            # IMPORTANT: Extract advisor from the continuation line if present
                            # Pattern: "01QA1(Advisor: DIRECT)" or "01QA1(Advisor: ARN-122635)"
                            advisor_in_continuation = re.search(r'\(Advisor:\s*([A-Z0-9\-]+)\)', next_line)
                            if advisor_in_continuation:
                                current_advisor = self._normalize_advisor(advisor_in_continuation.group(1))
                                logger.info(f"Found advisor in split ISIN continuation: {current_advisor}")
                            else:
                                # Infer DIRECT from scheme name if no explicit advisor
                                if 'Direct' in line or '-Direct' in line:
                                    current_advisor = 'DIRECT'
                                    logger.info(f"Inferred DIRECT advisor from scheme (split ISIN): {line[:50]}")
                            
                            # Extract scheme name from this line
                            scheme_match = re.match(r'^([A-Z0-9]+)-(.+?)\s+-\s+ISIN:', line)
                            if scheme_match:
                                scheme_code = scheme_match.group(1)
                                scheme_name = scheme_match.group(2).strip()
                                scheme_name = re.sub(r'\s*-\s*Reinvest.*$', '', scheme_name)
                                current_scheme_full = f"{scheme_code}-{scheme_name}"
                                current_scheme = scheme_name
                                logger.info(f"Parsed scheme with split ISIN: {scheme_name}")
                            
                            # Update current_key
                            if current_folio:
                                new_key = f"{current_folio}_{current_isin}"
                                if new_key not in self.folios:
                                    # Carry forward PAN if same folio
                                    prev_pan = current_pan
                                    
                                    self.folios[new_key] = {
                                        'folio': current_folio,
                                        'scheme': current_scheme,
                                        'scheme_code': current_scheme_full,
                                        'isin': current_isin,
                                        'pan': prev_pan,
                                        'amc': current_amc,
                                        'advisor': current_advisor,
                                        'registrar': current_registrar,
                                        'kyc_status': current_kyc_status,
                                        'pan_status': current_pan_status,
                                        'holder_name': '',
                                        'nominees': ['', '', ''],
                                        'transactions': [],
                                        'closing_balance': 0,
                                        'cost_value': 0,
                                        'current_nav': 0,
                                        'market_value': 0,
                                        'opening_balance': 0
                                    }
                                current_key = new_key
            
            # Also check if line ends with "ISIN:" and actual ISIN is on next line
            # Format: "...Fund - Direct Plan - Growth (Non-Demat) - ISIN:" followed by "INF109K015K4(Advisor: DIRECT)"
            if not isin_match and not current_isin and ('ISIN:' in line or line.strip().endswith('ISIN:')) and i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                # Check if next line starts with ISIN code (12 alphanumeric chars)
                next_isin_match = re.match(r'^([A-Z0-9]{12})', next_line)
                if next_isin_match:
                    current_isin = next_isin_match.group(1)
                    # Check for advisor on the ISIN line
                    advisor_match = re.search(r'\(Advisor:\s*([A-Z0-9\-]+)\)', next_line)
                    if advisor_match:
                        current_advisor = self._normalize_advisor(advisor_match.group(1))
                    
                    # Build full line for scheme extraction (combine pending scheme + current line)
                    full_line = line
                    if pending_scheme_line and 'ISIN' not in pending_scheme_line:
                        full_line = pending_scheme_line + ' ' + line
                    
                    # Extract scheme name - everything between scheme code and " - ISIN:"
                    # Use greedy match to capture the full scheme name up to the last " - ISIN:"
                    scheme_match = re.match(r'^([A-Z0-9]+)-(.+)\s+-\s+ISIN:$', full_line)
                    if scheme_match:
                        scheme_code = scheme_match.group(1)
                        scheme_name = scheme_match.group(2).strip()
                        scheme_name = re.sub(r'\s*-\s*Reinvest.*$', '', scheme_name)
                        current_scheme_full = f"{scheme_code}-{scheme_name}"
                        current_scheme = scheme_name
                        logger.info(f"Parsed scheme (ISIN on next line): {scheme_name} ISIN: {current_isin}")
                    
                    # Update current_key for this new scheme/ISIN
                    if current_folio and current_isin:
                        new_key = f"{current_folio}_{current_isin}"
                        old_key = current_key
                        if new_key != current_key:
                            current_key = new_key
                            if current_key not in self.folios:
                                # Check if we need to migrate data from a folio-only key
                                old_data = {}
                                if old_key and old_key in self.folios and old_key == current_folio:
                                    old_data = self.folios[old_key]
                                    logger.info(f"Migrating data from {old_key} to {current_key}")
                                    del self.folios[old_key]
                                
                                self.folios[current_key] = {
                                    'folio': current_folio,
                                    'scheme': current_scheme,
                                    'scheme_code': current_scheme_full,
                                    'isin': current_isin,
                                    'pan': current_pan,
                                    'amc': current_amc,
                                    'advisor': current_advisor,
                                    'registrar': current_registrar,
                                    'kyc_status': current_kyc_status,
                                    'pan_status': current_pan_status,
                                    'holder_name': old_data.get('holder_name', ''),
                                    'nominees': old_data.get('nominees', ['', '', '']),
                                    'transactions': old_data.get('transactions', []),
                                    'closing_balance': old_data.get('closing_balance', 0),
                                    'cost_value': old_data.get('cost_value', 0),
                                    'current_nav': old_data.get('current_nav', 0),
                                    'market_value': old_data.get('market_value', 0),
                                    'opening_balance': old_data.get('opening_balance', 0)
                                }
                    
                    pending_scheme_line = None
                    i += 1  # Skip the next line since we've processed it
                    continue
            
            if isin_match:
                current_isin = isin_match.group(1)
                
                # Check for advisor on same line - format: (Advisor: XXXXX)
                advisor_match = re.search(r'\(Advisor:\s*([A-Z0-9\-]+)\)', line)
                if advisor_match:
                    current_advisor = self._normalize_advisor(advisor_match.group(1))
                else:
                    # Check if advisor info is split across lines (two-column PDF layout)
                    # Pattern: "(Advisor:" and "Registrar :" on same line means value is on NEXT line
                    # Example: "...(Advisor: Registrar : CAMS" followed by "SCBONLINE)"
                    if '(Advisor:' in line and i + 1 < len(lines):
                        next_line = lines[i + 1].strip()
                        
                        # Check for various advisor value patterns on next line
                        # Pattern 1: "ARN-XXXXX)" or "ARN-XXXXX) something"
                        arn_match = re.match(r'^(ARN-[A-Z0-9\-]+)\)?', next_line)
                        if arn_match:
                            current_advisor = self._normalize_advisor(arn_match.group(1))
                        # Pattern 2: "DIRECT)" or "DIRECT) something"
                        elif re.match(r'^(DIRECT)\)?', next_line, re.IGNORECASE):
                            current_advisor = 'DIRECT'
                        # Pattern 3: "SCBONLINE)" or similar advisor codes
                        elif re.match(r'^([A-Z0-9]+)\)', next_line):
                            advisor_code = re.match(r'^([A-Z0-9]+)\)', next_line).group(1)
                            if advisor_code not in ('CAMS', 'KFINTECH', 'KARVY'):  # Exclude registrar names
                                current_advisor = self._normalize_advisor(advisor_code)
                        # Pattern 4: "SBI10899)" or similar with numbers
                        elif re.match(r'^([A-Z]+[0-9]+)\)', next_line):
                            current_advisor = self._normalize_advisor(re.match(r'^([A-Z]+[0-9]+)\)', next_line).group(1))
                    
                    # If still no advisor found, infer from scheme name
                    # Direct plans should have advisor = 'DIRECT'
                    # IMPORTANT: For Direct plans without explicit (Advisor:) tag, ALWAYS set to DIRECT
                    # This prevents stale ARN from previous Regular plan from carrying over
                    if not current_advisor or current_advisor is None:
                        if 'Direct' in line or '-Direct' in line or ' Direct ' in line:
                            current_advisor = 'DIRECT'
                            logger.info(f"Inferred DIRECT advisor from scheme name: {line[:60]}")
                    elif '(Advisor:' not in line:
                        # No explicit advisor tag on this line - check if it's a Direct plan
                        # that might have stale advisor from previous scheme
                        if 'Direct' in line or '-Direct' in line or ' Direct ' in line or 'DIRECT' in line:
                            current_advisor = 'DIRECT'
                            logger.info(f"Reset to DIRECT for Direct plan (no explicit advisor): {line[:60]}")
                    
                    # NEW: Check if next line is a standalone "(Advisor: ...)" line
                    # Pattern: current line has ISIN but no (Advisor:, next line starts with (Advisor:
                    if '(Advisor:' not in line and i + 1 < len(lines):
                        next_line = lines[i + 1].strip()
                        # Check if next line is a standalone advisor line
                        standalone_advisor = re.match(r'^\(Advisor:\s*([A-Z0-9\-]+)\)?$', next_line)
                        if standalone_advisor:
                            current_advisor = self._normalize_advisor(standalone_advisor.group(1))
                            logger.info(f"Found standalone advisor on next line: {current_advisor}")
                
                full_line = line
                if pending_scheme_line and 'ISIN' not in pending_scheme_line:
                    full_line = pending_scheme_line + ' ' + line
                
                # Extract scheme name - everything between scheme code and " - ISIN:"
                # Use greedy match (.+) to capture full scheme name up to last occurrence of " - ISIN:"
                scheme_match = re.match(r'^([A-Z0-9]+)-(.+)\s+-\s+ISIN:', full_line)
                if scheme_match:
                    scheme_code = scheme_match.group(1)
                    scheme_name = scheme_match.group(2).strip()
                    # Keep the full scheme name including (Non-Demat) and (formerly...) 
                    # Only remove trailing " - Reinvest" patterns if present
                    scheme_name = re.sub(r'\s*-\s*Reinvest.*$', '', scheme_name)
                    current_scheme_full = f"{scheme_code}-{scheme_name}"
                    current_scheme = scheme_name
                
                # IMPORTANT: Update current_key when ISIN changes (for multi-scheme folios)
                # This ensures schemes with the same folio but different ISINs get separate entries
                if current_folio and current_isin:
                    new_key = f"{current_folio}_{current_isin}"
                    old_key = current_key  # Save old key for transaction migration
                    
                    if new_key != current_key:
                        current_key = new_key
                        # Create new folio entry if it doesn't exist
                        if current_key not in self.folios:
                            logger.info(f"Creating folio entry: key={current_key[:50]}, scheme={current_scheme[:40] if current_scheme else 'None'}")
                            
                            # Check if we need to migrate data from a folio-only key
                            old_data = {}
                            if old_key and old_key in self.folios and old_key == current_folio:
                                # The old entry was created with just folio number (no ISIN)
                                # Migrate ALL its data to the new key
                                old_data = self.folios[old_key]
                                logger.info(f"Migrating data from {old_key} to {current_key}: {len(old_data.get('transactions', []))} transactions, closing={old_data.get('closing_balance', 0)}")
                                del self.folios[old_key]  # Remove the old folio-only entry
                            
                            self.folios[current_key] = {
                                'folio': current_folio,
                                'scheme': current_scheme,
                                'scheme_code': current_scheme_full,
                                'isin': current_isin,
                                'pan': current_pan,
                                'amc': current_amc,
                                'advisor': current_advisor,
                                'registrar': current_registrar,
                                'kyc_status': current_kyc_status,
                                'pan_status': current_pan_status,
                                'holder_name': old_data.get('holder_name', ''),
                                'nominees': old_data.get('nominees', ['', '', '']),
                                'transactions': old_data.get('transactions', []),
                                'closing_balance': old_data.get('closing_balance', 0),
                                'cost_value': old_data.get('cost_value', 0),
                                'current_nav': old_data.get('current_nav', 0),
                                'market_value': old_data.get('market_value', 0),
                                'opening_balance': old_data.get('opening_balance', 0)
                            }
                        else:
                            # Folio entry already exists - just update scheme info if needed
                            if current_scheme and not self.folios[current_key].get('scheme'):
                                self.folios[current_key]['scheme'] = current_scheme
                                self.folios[current_key]['scheme_code'] = current_scheme_full
                
                pending_scheme_line = None
            
            # Detect Folio No - look BACKWARD for the scheme/ISIN that precedes it
            folio_match = re.search(r'Folio No\s*:\s*([\d\s/]+)', line)
            if folio_match:
                new_folio = folio_match.group(1).strip()
                
                # If this is a DIFFERENT folio than before, reset scheme-related variables
                # This prevents stale data from previous scheme
                if new_folio != current_folio:
                    # Reset for new folio
                    prev_isin = None
                    prev_scheme = None
                    prev_scheme_full = None
                    prev_advisor = None
                    
                    # Look BACKWARD for ISIN line (typically 2-5 lines before Folio No)
                    for lookback in range(1, 8):
                        if i - lookback >= 0:
                            prev_line = lines[i - lookback].strip()
                            
                            # Stop if we hit another Folio No or transaction data
                            if 'Folio No' in prev_line:
                                break
                            if re.match(r'^\d{2}-[A-Z][a-z]{2}-\d{4}', prev_line):  # Date pattern
                                break
                            
                            # Check if this line starts with ARN- (continuation from truncated scheme line)
                            # This happens when scheme name is too long and ARN wraps to next line
                            arn_continuation = re.match(r'^(ARN-[A-Z0-9\-]+)\)?', prev_line)
                            if arn_continuation and not prev_advisor:
                                prev_advisor = self._normalize_advisor(arn_continuation.group(1))
                                logger.debug(f"Found ARN from continuation line: {prev_advisor}")
                                continue  # Keep looking for ISIN
                            
                            # Look for ISIN pattern in this line
                            isin_in_line = re.search(r'ISIN:\s*([A-Z0-9]{12})', prev_line)
                            
                            # Handle truncated ISIN (7-11 chars) - check if next line has remaining chars
                            if not isin_in_line:
                                truncated_isin = re.search(r'ISIN:\s*([A-Z0-9]{7,11})$', prev_line) or re.search(r'ISIN:\s*([A-Z0-9]{7,11})\s*$', prev_line)
                                if truncated_isin and i - lookback + 1 < len(lines):
                                    partial = truncated_isin.group(1)
                                    chars_needed = 12 - len(partial)
                                    next_line = lines[i - lookback + 1].strip()
                                    
                                    # Check if next line starts with remaining ISIN chars
                                    # Pattern: "01QA1(Advisor: DIRECT)" or "1 KFINTECH"
                                    remaining_pattern = rf'^([A-Z0-9]{{{chars_needed}}})'
                                    remaining_match = re.match(remaining_pattern, next_line)
                                    if remaining_match:
                                        full_isin = partial + remaining_match.group(1)
                                        if len(full_isin) == 12:
                                            isin_in_line = type('obj', (object,), {'group': lambda self, x, isin=full_isin: isin})()
                                            logger.debug(f"Reconstructed split ISIN in lookback: {full_isin} (was {len(partial)}+{chars_needed})")
                                            
                                            # Extract advisor from continuation line if present
                                            advisor_in_continuation = re.search(r'\(Advisor:\s*([A-Z0-9\-]+)\)', next_line)
                                            if advisor_in_continuation and not prev_advisor:
                                                prev_advisor = self._normalize_advisor(advisor_in_continuation.group(1))
                                                logger.debug(f"Found advisor in split ISIN continuation (lookback): {prev_advisor}")
                            
                            # Also try combining with next line for other split scenarios
                            if not isin_in_line:
                                if i - lookback + 1 < len(lines):
                                    combined = prev_line + lines[i - lookback + 1].strip()
                                    isin_in_line = re.search(r'ISIN:\s*([A-Z0-9]{12})', combined)
                                    
                                    # Also try to extract advisor from combined line
                                    if isin_in_line and not prev_advisor:
                                        advisor_in_combined = re.search(r'\(Advisor:\s*([A-Z0-9\-]+)\)', combined)
                                        if advisor_in_combined:
                                            prev_advisor = self._normalize_advisor(advisor_in_combined.group(1))
                                            logger.debug(f"Found advisor in combined line (lookback): {prev_advisor}")
                            
                            if isin_in_line:
                                prev_isin = isin_in_line.group(1)
                                
                                # Extract scheme name from the line (format: CODE-Scheme Name... - ISIN:)
                                scheme_match = re.match(r'^([A-Z0-9]+)-(.+?)\s*-\s*ISIN:', prev_line)
                                if scheme_match:
                                    prev_scheme_full = f"{scheme_match.group(1)}-{scheme_match.group(2).strip()}"
                                    prev_scheme = scheme_match.group(2).strip()
                                else:
                                    # Try simpler pattern - everything before ISIN
                                    scheme_part = re.split(r'\s*-\s*ISIN:', prev_line)[0]
                                    if scheme_part:
                                        prev_scheme = scheme_part.strip()
                                        prev_scheme_full = scheme_part.strip()
                                
                                # Extract advisor if present - can be on same line or split across lines
                                advisor_match = re.search(r'\(Advisor:\s*([^)]+)\)', prev_line)
                                if advisor_match:
                                    prev_advisor = self._normalize_advisor(advisor_match.group(1).strip())
                                elif '(Advisor:' in prev_line and i - lookback + 1 < len(lines):
                                    # Advisor value is on next line
                                    advisor_next_line = lines[i - lookback + 1].strip()
                                    
                                    # Pattern 1: "ARN-XXXXX)" 
                                    arn_match = re.match(r'^(ARN-[A-Z0-9\-]+)\)?', advisor_next_line)
                                    if arn_match:
                                        prev_advisor = self._normalize_advisor(arn_match.group(1))
                                        logger.debug(f"Found ARN on next line (lookback): {prev_advisor}")
                                    # Pattern 2: "DIRECT)"
                                    elif re.match(r'^(DIRECT)\)?', advisor_next_line, re.IGNORECASE):
                                        prev_advisor = 'DIRECT'
                                        logger.debug(f"Found DIRECT on next line (lookback)")
                                    # Pattern 3: "SCBONLINE)" or similar
                                    elif re.match(r'^([A-Z0-9]+)\)', advisor_next_line):
                                        advisor_code = re.match(r'^([A-Z0-9]+)\)', advisor_next_line).group(1)
                                        if advisor_code not in ('CAMS', 'KFINTECH', 'KARVY'):
                                            prev_advisor = self._normalize_advisor(advisor_code)
                                            logger.debug(f"Found advisor code on next line (lookback): {prev_advisor}")
                                
                                # Infer DIRECT from scheme name if no explicit advisor tag
                                # IMPORTANT: For Direct plans without (Advisor:) tag, ALWAYS set to DIRECT
                                if not prev_advisor and '(Advisor:' not in prev_line:
                                    if 'Direct' in prev_line or '-Direct' in prev_line or 'DIRECT' in prev_line:
                                        prev_advisor = 'DIRECT'
                                        logger.debug(f"Inferred DIRECT from scheme name (lookback): {prev_line[:50]}")
                                
                                # NEW: Check for standalone "(Advisor: ...)" on the line AFTER the ISIN line
                                if not prev_advisor and '(Advisor:' not in prev_line and i - lookback + 1 < len(lines):
                                    next_after_isin = lines[i - lookback + 1].strip()
                                    standalone_advisor = re.match(r'^\(Advisor:\s*([A-Z0-9\-]+)\)?$', next_after_isin)
                                    if standalone_advisor:
                                        prev_advisor = self._normalize_advisor(standalone_advisor.group(1))
                                        logger.debug(f"Found standalone advisor after ISIN line (lookback): {prev_advisor}")
                                
                                logger.debug(f"Found ISIN {prev_isin} for folio {new_folio} by looking back: {prev_scheme[:40] if prev_scheme else 'N/A'}")
                                break
                    
                    # Update current variables with found values
                    current_isin = prev_isin
                    current_scheme = prev_scheme
                    current_scheme_full = prev_scheme_full
                    current_advisor = prev_advisor
                
                current_folio = new_folio
                
                # Create key with ISIN if found
                if current_isin:
                    current_key = f"{current_folio}_{current_isin}"
                else:
                    current_key = current_folio
                    logger.warning(f"No ISIN found for folio {current_folio}")
                
                # Create folio entry
                if current_key not in self.folios:
                    self.folios[current_key] = {
                        'folio': current_folio,
                        'scheme': current_scheme,
                        'scheme_code': current_scheme_full,
                        'isin': current_isin,
                        'pan': current_pan,
                        'amc': current_amc,
                        'advisor': current_advisor,
                        'registrar': current_registrar,
                        'kyc_status': current_kyc_status,
                        'pan_status': current_pan_status,
                        'holder_name': '',
                        'nominees': ['', '', ''],
                        'transactions': [],
                        'closing_balance': 0,
                        'cost_value': 0,
                        'current_nav': 0,
                        'market_value': 0,
                        'opening_balance': 0
                    }
                    
                    # Look forward to extract holder name and nominees
                    # Format: after "Folio No:" comes holder name, then "Nominee 1:", "Nominee 2:", "Nominee 3:"
                    nominee_index = 0
                    for lookahead in range(1, 12):
                        if i + lookahead < len(lines):
                            next_line = lines[i + lookahead].strip()
                            
                            # Stop if we hit transaction data or another folio
                            if re.match(r'^\d{2}-[A-Z][a-z]{2}-\d{4}', next_line):  # Date pattern
                                break
                            if 'Folio No' in next_line:
                                break
                            if 'Opening Unit Balance:' in next_line:
                                break
                            
                            # First non-empty line after Folio No is holder name
                            if lookahead == 1 and next_line and not next_line.startswith('Nominee'):
                                self.folios[current_key]['holder_name'] = next_line
                            
                            # Extract nominee names
                            if 'Nominee 1:' in next_line:
                                # Nominee name may be on same line or next line
                                nominee_match = re.search(r'Nominee 1:\s*(.*)', next_line)
                                if nominee_match and nominee_match.group(1).strip():
                                    self.folios[current_key]['nominees'][0] = nominee_match.group(1).strip()
                                elif i + lookahead + 1 < len(lines):
                                    potential_name = lines[i + lookahead + 1].strip()
                                    if potential_name and not potential_name.startswith('Nominee') and not re.match(r'^\d{2}-[A-Z][a-z]{2}-\d{4}', potential_name):
                                        self.folios[current_key]['nominees'][0] = potential_name
                            
                            if 'Nominee 2:' in next_line:
                                nominee_match = re.search(r'Nominee 2:\s*(.*)', next_line)
                                if nominee_match and nominee_match.group(1).strip():
                                    self.folios[current_key]['nominees'][1] = nominee_match.group(1).strip()
                                elif i + lookahead + 1 < len(lines):
                                    potential_name = lines[i + lookahead + 1].strip()
                                    if potential_name and not potential_name.startswith('Nominee') and not re.match(r'^\d{2}-[A-Z][a-z]{2}-\d{4}', potential_name) and 'Opening' not in potential_name:
                                        self.folios[current_key]['nominees'][1] = potential_name
                            
                            if 'Nominee 3:' in next_line:
                                nominee_match = re.search(r'Nominee 3:\s*(.*)', next_line)
                                if nominee_match and nominee_match.group(1).strip():
                                    self.folios[current_key]['nominees'][2] = nominee_match.group(1).strip()
                                elif i + lookahead + 1 < len(lines):
                                    potential_name = lines[i + lookahead + 1].strip()
                                    if potential_name and not potential_name.startswith('Nominee') and not re.match(r'^\d{2}-[A-Z][a-z]{2}-\d{4}', potential_name) and 'Opening' not in potential_name:
                                        self.folios[current_key]['nominees'][2] = potential_name
                    
                    logger.info(f"Created folio: {current_key[:50]} | Scheme: {current_scheme[:40] if current_scheme else 'None'}")
            
            # Detect opening balance
            if 'Opening Unit Balance:' in line:
                balance_match = re.search(r'Opening Unit Balance:\s*([\d,]+\.?\d*)', line)
                if balance_match and current_key and current_key in self.folios:
                    self.folios[current_key]['opening_balance'] = float(balance_match.group(1).replace(',', ''))
            
            # Detect footer line with Closing Balance, NAV, Cost Value, Market Value
            # Format: "Closing Unit Balance: 171.934    NAV on 20-Feb-2026: INR 2,091.37   Total Cost Value: 127,500.00    Market Value on 20-Feb-2026: INR 359,577.61"
            if 'Closing Unit Balance:' in line:
                # Extract closing balance
                balance_match = re.search(r'Closing Unit Balance:\s*([\d,]+\.?\d*)', line)
                if balance_match and current_key and current_key in self.folios:
                    self.folios[current_key]['closing_balance'] = float(balance_match.group(1).replace(',', ''))
                    logger.debug(f"Found closing balance {balance_match.group(1)} for {current_key}")
                
                # Extract NAV from same line
                nav_match = re.search(r'NAV on [^:]+:\s*INR\s*([\d,]+\.?\d*)', line)
                if nav_match and current_key and current_key in self.folios:
                    self.folios[current_key]['current_nav'] = float(nav_match.group(1).replace(',', ''))
                    logger.debug(f"Found NAV {nav_match.group(1)} for {current_key}")
                
                # Extract Total Cost Value from same line
                cost_match = re.search(r'Total Cost Value:\s*([\d,]+\.?\d*)', line)
                if cost_match and current_key and current_key in self.folios:
                    self.folios[current_key]['cost_value'] = float(cost_match.group(1).replace(',', ''))
                    logger.debug(f"Found cost value {cost_match.group(1)} for {current_key}")
                
                # Extract Market Value from same line
                mv_match = re.search(r'Market Value on [^:]+:\s*INR\s*([\d,]+\.?\d*)', line)
                if mv_match and current_key and current_key in self.folios:
                    self.folios[current_key]['market_value'] = float(mv_match.group(1).replace(',', ''))
                    logger.debug(f"Found market value {mv_match.group(1)} for {current_key}")
            
            # Also handle cases where these values are on separate lines
            elif 'Total Cost Value:' in line:
                cost_match = re.search(r'Total Cost Value:\s*([\d,]+\.?\d*)', line)
                if cost_match and current_key and current_key in self.folios:
                    self.folios[current_key]['cost_value'] = float(cost_match.group(1).replace(',', ''))
            
            elif 'NAV on' in line and 'INR' in line:
                nav_match = re.search(r'NAV on [^:]+:\s*INR\s*([\d,]+\.?\d*)', line)
                if nav_match and current_key and current_key in self.folios:
                    self.folios[current_key]['current_nav'] = float(nav_match.group(1).replace(',', ''))
            
            elif 'Market Value on' in line and 'INR' in line:
                mv_match = re.search(r'Market Value on [^:]+:\s*INR\s*([\d,]+\.?\d*)', line)
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
            
            # Handle single-line transaction format (most common in CAS PDFs)
            # Format: Date Transaction Amount Units NAV Balance
            # Example: "08-Jan-2018 Purchase 30,000.00 505.287 59.3722 505.287"
            single_line_match = re.match(
                r'^(\d{2}-[A-Za-z]{3}-\d{4})\s+'  # Date
                r'([A-Za-z][A-Za-z\s\-\.\(\)\/0-9]+?)\s+'  # Transaction type
                r'([\d,]+\.?\d*|\([\d,]+\.?\d*\))\s+'  # Amount (can be in parentheses for negative)
                r'([\d,]+\.?\d*|\([\d,]+\.?\d*\))\s+'  # Units
                r'([\d,]+\.?\d*)\s+'  # NAV
                r'([\d,]+\.?\d*)'  # Balance
                r'\s*$',
                line
            )
            
            # Debug: Log if this looks like a Nippon segregated transaction but single_line didn't match
            if '505.287' in line or '672.249' in line:
                logger.info(f"DEBUG line {i}: {line[:60]}, single_line_match={single_line_match is not None}")
            
            if single_line_match and current_key:
                date_str = single_line_match.group(1)
                trans_type = single_line_match.group(2).strip()
                amount_str = single_line_match.group(3).replace(',', '').replace('(', '-').replace(')', '')
                units_str = single_line_match.group(4).replace(',', '').replace('(', '-').replace(')', '')
                nav_str = single_line_match.group(5).replace(',', '')
                balance_str = single_line_match.group(6).replace(',', '')
                
                # Skip NFT entries (marked with ***)
                if '***' in trans_type:
                    i += 1
                    continue
                
                try:
                    amount = float(amount_str)
                    units = float(units_str)
                    nav = float(nav_str)
                    balance = float(balance_str)
                except ValueError:
                    i += 1
                    continue
                
                # Skip zero amount/unit entries
                if amount == 0 and units == 0:
                    i += 1
                    continue
                
                # Check if this is a rejection/reversal entry - should be excluded from all calculations
                is_rejection = ('Rejection' in trans_type or 
                               'Reversal' in trans_type or 
                               'dishonoured' in trans_type.lower() or
                               'not realised' in trans_type.lower())
                
                # Determine if redemption (only actual sales, NOT rejections)
                is_redemption = (not is_rejection and (
                                amount < 0 or 
                                'Redemption' in trans_type or 
                                'Switch Over Out' in trans_type or 
                                'Lateral Shift Out' in trans_type))
                
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
                    'is_redemption': is_redemption,
                    'is_rejection': is_rejection
                }
                self.transactions.append(transaction)
                if current_key in self.folios:
                    self.folios[current_key]['transactions'].append(transaction)
                
                i += 1
                continue
            
            # Also handle single-line format for segregated portfolios (no Amount/NAV)
            # Format: Date Transaction Units Balance
            # Example: "08-Jan-2018 Purchase 505.287 505.287"
            segregated_match = re.match(
                r'^(\d{2}-[A-Za-z]{3}-\d{4})\s+'  # Date
                r'([A-Za-z][A-Za-z\s\-]+?)\s+'  # Transaction type (simple)
                r'([\d,]+\.?\d*)\s+'  # Units
                r'([\d,]+\.?\d*)'  # Balance
                r'\s*$',
                line
            )
            
            # Debug log for lines that might be segregated transactions
            if segregated_match:
                logger.info(f"SEGREGATED REGEX MATCH at line {i}: {line[:50]}, current_key={current_key}, scheme={current_scheme[:30] if current_scheme else 'None'}")
            
            if segregated_match and current_key:
                # Verify this is actually a 4-field format, not a misparse
                parts = line.split()
                # Must have exactly 4 groups of tokens: date, trans_type_words, units, balance
                if len(parts) >= 4:
                    date_str = segregated_match.group(1)
                    trans_type = segregated_match.group(2).strip()
                    units_str = segregated_match.group(3).replace(',', '')
                    balance_str = segregated_match.group(4).replace(',', '')
                    
                    # Debug logging for Nippon
                    if 'nippon' in current_scheme.lower():
                        logger.info(f"SEGREGATED MATCH: date={date_str}, trans_type={trans_type}, scheme={current_scheme[:30]}")
                    
                    # Skip if trans_type looks like a number (misparse)
                    if re.match(r'^[\d,\.]+$', trans_type):
                        pass  # Skip, let other parser handle it
                    else:
                        try:
                            units = float(units_str)
                            balance = float(balance_str)
                            
                            # This is likely a segregated portfolio or zero-cost entry
                            is_redemption = ('Redemption' in trans_type or 
                                            'Rejection' in trans_type)
                            
                            transaction = {
                                'date': date_str,
                                'amount': 0,  # Zero cost (segregated portfolio)
                                'nav': 0,
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
                            if current_key in self.folios:
                                self.folios[current_key]['transactions'].append(transaction)
                            
                            i += 1
                            continue
                        except ValueError:
                            pass
            
            # Detect transaction lines (vertical format - date only on line)
            # CAS PDFs use a 6-column structure: Date | Amount (INR) | Price (INR) | Units | Transaction | Unit Balance
            # In vertical format, these appear on separate lines
            trans_match = re.match(r'^(\d{2}-[A-Za-z]{3}-\d{4})\s*$', line)
            if trans_match and current_key:
                date_str = trans_match.group(1)
                
                # PRIORITY 0: Check for KFIN/alternative 6-line format where Transaction Type comes FIRST
                # Format: Date, TransType (text), Amount, Units, NAV, Balance
                # This is common in newer CAS PDFs from KFIN and some CAMS PDFs
                if i + 5 < len(lines):
                    line1 = lines[i + 1].strip()  # Transaction Type (should be text)
                    line2 = lines[i + 2].strip()  # Amount
                    line3 = lines[i + 3].strip()  # Units
                    line4 = lines[i + 4].strip()  # NAV
                    line5 = lines[i + 5].strip()  # Balance
                    
                    # Detect if this is the alternative format:
                    # - line1 should be text (transaction type) - not a pure number
                    # - lines 2-5 should be numbers
                    is_alt_format = (
                        not re.match(r'^[\d,\.\-\(\)]+$', line1) and  # line1 is NOT a number
                        not line1.startswith('***') and  # Not an NFT marker
                        re.match(r'^[\d,\.\-\(\)]+$', line2) and  # line2 IS a number (amount)
                        re.match(r'^[\d,\.\-\(\)]+$', line3) and  # line3 IS a number (units)
                        re.match(r'^[\d,\.\-\(\)]+$', line4) and  # line4 IS a number (nav)
                        re.match(r'^[\d,\.\-\(\)]+$', line5)      # line5 IS a number (balance)
                    )
                    
                    if is_alt_format:
                        try:
                            trans_type = line1
                            amount_str = line2.replace('(', '-').replace(')', '').replace(',', '')
                            units_str = line3.replace('(', '-').replace(')', '').replace(',', '')
                            nav_str = line4.replace(',', '')
                            balance_str = line5.replace(',', '')
                            
                            amount = float(amount_str)
                            units = float(units_str)
                            nav = float(nav_str)
                            balance = float(balance_str)
                            
                            # Skip zero amount/unit entries (except for special transactions)
                            if amount == 0 and units == 0 and 'Stamp Duty' not in trans_type:
                                i += 1
                                continue
                            
                            # Check if this is a rejection/reversal entry
                            is_rejection = ('Rejection' in trans_type or 
                                           'Reversal' in trans_type or
                                           'dishonoured' in trans_type.lower() or
                                           'not realised' in trans_type.lower())
                            
                            # Determine redemption (only actual sales, NOT rejections)
                            is_redemption = (not is_rejection and (
                                            amount < 0 or 
                                            'Redemption' in trans_type or 
                                            'Switch Over Out' in trans_type or 
                                            'Lateral Shift Out' in trans_type))
                            
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
                                'is_redemption': is_redemption,
                                'is_rejection': is_rejection
                            }
                            self.transactions.append(transaction)
                            if current_key in self.folios:
                                self.folios[current_key]['transactions'].append(transaction)
                            
                            logger.debug(f"ALT-FORMAT TRANS: date={date_str}, type={trans_type[:40]}, amount={amount}, units={units}")
                            i += 6  # Skip all 6 lines
                            continue
                        except ValueError:
                            pass
                
                # PRIORITY 1: Check for 4-line segregated portfolio format 
                # Format: Date, Units, TransType, Balance (no Amount/NAV)
                # This happens for zero-cost segregated portfolios
                if i + 3 < len(lines):
                    line1 = lines[i + 1].strip()  # Units
                    line2 = lines[i + 2].strip()  # TransType
                    line3 = lines[i + 3].strip()  # Balance
                    
                    # Segregated portfolios have transaction type as text in position 2
                    # and numeric values in positions 1 and 3
                    is_segregated_trans = (
                        line2 in ('Purchase', 'Redemption', 'Switch Over In', 'Switch Over Out', 
                                  'Switch In', 'Switch Out', 'Systematic Investment Plan') and
                        re.match(r'^[\d,\.]+$', line1) and
                        re.match(r'^[\d,\.]+$', line3)
                    )
                    
                    if is_segregated_trans:
                        try:
                            units = float(line1.replace(',', ''))
                            balance = float(line3.replace(',', ''))
                            trans_type = line2
                            
                            logger.info(f"SEGREGATED 4-LINE: date={date_str}, type={trans_type}, units={units}, balance={balance}, scheme={current_scheme[:30] if current_scheme else 'N/A'}")
                            
                            is_redemption = trans_type in ('Redemption', 'Switch Over Out', 'Switch Out')
                            
                            # Create transaction with 6-column structure (Amount and NAV are empty/0)
                            transaction = {
                                'date': date_str,
                                'amount': None,  # Empty - no cost for segregated portfolio
                                'nav': None,     # Empty - no NAV for segregated portfolio
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
                            if current_key in self.folios:
                                self.folios[current_key]['transactions'].append(transaction)
                            
                            i += 4  # Skip all 4 lines
                            continue
                        except ValueError:
                            pass
                
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
                        
                        # Handle IDCW Payout (Dividend) transactions
                        # Format: Date, Amount, ***IDCW Paid @ Rs.X.XX per unit***
                        # These are dividend payouts that don't have NAV/Units
                        if '***IDCW' in nav_str or '***Dividend' in nav_str or 'IDCW Paid' in nav_str:
                            try:
                                payout_amount = float(amount_str.replace(',', '').replace('(', '-').replace(')', ''))
                                # Extract rate per unit if available
                                rate_match = re.search(r'Rs\.?([\d.]+)\s*per unit', nav_str)
                                rate_per_unit = float(rate_match.group(1)) if rate_match else 0
                                
                                if abs(payout_amount) > 0:
                                    transaction = {
                                        'date': date_str,
                                        'amount': abs(payout_amount),
                                        'nav': rate_per_unit,  # Store rate per unit in NAV field
                                        'units': 0,
                                        'transaction_type': 'IDCW Payout',
                                        'balance': 0,
                                        'folio': current_folio,
                                        'scheme': current_scheme,
                                        'isin': current_isin,
                                        'pan': current_pan,
                                        'amc': current_amc,
                                        'advisor': current_advisor,
                                        'is_idcw': True,  # Mark as IDCW for Sold Units sheet
                                        'is_redemption': False  # Not a redemption, it's dividend income
                                    }
                                    self.transactions.append(transaction)
                                    if current_key in self.folios:
                                        self.folios[current_key]['transactions'].append(transaction)
                            except ValueError:
                                pass
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
                        # Some NFTs span multiple lines:
                        # Line 1: "25-Nov-2017 ***One Time Mandate Acceptance from BankSTANDARD CHARTERED"
                        # Line 2: "BANK$**4966***"
                        if '***' in amount_str:
                            # First try single line format: ***Description***
                            nft_match = re.search(r'\*\*\*(.+?)\*\*\*', amount_str)
                            if nft_match:
                                nft_type = nft_match.group(1).strip()
                            else:
                                # Multi-line format: ***Description on amount_str, closing *** on same line tokens
                                # Combine amount_str and nav_str
                                combined = amount_str + nav_str
                                nft_match = re.search(r'\*\*\*(.+?)\*\*\*', combined)
                                if nft_match:
                                    nft_type = nft_match.group(1).strip()
                                else:
                                    # Check if NFT description continues on the NEXT LINE
                                    # Pattern: current line has "***Description..." without closing ***
                                    # Next line has the rest ending with "***"
                                    nft_type = amount_str.replace('***', '').strip()
                                    
                                    # Look ahead to next line for continuation
                                    if i + 1 < len(lines):
                                        next_line = lines[i + 1].strip()
                                        # Check if next line ends with *** (closing marker)
                                        if '***' in next_line:
                                            # Extract the continuation and combine
                                            continuation = next_line.split('***')[0].strip()
                                            nft_type = nft_type + ' ' + continuation
                                            # Skip the next line since we consumed it
                                            i += 1
                                        # Also handle case where next line is just the continuation
                                        elif not re.match(r'^\d{2}-[A-Za-z]{3}-\d{4}', next_line):
                                            # Not a date line, might be continuation
                                            nft_type = nft_type + ' ' + next_line
                            
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
                        
                        # Keep full transaction type description instead of truncating
                        trans_type = trans_type_line.strip()
                        
                        balance = 0
                        if i + 5 < len(lines):
                            balance_line = lines[i + 5].strip().replace(',', '')
                            try:
                                balance = float(balance_line)
                            except ValueError:
                                pass
                        
                        # Treat as redemption/reversal if:
                        # - Amount is negative (in parentheses)
                        # - Contains 'Redemption', 'Switch Over Out', 'Lateral Shift Out'
                        # NOTE: Rejection/Reversal entries are excluded from redemption flag
                        
                        # Check if this is a rejection/reversal entry
                        is_rejection = ('Rejection' in trans_type_line or 
                                       'Reversal' in trans_type_line or
                                       'dishonoured' in trans_type_line.lower() or
                                       'not realised' in trans_type_line.lower())
                        
                        # Determine redemption (only actual sales, NOT rejections)
                        is_redemption = (not is_rejection and (
                                        amount < 0 or 
                                        'Redemption' in trans_type_line or 
                                        'Switch Over Out' in trans_type_line or 
                                        'Lateral Shift Out' in trans_type_line))
                        
                        # Debug logging for transaction classification
                        if is_redemption:
                            logger.debug(f"Redemption detected: date={date_str}, amount={amount}, type={trans_type_line[:50]}")
                        
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
                            'is_redemption': is_redemption,
                            'is_rejection': is_rejection
                        }
                        
                        self.transactions.append(transaction)
                        
                        if current_key and current_key in self.folios:
                            self.folios[current_key]['transactions'].append(transaction)
                        else:
                            logger.warning(f"Transaction not added to folio! key={current_key}, scheme={current_scheme[:30] if current_scheme else 'None'}, date={date_str}")
                        
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
            folio_match = re.search(r'Folio No\s*:\s*([\d\s/]+)', line)
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
        
        # Get report_date from parsed_data - this is the NAV date from the CAS (e.g., "NAV on 14-Jan-2026")
        raw_report_date = parsed_data.get('report_date')
        logger.info(f"GapSheetGenerator: raw_report_date from parsed_data = {raw_report_date}, type = {type(raw_report_date)}")
        
        if raw_report_date:
            if isinstance(raw_report_date, datetime):
                self.report_date = raw_report_date
            elif isinstance(raw_report_date, str):
                # Parse string date
                for fmt in ['%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d-%b-%Y', '%d-%b-%y']:
                    try:
                        self.report_date = datetime.strptime(raw_report_date[:19], fmt)
                        break
                    except:
                        continue
                else:
                    self.report_date = datetime.now()
            else:
                self.report_date = datetime.now()
        else:
            self.report_date = datetime.now()
        
        logger.info(f"GapSheetGenerator initialized with report_date: {self.report_date}")
        
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
    
    def _get_advisor_name(self, arn: str, scheme_name: str = '') -> str:
        """Get advisor name from ARN code or determine from scheme name.
        
        Rules:
        1. If ARN code exists in CAS, use it (or map to known name)
        2. If no ARN but scheme name contains 'DIRECT', return 'DIRECT'
        3. If no ARN and not direct plan, return empty string
        """
        # Handle None, 'None', empty string cases
        if not arn or arn in ('None', 'null', '', 'N/A'):
            # No ARN - check if Direct plan from scheme name
            if scheme_name and 'direct' in scheme_name.lower():
                return 'DIRECT'
            # No ARN and not direct - return empty (unknown/regular without broker)
            return ''
        
        # Use ARN code or map to known name
        return self.ADVISOR_NAMES.get(arn, arn)
    
    def _get_scheme_name_from_master(self, isin: str, fallback_name: str = '') -> str:
        """Get scheme name from scheme master using ISIN, fallback to parsed name"""
        if self.scheme_mapper and isin:
            scheme_data = self.scheme_mapper.isin_index.get(isin)
            if scheme_data and scheme_data.get('scheme_name'):
                return scheme_data['scheme_name']
        return fallback_name or 'Unknown Scheme'
    
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
        """Use NAVs from the parsed CAS PDF. Only calculate from market value if missing.
        
        Note: We no longer fetch from external API as the CAS PDF already contains
        the NAV as of the statement date.
        """
        for folio_key, folio_data in self.parsed_data.get('folios', {}).items():
            current_nav = folio_data.get('current_nav', 0)
            scheme_name = folio_data.get('scheme', '')
            
            # If NAV is already valid (greater than 1), keep it
            if current_nav and current_nav > 1 and current_nav < 100000:
                continue
            
            # If no valid NAV, try to calculate from market value and units
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
        # 2. Scheme Wise Breakdown
        # 3. Active Units (remaining/held units only)
        # 4. Sold Units (all redeemed/sold transactions with profit calculation)
        # 5. IDCW Payouts (dividend income)
        # 6. NFT
        # 7. Advisor View (with XIRR, sorted by AUM)
        # 8. XIRR (Broker-wise)
        # 9. TDS Details (only if TDS entries exist)
        self._create_summary_sheet(wb)
        self._create_scheme_breakdown_sheet(wb)  # New separate sheet for scheme breakdown
        self._create_folio_cards_sheet(wb)  # New card format view
        self._create_mf_transactions_sheet(wb)  # Renamed to Active Units
        self._create_sold_units_sheet(wb)  # New sheet for sold units
        self._create_idcw_sheet(wb)  # New sheet for IDCW/dividend payouts
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
    
    def generate_all_reports(self, include_consolidated: bool = False) -> bytes:
        """Generate all reports as a ZIP file containing:
        - A 'Consolidated' folder with reports showing all PANs' data combined (with PAN against each folio)
        - Separate folders for each PAN with their individual reports
        
        Important: The Potential Sell Report is derived from the GapSheet Active Units
        to ensure advisor information is consistent across both reports.
        """
        # First, generate the active units data once - this will be used by both
        # GapSheet Active Units tab and Potential Sell Report
        self._active_units_cache = self._get_active_units_data(pan_filter=None)
        
        # Get unique PANs
        unique_pans = set()
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            pan = folio_data.get('pan')
            if pan:
                unique_pans.add(pan)
        
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            # Always create a "Consolidated" folder with combined reports (PAN visible against each folio)
            # 1. Main consolidated report (uses _active_units_cache)
            main_report = self.generate()
            zip_file.writestr("Consolidated/GapSheet_Consolidated.xlsx", main_report)
            
            # 2. Consolidated Potential Sell Report (derived from same _active_units_cache)
            potential_sell_report = self._generate_potential_sell_report_from_cache()
            zip_file.writestr("Consolidated/PotentialSellReport_Consolidated.xlsx", potential_sell_report)
            
            # 3. Stocklist Consolidated - shows stock holdings for each scheme
            stocklist_report = self._generate_stocklist_consolidated()
            if stocklist_report:
                zip_file.writestr("Consolidated/Stocklist_Consolidated.xlsx", stocklist_report)
            
            # 4. Benchmark Comparison - compares actual returns vs benchmark returns
            benchmark_report = self._generate_benchmark_comparison()
            if benchmark_report:
                zip_file.writestr("Consolidated/Benchmark_Comparison.xlsx", benchmark_report)
            
            # Generate all reports for each PAN in its own folder
            for pan in unique_pans:
                safe_pan = (pan or 'UNKNOWN').replace('/', '_').replace(' ', '')
                
                # GapSheet for this PAN
                pan_gapsheet = self._generate_by_pan_single(pan)
                if pan_gapsheet:
                    zip_file.writestr(f"{safe_pan}/GapSheet_{safe_pan}.xlsx", pan_gapsheet)
                
                # Potential Sell Report for this PAN
                pan_sell_report = self._generate_potential_sell_report_from_cache(pan_filter=pan)
                if pan_sell_report:
                    zip_file.writestr(f"{safe_pan}/PotentialSellReport_{safe_pan}.xlsx", pan_sell_report)
                
                # Stocklist for this PAN
                pan_stocklist = self._generate_stocklist_consolidated(pan_filter=pan)
                if pan_stocklist:
                    zip_file.writestr(f"{safe_pan}/Stocklist_{safe_pan}.xlsx", pan_stocklist)
                
                # Benchmark Comparison for this PAN
                pan_benchmark = self._generate_benchmark_comparison(pan_filter=pan)
                if pan_benchmark:
                    zip_file.writestr(f"{safe_pan}/Benchmark_Comparison_{safe_pan}.xlsx", pan_benchmark)
        
        # Clear cache after all reports are generated
        self._active_units_cache = None
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()
    
    def _generate_by_pan_single(self, pan: str) -> bytes:
        """Generate GapSheet for a single PAN"""
        filtered_folios = {}
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            if folio_data.get('pan') == pan:
                filtered_folios[folio_id] = folio_data
        
        if not filtered_folios:
            return None
        
        filtered_data = {
            'folios': filtered_folios,
            'transactions': [t for t in self.parsed_data.get('transactions', []) 
                           if t.get('folio') in [f.get('folio_number') for f in filtered_folios.values()]
                           or any(t.get('isin') == f.get('isin') for f in filtered_folios.values())],
            'portfolio_summary': self.parsed_data.get('portfolio_summary', {}),
            'report_date': self.parsed_data.get('report_date')  # Pass the CAS NAV date
        }
        
        pan_generator = GapSheetGenerator(filtered_data, self.nav_service, self.scheme_mapper)
        return pan_generator.generate()
    
    def _generate_potential_sell_report_from_cache(self, pan_filter: str = None) -> bytes:
        """Generate Potential Sell Report derived from cached Active Units data.
        
        This ensures the advisor information is consistent with GapSheet Active Units tab.
        
        Tabs:
        - Scheme-wise Summary (first tab - consolidated view by scheme for all periods)
        - 5+ Years
        - 3-5 Years
        - 2-3 Years
        - 1-2 Years
        - Less than 1 Year
        
        Each tab shows active units sorted by lowest XIRR (worst performers first).
        """
        wb = Workbook()
        
        # Use cached active units data (already processed with proper advisor tagging)
        if hasattr(self, '_active_units_cache') and self._active_units_cache:
            active_units = self._active_units_cache
            if pan_filter:
                active_units = [u for u in active_units if u.get('pan') == pan_filter]
        else:
            # Fallback if cache not available
            active_units = self._get_active_units_data(pan_filter)
        
        # Define holding period buckets
        buckets = [
            ("5+ Years", 5 * 365, float('inf')),
            ("3-5 Years", 3 * 365, 5 * 365),
            ("2-3 Years", 2 * 365, 3 * 365),
            ("1-2 Years", 1 * 365, 2 * 365),
            ("Less than 1 Year", 0, 1 * 365)
        ]
        
        # Create Scheme-wise Summary as first sheet (using default sheet)
        ws_scheme_summary = wb.active
        ws_scheme_summary.title = "Scheme-wise Summary"
        self._write_scheme_wise_consolidated_summary(ws_scheme_summary, active_units, buckets)
        
        # Create a sheet for each bucket
        for bucket_name, min_days, max_days in buckets:
            # Filter units for this bucket
            bucket_units = [
                u for u in active_units 
                if min_days <= u['holding_days'] < max_days
            ]
            
            # Sort by XIRR ascending (lowest/worst performers first)
            bucket_units.sort(key=lambda x: x['xirr'] if x['xirr'] is not None else float('inf'))
            
            # Create sheet
            ws = wb.create_sheet(bucket_name)
            self._write_potential_sell_sheet(ws, bucket_units, bucket_name)
        
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output.getvalue()
    
    def _generate_potential_sell_report(self, pan_filter: str = None) -> bytes:
        """Generate Potential Sell Report with holdings segregated by holding period.
        
        Tabs:
        - Scheme-wise Summary (first tab - consolidated view by scheme for all periods)
        - 5+ Years
        - 3-5 Years
        - 2-3 Years
        - 1-2 Years
        - Less than 1 Year
        
        Each tab shows active units sorted by lowest XIRR (worst performers first).
        """
        wb = Workbook()
        
        # Get active units data with XIRR and holding period
        active_units = self._get_active_units_data(pan_filter)
        
        # Define holding period buckets
        buckets = [
            ("5+ Years", 5 * 365, float('inf')),
            ("3-5 Years", 3 * 365, 5 * 365),
            ("2-3 Years", 2 * 365, 3 * 365),
            ("1-2 Years", 1 * 365, 2 * 365),
            ("Less than 1 Year", 0, 1 * 365)
        ]
        
        # Create Scheme-wise Summary as first sheet (using default sheet)
        ws_scheme_summary = wb.active
        ws_scheme_summary.title = "Scheme-wise Summary"
        self._write_scheme_wise_consolidated_summary(ws_scheme_summary, active_units, buckets)
        
        # Create a sheet for each bucket
        for bucket_name, min_days, max_days in buckets:
            # Filter units for this bucket
            bucket_units = [
                u for u in active_units 
                if min_days <= u['holding_days'] < max_days
            ]
            
            # Sort by XIRR ascending (lowest/worst performers first)
            bucket_units.sort(key=lambda x: x['xirr'] if x['xirr'] is not None else float('inf'))
            
            # Create sheet
            ws = wb.create_sheet(bucket_name)
            self._write_potential_sell_sheet(ws, bucket_units, bucket_name)
        
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output.getvalue()
    
    def _write_scheme_wise_consolidated_summary(self, ws, active_units: List[Dict], buckets: List[tuple]):
        """Write consolidated scheme-wise summary for all tenures in one sheet."""
        from collections import defaultdict
        
        row = 1
        
        # Title
        ws.cell(row=row, column=1, value="SCHEME-WISE SUMMARY BY HOLDING PERIOD")
        ws.merge_cells(f'A{row}:J{row}')
        ws.cell(row=row, column=1).font = Font(bold=True, size=14)
        ws.cell(row=row, column=1).alignment = Alignment(horizontal="center")
        
        row += 2
        
        # Process each tenure bucket
        for bucket_name, min_days, max_days in buckets:
            # Filter units for this bucket
            bucket_units = [
                u for u in active_units 
                if min_days <= u['holding_days'] < max_days
            ]
            
            if not bucket_units:
                continue
            
            # Aggregate by scheme
            scheme_data = defaultdict(lambda: {
                'scheme_name': '',
                'isin': '',
                'plan_type': '',
                'adviser': '',
                'num_holdings': 0,
                'total_units': 0,
                'cost_value': 0,
                'market_value': 0,
                'xirr_values': []
            })
            
            for unit in bucket_units:
                scheme_key = (unit.get('isin', ''), unit.get('scheme', ''))
                scheme_data[scheme_key]['scheme_name'] = unit.get('scheme', '')
                scheme_data[scheme_key]['isin'] = unit.get('isin', '')
                scheme_data[scheme_key]['plan_type'] = unit.get('plan_type', '')
                scheme_data[scheme_key]['adviser'] = unit.get('advisor', '')
                scheme_data[scheme_key]['num_holdings'] += 1
                scheme_data[scheme_key]['total_units'] += unit.get('remaining_units', 0)
                scheme_data[scheme_key]['cost_value'] += unit.get('cost_value', 0)
                scheme_data[scheme_key]['market_value'] += unit.get('market_value', 0)
                if unit.get('xirr') is not None:
                    scheme_data[scheme_key]['xirr_values'].append(unit['xirr'])
            
            # Tenure section header
            ws.cell(row=row, column=1, value=f"HOLDING PERIOD: {bucket_name}")
            ws.merge_cells(f'A{row}:J{row}')
            ws.cell(row=row, column=1).fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
            ws.cell(row=row, column=1).font = Font(bold=True, color="FFFFFF", size=12)
            ws.cell(row=row, column=1).alignment = Alignment(horizontal="left")
            row += 1
            
            # Column headers
            headers = [
                "Scheme Name", "ISIN", "Plan Type", "Adviser", "No. of Lots",
                "Total Units", "Cost Value (INR)", "Market Value (INR)", 
                "Gain/Loss (INR)", "Avg XIRR %"
            ]
            
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=row, column=col, value=header)
                cell.fill = self.header_fill
                cell.font = self.header_font
                cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                cell.border = self.thin_border
            row += 1
            
            # Data rows - sort by scheme name
            total_cost = 0
            total_market = 0
            total_holdings = 0
            total_units = 0
            
            for scheme_key in sorted(scheme_data.keys(), key=lambda x: x[1]):
                data = scheme_data[scheme_key]
                gain_loss = data['market_value'] - data['cost_value']
                avg_xirr = sum(data['xirr_values']) / len(data['xirr_values']) if data['xirr_values'] else 0
                
                ws.cell(row=row, column=1, value=data['scheme_name'])
                ws.cell(row=row, column=2, value=data['isin'])
                ws.cell(row=row, column=3, value=data['plan_type'])
                ws.cell(row=row, column=4, value=data['adviser'])
                ws.cell(row=row, column=5, value=data['num_holdings'])
                
                cell = ws.cell(row=row, column=6, value=round(data['total_units'], 3))
                cell.number_format = '#,##0.000'
                
                cell = ws.cell(row=row, column=7, value=round(data['cost_value'], 2))
                cell.number_format = '₹#,##0.00'
                
                cell = ws.cell(row=row, column=8, value=round(data['market_value'], 2))
                cell.number_format = '₹#,##0.00'
                
                cell = ws.cell(row=row, column=9, value=round(gain_loss, 2))
                cell.number_format = '₹#,##0.00'
                if gain_loss < 0:
                    cell.font = Font(color="FF0000")
                elif gain_loss > 0:
                    cell.font = Font(color="008000")
                
                cell = ws.cell(row=row, column=10, value=f"{avg_xirr:.2f}%")
                if avg_xirr < 0:
                    cell.font = Font(color="FF0000")
                elif avg_xirr > 0:
                    cell.font = Font(color="008000")
                
                # Apply border
                for col in range(1, 11):
                    ws.cell(row=row, column=col).border = self.thin_border
                
                total_cost += data['cost_value']
                total_market += data['market_value']
                total_holdings += data['num_holdings']
                total_units += data['total_units']
                row += 1
            
            # Subtotal row for this tenure
            ws.cell(row=row, column=1, value=f"Subtotal ({bucket_name})")
            ws.cell(row=row, column=1).font = Font(bold=True)
            ws.cell(row=row, column=5, value=total_holdings)
            ws.cell(row=row, column=5).font = Font(bold=True)
            
            cell = ws.cell(row=row, column=6, value=round(total_units, 3))
            cell.number_format = '#,##0.000'
            cell.font = Font(bold=True)
            
            cell = ws.cell(row=row, column=7, value=round(total_cost, 2))
            cell.number_format = '₹#,##0.00'
            cell.font = Font(bold=True)
            
            cell = ws.cell(row=row, column=8, value=round(total_market, 2))
            cell.number_format = '₹#,##0.00'
            cell.font = Font(bold=True)
            
            total_gain = total_market - total_cost
            cell = ws.cell(row=row, column=9, value=round(total_gain, 2))
            cell.number_format = '₹#,##0.00'
            cell.font = Font(bold=True, color="008000" if total_gain >= 0 else "FF0000")
            
            # Apply border to subtotal row
            for col in range(1, 11):
                ws.cell(row=row, column=col).border = self.thin_border
                ws.cell(row=row, column=col).fill = PatternFill(start_color="E2EFDA", end_color="E2EFDA", fill_type="solid")
            
            row += 2  # Add spacing before next tenure
        
        # Auto-width columns
        self._auto_width(ws, min_width=10, max_width=50)
    
    def _write_potential_sell_summary(self, ws, summary_data: List[Dict]):
        """Write summary sheet with cost and market values by period."""
        
        # Title
        ws.merge_cells('A1:G1')
        ws['A1'] = "XIRR Basis Holding Period"
        ws['A1'].font = Font(bold=True, size=14)
        ws['A1'].alignment = Alignment(horizontal="center")
        
        # Headers
        headers = [
            "Holding Period", "No. of Holdings", "Cost Value (INR)", 
            "Current Market Value (INR)", "Gain/Loss (INR)", "Gain/Loss %", "Avg XIRR %"
        ]
        
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=3, column=col, value=header)
            cell.fill = self.header_fill
            cell.font = self.header_font
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = self.thin_border
        
        # Data rows
        row = 4
        total_cost = 0
        total_market = 0
        total_holdings = 0
        
        for data in summary_data:
            ws.cell(row=row, column=1, value=data['period'])
            ws.cell(row=row, column=2, value=data['num_holdings'])
            
            cell = ws.cell(row=row, column=3, value=round(data['cost_value'], 2))
            cell.number_format = '₹#,##0.00'
            
            cell = ws.cell(row=row, column=4, value=round(data['market_value'], 2))
            cell.number_format = '₹#,##0.00'
            
            cell = ws.cell(row=row, column=5, value=round(data['gain_loss'], 2))
            cell.number_format = '₹#,##0.00'
            if data['gain_loss'] < 0:
                cell.font = Font(color="FF0000")
            elif data['gain_loss'] > 0:
                cell.font = Font(color="008000")
            
            cell = ws.cell(row=row, column=6, value=round(data['gain_loss_pct'], 2))
            cell.number_format = '0.00"%"'
            
            cell = ws.cell(row=row, column=7, value=round(data['avg_xirr'], 2))
            cell.number_format = '0.00"%"'
            if data['avg_xirr'] < 0:
                cell.font = Font(color="FF0000")
            elif data['avg_xirr'] > 0:
                cell.font = Font(color="008000")
            
            # Apply border to data cells
            for col in range(1, 8):
                ws.cell(row=row, column=col).border = self.thin_border
            
            total_cost += data['cost_value']
            total_market += data['market_value']
            total_holdings += data['num_holdings']
            row += 1
        
        # Total row
        row += 1
        ws.cell(row=row, column=1, value="GRAND TOTAL")
        ws.cell(row=row, column=1).font = Font(bold=True)
        
        ws.cell(row=row, column=2, value=total_holdings)
        ws.cell(row=row, column=2).font = Font(bold=True)
        
        cell = ws.cell(row=row, column=3, value=round(total_cost, 2))
        cell.number_format = '₹#,##0.00'
        cell.font = Font(bold=True)
        
        cell = ws.cell(row=row, column=4, value=round(total_market, 2))
        cell.number_format = '₹#,##0.00'
        cell.font = Font(bold=True)
        
        total_gain = total_market - total_cost
        cell = ws.cell(row=row, column=5, value=round(total_gain, 2))
        cell.number_format = '₹#,##0.00'
        cell.font = Font(bold=True, color="008000" if total_gain >= 0 else "FF0000")
        
        total_gain_pct = (total_gain / total_cost * 100) if total_cost > 0 else 0
        cell = ws.cell(row=row, column=6, value=round(total_gain_pct, 2))
        cell.number_format = '0.00"%"'
        cell.font = Font(bold=True)
        
        # Apply border to total row
        for col in range(1, 8):
            ws.cell(row=row, column=col).border = self.thin_border
        
        # Auto-width columns
        self._auto_width(ws, min_width=12, max_width=30)
    
    def _get_active_units_data(self, pan_filter: str = None) -> List[Dict]:
        """Extract active units data with XIRR and holding period calculations.
        Uses FIFO logic to determine remaining units per purchase.
        """
        active_units = []
        
        # Parse date helper
        def parse_date(date_str):
            try:
                return datetime.strptime(date_str, '%d-%b-%Y')
            except:
                return None
        
        # Group transactions by folio+isin
        folio_transactions = defaultdict(list)
        
        # Build rejection lookup
        all_rejections = {}  # (date, folio, isin, amount) -> count
        for trans in self.parsed_data.get('transactions', []):
            ttype = trans.get('transaction_type', '')
            if 'Rejection' in ttype or 'Reversal' in ttype:
                date = trans.get('date', '')
                folio = trans.get('folio', '')
                isin = trans.get('isin', '')
                amount = abs(trans.get('amount', 0) or 0)
                key = (date, folio, isin, round(amount, 2))
                all_rejections[key] = all_rejections.get(key, 0) + 1
        
        used_rejections = {}
        
        for trans in self.parsed_data.get('transactions', []):
            # Skip non-financial transactions
            if trans.get('is_nft') or trans.get('is_pledge'):
                continue
            if trans.get('transaction_type') in ['STT Paid', 'Stamp Duty']:
                continue
            
            ttype = trans.get('transaction_type', '')
            
            # Skip rejection entries
            if 'Rejection' in ttype or 'Reversal' in ttype:
                continue
            
            # Apply PAN filter if specified
            if pan_filter and trans.get('pan') != pan_filter:
                continue
            
            # Check if this purchase was rejected
            if not trans.get('is_redemption'):
                date = trans.get('date', '')
                folio = trans.get('folio', '')
                isin = trans.get('isin', '')
                amount = abs(trans.get('amount', 0) or 0)
                key = (date, folio, isin, round(amount, 2))
                
                if key in all_rejections:
                    matched = used_rejections.get(key, 0)
                    if matched < all_rejections[key]:
                        used_rejections[key] = matched + 1
                        continue  # Skip this rejected purchase
            
            folio = trans.get('folio', '')
            isin = trans.get('isin', '')
            key = f"{folio}_{isin}" if isin else folio
            folio_transactions[key].append(trans)
        
        # Build folio data lookup
        folio_lookup = {}
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            folio_lookup[folio_id] = folio_data
        
        # Process each folio using FIFO
        for folio_key, transactions in folio_transactions.items():
            # Sort by date
            sorted_trans = sorted(transactions, key=lambda x: parse_date(x.get('date', '')) or datetime.min)
            
            # Get folio data for current NAV and closing balance
            folio_data = folio_lookup.get(folio_key, {})
            current_nav = folio_data.get('current_nav', 0) or 0
            closing_balance = folio_data.get('closing_balance', 0) or 0
            
            # Skip folios with no remaining balance (fully redeemed)
            # This handles cases where redemption transactions may not be properly parsed
            if closing_balance <= 0:
                continue
            
            # FIFO tracking: list of purchases with remaining units
            purchases = []
            
            for trans in sorted_trans:
                trans_units = trans.get('units', 0) or 0
                trans_date = parse_date(trans.get('date', ''))
                
                if trans.get('is_redemption'):
                    # Redemption: deplete oldest purchases first (FIFO)
                    units_to_redeem = trans_units
                    for purchase in purchases:
                        if units_to_redeem <= 0:
                            break
                        if purchase['remaining_units'] > 0:
                            deducted = min(purchase['remaining_units'], units_to_redeem)
                            purchase['remaining_units'] -= deducted
                            units_to_redeem -= deducted
                else:
                    # Purchase: add to tracking
                    purchases.append({
                        'trans': trans,
                        'original_units': trans_units,
                        'remaining_units': trans_units,
                        'date': trans_date,
                        'nav': trans.get('nav', 0) or 0,
                        'amount': trans.get('amount', 0) or 0
                    })
            
            # Extract active units (purchases with remaining units > 0)
            # Also validate that total remaining doesn't exceed folio's closing balance
            total_remaining = sum(p['remaining_units'] for p in purchases if p['remaining_units'] > 0)
            
            # If calculated remaining exceeds closing balance, scale down proportionally
            # This handles cases where some redemptions weren't captured in transactions
            scale_factor = 1.0
            if total_remaining > closing_balance and closing_balance > 0:
                scale_factor = closing_balance / total_remaining
            elif total_remaining > 0 and closing_balance <= 0:
                # All units should be redeemed but we have remaining - skip this folio
                continue
            
            for purchase in purchases:
                if purchase['remaining_units'] <= 0:
                    continue
                
                trans = purchase['trans']
                trans_date = purchase['date']
                remaining_units = purchase['remaining_units'] * scale_factor  # Apply scaling
                original_units = purchase['original_units']
                original_amount = purchase['amount']
                purchase_nav = purchase['nav']
                
                # Calculate holding days
                if trans_date:
                    holding_days = (self.report_date - trans_date).days
                else:
                    holding_days = 0
                
                # Calculate proportional cost
                if original_units > 0:
                    cost_value = (remaining_units / original_units) * original_amount
                else:
                    cost_value = 0
                
                # Calculate current market value
                if current_nav > 1:
                    market_value = remaining_units * current_nav
                else:
                    market_value = 0
                
                # Calculate XIRR
                xirr_value = None
                if cost_value > 0 and market_value > 0 and trans_date:
                    try:
                        cashflows = [
                            (trans_date, -cost_value),
                            (self.report_date, market_value)
                        ]
                        xirr_rate = calculate_xirr(cashflows) * 100
                        if -100 < xirr_rate < 1000:
                            xirr_value = xirr_rate
                    except:
                        pass
                
                # Get scheme name from master if available
                isin = trans.get('isin', '')
                scheme_name = self._get_scheme_name_from_master(isin, trans.get('scheme', ''))
                
                # Determine if Direct or Regular
                is_direct = 'direct' in scheme_name.lower() if scheme_name else False
                
                # Get advisor - handle string "None" as blank
                advisor = trans.get('advisor', '') or ''
                if advisor in ('None', 'null', ''):
                    advisor = ''
                
                # If no advisor, check if direct plan
                if not advisor and is_direct:
                    advisor = 'DIRECT'
                
                active_units.append({
                    'folio': trans.get('folio', ''),
                    'pan': trans.get('pan', ''),
                    'scheme': scheme_name,
                    'isin': isin,
                    'purchase_date': trans_date.strftime('%d-%b-%Y') if trans_date else '',
                    'original_units': original_units,
                    'remaining_units': remaining_units,
                    'purchase_nav': purchase_nav,
                    'current_nav': current_nav,
                    'cost_value': cost_value,
                    'market_value': market_value,
                    'holding_days': holding_days,
                    'xirr': xirr_value,
                    'gain_loss': market_value - cost_value,
                    'gain_loss_pct': ((market_value - cost_value) / cost_value * 100) if cost_value > 0 else 0,
                    'advisor': advisor,
                    'plan_type': 'Direct' if is_direct else 'Regular',
                    'amc': trans.get('amc', '')
                })
        
        return active_units
    
    def _write_potential_sell_sheet(self, ws, units: List[Dict], bucket_name: str):
        """Write data to a potential sell sheet."""
        
        # Headers
        headers = [
            "Folio No.", "PAN", "Scheme Name", "Plan Type", "ISIN", 
            "Purchase Date", "Holding Days", "Original Units", "Remaining Units",
            "Purchase NAV", "Current NAV", "Cost Value (INR)", "Market Value (INR)",
            "Gain/Loss (INR)", "Gain/Loss %", "XIRR %", "Advisor"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        if not units:
            ws.cell(row=2, column=1, value="No holdings in this period")
            self._auto_width(ws)
            return
        
        # Calculate totals
        total_cost = 0
        total_market = 0
        
        row = 2
        for unit in units:
            ws.cell(row=row, column=1, value=unit['folio'])
            ws.cell(row=row, column=2, value=unit['pan'])
            
            # Truncate scheme name if too long
            scheme_display = unit['scheme'] if len(unit['scheme']) > 60 else unit['scheme']
            ws.cell(row=row, column=3, value=scheme_display)
            
            ws.cell(row=row, column=4, value=unit['plan_type'])
            ws.cell(row=row, column=5, value=unit['isin'])
            ws.cell(row=row, column=6, value=unit['purchase_date'])
            ws.cell(row=row, column=7, value=unit['holding_days'])
            
            cell = ws.cell(row=row, column=8, value=round(unit['original_units'], 3))
            cell.number_format = '#,##0.000'
            
            cell = ws.cell(row=row, column=9, value=round(unit['remaining_units'], 3))
            cell.number_format = '#,##0.000'
            
            cell = ws.cell(row=row, column=10, value=round(unit['purchase_nav'], 4))
            cell.number_format = '#,##0.0000'
            
            cell = ws.cell(row=row, column=11, value=round(unit['current_nav'], 4) if unit['current_nav'] > 1 else 0)
            cell.number_format = '#,##0.0000'
            
            cell = ws.cell(row=row, column=12, value=round(unit['cost_value'], 2))
            cell.number_format = '#,##0.00'
            total_cost += unit['cost_value']
            
            cell = ws.cell(row=row, column=13, value=round(unit['market_value'], 2))
            cell.number_format = '#,##0.00'
            total_market += unit['market_value']
            
            cell = ws.cell(row=row, column=14, value=round(unit['gain_loss'], 2))
            cell.number_format = '#,##0.00'
            # Color code gain/loss
            if unit['gain_loss'] < 0:
                cell.font = Font(color="FF0000")  # Red for loss
            elif unit['gain_loss'] > 0:
                cell.font = Font(color="008000")  # Green for gain
            
            cell = ws.cell(row=row, column=15, value=round(unit['gain_loss_pct'], 2))
            cell.number_format = '0.00"%"'
            
            # XIRR
            if unit['xirr'] is not None:
                cell = ws.cell(row=row, column=16, value=f"{unit['xirr']:.2f}%")
                if unit['xirr'] < 0:
                    cell.font = Font(color="FF0000")
                elif unit['xirr'] > 0:
                    cell.font = Font(color="008000")
            else:
                ws.cell(row=row, column=16, value="N/A")
            
            ws.cell(row=row, column=17, value=self._get_advisor_name(unit['advisor'], unit.get('scheme', '')))
            
            row += 1
        
        # Total row
        ws.cell(row=row, column=1, value="TOTAL")
        ws.cell(row=row, column=1).font = Font(bold=True)
        
        cell = ws.cell(row=row, column=12, value=round(total_cost, 2))
        cell.number_format = '#,##0.00'
        cell.font = Font(bold=True)
        
        cell = ws.cell(row=row, column=13, value=round(total_market, 2))
        cell.number_format = '#,##0.00'
        cell.font = Font(bold=True)
        
        total_gain = total_market - total_cost
        cell = ws.cell(row=row, column=14, value=round(total_gain, 2))
        cell.number_format = '#,##0.00'
        cell.font = Font(bold=True)
        if total_gain < 0:
            cell.font = Font(bold=True, color="FF0000")
        elif total_gain > 0:
            cell.font = Font(bold=True, color="008000")
        
        self._auto_width(ws)
    
    def _generate_potential_sell_by_pan(self) -> Dict[str, bytes]:
        """Generate Potential Sell Reports for each unique PAN using cached data."""
        pan_reports = {}
        
        # Get unique PANs from cached data or folios
        pans = set()
        if hasattr(self, '_active_units_cache') and self._active_units_cache:
            for unit in self._active_units_cache:
                pan = unit.get('pan')
                if pan:
                    pans.add(pan)
        else:
            for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
                pan = folio_data.get('pan')
                if pan:
                    pans.add(pan)
        
        # Generate report for each PAN using cached data
        for pan in pans:
            report_bytes = self._generate_potential_sell_report_from_cache(pan_filter=pan)
            pan_reports[pan] = report_bytes
        
        return pan_reports
    
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

    def _generate_stocklist_consolidated(self, pan_filter: str = None) -> bytes:
        """Generate Stocklist Consolidated Excel - one tab per scheme showing stock holdings.
        
        Uses stockwise_holdings collection from MongoDB to get stock-level holdings for each scheme.
        
        Args:
            pan_filter: If provided, only include folios with this PAN
        
        Tabs:
        1. Summary - Sector breakdown, Market Cap breakdown, ISINs fetched/not fetched
        2. Consolidated Stocklist - All stocks combined, sorted by % to Portfolio
        3+ Individual scheme tabs - One per scheme with stock holdings
        
        Columns: ISIN, Stock Name, Sector, Market Cap, %, % to Portfolio
        """
        import os
        
        wb = Workbook()
        
        # First, calculate scheme % holdings from the parsed data (same logic as scheme breakdown)
        # This gives us the % weight of each scheme in the total portfolio
        scheme_holdings_pct = {}  # isin -> % of total portfolio market value
        total_market_value = 0
        scheme_market_values = {}  # isin -> market value
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            # Apply PAN filter if provided
            if pan_filter and folio_data.get('pan') != pan_filter:
                continue
                
            closing_balance = folio_data.get('closing_balance', 0) or 0
            current_nav = folio_data.get('current_nav', 0) or 0
            if closing_balance > 0 and current_nav > 1:
                isin = folio_data.get('isin', '') or ''
                market_value = closing_balance * current_nav
                if isin:
                    scheme_market_values[isin] = scheme_market_values.get(isin, 0) + market_value
                    total_market_value += market_value
        
        # Calculate % holdings for each scheme
        for isin, mv in scheme_market_values.items():
            scheme_holdings_pct[isin] = (mv / total_market_value * 100) if total_market_value > 0 else 0
        
        # Get unique ISINs and scheme names from the parsed data (active holdings only)
        scheme_isin_map = {}  # isin -> scheme_name
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            # Apply PAN filter if provided
            if pan_filter and folio_data.get('pan') != pan_filter:
                continue
                
            closing_balance = folio_data.get('closing_balance', 0) or 0
            if closing_balance > 0:  # Only active holdings
                isin = folio_data.get('isin', '') or ''
                scheme_name = folio_data.get('scheme', '') or ''
                if isin and isin not in scheme_isin_map:
                    # Get better scheme name from scheme master if available
                    scheme_from_master = self._get_scheme_name_from_master(isin, scheme_name)
                    scheme_isin_map[isin] = scheme_from_master
        
        if not scheme_isin_map:
            return None
        
        # Try to get stockwise holdings from MongoDB
        try:
            # Use synchronous MongoDB client for this context
            from pymongo import MongoClient
            from dotenv import load_dotenv
            load_dotenv('/app/backend/.env')
            
            mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
            db_name = os.environ.get('DB_NAME', 'bond_platform')
            
            client = MongoClient(mongo_url)
            db = client[db_name]
            
            # Helper function to map Direct Plan ISIN to Regular Plan AMFI code
            def get_regular_plan_amfi_code(direct_isin: str, scheme_name: str = None) -> str:
                """
                Map a Direct Plan ISIN to its corresponding Regular Plan AMFI code.
                
                The stockwise_holdings data typically contains Regular Plan data, not Direct Plan.
                This function finds the Regular Plan variant of the same scheme.
                
                Algorithm:
                1. Look up the Direct ISIN in amfi_scheme_data to get scheme_name
                2. Find all entries with same scheme_name where scheme_nav_name does NOT contain "Direct"
                3. Return the scheme_code that has data in stockwise_holdings
                
                Args:
                    direct_isin: The Direct Plan ISIN
                    scheme_name: Optional scheme name if already known
                
                Returns:
                    Regular Plan AMFI code with stockwise data, or None
                """
                if not scheme_name:
                    amfi_record = db.amfi_scheme_data.find_one({"isin": direct_isin})
                    if not amfi_record:
                        return None
                    scheme_name = amfi_record.get('scheme_name')
                
                if not scheme_name:
                    return None
                
                # Find Regular Plan variants (same scheme_name, nav_name without 'Direct')
                regular_variants = list(db.amfi_scheme_data.find({
                    "scheme_name": scheme_name,
                    "scheme_nav_name": {"$not": {"$regex": "Direct", "$options": "i"}}
                }))
                
                # Find which variant has stockwise data
                for reg in regular_variants:
                    reg_code = reg.get('scheme_code')
                    if reg_code:
                        sw_count = db.stockwise_holdings.count_documents({"amfi_code": str(reg_code)})
                        if sw_count > 0:
                            return str(reg_code)
                
                return None
            
            # Helper function to look through MF units and get underlying stocks
            def get_underlying_stocks_for_mf_unit(instrument_isin: str, instrument_name: str, parent_pct_to_portfolio: float, depth: int = 0, visited_isins: set = None) -> list:
                """
                Recursively look through Mutual Fund Units to get underlying stocks.
                Drills down until ALL MF units are converted to actual stocks.
                
                Uses AMFI code linkage: Direct Plan ISIN -> scheme_name -> Regular Plan AMFI code
                
                Args:
                    instrument_isin: ISIN of the MF unit to look through
                    instrument_name: Name of the MF unit
                    parent_pct_to_portfolio: The MF unit's % allocation to TOTAL PORTFOLIO (not to parent scheme)
                    depth: Current recursion depth
                    visited_isins: Set of already visited ISINs to prevent infinite loops
                
                Returns:
                    List of actual stock holdings (not MF units) with their % to portfolio
                """
                if visited_isins is None:
                    visited_isins = set()
                
                # Prevent infinite loops - increase depth limit to handle nested FOFs
                if depth > 10 or instrument_isin in visited_isins:
                    return []
                
                # Only look through domestic MF units (Indian ISINs)
                if not instrument_isin or not instrument_isin.startswith('INF'):
                    return []
                
                visited_isins.add(instrument_isin)
                
                # Step 1: Find AMFI code for this ISIN from amfi_scheme_data
                underlying_amfi_code = None
                underlying_scheme_name = None
                
                amfi_record = db.amfi_scheme_data.find_one({"isin": instrument_isin})
                if amfi_record:
                    underlying_amfi_code = amfi_record.get('scheme_code')
                    underlying_scheme_name = amfi_record.get('scheme_name', '')
                
                # Step 2: Get holdings using the AMFI code
                underlying_holdings = []
                
                if underlying_amfi_code:
                    # First try with the direct AMFI code
                    underlying_holdings = list(db.stockwise_holdings.find(
                        {"amfi_code": str(underlying_amfi_code)},
                        {"_id": 0}
                    ).sort("pct_to_net_assets", -1))
                
                # Step 3: If no holdings found, this might be a Direct Plan ISIN
                # Use AMFI code linkage to find the corresponding Regular Plan
                if not underlying_holdings and underlying_scheme_name:
                    regular_plan_code = get_regular_plan_amfi_code(instrument_isin, underlying_scheme_name)
                    if regular_plan_code:
                        underlying_holdings = list(db.stockwise_holdings.find(
                            {"amfi_code": regular_plan_code},
                            {"_id": 0}
                        ).sort("pct_to_net_assets", -1))
                        if underlying_holdings:
                            logger.info(f"Look-through: Mapped Direct ISIN {instrument_isin} to Regular Plan AMFI code {regular_plan_code} ({len(underlying_holdings)} holdings)")
                
                if not underlying_holdings:
                    logger.warning(f"Look-through: No stockwise data found for ISIN {instrument_isin} ({instrument_name[:50]})")
                    return []
                
                result_stocks = []
                
                for holding in underlying_holdings:
                    h_isin = holding.get('instrument_isin', '')
                    h_name = holding.get('instrument_name', '')
                    h_sector = holding.get('sector', '') or 'Other'
                    h_market_cap = holding.get('market_cap_category', '') or 'Other'
                    if h_market_cap == 'Other':
                        h_market_cap = 'Debt'
                    h_pct_in_fund = holding.get('pct_to_net_assets', 0) or 0
                    # Fix: Data is stored as decimal (0.05 means 5%), convert to percentage
                    h_pct_in_fund = h_pct_in_fund * 100
                    
                    # Calculate this holding's % to TOTAL PORTFOLIO
                    # Example: MF unit is 4% of portfolio, stock is 50% of MF unit
                    # Stock's % to portfolio = 4% × 50% / 100 = 2%
                    stock_pct_to_portfolio = (parent_pct_to_portfolio * h_pct_in_fund) / 100
                    
                    # Check if this is also a MF unit - recursively drill down
                    if h_sector and ('mutual fund' in h_sector.lower() or 'mf units' in h_sector.lower()):
                        # Recursively get underlying stocks - drill down further
                        nested_stocks = get_underlying_stocks_for_mf_unit(
                            h_isin, h_name, stock_pct_to_portfolio, depth + 1, visited_isins
                        )
                        if nested_stocks:
                            # Add all nested stocks (these are actual stocks, not MF units)
                            result_stocks.extend(nested_stocks)
                        else:
                            # Can't look through this MF unit - add it as-is (foreign MF or no data)
                            result_stocks.append({
                                'isin': h_isin,
                                'stock_name': h_name,
                                'sector': 'MF Unit (No Data)',
                                'market_cap': 'MF Unit',
                                'pct_to_portfolio': stock_pct_to_portfolio,
                                'looked_through': False,
                                'source_fund': instrument_name
                            })
                    else:
                        # This is an actual stock - add it
                        result_stocks.append({
                            'isin': h_isin,
                            'stock_name': h_name,
                            'sector': h_sector,
                            'market_cap': h_market_cap,
                            'pct_to_portfolio': stock_pct_to_portfolio,
                            'looked_through': True,
                            'source_fund': instrument_name
                        })
                
                return result_stocks
            
            # Header styling
            header_fill = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
            header_font = Font(bold=True, color="FFFFFF", size=11)
            header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            
            # Tracking for Summary tab
            sector_totals = {}  # sector -> total % to portfolio
            market_cap_totals = {}  # market_cap_category -> total % to portfolio
            isins_fetched = []
            isins_not_fetched = []
            
            # Tracking for sheet names (for hyperlinks)
            main_mf_sheets = []  # List of (isin, name, sheet_name) for main MFs
            sub_mf_sheets = []   # List of (isin, name, sheet_name, parent_isin) for sub-MFs (look-through)
            
            # Tracking for Consolidated Stocklist (only actual stocks, no MF units)
            all_stocks = []  # list of actual stocks with source_type (Direct/Indirect)
            
            # Tracking for MF Holdings tab
            mf_holdings_list = []  # Direct MF investments from CAS
            
            # Track sector totals by source type (Direct vs Indirect via FOF)
            sector_totals_direct = {}  # Sectors from regular MFs
            sector_totals_indirect = {}  # Sectors from FOF look-through
            
            # Sector normalization function to consolidate similar names
            def normalize_sector(sector: str) -> str:
                """Normalize sector names to consolidate duplicates like 'Non - Ferrous Metals' and 'Non Ferrous Metals'"""
                if not sector:
                    return 'Other'
                
                # Mapping of variations to canonical names
                sector_mappings = {
                    'Non - Ferrous Metals': 'Non-Ferrous Metals',
                    'Non Ferrous Metals': 'Non-Ferrous Metals',
                    'Telecom -  Equipment & Accessories': 'Telecom - Equipment & Accessories',
                    'IT - Software': 'IT Software',
                    'IT - Services': 'IT Services', 
                    'IT - Hardware': 'IT Hardware',
                    'Telecom - Services': 'Telecom Services',
                }
                
                # Check for exact match in mappings
                if sector in sector_mappings:
                    return sector_mappings[sector]
                
                # Clean up extra spaces
                sector = ' '.join(sector.split())
                
                return sector
            
            # Updated headers: ISIN, Stock Name, Sector, Market Cap, %, % to Portfolio
            headers = [
                "ISIN", "Stock Name", "Sector", "Market Cap", "%", "% to Portfolio"
            ]
            
            sheets_created = 0
            
            # Process each scheme
            for isin, scheme_name in scheme_isin_map.items():
                # Get AMFI code - try multiple sources
                amfi_code = None
                is_fof = False  # Track if this scheme is a Fund of Funds
                
                # Method 1: Try amfi_scheme_data collection (ISIN -> scheme_code mapping)
                amfi_record = db.amfi_scheme_data.find_one({"isin": isin})
                if amfi_record:
                    amfi_code = amfi_record.get('scheme_code')
                    # Check if this is a FOF based on scheme_category
                    scheme_category = amfi_record.get('scheme_category', '').lower()
                    is_fof = 'fof' in scheme_category or 'fund of funds' in scheme_category
                
                # Method 2: Try scheme_mapper (BSE master)
                if not amfi_code and self.scheme_mapper:
                    scheme_data = self.scheme_mapper.isin_index.get(isin)
                    if scheme_data:
                        amfi_code = scheme_data.get('scheme_code') or scheme_data.get('unique_no')
                
                # Method 3: Try scheme_benchmark_mapping collection
                if not amfi_code:
                    mapping = db.scheme_benchmark_mapping.find_one({
                        "$or": [
                            {"isin_dividend": isin},
                            {"isin_reinvest": isin}
                        ]
                    })
                    if mapping:
                        amfi_code = mapping.get('scheme_code')
                
                # Query stockwise_holdings for this AMFI code or ISIN
                holdings = []
                if amfi_code:
                    holdings = list(db.stockwise_holdings.find(
                        {"amfi_code": str(amfi_code)},
                        {"_id": 0}
                    ).sort("pct_to_net_assets", -1).limit(100))
                
                # If no holdings found, try by scheme ISIN
                if not holdings:
                    holdings = list(db.stockwise_holdings.find(
                        {"scheme_isin": isin},
                        {"_id": 0}
                    ).sort("pct_to_net_assets", -1).limit(100))
                
                # If still no holdings, try fuzzy name matching
                if not holdings and scheme_name:
                    import re
                    # Normalize scheme name for matching
                    # "ICICI Prudential" -> "ICICI Pru", "360 ONE Flexicap Fund" -> "360 ONE Flexicap"
                    clean_name = scheme_name.replace('Prudential', 'Pru').replace('Mutual Fund', '')
                    clean_name = re.sub(r'\s*(Regular|Direct|Growth|Plan|Dividend|IDCW|Non-Demat|\(G\)|\(D\)).*', '', clean_name, flags=re.I)
                    clean_name = clean_name.strip()
                    
                    if len(clean_name) > 5:
                        # Try exact-ish match first
                        holdings = list(db.stockwise_holdings.find(
                            {"scheme_name": {"$regex": f"^{re.escape(clean_name[:20])}", "$options": "i"}},
                            {"_id": 0}
                        ).sort("pct_to_net_assets", -1).limit(100))
                        
                        # If still no match, try more relaxed pattern
                        if not holdings:
                            words = clean_name.split()[:3]
                            if len(words) >= 2:
                                pattern = f".*{re.escape(words[0])}.*{re.escape(words[1])}.*"
                                holdings = list(db.stockwise_holdings.find(
                                    {"scheme_name": {"$regex": pattern, "$options": "i"}},
                                    {"_id": 0}
                                ).sort("pct_to_net_assets", -1).limit(100))
                
                if not holdings:
                    isins_not_fetched.append((isin, scheme_name))
                    # Still count this scheme's allocation in sector totals as "Data Not Available"
                    scheme_pct = scheme_holdings_pct.get(isin, 0)
                    if scheme_pct > 0:
                        sector_totals["Data Not Available"] = sector_totals.get("Data Not Available", 0) + scheme_pct
                        market_cap_totals["Data Not Available"] = market_cap_totals.get("Data Not Available", 0) + scheme_pct
                        # Track in MF holdings even if no stockwise data
                        mf_holdings_list.append({
                            'isin': isin,
                            'scheme_name': scheme_name,
                            'pct_to_portfolio': scheme_pct,
                            'amfi_code': amfi_code or 'N/A'
                        })
                    continue
                
                isins_fetched.append((isin, scheme_name))
                
                # Get scheme's % holdings from portfolio
                scheme_pct_holdings = scheme_holdings_pct.get(isin, 0)
                
                # Get underlying MF units for this scheme (for MF Holdings page)
                underlying_mf_units = []
                direct_holdings_pct = 0
                
                for holding in holdings:
                    h_sector = holding.get('sector', '') or ''
                    h_pct = (holding.get('pct_to_net_assets', 0) or 0) * 100
                    
                    if 'mutual fund' in h_sector.lower() or 'mf unit' in h_sector.lower():
                        underlying_mf_units.append({
                            'isin': holding.get('instrument_isin', ''),
                            'name': holding.get('instrument_name', ''),
                            'pct_in_fund': h_pct
                        })
                    else:
                        direct_holdings_pct += h_pct
                
                # Track this as an MF holding with underlying breakdown
                mf_holdings_list.append({
                    'isin': isin,
                    'scheme_name': scheme_name,
                    'pct_to_portfolio': scheme_pct_holdings,
                    'amfi_code': amfi_code,
                    'is_fof': is_fof,
                    'underlying_mf_units': underlying_mf_units,
                    'direct_holdings_pct': direct_holdings_pct
                })
                
                # Create sheet name (Excel limits to 31 chars, and certain chars not allowed)
                safe_name = scheme_name[:28] if len(scheme_name) > 28 else scheme_name
                safe_name = safe_name.replace('/', '-').replace('\\', '-').replace('*', '').replace('?', '')
                safe_name = safe_name.replace('[', '(').replace(']', ')').replace(':', '-')
                safe_name = safe_name.strip()
                
                # Ensure unique sheet names
                existing_names = [ws.title for ws in wb.worksheets]
                if safe_name in existing_names:
                    safe_name = f"{safe_name[:25]}_{sheets_created}"
                
                ws = wb.create_sheet(safe_name)
                
                # Track this main MF sheet for hyperlinks
                main_mf_sheets.append((isin, scheme_name, safe_name))
                
                # Write headers
                for col, header in enumerate(headers, 1):
                    cell = ws.cell(row=1, column=col, value=header)
                    cell.font = header_font
                    cell.fill = header_fill
                    cell.alignment = header_alignment
                
                # Write data rows
                row = 2
                for holding in holdings:
                    instrument_isin = holding.get('instrument_isin', '')
                    stock_name = holding.get('instrument_name', '')
                    sector = holding.get('sector', '') or 'Other'
                    market_cap = holding.get('market_cap_category', '') or 'Other'
                    # Replace "Other" market cap with "Debt"
                    if market_cap == 'Other':
                        market_cap = 'Debt'
                    pct_to_net_assets = holding.get('pct_to_net_assets', 0) or 0
                    # Fix: Data is stored as decimal (0.05 means 5%), convert to percentage
                    pct_to_net_assets = pct_to_net_assets * 100
                    
                    # Calculate % to Portfolio
                    # scheme_pct_holdings is already a percentage (e.g., 69.22 means 69.22%)
                    # pct_to_net_assets is now a percentage (e.g., 5 means 5%)
                    # Result: 69.22% * 5% = 3.461%
                    pct_to_portfolio = (pct_to_net_assets * scheme_pct_holdings) / 100
                    
                    # Check if this is a Mutual Fund Unit - look through to get underlying stocks
                    if sector and ('mutual fund' in sector.lower() or 'mf units' in sector.lower()):
                        # Try to look through this MF unit
                        underlying_stocks = get_underlying_stocks_for_mf_unit(
                            instrument_isin, stock_name, pct_to_portfolio
                        )
                        
                        if underlying_stocks:
                            # Add underlying stocks to consolidated list and summary
                            # These are INDIRECT holdings (via FOF look-through)
                            for u_stock in underlying_stocks:
                                u_sector = u_stock.get('sector', 'Other')
                                u_market_cap = u_stock.get('market_cap', 'Debt')
                                u_pct = u_stock.get('pct_to_portfolio', 0)
                                
                                # Normalize sector name
                                u_sector = normalize_sector(u_sector)
                                u_stock['sector'] = u_sector  # Update the stock dict too
                                
                                # Only add to consolidated if it's NOT an MF unit
                                if not ('mutual fund' in u_sector.lower() or 'mf units' in u_sector.lower()):
                                    sector_totals[u_sector] = sector_totals.get(u_sector, 0) + u_pct
                                    market_cap_totals[u_market_cap] = market_cap_totals.get(u_market_cap, 0) + u_pct
                                    # Track in indirect totals (via FOF)
                                    sector_totals_indirect[u_sector] = sector_totals_indirect.get(u_sector, 0) + u_pct
                                    # Add source_type to stock
                                    u_stock['source_type'] = 'Indirect'
                                    all_stocks.append(u_stock)
                            
                            # Look up the actual asset class for this MF unit from AMFI data
                            mf_unit_amfi = db.amfi_scheme_data.find_one({"isin": instrument_isin})
                            mf_asset_class = "Debt"  # Default
                            if mf_unit_amfi:
                                mf_category = mf_unit_amfi.get('scheme_category', '').lower()
                                if 'equity' in mf_category or 'elss' in mf_category:
                                    mf_asset_class = "Equity"
                                elif 'hybrid' in mf_category:
                                    mf_asset_class = "Hybrid"
                                elif 'debt' in mf_category or 'gilt' in mf_category or 'liquid' in mf_category or 'income' in mf_category:
                                    mf_asset_class = "Debt"
                                elif 'index' in mf_category or 'etf' in mf_category:
                                    mf_asset_class = "Index/ETF"
                                elif 'fof' in mf_category:
                                    mf_asset_class = "FoF"
                                else:
                                    mf_asset_class = "Other"
                            
                            # Still write the MF unit row to the individual scheme sheet
                            ws.cell(row=row, column=1, value=instrument_isin)
                            ws.cell(row=row, column=2, value=f"{stock_name} (Look-through applied)")
                            ws.cell(row=row, column=3, value=sector)
                            ws.cell(row=row, column=4, value=mf_asset_class)  # Use AMFI-derived asset class
                            cell = ws.cell(row=row, column=5, value=round(pct_to_net_assets, 2))
                            cell.number_format = '0.00"%"'
                            cell = ws.cell(row=row, column=6, value=round(pct_to_portfolio, 4))
                            cell.number_format = '0.0000"%"'
                            row += 1
                            
                            # Create a separate sheet for this underlying MF's breakdown
                            # Get the underlying fund's direct holdings for the sub-sheet
                            sub_fund_amfi = db.amfi_scheme_data.find_one({"isin": instrument_isin})
                            if sub_fund_amfi:
                                sub_fund_code = sub_fund_amfi.get('scheme_code')
                                sub_fund_name = sub_fund_amfi.get('scheme_name', stock_name)
                                
                                # Get holdings for this sub-fund
                                sub_holdings = list(db.stockwise_holdings.find(
                                    {"amfi_code": str(sub_fund_code)},
                                    {"_id": 0}
                                ).sort("pct_to_net_assets", -1))
                                
                                # If no holdings, try Regular Plan mapping
                                if not sub_holdings:
                                    reg_code = get_regular_plan_amfi_code(instrument_isin, sub_fund_name)
                                    if reg_code:
                                        sub_holdings = list(db.stockwise_holdings.find(
                                            {"amfi_code": reg_code},
                                            {"_id": 0}
                                        ).sort("pct_to_net_assets", -1))
                                
                                if sub_holdings:
                                    # Create sheet name - truncate to 31 chars (Excel limit)
                                    # Use format: "LT-{Sub Fund Short}"
                                    sub_short = sub_fund_name[:25].replace('/', '-').replace('\\', '-').replace('*', '').replace('?', '').replace('[', '').replace(']', '')
                                    sub_sheet_name = f"LT-{sub_short}"[:31]
                                    
                                    # Ensure unique sheet name
                                    base_name = sub_sheet_name
                                    counter = 1
                                    while sub_sheet_name in wb.sheetnames:
                                        sub_sheet_name = f"{base_name[:28]}_{counter}"
                                        counter += 1
                                    
                                    ws_sub = wb.create_sheet(sub_sheet_name)
                                    
                                    # Track this sub-MF sheet for hyperlinks
                                    sub_mf_sheets.append((instrument_isin, sub_fund_name, sub_sheet_name, isin))
                                    
                                    # Write sub-fund info header
                                    ws_sub.cell(row=1, column=1, value=f"Look-through: {sub_fund_name}")
                                    ws_sub.cell(row=1, column=1).font = Font(bold=True, size=12)
                                    ws_sub.merge_cells('A1:F1')
                                    
                                    ws_sub.cell(row=2, column=1, value=f"ISIN: {instrument_isin}")
                                    ws_sub.cell(row=2, column=3, value=f"Weight in Parent: {pct_to_net_assets:.2f}%")
                                    ws_sub.cell(row=2, column=5, value=f"Weight in Portfolio: {pct_to_portfolio:.4f}%")
                                    
                                    # Headers row
                                    sub_headers = ["ISIN", "Stock Name", "Sector", "Market Cap", "% in Fund", "% to Portfolio"]
                                    for col, header in enumerate(sub_headers, 1):
                                        cell = ws_sub.cell(row=4, column=col, value=header)
                                        cell.font = header_font
                                        cell.fill = header_fill
                                        cell.alignment = header_alignment
                                    
                                    # Write holdings
                                    sub_row = 5
                                    for h in sub_holdings:
                                        h_isin = h.get('instrument_isin', '')
                                        h_name = h.get('instrument_name', '')
                                        h_sector = normalize_sector(h.get('sector', '') or 'Other')
                                        h_mcap = h.get('market_cap_category', '') or 'Other'
                                        h_pct_fund = (h.get('pct_to_net_assets', 0) or 0) * 100
                                        h_pct_portfolio = (pct_to_portfolio * h_pct_fund) / 100
                                        
                                        ws_sub.cell(row=sub_row, column=1, value=h_isin)
                                        ws_sub.cell(row=sub_row, column=2, value=h_name)
                                        ws_sub.cell(row=sub_row, column=3, value=h_sector)
                                        ws_sub.cell(row=sub_row, column=4, value=h_mcap)
                                        cell = ws_sub.cell(row=sub_row, column=5, value=round(h_pct_fund, 2))
                                        cell.number_format = '0.00"%"'
                                        cell = ws_sub.cell(row=sub_row, column=6, value=round(h_pct_portfolio, 4))
                                        cell.number_format = '0.0000"%"'
                                        sub_row += 1
                                    
                                    # Auto-width columns
                                    ws_sub.column_dimensions['A'].width = 16
                                    ws_sub.column_dimensions['B'].width = 40
                                    ws_sub.column_dimensions['C'].width = 25
                                    ws_sub.column_dimensions['D'].width = 12
                                    ws_sub.column_dimensions['E'].width = 12
                                    ws_sub.column_dimensions['F'].width = 14
                            
                            continue
                        else:
                            # Couldn't look through - count in sector totals as MF Units
                            sector_totals["Mutual Fund Units (No Look-through)"] = sector_totals.get("Mutual Fund Units (No Look-through)", 0) + pct_to_portfolio
                            market_cap_totals["MF Units"] = market_cap_totals.get("MF Units", 0) + pct_to_portfolio
                            
                            # Look up the actual asset class for this MF unit from AMFI data
                            mf_unit_amfi = db.amfi_scheme_data.find_one({"isin": instrument_isin})
                            mf_asset_class = "Debt"  # Default
                            if mf_unit_amfi:
                                mf_category = mf_unit_amfi.get('scheme_category', '').lower()
                                if 'equity' in mf_category or 'elss' in mf_category:
                                    mf_asset_class = "Equity"
                                elif 'hybrid' in mf_category:
                                    mf_asset_class = "Hybrid"
                                elif 'debt' in mf_category or 'gilt' in mf_category or 'liquid' in mf_category or 'income' in mf_category:
                                    mf_asset_class = "Debt"
                                elif 'index' in mf_category or 'etf' in mf_category:
                                    mf_asset_class = "Index/ETF"
                                elif 'fof' in mf_category:
                                    mf_asset_class = "FoF"
                                else:
                                    mf_asset_class = "Other"
                            
                            # Write to sheet
                            ws.cell(row=row, column=1, value=instrument_isin)
                            ws.cell(row=row, column=2, value=f"{stock_name} (No look-through)")
                            ws.cell(row=row, column=3, value=sector)
                            ws.cell(row=row, column=4, value=mf_asset_class)  # Use AMFI-derived asset class
                            cell = ws.cell(row=row, column=5, value=round(pct_to_net_assets, 2))
                            cell.number_format = '0.00"%"'
                            cell = ws.cell(row=row, column=6, value=round(pct_to_portfolio, 4))
                            cell.number_format = '0.0000"%"'
                            row += 1
                            continue
                    
                    # Regular stock - write to sheet
                    # Column 1: ISIN
                    ws.cell(row=row, column=1, value=instrument_isin)
                    
                    # Column 2: Stock Name
                    ws.cell(row=row, column=2, value=stock_name)
                    
                    # Column 3: Sector
                    ws.cell(row=row, column=3, value=sector)
                    
                    # Column 4: Market Cap
                    ws.cell(row=row, column=4, value=market_cap)
                    
                    # Column 5: %
                    cell = ws.cell(row=row, column=5, value=round(pct_to_net_assets, 2))
                    cell.number_format = '0.00"%"'
                    
                    # Column 6: % to Portfolio
                    cell = ws.cell(row=row, column=6, value=round(pct_to_portfolio, 4))
                    cell.number_format = '0.0000"%"'
                    
                    # Determine source type: Direct (regular MF) or Indirect (FOF's direct holdings)
                    source_type = 'Indirect' if is_fof else 'Direct'
                    
                    # Normalize sector name
                    sector = normalize_sector(sector)
                    
                    # Track for summary
                    sector_totals[sector] = sector_totals.get(sector, 0) + pct_to_portfolio
                    market_cap_totals[market_cap] = market_cap_totals.get(market_cap, 0) + pct_to_portfolio
                    
                    # Track by source type (Direct vs Indirect)
                    if is_fof:
                        sector_totals_indirect[sector] = sector_totals_indirect.get(sector, 0) + pct_to_portfolio
                    else:
                        sector_totals_direct[sector] = sector_totals_direct.get(sector, 0) + pct_to_portfolio
                    
                    # Track for consolidated list
                    all_stocks.append({
                        'isin': instrument_isin,
                        'stock_name': stock_name,
                        'sector': sector,
                        'market_cap': market_cap,
                        'pct_to_portfolio': pct_to_portfolio,
                        'source_type': source_type
                    })
                    
                    row += 1
                
                # Auto-width columns
                ws.column_dimensions['A'].width = 16
                ws.column_dimensions['B'].width = 35
                ws.column_dimensions['C'].width = 20
                ws.column_dimensions['D'].width = 12
                ws.column_dimensions['E'].width = 10
                ws.column_dimensions['F'].width = 14
                
                sheets_created += 1
            
            client.close()
            
            if sheets_created == 0:
                return None
            
            # Create Summary tab (first tab)
            ws_summary = wb.create_sheet("Summary", 0)
            
            # Title styling
            title_font = Font(bold=True, size=14, color="1E3A5F")
            subtitle_font = Font(bold=True, size=11)
            
            row = 1
            
            # Section 1: MF ISINs Count
            ws_summary.cell(row=row, column=1, value="MF Schemes Coverage").font = title_font
            row += 1
            ws_summary.cell(row=row, column=1, value="Category")
            ws_summary.cell(row=row, column=2, value="Count")
            ws_summary.cell(row=row, column=1).font = header_font
            ws_summary.cell(row=row, column=2).font = header_font
            ws_summary.cell(row=row, column=1).fill = header_fill
            ws_summary.cell(row=row, column=2).fill = header_fill
            row += 1
            ws_summary.cell(row=row, column=1, value="Total MF ISINs")
            ws_summary.cell(row=row, column=2, value=len(scheme_isin_map))
            row += 1
            ws_summary.cell(row=row, column=1, value="Stockwise Data Fetched")
            ws_summary.cell(row=row, column=2, value=len(isins_fetched))
            row += 1
            ws_summary.cell(row=row, column=1, value="Not Fetched")
            ws_summary.cell(row=row, column=2, value=len(isins_not_fetched))
            row += 2
            
            # Section 2: Sector Wise Breakdown (with Direct vs Indirect)
            ws_summary.cell(row=row, column=1, value="Sector Wise Breakdown").font = title_font
            row += 1
            ws_summary.cell(row=row, column=1, value="Sector")
            ws_summary.cell(row=row, column=2, value="Direct %")
            ws_summary.cell(row=row, column=3, value="Indirect %")
            ws_summary.cell(row=row, column=4, value="Total %")
            for col in range(1, 5):
                ws_summary.cell(row=row, column=col).font = header_font
                ws_summary.cell(row=row, column=col).fill = header_fill
            row += 1
            
            # Sort sectors by total percentage descending
            sorted_sectors = sorted(sector_totals.items(), key=lambda x: x[1], reverse=True)
            for sector, total_pct in sorted_sectors:
                if total_pct > 0.01:  # Only show sectors with > 0.01%
                    direct_pct = sector_totals_direct.get(sector, 0)
                    indirect_pct = sector_totals_indirect.get(sector, 0)
                    
                    ws_summary.cell(row=row, column=1, value=sector)
                    
                    # Direct %
                    if direct_pct > 0:
                        cell = ws_summary.cell(row=row, column=2, value=round(direct_pct, 2))
                        cell.number_format = '0.00"%"'
                    else:
                        ws_summary.cell(row=row, column=2, value="-")
                    
                    # Indirect %
                    if indirect_pct > 0:
                        cell = ws_summary.cell(row=row, column=3, value=round(indirect_pct, 2))
                        cell.number_format = '0.00"%"'
                    else:
                        ws_summary.cell(row=row, column=3, value="-")
                    
                    # Total %
                    cell = ws_summary.cell(row=row, column=4, value=round(total_pct, 2))
                    cell.number_format = '0.00"%"'
                    row += 1
            
            # Add total row for sectors
            total_sector_pct = sum(sector_totals.values())
            total_direct_pct = sum(sector_totals_direct.values())
            total_indirect_pct = sum(sector_totals_indirect.values())
            
            ws_summary.cell(row=row, column=1, value="TOTAL").font = Font(bold=True)
            cell = ws_summary.cell(row=row, column=2, value=round(total_direct_pct, 2))
            cell.number_format = '0.00"%"'
            cell.font = Font(bold=True)
            cell = ws_summary.cell(row=row, column=3, value=round(total_indirect_pct, 2))
            cell.number_format = '0.00"%"'
            cell.font = Font(bold=True)
            cell = ws_summary.cell(row=row, column=4, value=round(total_sector_pct, 2))
            cell.number_format = '0.00"%"'
            cell.font = Font(bold=True)
            row += 2
            
            # Section 2b: Asset Class Breakdown (Equity vs Debt vs Hybrid vs Cash)
            # Derived from AMFI scheme_category for each holding
            ws_summary.cell(row=row, column=1, value="Asset Class Breakdown (from AMFI Fund Categories)").font = title_font
            row += 1
            ws_summary.cell(row=row, column=1, value="Asset Class")
            ws_summary.cell(row=row, column=2, value="Direct %")
            ws_summary.cell(row=row, column=3, value="Indirect %")
            ws_summary.cell(row=row, column=4, value="Total %")
            for col in range(1, 5):
                ws_summary.cell(row=row, column=col).font = header_font
                ws_summary.cell(row=row, column=col).fill = header_fill
            row += 1
            
            # Function to classify AMFI scheme_category into asset class
            def get_asset_class_from_category(scheme_category):
                """Classify AMFI scheme_category into Equity/Debt/Hybrid/Cash/Other"""
                if not scheme_category:
                    return 'Other'
                
                cat_lower = scheme_category.lower()
                
                # Equity categories
                if 'equity scheme' in cat_lower or 'elss' in cat_lower:
                    return 'Equity'
                
                # Debt categories
                if 'debt scheme' in cat_lower or 'gilt' in cat_lower or 'income' in cat_lower or 'liquid' in cat_lower:
                    return 'Debt'
                
                # Hybrid categories
                if 'hybrid scheme' in cat_lower:
                    return 'Hybrid'
                
                # Index/ETF - check if it's equity or debt based
                if 'index funds' in cat_lower or 'etf' in cat_lower:
                    return 'Index/ETF'
                
                # FoF - will be looked through
                if 'fof' in cat_lower:
                    return 'FoF'
                
                # Solution oriented
                if 'solution oriented' in cat_lower:
                    return 'Hybrid'
                
                # Growth (older classification, typically equity)
                if cat_lower == 'growth':
                    return 'Equity'
                
                return 'Other'
            
            # Calculate asset class totals by looking up each stock's parent scheme category
            # We need to track which scheme each stock came from
            asset_class_direct = {'Equity': 0, 'Debt': 0, 'Hybrid': 0, 'Index/ETF': 0, 'Cash': 0, 'Other': 0}
            asset_class_indirect = {'Equity': 0, 'Debt': 0, 'Hybrid': 0, 'Index/ETF': 0, 'Cash': 0, 'Other': 0}
            
            # Re-calculate from sector_totals using sector-to-asset-class mapping
            # Cash sectors
            cash_sector_keywords = ['cash', 'treps', 'repo', 'deposits', 'margins']
            # Debt sectors (when we can't determine from AMFI)
            debt_sector_keywords = ['govt-sec', 'finance', 'sovereign', 'bonds', 'debentures', 'fixed income']
            
            for sector, total_pct in sector_totals.items():
                direct_pct = sector_totals_direct.get(sector, 0)
                indirect_pct = sector_totals_indirect.get(sector, 0)
                
                sector_lower = sector.lower()
                
                # Classify based on sector name
                if any(kw in sector_lower for kw in cash_sector_keywords):
                    asset_class_direct['Cash'] += direct_pct
                    asset_class_indirect['Cash'] += indirect_pct
                elif any(kw in sector_lower for kw in debt_sector_keywords):
                    asset_class_direct['Debt'] += direct_pct
                    asset_class_indirect['Debt'] += indirect_pct
                elif 'mutual fund' in sector_lower or 'mf unit' in sector_lower or 'no look-through' in sector_lower:
                    asset_class_direct['Other'] += direct_pct
                    asset_class_indirect['Other'] += indirect_pct
                else:
                    # Default to Equity for all other sectors (Banks, IT, Pharma, etc.)
                    asset_class_direct['Equity'] += direct_pct
                    asset_class_indirect['Equity'] += indirect_pct
            
            # Write asset class rows
            asset_class_order = ['Equity', 'Debt', 'Hybrid', 'Index/ETF', 'Cash', 'Other']
            
            for asset_class in asset_class_order:
                direct = asset_class_direct.get(asset_class, 0)
                indirect = asset_class_indirect.get(asset_class, 0)
                total = direct + indirect
                
                if total > 0.001:  # Only show if > 0.001%
                    ws_summary.cell(row=row, column=1, value=asset_class)
                    
                    if direct > 0:
                        cell = ws_summary.cell(row=row, column=2, value=round(direct, 2))
                        cell.number_format = '0.00"%"'
                    else:
                        ws_summary.cell(row=row, column=2, value="-")
                    
                    if indirect > 0:
                        cell = ws_summary.cell(row=row, column=3, value=round(indirect, 2))
                        cell.number_format = '0.00"%"'
                    else:
                        ws_summary.cell(row=row, column=3, value="-")
                    
                    cell = ws_summary.cell(row=row, column=4, value=round(total, 2))
                    cell.number_format = '0.00"%"'
                    row += 1
            
            # Total row for asset classes
            total_direct_asset = sum(asset_class_direct.values())
            total_indirect_asset = sum(asset_class_indirect.values())
            total_all_asset = total_direct_asset + total_indirect_asset
            
            ws_summary.cell(row=row, column=1, value="TOTAL").font = Font(bold=True)
            cell = ws_summary.cell(row=row, column=2, value=round(total_direct_asset, 2))
            cell.number_format = '0.00"%"'
            cell.font = Font(bold=True)
            cell = ws_summary.cell(row=row, column=3, value=round(total_indirect_asset, 2))
            cell.number_format = '0.00"%"'
            cell.font = Font(bold=True)
            cell = ws_summary.cell(row=row, column=4, value=round(total_all_asset, 2))
            cell.number_format = '0.00"%"'
            cell.font = Font(bold=True)
            row += 2
            
            # Section 3: Market Cap Wise Breakdown (derived from Asset Class)
            # This shows the same data as Asset Class Breakdown but in a simplified format
            ws_summary.cell(row=row, column=1, value="Market Cap Wise Breakdown (from Asset Class)").font = title_font
            row += 1
            ws_summary.cell(row=row, column=1, value="Category")
            ws_summary.cell(row=row, column=2, value="% to Portfolio")
            ws_summary.cell(row=row, column=1).font = header_font
            ws_summary.cell(row=row, column=2).font = header_font
            ws_summary.cell(row=row, column=1).fill = header_fill
            ws_summary.cell(row=row, column=2).fill = header_fill
            row += 1
            
            # Use the asset class totals we already calculated
            market_cap_from_asset = {
                'Equity': asset_class_direct.get('Equity', 0) + asset_class_indirect.get('Equity', 0),
                'Debt': asset_class_direct.get('Debt', 0) + asset_class_indirect.get('Debt', 0),
                'Hybrid': asset_class_direct.get('Hybrid', 0) + asset_class_indirect.get('Hybrid', 0),
                'Index/ETF': asset_class_direct.get('Index/ETF', 0) + asset_class_indirect.get('Index/ETF', 0),
                'Cash & Equivalents': asset_class_direct.get('Cash', 0) + asset_class_indirect.get('Cash', 0),
                'Other/Unresolved': asset_class_direct.get('Other', 0) + asset_class_indirect.get('Other', 0),
            }
            
            # Write in order
            cap_order = ['Equity', 'Debt', 'Hybrid', 'Index/ETF', 'Cash & Equivalents', 'Other/Unresolved']
            for cap in cap_order:
                pct = market_cap_from_asset.get(cap, 0)
                if pct > 0.01:  # Only show if > 0.01%
                    ws_summary.cell(row=row, column=1, value=cap)
                    cell = ws_summary.cell(row=row, column=2, value=round(pct, 2))
                    cell.number_format = '0.00"%"'
                    row += 1
            
            # Add total row
            total_cap_pct = sum(market_cap_from_asset.values())
            ws_summary.cell(row=row, column=1, value="TOTAL").font = Font(bold=True)
            cell = ws_summary.cell(row=row, column=2, value=round(total_cap_pct, 2))
            cell.number_format = '0.00"%"'
            cell.font = Font(bold=True)
            row += 2
            
            # Section 4: Main MF Schemes with Stockwise Data (with hyperlinks)
            if main_mf_sheets:
                ws_summary.cell(row=row, column=1, value="Main MF Schemes (Direct Holdings)").font = title_font
                row += 1
                ws_summary.cell(row=row, column=1, value="ISIN")
                ws_summary.cell(row=row, column=2, value="Scheme Name")
                ws_summary.cell(row=row, column=3, value="Sheet Link")
                for col in range(1, 4):
                    ws_summary.cell(row=row, column=col).font = header_font
                    ws_summary.cell(row=row, column=col).fill = header_fill
                row += 1
                
                for isin, name, sheet_name in main_mf_sheets:
                    ws_summary.cell(row=row, column=1, value=isin)
                    ws_summary.cell(row=row, column=2, value=name[:50])
                    
                    # Create hyperlink to the sheet
                    link_cell = ws_summary.cell(row=row, column=3, value="Go to Sheet →")
                    link_cell.hyperlink = f"#'{sheet_name}'!A1"
                    link_cell.font = Font(color="0000FF", underline="single")
                    row += 1
                row += 1
            
            # Section 4b: Sub-MF Schemes (Look-through) with hyperlinks
            if sub_mf_sheets:
                ws_summary.cell(row=row, column=1, value="Sub-MF Schemes (Look-through from FOF)").font = title_font
                row += 1
                ws_summary.cell(row=row, column=1, value="ISIN")
                ws_summary.cell(row=row, column=2, value="Scheme Name")
                ws_summary.cell(row=row, column=3, value="Parent ISIN")
                ws_summary.cell(row=row, column=4, value="Sheet Link")
                for col in range(1, 5):
                    ws_summary.cell(row=row, column=col).font = header_font
                    ws_summary.cell(row=row, column=col).fill = header_fill
                row += 1
                
                for isin, name, sheet_name, parent_isin in sub_mf_sheets:
                    ws_summary.cell(row=row, column=1, value=isin)
                    ws_summary.cell(row=row, column=2, value=name[:45])
                    ws_summary.cell(row=row, column=3, value=parent_isin)
                    
                    # Create hyperlink to the sheet
                    link_cell = ws_summary.cell(row=row, column=4, value="Go to Sheet →")
                    link_cell.hyperlink = f"#'{sheet_name}'!A1"
                    link_cell.font = Font(color="0000FF", underline="single")
                    row += 1
                row += 1
            
            # Section 5: Schemes WITHOUT Stockwise Data
            if isins_not_fetched:
                ws_summary.cell(row=row, column=1, value="Schemes Without Stockwise Data").font = title_font
                row += 1
                ws_summary.cell(row=row, column=1, value="ISIN")
                ws_summary.cell(row=row, column=2, value="Scheme Name")
                ws_summary.cell(row=row, column=1).font = header_font
                ws_summary.cell(row=row, column=2).font = header_font
                ws_summary.cell(row=row, column=1).fill = header_fill
                ws_summary.cell(row=row, column=2).fill = header_fill
                row += 1
                for isin, name in isins_not_fetched:
                    ws_summary.cell(row=row, column=1, value=isin)
                    ws_summary.cell(row=row, column=2, value=name)
                    row += 1
            
            ws_summary.column_dimensions['A'].width = 35
            ws_summary.column_dimensions['B'].width = 15
            ws_summary.column_dimensions['C'].width = 15
            ws_summary.column_dimensions['D'].width = 15
            
            # Create Consolidated Stocklist tab (second tab)
            ws_consolidated = wb.create_sheet("Consolidated Stocklist", 1)
            
            # Write headers - now includes Direct %, Indirect %, and Total %
            consolidated_headers = ["ISIN", "Stock Name", "Sector", "Market Cap", "Direct %", "Indirect %", "Total %"]
            for col, header in enumerate(consolidated_headers, 1):
                cell = ws_consolidated.cell(row=1, column=col, value=header)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = header_alignment
            
            # Aggregate stocks by ISIN, tracking Direct vs Indirect separately
            stock_aggregated = {}  # key -> {direct_pct, indirect_pct, stock_name, sector, market_cap, isin}
            
            # Helper function to find common prefix/term in stock names
            def get_common_term(name1: str, name2: str) -> str:
                """Find the longest common prefix or significant common word"""
                # Normalize names
                n1 = name1.strip().upper()
                n2 = name2.strip().upper()
                
                # First check for common prefix (at least 3 chars)
                common_prefix = ""
                for c1, c2 in zip(n1, n2):
                    if c1 == c2:
                        common_prefix += c1
                    else:
                        break
                
                if len(common_prefix) >= 3:
                    # Clean up - stop at word boundary if possible
                    common_prefix = common_prefix.rstrip(' -/')
                    return common_prefix
                
                # Check for common words
                words1 = set(n1.replace('-', ' ').replace('/', ' ').split())
                words2 = set(n2.replace('-', ' ').replace('/', ' ').split())
                common_words = words1 & words2
                
                # Filter out very short common words
                significant_common = [w for w in common_words if len(w) >= 3]
                if significant_common:
                    return max(significant_common, key=len)  # Return longest common word
                
                return None
            
            # First pass: aggregate stocks by ISIN, tracking Direct vs Indirect
            no_isin_stocks = {}  # sector -> list of stocks
            for stock in all_stocks:
                source_type = stock.get('source_type', 'Direct')
                if stock['isin']:
                    # Has ISIN - use as key directly
                    key = stock['isin']
                    if key not in stock_aggregated:
                        stock_aggregated[key] = {
                            'isin': stock['isin'],
                            'stock_name': stock['stock_name'],
                            'sector': stock['sector'],
                            'market_cap': stock['market_cap'],
                            'direct_pct': 0,
                            'indirect_pct': 0
                        }
                    # Add to appropriate bucket
                    if source_type == 'Direct':
                        stock_aggregated[key]['direct_pct'] += stock['pct_to_portfolio']
                    else:
                        stock_aggregated[key]['indirect_pct'] += stock['pct_to_portfolio']
                else:
                    # No ISIN - collect for later processing
                    sector = stock['sector']
                    if sector not in no_isin_stocks:
                        no_isin_stocks[sector] = []
                    no_isin_stocks[sector].append(stock)
            
            # Second pass: process stocks without ISIN - group by common name patterns
            for sector, stocks in no_isin_stocks.items():
                # Group stocks by finding common terms in names
                grouped = {}  # common_term -> list of stocks
                processed = set()
                
                for i, stock1 in enumerate(stocks):
                    if i in processed:
                        continue
                    
                    # Find all stocks with common terms
                    group_key = stock1['stock_name'].strip().upper().split()[0] if stock1['stock_name'] else sector
                    group = [stock1]
                    processed.add(i)
                    
                    for j, stock2 in enumerate(stocks):
                        if j in processed or j <= i:
                            continue
                        
                        common = get_common_term(stock1['stock_name'], stock2['stock_name'])
                        if common and len(common) >= 3:
                            group.append(stock2)
                            processed.add(j)
                            group_key = common  # Use the common term as group key
                    
                    # Merge all stocks in the group
                    merged_key = f"NO_ISIN:{sector}:{group_key}"
                    if merged_key not in stock_aggregated:
                        # Use the shortest name in group or the common term
                        display_name = min([s['stock_name'] for s in group], key=len) if len(group) > 1 else group[0]['stock_name']
                        stock_aggregated[merged_key] = {
                            'isin': '',
                            'stock_name': display_name,
                            'sector': sector,
                            'market_cap': group[0]['market_cap'],
                            'direct_pct': 0,
                            'indirect_pct': 0
                        }
                    
                    for s in group:
                        source_type = s.get('source_type', 'Direct')
                        if source_type == 'Direct':
                            stock_aggregated[merged_key]['direct_pct'] += s['pct_to_portfolio']
                        else:
                            stock_aggregated[merged_key]['indirect_pct'] += s['pct_to_portfolio']
            
            # Calculate total_pct and sort by total descending
            for key in stock_aggregated:
                stock_aggregated[key]['total_pct'] = stock_aggregated[key]['direct_pct'] + stock_aggregated[key]['indirect_pct']
            
            sorted_stocks = sorted(stock_aggregated.values(), key=lambda x: x['total_pct'], reverse=True)
            
            # Write data with Direct, Indirect, and Total columns
            row = 2
            for stock in sorted_stocks:
                if stock['total_pct'] > 0.0001:  # Only show stocks with > 0.0001%
                    ws_consolidated.cell(row=row, column=1, value=stock['isin'])
                    ws_consolidated.cell(row=row, column=2, value=stock['stock_name'])
                    ws_consolidated.cell(row=row, column=3, value=stock['sector'])
                    ws_consolidated.cell(row=row, column=4, value=stock['market_cap'])
                    
                    # Direct %
                    if stock['direct_pct'] > 0:
                        cell = ws_consolidated.cell(row=row, column=5, value=round(stock['direct_pct'], 4))
                        cell.number_format = '0.0000"%"'
                    else:
                        ws_consolidated.cell(row=row, column=5, value="-")
                    
                    # Indirect %
                    if stock['indirect_pct'] > 0:
                        cell = ws_consolidated.cell(row=row, column=6, value=round(stock['indirect_pct'], 4))
                        cell.number_format = '0.0000"%"'
                    else:
                        ws_consolidated.cell(row=row, column=6, value="-")
                    
                    # Total %
                    cell = ws_consolidated.cell(row=row, column=7, value=round(stock['total_pct'], 4))
                    cell.number_format = '0.0000"%"'
                    row += 1
            
            ws_consolidated.column_dimensions['A'].width = 16
            ws_consolidated.column_dimensions['B'].width = 35
            ws_consolidated.column_dimensions['C'].width = 20
            ws_consolidated.column_dimensions['D'].width = 12
            ws_consolidated.column_dimensions['E'].width = 12
            ws_consolidated.column_dimensions['F'].width = 12
            ws_consolidated.column_dimensions['G'].width = 12
            
            # Create MF Holdings tab (third tab) - Direct MF investments from CAS with underlying breakdown
            ws_mf = wb.create_sheet("MF Holdings", 2)
            
            # Updated headers to show underlying MF breakdown
            mf_headers = ["ISIN", "Scheme Name", "Type", "% to Portfolio", "Underlying Breakdown"]
            for col, header in enumerate(mf_headers, 1):
                cell = ws_mf.cell(row=1, column=col, value=header)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = header_alignment
            
            # Sort MF holdings by % descending
            sorted_mf = sorted(mf_holdings_list, key=lambda x: x.get('pct_to_portfolio', 0), reverse=True)
            
            row = 2
            for mf in sorted_mf:
                isin = mf.get('isin', '')
                scheme_name = mf.get('scheme_name', '')
                pct_to_portfolio = mf.get('pct_to_portfolio', 0)
                is_fof = mf.get('is_fof', False)
                underlying_mf_units = mf.get('underlying_mf_units', [])
                direct_holdings_pct = mf.get('direct_holdings_pct', 0)
                
                # Determine fund type
                if is_fof:
                    fund_type = "FOF"
                elif underlying_mf_units:
                    fund_type = "Hybrid/Combo"
                else:
                    fund_type = "Direct"
                
                # Write main fund row
                ws_mf.cell(row=row, column=1, value=isin)
                ws_mf.cell(row=row, column=2, value=scheme_name)
                ws_mf.cell(row=row, column=3, value=fund_type)
                cell = ws_mf.cell(row=row, column=4, value=round(pct_to_portfolio, 4))
                cell.number_format = '0.0000"%"'
                
                # If FOF or has underlying MF units, show breakdown
                if underlying_mf_units:
                    ws_mf.cell(row=row, column=5, value=f"Contains {len(underlying_mf_units)} underlying MFs")
                    ws_mf.cell(row=row, column=1).font = Font(bold=True)
                    ws_mf.cell(row=row, column=2).font = Font(bold=True)
                    row += 1
                    
                    # Write underlying MF units
                    for u_mf in sorted(underlying_mf_units, key=lambda x: -x.get('pct_in_fund', 0)):
                        u_isin = u_mf.get('isin', '')
                        u_name = u_mf.get('name', '')
                        u_pct = u_mf.get('pct_in_fund', 0)
                        
                        # Indent the underlying MF
                        ws_mf.cell(row=row, column=1, value=u_isin)
                        ws_mf.cell(row=row, column=2, value=f"  └─ {u_name[:40]}")
                        ws_mf.cell(row=row, column=2).font = Font(color="666666")
                        ws_mf.cell(row=row, column=3, value="Sub-MF")
                        cell = ws_mf.cell(row=row, column=4, value=round(u_pct, 2))
                        cell.number_format = '0.00"%"'
                        ws_mf.cell(row=row, column=5, value="% of parent fund")
                        row += 1
                    
                    # If there are direct holdings (stocks/bonds), show that too
                    if direct_holdings_pct > 0.01:
                        ws_mf.cell(row=row, column=2, value=f"  └─ Direct Holdings (Stocks/Bonds/Cash)")
                        ws_mf.cell(row=row, column=2).font = Font(color="666666")
                        ws_mf.cell(row=row, column=3, value="Direct")
                        cell = ws_mf.cell(row=row, column=4, value=round(direct_holdings_pct, 2))
                        cell.number_format = '0.00"%"'
                        ws_mf.cell(row=row, column=5, value="% of parent fund")
                        row += 1
                    
                    # Add empty row for separation
                    row += 1
                else:
                    ws_mf.cell(row=row, column=5, value="100% Direct Holdings")
                    row += 1
            
            # Add total row
            total_pct = sum(mf.get('pct_to_portfolio', 0) for mf in sorted_mf)
            ws_mf.cell(row=row, column=1, value="TOTAL")
            ws_mf.cell(row=row, column=1).font = Font(bold=True)
            cell = ws_mf.cell(row=row, column=4, value=round(total_pct, 4))
            cell.number_format = '0.0000"%"'
            cell.font = Font(bold=True)
            
            ws_mf.column_dimensions['A'].width = 16
            ws_mf.column_dimensions['B'].width = 50
            ws_mf.column_dimensions['C'].width = 12
            ws_mf.column_dimensions['D'].width = 14
            ws_mf.column_dimensions['E'].width = 25
            
            # Remove the default empty sheet if it exists
            if "Sheet" in wb.sheetnames:
                del wb["Sheet"]
            
            # Save to bytes
            output = io.BytesIO()
            wb.save(output)
            output.seek(0)
            return output.getvalue()
            
        except Exception as e:
            logger.error(f"Error generating stocklist consolidated: {e}")
            return None

    def _generate_benchmark_comparison(self, pan_filter: str = None) -> bytes:
        """Generate Benchmark Comparison Excel - compares actual portfolio returns vs benchmark returns.
        
        For each investment in Active Units, calculates what the return would have been 
        if the same money was invested in the respective benchmark on the same date.
        
        Args:
            pan_filter: If provided, only include folios/transactions with this PAN
        
        Uses:
        - scheme_benchmark_mapping: Maps scheme_code to benchmark_code
        - benchmark_values: Historical benchmark values by date
        
        Columns:
        - ISIN, Scheme Name, Transaction Date, Investment Amount
        - Current Market Value, Actual Return, Actual XIRR
        - Benchmark Code, Benchmark Return, Benchmark XIRR
        - Alpha (Actual vs Benchmark)
        """
        import os
        from pymongo import MongoClient
        
        wb = Workbook()
        
        # Header styling
        header_fill = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF", size=11)
        header_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        
        # Conditional formatting colors
        positive_fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
        negative_fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
        
        try:
            # Connect to MongoDB
            from dotenv import load_dotenv
            load_dotenv('/app/backend/.env')
            
            mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
            db_name = os.environ.get('DB_NAME', 'bond_platform')
            client = MongoClient(mongo_url)
            db = client[db_name]
            
            # Load scheme to benchmark mappings (key is AMFI scheme_code)
            # Also build direct ISIN to benchmark mapping from isin_dividend/isin_reinvest fields
            scheme_bm_mappings = {}  # scheme_code -> benchmark info
            isin_bm_mappings = {}    # direct ISIN -> benchmark info
            
            # Helper function to derive readable name from benchmark code
            def derive_benchmark_name(bm_code: str) -> str:
                """Convert benchmark code to readable name if no name provided.
                Examples: NIFTY_FLEXI -> Nifty Flexi, AB124 -> AB124
                """
                if not bm_code:
                    return ''
                # Replace underscores with spaces and title case
                name = bm_code.replace('_', ' ')
                # Title case but preserve uppercase acronyms like NIFTY, SENSEX
                words = name.split()
                result = []
                for word in words:
                    if word.upper() in ['NIFTY', 'SENSEX', 'BSE', 'NSE', 'TRI', 'SBI', 'HDFC', 'ICICI']:
                        result.append(word.upper())
                    elif word.isupper() and len(word) <= 4:  # Short acronyms
                        result.append(word)
                    else:
                        result.append(word.title())
                return ' '.join(result)
            
            for mapping in db.scheme_benchmark_mapping.find({}, {"_id": 0}):
                scheme_code = mapping.get('scheme_code')
                bm_code = mapping.get('bm_code') or mapping.get('benchmark_code')
                bm_name = mapping.get('benchmark_name', '')
                isin_dividend = mapping.get('isin_dividend', '')
                isin_reinvest = mapping.get('isin_reinvest', '')
                direct_isin = mapping.get('isin', '')  # Direct ISIN field for files with ISIN in scheme_code
                
                # If no benchmark name provided, derive from code
                if not bm_name and bm_code:
                    bm_name = derive_benchmark_name(bm_code)
                
                if scheme_code and bm_code:
                    scheme_bm_mappings[str(scheme_code)] = {
                        'bm_code': bm_code,
                        'bm_name': bm_name
                    }
                
                # Direct ISIN to benchmark mapping (more reliable)
                if bm_code:
                    # Handle direct ISIN field (from files where ISIN is in scheme_code column)
                    if direct_isin:
                        isin_bm_mappings[direct_isin] = {
                            'bm_code': bm_code,
                            'bm_name': bm_name,
                            'scheme_code': scheme_code
                        }
                    if isin_dividend:
                        isin_bm_mappings[isin_dividend] = {
                            'bm_code': bm_code,
                            'bm_name': bm_name,
                            'scheme_code': scheme_code
                        }
                    if isin_reinvest:
                        isin_bm_mappings[isin_reinvest] = {
                            'bm_code': bm_code,
                            'bm_name': bm_name,
                            'scheme_code': scheme_code
                        }
            
            logger.info(f"Loaded {len(scheme_bm_mappings)} scheme->benchmark mappings, {len(isin_bm_mappings)} direct ISIN->benchmark mappings")
            
            # Build ISIN to AMFI code mapping - PRIMARY SOURCE: amfi_scheme_data
            # This collection has direct ISIN -> scheme_code mapping from AMFI
            isin_to_amfi = {}  # isin -> amfi_code
            
            # First, load from amfi_scheme_data (most reliable source)
            for record in db.amfi_scheme_data.find({}, {"_id": 0, "isin": 1, "scheme_code": 1}):
                isin = record.get('isin', '')
                scheme_code = record.get('scheme_code', '')
                if isin and scheme_code:
                    isin_to_amfi[isin] = str(scheme_code)
            
            # Also add from stockwise_holdings (may have scheme_isin -> amfi_code mappings)
            for holding in db.stockwise_holdings.find({}, {"_id": 0, "scheme_isin": 1, "amfi_code": 1, "amfi_code_direct": 1}):
                scheme_isin = holding.get('scheme_isin', '')
                amfi_code = holding.get('amfi_code', '')
                amfi_code_direct = holding.get('amfi_code_direct', '')
                
                if scheme_isin and scheme_isin not in isin_to_amfi:  # Don't override amfi_scheme_data
                    # Prefer amfi_code_direct if available, otherwise amfi_code
                    if amfi_code_direct and amfi_code_direct not in ['', '0', 'nan']:
                        isin_to_amfi[scheme_isin] = str(amfi_code_direct)
                    elif amfi_code and amfi_code not in ['', '0', 'nan']:
                        isin_to_amfi[scheme_isin] = str(amfi_code)
            
            logger.info(f"Loaded {len(scheme_bm_mappings)} benchmark mappings, {len(isin_to_amfi)} ISIN-AMFI mappings")
            
            # Load all benchmark values into memory for faster lookup
            # Index by BOTH benchmark_code AND alt_benchmark_code for flexible lookup
            benchmark_values = {}  # {bm_code: {date_str: value}}
            for bv in db.benchmark_values.find({}, {"_id": 0}):
                bm_code = bv.get('benchmark_code')
                alt_bm_code = bv.get('alt_benchmark_code')  # Alternative code (e.g., AB124 for OB124)
                date_str = bv.get('as_on_date')
                value = bv.get('benchmark_value')
                
                if date_str and value:
                    # Index by primary benchmark_code
                    if bm_code:
                        if bm_code not in benchmark_values:
                            benchmark_values[bm_code] = {}
                        benchmark_values[bm_code][date_str] = value
                    
                    # ALSO index by alt_benchmark_code so schemes using AB codes can find NAV data
                    if alt_bm_code and alt_bm_code != bm_code:
                        if alt_bm_code not in benchmark_values:
                            benchmark_values[alt_bm_code] = {}
                        benchmark_values[alt_bm_code][date_str] = value
            
            logger.info(f"Loaded benchmark values for {len(benchmark_values)} unique codes (including alt codes)")
            
            if not scheme_bm_mappings or not benchmark_values:
                logger.warning("No benchmark data available for comparison report")
                client.close()
                return None
            
            # Helper to normalize date formats for comparison
            def normalize_date(date_str):
                """Convert various date formats to YYYY-MM-DD for comparison"""
                if not date_str:
                    return None
                try:
                    # Already in YYYY-MM-DD format
                    if len(date_str) == 10 and date_str[4] == '-' and date_str[7] == '-':
                        return date_str
                    # DD-Mon-YY format (e.g., 31-Oct-25)
                    if '-' in date_str:
                        from datetime import datetime
                        for fmt in ['%d-%b-%y', '%d-%b-%Y', '%Y-%m-%d']:
                            try:
                                dt = datetime.strptime(date_str, fmt)
                                # Handle 2-digit year - assume 20xx for years < 50, 19xx otherwise
                                if dt.year < 100:
                                    dt = dt.replace(year=dt.year + 2000 if dt.year < 50 else dt.year + 1900)
                                return dt.strftime('%Y-%m-%d')
                            except:
                                continue
                    return date_str
                except:
                    return date_str
            
            # Use CAS report date as the "current" date for benchmark comparison
            # This is the date from the CAS statement (e.g., "01-Jan-2001 To 16-Jan-2026" -> 16-Jan-2026)
            # Handle both datetime objects and string dates
            cas_report_date = None
            cas_report_date_alt = None
            
            if self.report_date:
                if hasattr(self.report_date, 'strftime'):
                    # It's a datetime object
                    cas_report_date = self.report_date.strftime('%Y-%m-%d')
                    cas_report_date_alt = self.report_date.strftime('%d-%b-%Y')
                elif isinstance(self.report_date, str):
                    # It's a string - try to parse it
                    try:
                        if 'T' in self.report_date:  # ISO format with time
                            dt = datetime.fromisoformat(self.report_date.replace('Z', '+00:00'))
                        else:
                            for fmt in ['%Y-%m-%d', '%d-%b-%Y', '%Y-%m-%d %H:%M:%S']:
                                try:
                                    dt = datetime.strptime(self.report_date[:19], fmt)
                                    break
                                except:
                                    continue
                            else:
                                dt = None
                        if dt:
                            cas_report_date = dt.strftime('%Y-%m-%d')
                            cas_report_date_alt = dt.strftime('%d-%b-%Y')
                    except Exception as e:
                        logger.warning(f"Could not parse report_date '{self.report_date}': {e}")
            
            logger.info(f"CAS Report Date (for current NAV): {cas_report_date} / {cas_report_date_alt}")
            
            # Helper to get closest benchmark value to a date
            def get_benchmark_value(bm_code: str, target_date: str) -> float:
                if bm_code not in benchmark_values:
                    return None
                bm_dates = benchmark_values[bm_code]
                
                # Normalize target date to handle different formats
                def normalize_date(date_str):
                    """Convert various date formats to YYYY-MM-DD for comparison"""
                    if not date_str:
                        return None
                    try:
                        # Already in YYYY-MM-DD format
                        if len(date_str) == 10 and date_str[4] == '-' and date_str[7] == '-':
                            return date_str
                        # DD-Mon-YY format (e.g., 31-Oct-25)
                        if '-' in date_str and len(date_str) <= 11:
                            from datetime import datetime
                            try:
                                dt = datetime.strptime(date_str, '%d-%b-%y')
                                return dt.strftime('%Y-%m-%d')
                            except:
                                pass
                            try:
                                dt = datetime.strptime(date_str, '%d-%b-%Y')
                                return dt.strftime('%Y-%m-%d')
                            except:
                                pass
                        return date_str
                    except:
                        return date_str
                
                target_normalized = normalize_date(target_date)
                
                # Build normalized lookup dict
                normalized_bm_dates = {}
                for d, v in bm_dates.items():
                    norm_d = normalize_date(d)
                    if norm_d:
                        normalized_bm_dates[norm_d] = v
                
                # Try exact match first
                if target_normalized in normalized_bm_dates:
                    return normalized_bm_dates[target_normalized]
                
                # Find closest date before target
                sorted_dates = sorted(normalized_bm_dates.keys())
                closest = None
                for d in sorted_dates:
                    if d <= target_normalized:
                        closest = d
                    else:
                        break
                
                if closest:
                    return normalized_bm_dates[closest]
                
                # If no earlier date, use the earliest available
                if sorted_dates:
                    return normalized_bm_dates[sorted_dates[0]]
                
                return None
            
            # Create Summary tab
            ws_summary = wb.active
            ws_summary.title = "Summary"
            
            # Create Detail tab
            ws_detail = wb.create_sheet("Investment Details")
            
            # Detail tab headers - Added Scheme Code column and BM Balance Units
            headers = [
                "ISIN", "Scheme Code", "Scheme Name", "Benchmark Code", "Benchmark Name", "Transaction Date", 
                "Investment Amount", "Balance Units", "Current NAV", "Current Value",
                "Actual Return %", "Actual XIRR %",
                "BM NAV (Purchase)", "BM Balance Units", "BM NAV (Current)", "BM Equivalent Value", "Benchmark Return %", "Benchmark XIRR %",
                "Alpha %"
            ]
            
            for col, header in enumerate(headers, 1):
                cell = ws_detail.cell(row=1, column=col, value=header)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = header_alignment
            
            # Build folio lookup (filtered by PAN if provided)
            folio_lookup = {}
            allowed_folios = set()  # folio_numbers for this PAN
            allowed_isins = set()   # ISINs for this PAN
            
            for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
                # Apply PAN filter if provided
                if pan_filter and folio_data.get('pan') != pan_filter:
                    continue
                folio_lookup[folio_id] = folio_data
                if folio_data.get('folio_number'):
                    allowed_folios.add(folio_data.get('folio_number'))
                if folio_data.get('isin'):
                    allowed_isins.add(folio_data.get('isin'))
            
            if not folio_lookup:
                client.close()
                return None
            
            # ====== USE ACTIVE UNITS DATA DIRECTLY ======
            # This ensures consistency with Active Units sheet and avoids duplicate calculations
            active_units = self._get_active_units_data(pan_filter)
            
            if not active_units:
                client.close()
                return None
            
            # Parse date helper
            def parse_date(date_str):
                try:
                    return datetime.strptime(date_str, '%d-%b-%Y')
                except:
                    return datetime.min
            
            def date_to_str(dt):
                return dt.strftime('%Y-%m-%d')
            
            # Write data and collect summary stats
            row = 2
            total_invested = 0
            total_current_value = 0
            total_bm_current_value = 0
            scheme_summaries = {}  # {scheme_name: {invested, current, bm_current}}
            schemes_without_bm = set()
            
            for unit in active_units:
                isin = unit.get('isin', '')
                scheme_name = unit.get('scheme', '')
                trans_date = unit.get('purchase_date', '')
                trans_date_dt = parse_date(trans_date)
                remaining_units = unit.get('remaining_units', 0)
                proportional_cost = unit.get('cost_value', 0)  # Already calculated by Active Units
                current_nav = unit.get('current_nav', 0)
                current_value = unit.get('market_value', 0)  # Already calculated by Active Units
                
                # Skip invalid data
                if not current_nav or current_nav <= 1 or proportional_cost <= 0:
                    continue
                
                # Use values already calculated by Active Units
                # (proportional_cost = cost_value, current_value = market_value)
                
                # Calculate actual return
                actual_return_pct = unit.get('gain_loss_pct', 0)
                
                # Get actual XIRR from Active Units (already calculated)
                actual_xirr = unit.get('xirr')
                
                # Get benchmark data - try multiple methods to find the benchmark
                scheme_code = None
                bm_code = None
                bm_name = None
                
                # Method 1: Direct ISIN to benchmark mapping (most reliable - from isin_benchmark_link/scheme_benchmark_mapping)
                if isin and isin in isin_bm_mappings:
                    bm_info = isin_bm_mappings[isin]
                    bm_code = bm_info.get('bm_code')
                    bm_name = bm_info.get('bm_name', '')
                    scheme_code = bm_info.get('scheme_code')
                
                # Method 2: Try ISIN-to-AMFI mapping then scheme_code to benchmark
                if not bm_code and isin and isin in isin_to_amfi:
                    scheme_code = isin_to_amfi[isin]
                    bm_info = scheme_bm_mappings.get(str(scheme_code), {})
                    if bm_info:
                        bm_code = bm_info.get('bm_code')
                        bm_name = bm_info.get('bm_name', '')
                
                # Method 3: Try amfi_scheme_data directly if not found
                if not bm_code and isin:
                    amfi_record = db.amfi_scheme_data.find_one({"isin": isin})
                    if amfi_record:
                        scheme_code = str(amfi_record.get('scheme_code', ''))
                        if scheme_code:
                            bm_info = scheme_bm_mappings.get(scheme_code, {})
                            if bm_info:
                                bm_code = bm_info.get('bm_code')
                                bm_name = bm_info.get('bm_name', '')
                
                # Method 4: Try scheme_mapper if available
                if not bm_code and self.scheme_mapper:
                    mapper_scheme_code = self.scheme_mapper.get_scheme_code(isin, scheme_name)
                    if mapper_scheme_code:
                        scheme_code = str(mapper_scheme_code)
                        bm_info = scheme_bm_mappings.get(scheme_code, {})
                        if bm_info:
                            bm_code = bm_info.get('bm_code')
                            bm_name = bm_info.get('bm_name', '')
                
                # Method 5: Try scheme master's isin_index directly  
                if not bm_code and self.scheme_mapper and hasattr(self.scheme_mapper, 'isin_index'):
                    scheme_data = self.scheme_mapper.isin_index.get(isin, {})
                    if scheme_data:
                        # Try scheme_code or unique_no
                        for code_field in ['scheme_code', 'unique_no', 'amfi_code']:
                            code = scheme_data.get(code_field)
                            if code:
                                scheme_code = str(code)
                                bm_info = scheme_bm_mappings.get(scheme_code, {})
                                if bm_info:
                                    bm_code = bm_info.get('bm_code')
                                    bm_name = bm_info.get('bm_name', '')
                                    break
                
                bm_value_purchase = None
                bm_value_current = None
                bm_return_pct = None
                bm_xirr = None
                bm_equivalent_value = None
                alpha = None
                
                if bm_code:
                    # Convert transaction date to YYYY-MM-DD format
                    trans_date_iso = date_to_str(trans_date_dt) if trans_date_dt != datetime.min else None
                    
                    if trans_date_iso:
                        bm_value_purchase = get_benchmark_value(bm_code, trans_date_iso)
                        # Use CAS report date for "current" benchmark value (not latest DB date)
                        bm_value_current = get_benchmark_value(bm_code, cas_report_date) or get_benchmark_value(bm_code, cas_report_date_alt)
                        
                        if bm_value_purchase and bm_value_current and bm_value_purchase > 0:
                            # Calculate benchmark return
                            bm_return_pct = ((bm_value_current - bm_value_purchase) / bm_value_purchase * 100)
                            
                            # Calculate what value would be if invested in benchmark
                            bm_equivalent_value = proportional_cost * (bm_value_current / bm_value_purchase)
                            
                            # Calculate benchmark XIRR
                            try:
                                bm_cashflows = [
                                    (trans_date_dt, -proportional_cost),
                                    (self.report_date, bm_equivalent_value)
                                ]
                                bm_xirr = calculate_xirr(bm_cashflows) * 100
                                if bm_xirr < -100 or bm_xirr > 1000:
                                    bm_xirr = None
                            except:
                                pass
                            
                            # Calculate alpha (fund performance vs benchmark)
                            if actual_xirr is not None and bm_xirr is not None:
                                alpha = actual_xirr - bm_xirr
                else:
                    schemes_without_bm.add(scheme_name)
                
                # Write row - Updated column positions after adding Scheme Code
                ws_detail.cell(row=row, column=1, value=isin)
                ws_detail.cell(row=row, column=2, value=scheme_code or "N/A")  # New Scheme Code column
                ws_detail.cell(row=row, column=3, value=scheme_name)
                ws_detail.cell(row=row, column=4, value=bm_code or "N/A")
                ws_detail.cell(row=row, column=5, value=bm_name or "N/A")
                ws_detail.cell(row=row, column=6, value=trans_date)
                ws_detail.cell(row=row, column=7, value=round(proportional_cost, 2))
                ws_detail.cell(row=row, column=8, value=round(remaining_units, 3))
                ws_detail.cell(row=row, column=9, value=round(current_nav, 4))
                ws_detail.cell(row=row, column=10, value=round(current_value, 2))
                
                cell = ws_detail.cell(row=row, column=11, value=round(actual_return_pct, 2) if actual_return_pct else None)
                if actual_return_pct:
                    cell.number_format = '0.00"%"'
                
                cell = ws_detail.cell(row=row, column=12, value=round(actual_xirr, 2) if actual_xirr else None)
                if actual_xirr:
                    cell.number_format = '0.00"%"'
                
                # Benchmark NAV values
                ws_detail.cell(row=row, column=13, value=round(bm_value_purchase, 4) if bm_value_purchase else None)
                
                # BM Balance Units = Investment Amount / BM NAV (Purchase)
                bm_balance_units = None
                if bm_value_purchase and bm_value_purchase > 0:
                    bm_balance_units = proportional_cost / bm_value_purchase
                ws_detail.cell(row=row, column=14, value=round(bm_balance_units, 4) if bm_balance_units else None)
                
                ws_detail.cell(row=row, column=15, value=round(bm_value_current, 4) if bm_value_current else None)
                
                # BM Equivalent Value (what investment would be worth if invested in benchmark)
                ws_detail.cell(row=row, column=16, value=round(bm_equivalent_value, 2) if bm_equivalent_value else None)
                
                cell = ws_detail.cell(row=row, column=17, value=round(bm_return_pct, 2) if bm_return_pct else None)
                if bm_return_pct:
                    cell.number_format = '0.00"%"'
                
                cell = ws_detail.cell(row=row, column=18, value=round(bm_xirr, 2) if bm_xirr else None)
                if bm_xirr:
                    cell.number_format = '0.00"%"'
                
                cell = ws_detail.cell(row=row, column=19, value=round(alpha, 2) if alpha else None)
                if alpha is not None:
                    cell.number_format = '0.00"%"'
                    if alpha > 0:
                        cell.fill = positive_fill
                    elif alpha < 0:
                        cell.fill = negative_fill
                
                # Accumulate for summary
                total_invested += proportional_cost
                total_current_value += current_value
                
                # Track ALL schemes in scheme_summaries (with or without benchmark)
                if scheme_name not in scheme_summaries:
                    scheme_summaries[scheme_name] = {
                        'invested': 0, 
                        'current': 0, 
                        'bm_current': 0, 
                        'bm_code': bm_code,
                        'bm_name': bm_name or bm_code,  # Use benchmark name, fallback to code
                        'has_benchmark': False
                    }
                
                scheme_summaries[scheme_name]['invested'] += proportional_cost
                scheme_summaries[scheme_name]['current'] += current_value
                
                if bm_value_purchase and bm_value_current:
                    bm_eq_val = proportional_cost * (bm_value_current / bm_value_purchase)
                    total_bm_current_value += bm_eq_val
                    scheme_summaries[scheme_name]['bm_current'] += bm_eq_val
                    scheme_summaries[scheme_name]['has_benchmark'] = True
                
                row += 1
            
            # Set column widths for detail sheet
            ws_detail.column_dimensions['A'].width = 16
            ws_detail.column_dimensions['B'].width = 40
            ws_detail.column_dimensions['C'].width = 14
            ws_detail.column_dimensions['D'].width = 14
            ws_detail.column_dimensions['E'].width = 16
            ws_detail.column_dimensions['F'].width = 14
            ws_detail.column_dimensions['G'].width = 12
            ws_detail.column_dimensions['H'].width = 16
            ws_detail.column_dimensions['I'].width = 14
            ws_detail.column_dimensions['J'].width = 14
            ws_detail.column_dimensions['K'].width = 16
            ws_detail.column_dimensions['L'].width = 16
            ws_detail.column_dimensions['M'].width = 16
            ws_detail.column_dimensions['N'].width = 16
            ws_detail.column_dimensions['O'].width = 12
            
            # Build Summary tab
            title_font = Font(bold=True, size=14, color="1E3A5F")
            subtitle_font = Font(bold=True, size=11)
            
            row = 1
            ws_summary.cell(row=row, column=1, value="Portfolio vs Benchmark Comparison").font = title_font
            row += 2
            
            # Overall summary
            ws_summary.cell(row=row, column=1, value="Overall Summary").font = subtitle_font
            row += 1
            
            summary_headers = ["Metric", "Value"]
            for col, h in enumerate(summary_headers, 1):
                cell = ws_summary.cell(row=row, column=col, value=h)
                cell.font = header_font
                cell.fill = header_fill
            row += 1
            
            ws_summary.cell(row=row, column=1, value="Total Investment")
            ws_summary.cell(row=row, column=2, value=round(total_invested, 2))
            row += 1
            
            ws_summary.cell(row=row, column=1, value="Current Portfolio Value")
            ws_summary.cell(row=row, column=2, value=round(total_current_value, 2))
            row += 1
            
            # Check if ALL schemes have benchmark data
            all_schemes_have_bm = len(schemes_without_bm) == 0 and all(
                data.get('has_benchmark', False) for data in scheme_summaries.values()
            )
            
            ws_summary.cell(row=row, column=1, value="Equivalent Benchmark Value")
            if all_schemes_have_bm and total_bm_current_value > 0:
                ws_summary.cell(row=row, column=2, value=round(total_bm_current_value, 2))
            else:
                ws_summary.cell(row=row, column=2, value="N/A (Incomplete benchmark data)")
            row += 1
            
            if total_invested > 0:
                actual_total_return = ((total_current_value - total_invested) / total_invested) * 100
                ws_summary.cell(row=row, column=1, value="Actual Portfolio Return %")
                cell = ws_summary.cell(row=row, column=2, value=round(actual_total_return, 2))
                cell.number_format = '0.00"%"'
                row += 1
                
                # Only show overall benchmark return if ALL schemes have benchmark data
                if all_schemes_have_bm and total_bm_current_value > 0:
                    bm_total_return = ((total_bm_current_value - total_invested) / total_invested) * 100
                    ws_summary.cell(row=row, column=1, value="Benchmark Return %")
                    cell = ws_summary.cell(row=row, column=2, value=round(bm_total_return, 2))
                    cell.number_format = '0.00"%"'
                    row += 1
                    
                    total_alpha = actual_total_return - bm_total_return
                    ws_summary.cell(row=row, column=1, value="Overall Alpha %")
                    cell = ws_summary.cell(row=row, column=2, value=round(total_alpha, 2))
                    cell.number_format = '0.00"%"'
                    if total_alpha > 0:
                        cell.fill = positive_fill
                    elif total_alpha < 0:
                        cell.fill = negative_fill
                    row += 1
                else:
                    ws_summary.cell(row=row, column=1, value="Benchmark Return %")
                    ws_summary.cell(row=row, column=2, value="N/A (Not all schemes have benchmark)")
                    row += 1
                    ws_summary.cell(row=row, column=1, value="Overall Alpha %")
                    ws_summary.cell(row=row, column=2, value="N/A")
                    row += 1
            
            row += 2
            
            # Scheme-wise summary
            if scheme_summaries:
                ws_summary.cell(row=row, column=1, value="Scheme-wise Comparison").font = subtitle_font
                row += 1
                
                scheme_headers = ["Scheme Name", "Benchmark", "Invested", "Current Value", "BM Equiv Value", "Actual Return %", "BM Return %", "Alpha %"]
                for col, h in enumerate(scheme_headers, 1):
                    cell = ws_summary.cell(row=row, column=col, value=h)
                    cell.font = header_font
                    cell.fill = header_fill
                row += 1
                
                for scheme_name, data in sorted(scheme_summaries.items(), key=lambda x: x[1]['invested'], reverse=True):
                    ws_summary.cell(row=row, column=1, value=scheme_name)
                    ws_summary.cell(row=row, column=2, value=data.get('bm_name') or data.get('bm_code') or "N/A")
                    ws_summary.cell(row=row, column=3, value=round(data['invested'], 2))
                    ws_summary.cell(row=row, column=4, value=round(data['current'], 2))
                    
                    if data['invested'] > 0:
                        act_ret = ((data['current'] - data['invested']) / data['invested']) * 100
                        
                        cell = ws_summary.cell(row=row, column=6, value=round(act_ret, 2))
                        cell.number_format = '0.00"%"'
                        
                        # Only show benchmark columns if scheme has benchmark data
                        if data.get('has_benchmark') and data['bm_current'] > 0:
                            ws_summary.cell(row=row, column=5, value=round(data['bm_current'], 2))
                            
                            bm_ret = ((data['bm_current'] - data['invested']) / data['invested']) * 100
                            sch_alpha = act_ret - bm_ret
                            
                            cell = ws_summary.cell(row=row, column=7, value=round(bm_ret, 2))
                            cell.number_format = '0.00"%"'
                            
                            cell = ws_summary.cell(row=row, column=8, value=round(sch_alpha, 2))
                            cell.number_format = '0.00"%"'
                            if sch_alpha > 0:
                                cell.fill = positive_fill
                            elif sch_alpha < 0:
                                cell.fill = negative_fill
                        else:
                            # Leave benchmark columns blank for schemes without benchmark
                            ws_summary.cell(row=row, column=5, value="")  # BM Equiv Value
                            ws_summary.cell(row=row, column=7, value="")  # BM Return %
                            ws_summary.cell(row=row, column=8, value="")  # Alpha %
                    
                    row += 1
            
            row += 2
            
            # Schemes without benchmark mapping
            if schemes_without_bm:
                ws_summary.cell(row=row, column=1, value="Schemes Without Benchmark Mapping").font = subtitle_font
                row += 1
                for scheme in sorted(schemes_without_bm):
                    ws_summary.cell(row=row, column=1, value=scheme)
                    row += 1
            
            ws_summary.column_dimensions['A'].width = 45
            ws_summary.column_dimensions['B'].width = 20
            ws_summary.column_dimensions['C'].width = 16
            ws_summary.column_dimensions['D'].width = 16
            ws_summary.column_dimensions['E'].width = 18
            ws_summary.column_dimensions['F'].width = 16
            ws_summary.column_dimensions['G'].width = 14
            ws_summary.column_dimensions['H'].width = 12
            
            client.close()
            
            # Save to bytes
            output = io.BytesIO()
            wb.save(output)
            output.seek(0)
            return output.getvalue()
            
        except Exception as e:
            logger.error(f"Error generating benchmark comparison: {e}")
            import traceback
            traceback.print_exc()
            return None

    
    def _create_portfolio_performance_sheet(self, wb: Workbook):
        """Sheet 2: Portfolio Performance - Matching CAMS Gap Sheet format"""
        ws = wb.create_sheet("Portfolio Performance")
        
        # Column order matching CAMS Gap Sheet format (25 columns - added STT):
        headers = [
            "Group Name", "PAN", "Asset Class", "Advisor", "Folio No.", "Instrument Name",
            "Instrument Type", "From Date", "To Date", "Amount Invested", "Cash Withdrawal",
            "Dividend Paid", "Valuation", "Absolute Gains", "Absolute Return %", "CAGR %",
            "3 Yr %", "Inception Date", "Cost Value", "Cost price", "Closing Units",
            "Realized GL", "Unrealized GL", "STT", "Remarks"
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
            
            invested = sum((t.get('amount') or 0) for t in valid_trans if not t.get('is_redemption', False))
            withdrawn = sum((t.get('amount') or 0) for t in valid_trans if t.get('is_redemption', False))
            
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
            realized_gl = withdrawn - sum((t.get('amount') or 0) for t in valid_trans 
                                          if t.get('is_redemption', False)) if withdrawn > 0 else 0
            unrealized_gl = gains if closing_balance > 0 else 0
            
            # Calculate STT (sum of all STT transactions for this folio)
            stt_amount = sum(t.get('amount', 0) for t in transactions 
                            if t.get('transaction_type') in ['STT Paid', 'STT'])
            
            # Get scheme name for advisor lookup
            scheme_name = folio_data.get('scheme', '')
            
            # Get advisor name from ARN (pass scheme name to determine DIRECT)
            advisor_name = self._get_advisor_name(advisor_arn, scheme_name)
            
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
                'stt': stt_amount,
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
            
            # Column 24: STT
            cell = ws.cell(row=row, column=24, value=round(entry['stt'], 2))
            cell.number_format = '#,##0.00'
            
            # Column 25: Remarks
            ws.cell(row=row, column=25, value=entry['remarks'])
            
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
                    key = (pan, folio_num, scheme_name, fy, fund_type)
                    
                    if key not in tax_data:
                        tax_data[key] = {
                            'pan': pan,
                            'folio': folio_num,
                            'scheme': scheme_name,
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
            'folios': [],
            'sample_scheme': ''  # Store a sample scheme name for DIRECT detection
        })
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            arn = folio_data.get('advisor', '') or 'NO_ARN'
            transactions = folio_data.get('transactions', [])
            closing_balance = folio_data.get('closing_balance', 0)
            market_value = folio_data.get('market_value', 0)
            
            # Store sample scheme name for this advisor
            if not advisor_data[arn]['sample_scheme']:
                advisor_data[arn]['sample_scheme'] = folio_data.get('scheme', '')
            
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
            
            # Use folio's cost_value for accurate invested amount
            # This properly reflects actual money at risk, accounting for:
            # - Internal switches between funds
            # - Partial redemptions
            # - Dividend reinvestments
            cost_value = folio_data.get('cost_value', 0) or 0
            
            # Track withdrawals from transactions (redemptions + switch-outs)
            withdrawn = 0
            for t in valid_trans:
                if t.get('is_redemption'):
                    withdrawn += t.get('amount', 0) or 0
            
            advisor_data[arn]['invested'] += cost_value
            advisor_data[arn]['withdrawn'] += withdrawn
            advisor_data[arn]['valuation'] += market_value
            
            # Track active vs closed folios
            if closing_balance > 0 and market_value > 0:
                advisor_data[arn]['active_folios'] += 1
            else:
                advisor_data[arn]['closed_folios'] += 1
            
            # Track transaction dates and build cashflows for XIRR
            # Only include transactions from ACTIVE folios for consistent XIRR calculation
            for trans in valid_trans:
                try:
                    trans_date = datetime.strptime(trans['date'], '%d-%b-%Y')
                    amount = trans.get('amount') or 0  # Handle None for segregated portfolios
                    
                    # Track first/last dates (for all folios)
                    if advisor_data[arn]['first_date'] is None or trans_date < advisor_data[arn]['first_date']:
                        advisor_data[arn]['first_date'] = trans_date
                    if advisor_data[arn]['last_date'] is None or trans_date > advisor_data[arn]['last_date']:
                        advisor_data[arn]['last_date'] = trans_date
                    
                    # Track last active date (for active folios only)
                    if closing_balance > 0:
                        if advisor_data[arn]['last_active_date'] is None or trans_date > advisor_data[arn]['last_active_date']:
                            advisor_data[arn]['last_active_date'] = trans_date
                    
                    # Only include cashflows from ACTIVE folios for XIRR
                    if closing_balance > 0:
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
            if closing_balance > 0 and market_value > 0:
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
            # Get a sample scheme name for this advisor to determine if DIRECT
            sample_scheme = data.get('sample_scheme', '')
            ws.cell(row=row, column=2, value=self._get_advisor_name(arn, sample_scheme))
            
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
            invested = sum((t.get('amount') or 0) for t in transactions if not t.get('is_redemption', False))
            withdrawn = sum((t.get('amount') or 0) for t in transactions if t.get('is_redemption', False))
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
            ws.cell(row=row, column=5, value=scheme_name)
            ws.cell(row=row, column=6, value=trans.get('transaction_type', ''))
            ws.cell(row=row, column=7, value=trans.get('nav') or 0)  # Handle None
            ws.cell(row=row, column=8, value=trans.get('units') or 0)  # Handle None
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
            invested = sum((t.get('amount') or 0) for t in transactions if not t.get('is_redemption', False))
            
            ws.cell(row=row, column=1, value=investor_name)
            ws.cell(row=row, column=2, value=folio_data.get('amc', ''))
            ws.cell(row=row, column=4, value="Folio Number")
            ws.cell(row=row, column=5, value=folio_data.get('folio', folio_id))
            ws.cell(row=row, column=8, value=folio_data.get('isin', ''))
            ws.cell(row=row, column=9, value=folio_data.get('scheme', ''))
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
        """Sheet 3: Active Units - shows remaining/held units with FIFO calculation"""
        ws = wb.create_sheet("Active Units")
        
        # Headers matching the template image + MF Ageing + Grandfathering + PAN
        # ISIN first for scheme master lookup
        # Grandfathering applies to equity funds purchased before 31-Jan-2018
        # Note: STT column removed as per user request
        headers = [
            "ISIN", "Scheme Name", "Account Identifier", "PAN", "Transaction Date",
            "Transaction Details", "Opening Units", "Units (Debit)", "Units (Credit)",
            "Closing Units", "Price", "Transaction Amount", "Stamp Duty",
            "Total Amount", "Balance Units", "Cost Value", 
            "Grandfathered NAV (31-Jan-2018)", "Grandfathered Purchase Value",
            "Current NAV", "Current Market Value",
            "MF Ageing", "XIRR", "Advisor ARN", "Advisor Name"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        # Build Stamp Duty lookup: key = (date, folio, isin) -> Stamp Duty amount
        stamp_lookup = {}
        for trans in self.parsed_data.get('transactions', []):
            if trans.get('transaction_type') == 'Stamp Duty':
                key = (trans.get('date'), trans.get('folio'), trans.get('isin'))
                stamp_lookup[key] = stamp_lookup.get(key, 0) + (trans.get('amount') or 0)
        
        # Build folio data lookup for current NAV and market value
        folio_lookup = {}
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            folio_lookup[folio_id] = folio_data
        
        # Filter transactions (excluding NFT, Pledge, STT, Stamp Duty, and Rejections)
        # Also identify rejection pairs (purchase + rejection on same day = rejected transaction)
        all_trans = []
        for trans in self.parsed_data.get('transactions', []):
            if trans.get('is_nft') or trans.get('is_pledge'):
                continue
            if trans.get('transaction_type') in ['STT Paid', 'Stamp Duty']:
                continue
            all_trans.append(trans)
        
        # Find rejection transactions and their matching original purchases
        rejections = {}  # key = (date, folio, isin, abs(amount)) -> count
        for trans in all_trans:
            ttype = trans.get('transaction_type', '')
            if 'Rejection' in ttype or 'Reversal' in ttype:
                date = trans.get('date', '')
                folio = trans.get('folio', '')
                isin = trans.get('isin', '')
                amount = abs(trans.get('amount', 0) or 0)
                key = (date, folio, isin, round(amount, 2))
                rejections[key] = rejections.get(key, 0) + 1
        
        # Filter out rejections and their matching original purchases
        filtered_trans = []
        used_rejections = {}  # Track how many we've matched
        
        for trans in all_trans:
            ttype = trans.get('transaction_type', '')
            
            # Skip rejection entries themselves
            if 'Rejection' in ttype or 'Reversal' in ttype:
                continue
            
            # Check if this is a purchase that has a matching rejection
            date = trans.get('date', '')
            folio = trans.get('folio', '')
            isin = trans.get('isin', '')
            amount = abs(trans.get('amount', 0) or 0)
            key = (date, folio, isin, round(amount, 2))
            
            if key in rejections:
                # There's a rejection for this transaction
                matched = used_rejections.get(key, 0)
                if matched < rejections[key]:
                    # Skip this purchase as it was rejected
                    used_rejections[key] = matched + 1
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
            # Get folio data to check closing balance
            folio_data = folio_lookup.get(folio_key, {})
            closing_balance = folio_data.get('closing_balance', 0) or 0
            
            # Skip folios with no remaining balance (fully redeemed)
            # This handles cases where redemption transactions may not be properly parsed
            if closing_balance <= 0:
                continue
            
            # Sort transactions by date
            sorted_trans = sorted(transactions, key=lambda x: parse_date(x.get('date', '')))
            
            # Track purchases with their remaining units
            purchases = []  # List of {'index': original_index, 'units': remaining_units, 'date': date}
            
            for idx, trans in enumerate(sorted_trans):
                trans_units = trans.get('units') or 0  # Handle None
                
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
            # First, calculate total remaining from FIFO
            total_remaining = sum(p['units'] for p in purchases if p['units'] > 0)
            
            # If calculated remaining exceeds closing balance, scale down proportionally
            scale_factor = 1.0
            if total_remaining > closing_balance and closing_balance > 0:
                scale_factor = closing_balance / total_remaining
            
            for purchase in purchases:
                if purchase['units'] <= 0:
                    continue
                    
                scaled_units = purchase['units'] * scale_factor
                
                # Find the original transaction index in filtered_trans
                for i, trans in enumerate(filtered_trans):
                    t_folio = trans.get('folio', '')
                    t_isin = trans.get('isin', '')
                    t_key = f"{t_folio}_{t_isin}" if t_isin else t_folio
                    if t_key == folio_key and trans.get('date') == purchase['date'] and trans.get('units') == purchase['original_units'] and not trans.get('is_redemption'):
                        purchase_remaining_units[(folio_key, i)] = scaled_units
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
            
            # Skip IDCW (dividend) transactions - they appear in the IDCW Payouts tab
            if trans.get('is_idcw'):
                continue
            
            # Skip purchase transactions with zero balance units (fully sold)
            if remaining_units <= 0:
                trans_units = trans.get('units') or 0  # Handle None
                if trans_units > 0:
                    # This was a purchase but has 0 remaining - skip it
                    continue
            
            # Get scheme name from scheme master using ISIN
            scheme_name = self._get_scheme_name_from_master(isin, trans.get('scheme', ''))
            
            # Get advisor from transaction first, then fallback to folio data
            advisor_arn = trans.get('advisor', '') or ''
            if advisor_arn in ('None', 'null', ''):
                advisor_arn = folio_data.get('advisor', '') or ''
            if advisor_arn in ('None', 'null', ''):
                advisor_arn = ''
            
            # Column 1: ISIN (first for scheme master lookup)
            ws.cell(row=row, column=1, value=isin)
            # Column 2: Scheme Name (from scheme master)
            ws.cell(row=row, column=2, value=scheme_name if scheme_name else '')
            # Column 3: Account Identifier (Folio)
            ws.cell(row=row, column=3, value=folio)
            # Column 4: PAN
            ws.cell(row=row, column=4, value=folio_data.get('pan', ''))
            # Column 5: Transaction Date
            ws.cell(row=row, column=5, value=trans.get('date', ''))
            # Column 6: Transaction Details
            ws.cell(row=row, column=6, value=trans.get('transaction_type', ''))
            # Column 7: Opening Units (leave blank as per template)
            # Column 8: Units (Debit) - for redemptions
            if trans.get('is_redemption'):
                ws.cell(row=row, column=8, value=trans.get('units') or 0)  # Handle None
            # Column 9: Units (Credit) - for purchases
            else:
                ws.cell(row=row, column=9, value=trans.get('units') or 0)  # Handle None
            # Column 10: Closing Units (balance after transaction)
            ws.cell(row=row, column=10, value=trans.get('balance') or 0)  # Handle None
            # Column 11: Price (NAV)
            ws.cell(row=row, column=11, value=trans.get('nav') or 0)  # Handle None
            
            # Column 12: Transaction Amount
            trans_amount = trans.get('amount') or 0  # Handle None for segregated portfolios
            ws.cell(row=row, column=12, value=trans_amount)
            
            # Column 13: Stamp Duty (STT column removed)
            key = (trans.get('date'), folio, isin)
            stamp_amount = stamp_lookup.get(key, 0) or 0
            if stamp_amount > 0:
                ws.cell(row=row, column=13, value=stamp_amount)
            
            # Column 14: Total Amount
            total_amount = (trans_amount or 0) + (stamp_amount or 0)
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
            cost_value = 0
            if not trans.get('is_redemption') and has_remaining and trans_amount > 0:
                original_units = trans.get('units', 0)
                if original_units > 0:
                    cost_value = (remaining_units / original_units) * trans_amount
                    ws.cell(row=row, column=16, value=round(cost_value, 2))
            
            # Parse transaction date for grandfathering and ageing calculations
            trans_date = parse_date(trans.get('date', ''))
            
            # Column 17 & 18: Grandfathered NAV and Purchase Value (for pre-2018 equity purchases)
            # Grandfathering applies to equity funds purchased before 31-Jan-2018
            if not trans.get('is_redemption') and has_remaining and trans_date != datetime.min:
                # Check if this is an equity fund and purchased before grandfathering date
                is_equity = NAVFetcher.is_equity_fund(scheme_name)
                if is_equity and trans_date < GRANDFATHERING_DATE:
                    # Calculate grandfathered values
                    gf_nav, gf_cost = NAVFetcher.calculate_grandfathered_cost(
                        isin=isin,
                        purchase_date=trans_date,
                        units=remaining_units,
                        original_cost=cost_value,
                        scheme_name_hint=scheme_name
                    )
                    if gf_nav is not None:
                        ws.cell(row=row, column=17, value=round(gf_nav, 4))
                    if gf_cost is not None:
                        ws.cell(row=row, column=18, value=round(gf_cost, 2))
            
            # Column 19: Current NAV - only show for purchases with remaining units and valid NAV
            if not trans.get('is_redemption') and has_remaining and valid_nav:
                ws.cell(row=row, column=19, value=current_nav)
            
            # Column 20: Current Market Value - value of remaining units from THIS purchase
            if not trans.get('is_redemption') and has_remaining and valid_nav:
                market_value = remaining_units * current_nav
                ws.cell(row=row, column=20, value=round(market_value, 2))
            
            # Column 21: MF Ageing - days held for purchases with remaining units
            if not trans.get('is_redemption') and has_remaining and trans_date != datetime.min:
                days_held = (self.report_date - trans_date).days
                ws.cell(row=row, column=21, value=days_held)
            
            # Column 22: XIRR - Per-transaction XIRR calculation
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
                ws.cell(row=row, column=22, value=xirr_value)
            
            # Column 23: Advisor ARN - already got advisor_arn above, now check if should tag as DIRECT
            if not advisor_arn:
                # Check if scheme name contains "direct" - if yes, it's a direct plan
                if 'direct' in scheme_name.lower():
                    advisor_arn = 'DIRECT'
            ws.cell(row=row, column=23, value=advisor_arn)
            
            # Column 24: Advisor Name
            advisor_name = self._get_advisor_name(advisor_arn, scheme_name)
            ws.cell(row=row, column=24, value=advisor_name)
            
            row += 1
        
        self._auto_width(ws)
    
    def _create_sold_units_sheet(self, wb: Workbook):
        """Sheet: Sold Units - Shows all redeemed/sold transactions with profit calculation"""
        ws = wb.create_sheet("Sold Units")
        
        # Headers for sold units - ISIN first for scheme master lookup
        # Added grandfathering columns for pre-2018 equity purchases
        headers = [
            "ISIN", "Scheme Name", "Account Identifier", 
            "Purchase Date", "Purchase NAV", "Units Purchased", "Purchase Amount",
            "Grandfathered NAV", "Grandfathered Purchase Value",
            "Sale Date", "Sale NAV", "Units Sold", "Sale Amount",
            "Holding Days", "Financial Year", "Capital Gain Treatment",
            "Profit/Loss", "Tax-Adjusted Profit/Loss", "Profit %", "Annualized Return %",
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
        
        # Build rejection lookup for all folios
        all_rejections = {}  # (date, folio, isin, amount) -> count
        for folio_key, folio_data in self.parsed_data.get('folios', {}).items():
            for trans in folio_data.get('transactions', []):
                ttype = trans.get('transaction_type', '')
                if 'Rejection' in ttype or 'Reversal' in ttype:
                    date = trans.get('date', '')
                    folio = trans.get('folio', '')
                    isin = trans.get('isin', '')
                    amount = abs(trans.get('amount', 0) or 0)
                    key = (date, folio, isin, round(amount, 2))
                    all_rejections[key] = all_rejections.get(key, 0) + 1
        
        # First pass: collect all purchases by folio (excluding rejections and rejected purchases)
        for folio_key, folio_data in self.parsed_data.get('folios', {}).items():
            purchases = []
            used_rejections = {}
            
            for trans in folio_data.get('transactions', []):
                if trans.get('is_nft') or trans.get('is_pledge'):
                    continue
                if trans.get('transaction_type') in ['STT Paid', 'Stamp Duty']:
                    continue
                
                ttype = trans.get('transaction_type', '')
                
                # Skip rejection entries
                if 'Rejection' in ttype or 'Reversal' in ttype:
                    continue
                
                # Check if this purchase was rejected
                if not trans.get('is_redemption'):
                    date = trans.get('date', '')
                    folio = trans.get('folio', '')
                    isin = trans.get('isin', '')
                    amount = abs(trans.get('amount', 0) or 0)
                    key = (date, folio, isin, round(amount, 2))
                    
                    if key in all_rejections:
                        matched = used_rejections.get(key, 0)
                        if matched < all_rejections[key]:
                            used_rejections[key] = matched + 1
                            continue  # Skip this rejected purchase
                    
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
            
            # Get scheme name from scheme master using ISIN
            scheme_from_master = self._get_scheme_name_from_master(isin, scheme_name)
            
            # Get advisor from folio data
            folio_advisor = folio_data.get('advisor', '') or ''
            if folio_advisor in ('None', 'null', ''):
                folio_advisor = ''
            
            # Get purchases for this folio
            available_purchases = []
            for p in purchases_by_folio.get(folio_key, []):
                # Get advisor from purchase, fallback to folio advisor
                purchase_advisor = p.get('advisor', '') or ''
                if purchase_advisor in ('None', 'null', ''):
                    purchase_advisor = folio_advisor
                
                available_purchases.append({
                    'date': p.get('date'),
                    'nav': p.get('nav', 0),
                    'units': p.get('units', 0),
                    'amount': p.get('amount', 0),
                    'remaining_units': p.get('units', 0),
                    'advisor': purchase_advisor
                })
            
            # Process redemptions (skip rejections explicitly)
            for trans in folio_data.get('transactions', []):
                if not trans.get('is_redemption'):
                    continue
                if trans.get('is_rejection'):  # Skip rejection entries
                    continue
                if trans.get('is_nft') or trans.get('is_pledge'):
                    continue
                
                sale_date_str = trans.get('date', '')
                sale_nav = trans.get('nav') or 0  # Handle None for segregated portfolios
                units_to_sell = abs(trans.get('units') or 0)
                sale_amount = abs(trans.get('amount') or 0)  # Handle None for segregated portfolios
                
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
                    
                    # IMPORTANT: Only match purchases that happened BEFORE the sale
                    try:
                        purchase_date = datetime.strptime(purchase['date'], '%d-%b-%Y')
                        if sale_date and purchase_date >= sale_date:
                            # Skip purchases that happened on or after the sale date
                            continue
                    except:
                        pass
                    
                    # Calculate how many units from this purchase are sold
                    units_from_this_purchase = min(remaining_to_sell, purchase['remaining_units'])
                    
                    if units_from_this_purchase > 0:
                        # Calculate purchase details for these units
                        purchase_nav = purchase['nav']
                        purchase_amount = (units_from_this_purchase / purchase['units']) * purchase['amount'] if purchase['units'] > 0 else 0
                        
                        # Calculate sale amount for these units
                        sale_amount_portion = (units_from_this_purchase / units_to_sell) * sale_amount if units_to_sell > 0 else 0
                        
                        # Calculate holding period (purchase_date already parsed above)
                        holding_days = (sale_date - purchase_date).days if sale_date and purchase_date else 0
                        
                        # Calculate profit/loss
                        profit_loss = sale_amount_portion - purchase_amount
                        profit_pct = (profit_loss / purchase_amount * 100) if purchase_amount > 0 else 0
                        
                        # Calculate grandfathering for pre-2018 equity purchases
                        gf_nav = None
                        gf_purchase_value = None
                        tax_adjusted_profit_loss = profit_loss
                        
                        if purchase_date and purchase_date < GRANDFATHERING_DATE:
                            # Check if equity fund
                            is_equity = NAVFetcher.is_equity_fund(scheme_from_master)
                            if is_equity:
                                gf_nav, gf_purchase_value = NAVFetcher.calculate_grandfathered_cost(
                                    isin=isin,
                                    purchase_date=purchase_date,
                                    units=units_from_this_purchase,
                                    original_cost=purchase_amount,
                                    scheme_name_hint=scheme_from_master
                                )
                                # Calculate tax-adjusted profit using grandfathered cost
                                if gf_purchase_value is not None:
                                    tax_adjusted_profit_loss = sale_amount_portion - gf_purchase_value
                        
                        # Calculate annualized return
                        annualized_return = 0
                        if holding_days > 0 and purchase_amount > 0:
                            try:
                                annualized_return = ((sale_amount_portion / purchase_amount) ** (365 / holding_days) - 1) * 100
                            except:
                                pass
                        
                        sold_entries.append({
                            'folio': folio_num,
                            'scheme': scheme_from_master,
                            'isin': isin,
                            'purchase_date': purchase['date'],
                            'purchase_date_obj': purchase_date,
                            'purchase_nav': purchase_nav,
                            'units_purchased': units_from_this_purchase,
                            'purchase_amount': purchase_amount,
                            'gf_nav': gf_nav,
                            'gf_purchase_value': gf_purchase_value,
                            'sale_date': sale_date_str,
                            'sale_date_obj': sale_date,
                            'sale_nav': sale_nav,
                            'units_sold': units_from_this_purchase,
                            'sale_amount': sale_amount_portion,
                            'holding_days': holding_days,
                            'financial_year': get_financial_year(sale_date),
                            'capital_gain_treatment': get_capital_gain_treatment(holding_days, scheme_from_master),
                            'profit_loss': profit_loss,
                            'tax_adjusted_profit_loss': tax_adjusted_profit_loss,
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
            # Skip entries with zero units sold (couldn't match to a purchase)
            # Also skip IDCW entries - they go to separate IDCW tab
            if entry['units_sold'] <= 0:
                continue
            if entry.get('is_idcw'):
                continue
            
            # Column layout based on new headers with grandfathering columns
            # 1: ISIN, 2: Scheme Name, 3: Account Identifier
            # 4: Purchase Date, 5: Purchase NAV, 6: Units Purchased, 7: Purchase Amount
            # 8: Grandfathered NAV, 9: Grandfathered Purchase Value
            # 10: Sale Date, 11: Sale NAV, 12: Units Sold, 13: Sale Amount
            # 14: Holding Days, 15: Financial Year, 16: Capital Gain Treatment
            # 17: Profit/Loss, 18: Tax-Adjusted Profit/Loss, 19: Profit %, 20: Annualized Return %
            # 21: Advisor ARN
            
            ws.cell(row=row, column=1, value=entry['isin'])
            ws.cell(row=row, column=2, value=entry['scheme'] if entry['scheme'] else '')
            ws.cell(row=row, column=3, value=entry['folio'])
            ws.cell(row=row, column=4, value=entry['purchase_date'])
            ws.cell(row=row, column=5, value=entry['purchase_nav'])
            ws.cell(row=row, column=6, value=round(entry['units_purchased'], 3))
            ws.cell(row=row, column=7, value=round(entry['purchase_amount'], 2))
            
            # Grandfathering columns (8-9)
            if entry.get('gf_nav') is not None:
                ws.cell(row=row, column=8, value=round(entry['gf_nav'], 4))
            if entry.get('gf_purchase_value') is not None:
                ws.cell(row=row, column=9, value=round(entry['gf_purchase_value'], 2))
            
            ws.cell(row=row, column=10, value=entry['sale_date'])
            ws.cell(row=row, column=11, value=entry['sale_nav'])
            ws.cell(row=row, column=12, value=round(entry['units_sold'], 3))
            ws.cell(row=row, column=13, value=round(entry['sale_amount'], 2))
            ws.cell(row=row, column=14, value=entry['holding_days'])
            ws.cell(row=row, column=15, value=entry['financial_year'])
            
            # Capital Gain Treatment with color coding (col 16)
            cg_cell = ws.cell(row=row, column=16, value=entry['capital_gain_treatment'])
            if entry['capital_gain_treatment'] == 'Long Term':
                cg_cell.fill = PatternFill(start_color="E2EFDA", end_color="E2EFDA", fill_type="solid")
                cg_cell.font = Font(color="375623")
            elif entry['capital_gain_treatment'] == 'Short Term':
                cg_cell.fill = PatternFill(start_color="FCE4D6", end_color="FCE4D6", fill_type="solid")
                cg_cell.font = Font(color="974706")
            
            # Profit/Loss with conditional formatting (col 17)
            profit_cell = ws.cell(row=row, column=17, value=round(entry['profit_loss'], 2))
            
            if entry['profit_loss'] >= 0:
                profit_cell.fill = profit_fill
                profit_cell.font = profit_font
            else:
                profit_cell.fill = loss_fill
                profit_cell.font = loss_font
            
            # Tax-Adjusted Profit/Loss (col 18) - uses grandfathered cost if available
            tax_adj_pl = entry.get('tax_adjusted_profit_loss', entry['profit_loss'])
            tax_adj_cell = ws.cell(row=row, column=18, value=round(tax_adj_pl, 2))
            if tax_adj_pl >= 0:
                tax_adj_cell.fill = profit_fill
                tax_adj_cell.font = profit_font
            else:
                tax_adj_cell.fill = loss_fill
                tax_adj_cell.font = loss_font
            
            # Profit % (col 19)
            pct_cell = ws.cell(row=row, column=19, value=f"{entry['profit_pct']:.2f}%")
            if entry['profit_loss'] >= 0:
                pct_cell.fill = profit_fill
                pct_cell.font = profit_font
            else:
                pct_cell.fill = loss_fill
                pct_cell.font = loss_font
            
            # Annualized Return (col 20)
            ws.cell(row=row, column=20, value=f"{entry['annualized_return']:.2f}%")
            
            # Advisor ARN (col 21) - if blank/None and scheme has "direct", tag as DIRECT
            advisor_arn = entry.get('advisor', '') or ''
            # Handle string "None" as blank
            if advisor_arn in ('None', 'null', ''):
                advisor_arn = ''
            
            scheme_name = entry.get('scheme', '') or ''
            if not advisor_arn:
                if 'direct' in scheme_name.lower():
                    advisor_arn = 'DIRECT'
            ws.cell(row=row, column=21, value=advisor_arn)
            
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
            ws.cell(row=row, column=13, value=round(total_sale, 2))
            ws.cell(row=row, column=13).font = Font(bold=True)
            
            total_profit_cell = ws.cell(row=row, column=17, value=round(total_profit, 2))
            total_profit_cell.font = Font(bold=True)
            if total_profit >= 0:
                total_profit_cell.fill = profit_fill
            else:
                total_profit_cell.fill = loss_fill
            
            if total_purchase > 0:
                total_pct_cell = ws.cell(row=row, column=19, value=f"{(total_profit / total_purchase * 100):.2f}%")
                total_pct_cell.font = Font(bold=True)
                total_pct_cell.font = Font(bold=True)
        
        self._auto_width(ws)
    
    def _create_idcw_sheet(self, wb: Workbook):
        """Sheet: IDCW Payouts - Dividend income from IDCW schemes"""
        ws = wb.create_sheet("IDCW Payouts")
        
        # Headers - ISIN first
        headers = [
            "ISIN", "Scheme Name", "Folio No", "Date", "Rate/Unit",
            "Dividend Amount", "Financial Year", "Advisor ARN"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        # Collect IDCW transactions from all folios
        idcw_entries = []
        
        for folio_key, folio_data in self.parsed_data.get('folios', {}).items():
            scheme_name = folio_data.get('scheme', '')
            isin = folio_data.get('isin', '')
            folio_num = folio_data.get('folio', folio_key)
            
            # Get scheme name from scheme master using ISIN
            scheme_from_master = self._get_scheme_name_from_master(isin, scheme_name)
            
            # Get advisor from folio data
            folio_advisor = folio_data.get('advisor', '') or ''
            if folio_advisor in ('None', 'null', ''):
                folio_advisor = ''
            
            # Process IDCW transactions
            for trans in folio_data.get('transactions', []):
                if not trans.get('is_idcw'):
                    continue
                
                idcw_date_str = trans.get('date', '')
                idcw_amount = trans.get('amount', 0)
                rate_per_unit = trans.get('nav', 0)  # Rate per unit stored in NAV field
                
                try:
                    idcw_date = datetime.strptime(idcw_date_str, '%d-%b-%Y')
                    fy = self._get_financial_year(idcw_date)
                except:
                    fy = ''
                
                idcw_entries.append({
                    'isin': isin,
                    'scheme': scheme_from_master,
                    'folio': folio_num,
                    'date': idcw_date_str,
                    'rate_per_unit': rate_per_unit,
                    'amount': idcw_amount,
                    'financial_year': fy,
                    'advisor': folio_advisor
                })
        
        # Sort by date
        def parse_date(date_str):
            try:
                return datetime.strptime(date_str, '%d-%b-%Y')
            except:
                return datetime.min
        
        idcw_entries.sort(key=lambda x: parse_date(x.get('date', '')))
        
        # Write data
        row = 2
        total_dividend = 0
        
        for entry in idcw_entries:
            ws.cell(row=row, column=1, value=entry['isin'])
            ws.cell(row=row, column=2, value=entry['scheme'])
            ws.cell(row=row, column=3, value=entry['folio'])
            ws.cell(row=row, column=4, value=entry['date'])
            ws.cell(row=row, column=5, value=entry['rate_per_unit'])
            ws.cell(row=row, column=6, value=round(entry['amount'], 2))
            ws.cell(row=row, column=7, value=entry['financial_year'])
            ws.cell(row=row, column=8, value=entry['advisor'])
            
            total_dividend += entry['amount']
            row += 1
        
        # Add summary row
        if idcw_entries:
            row += 1
            ws.cell(row=row, column=1, value="TOTAL")
            ws.cell(row=row, column=1).font = Font(bold=True)
            total_cell = ws.cell(row=row, column=6, value=round(total_dividend, 2))
            total_cell.font = Font(bold=True)
            total_cell.fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
        
        self._auto_width(ws)
    
    def _get_financial_year(self, date_obj):
        """Get financial year string for a date"""
        if not date_obj:
            return ''
        if date_obj.month >= 4:
            return f"FY {date_obj.year}-{str(date_obj.year + 1)[2:]}"
        else:
            return f"FY {date_obj.year - 1}-{str(date_obj.year)[2:]}"

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
            ws.cell(row=row, column=2, value=folio_data.get('scheme', ''))
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
                
                amount = trans.get('amount') or 0  # Handle None
                units = trans.get('units') or 0  # Handle None
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
                trans_amount = trans.get('amount') or 0  # Handle None for segregated portfolios
                cell = ws.cell(row=data_row, column=start_col + 2, value=round(trans_amount, 2) if trans_amount else 0)
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
            "ISIN", "Scheme Name", "Date", "PAN", "Folio Number", "Transaction Type", "Units"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        # Build folio lookups for PAN and ISIN
        folio_pan_lookup = {}
        folio_isin_lookup = {}
        folio_scheme_lookup = {}
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            folio_num = folio_data.get('folio', '')
            pan = folio_data.get('pan', '')
            isin = folio_data.get('isin', '')
            scheme = folio_data.get('scheme', '')
            if folio_num:
                if pan:
                    folio_pan_lookup[folio_num] = pan
                if isin:
                    folio_isin_lookup[folio_num] = isin
                if scheme:
                    folio_scheme_lookup[folio_num] = scheme
        
        # Collect all NFT entries
        nft_list = []
        
        # Add NFT entries from transactions (is_nft=True or is_pledge=True)
        for trans in self.parsed_data.get('transactions', []):
            if trans.get('is_nft') or trans.get('is_pledge'):
                folio = trans.get('folio', '')
                pan = trans.get('pan', '') or folio_pan_lookup.get(folio, '')
                isin = trans.get('isin', '') or folio_isin_lookup.get(folio, '')
                scheme = trans.get('scheme', '') or folio_scheme_lookup.get(folio, '')
                
                # Get scheme name from scheme master using ISIN
                scheme_from_master = self._get_scheme_name_from_master(isin, scheme)
                
                nft_list.append({
                    'date': trans.get('date', ''),
                    'pan': pan,
                    'folio': folio,
                    'scheme': scheme_from_master if scheme_from_master else '',
                    'isin': isin,
                    'type': trans.get('transaction_type', ''),
                    'units': trans.get('units', 0) if trans.get('units') else ''
                })
        
        # Also add original nft_entries
        for nft in self.parsed_data.get('nft_entries', []):
            folio = nft.get('folio', '')
            pan = nft.get('pan', '') or folio_pan_lookup.get(folio, '')
            isin = nft.get('isin', '') or folio_isin_lookup.get(folio, '')
            scheme = nft.get('scheme', '') or folio_scheme_lookup.get(folio, '')
            
            # Get scheme name from scheme master using ISIN
            scheme_from_master = self._get_scheme_name_from_master(isin, scheme)
            
            nft_list.append({
                'date': nft.get('date', ''),
                'pan': pan,
                'folio': folio,
                'scheme': scheme_from_master if scheme_from_master else '',
                'isin': isin,
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
        
        # Write sorted data - ISIN first
        row = 2
        for nft in nft_list:
            ws.cell(row=row, column=1, value=nft['isin'])
            ws.cell(row=row, column=2, value=nft['scheme'])
            ws.cell(row=row, column=3, value=nft['date'])
            ws.cell(row=row, column=4, value=nft['pan'])
            ws.cell(row=row, column=5, value=nft['folio'])
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
        
        # Headers - ISIN first
        headers = [
            "ISIN", "Scheme Name", "Date", "PAN", "Folio Number",
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
        
        # Write TDS data - ISIN first
        row = 2
        for tds in sorted_tds:
            isin = tds.get('isin', '')
            scheme_from_master = self._get_scheme_name_from_master(isin, tds.get('scheme', ''))
            ws.cell(row=row, column=1, value=isin)
            ws.cell(row=row, column=2, value=scheme_from_master if scheme_from_master else '')
            ws.cell(row=row, column=3, value=tds.get('date', ''))
            ws.cell(row=row, column=4, value=tds.get('pan', ''))
            ws.cell(row=row, column=5, value=tds.get('folio', ''))
            ws.cell(row=row, column=6, value=tds.get('transaction_desc', '') if tds.get('transaction_desc') else '')
            ws.cell(row=row, column=7, value=tds.get('amount', 0))
            ws.cell(row=row, column=8, value=tds.get('financial_year', ''))
            row += 1
        
        self._auto_width(ws)
    
    def _create_summary_sheet(self, wb: Workbook):
        """Sheet 1: Summary - Portfolio Summary with AMC-wise breakdown"""
        ws = wb.create_sheet("Summary", 0)  # Position 0 to make it first
        
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
        
        # Helper function to extract AMC name from scheme name or ISIN
        def get_amc_name(scheme_name, isin=None):
            """Extract AMC name from scheme name or ISIN"""
            
            # First try to identify by ISIN prefix (more reliable)
            if isin:
                isin_upper = isin.upper()
                isin_prefixes = {
                    'INF200K': 'SBI Mutual Fund',         # SBI MF
                    'INF174K': 'Kotak Mutual Fund',       # Kotak MF
                    'INF109K': 'ICICI Prudential Mutual Fund',  # ICICI Pru
                    'INF209K': 'Aditya Birla Sun Life Mutual Fund',  # ABSL
                    'INF194K': 'HSBC Mutual Fund',        # HSBC
                    'INF179K': 'HDFC Mutual Fund',        # HDFC
                    'INF903J': 'Sundaram Mutual Fund',    # Sundaram
                    'INF769K': 'Mirae Asset Mutual Fund', # Mirae Asset
                    'INF204K': 'Nippon India Mutual Fund', # Nippon
                    'INF846K': 'Axis Mutual Fund',        # Axis
                    'INF277K': 'Tata Mutual Fund',        # Tata
                    'INF740K': 'DSP Mutual Fund',         # DSP
                    'INF789F': 'UTI Mutual Fund',         # UTI
                    'INF090I': 'Franklin Templeton Mutual Fund',
                    'INF205K': 'Invesco Mutual Fund',
                    'INF247L': 'Motilal Oswal Mutual Fund',
                    'INF760K': 'Canara Robeco Mutual Fund',
                    'INF223J': 'PGIM India Mutual Fund',
                    'INF879O': 'PPFAS Mutual Fund',
                    'INF754K': 'Edelweiss Mutual Fund',
                    'INF767K': 'IDFC Mutual Fund',
                    'INF966L': 'Quant Mutual Fund',        # quant MF
                    'INF194K': 'Bandhan Mutual Fund',      # Bandhan MF
                    'INF082J': 'Quantum Mutual Fund',
                    'INF955L': 'Baroda BNP Paribas Mutual Fund',
                    'INF917K': 'HSBC Mutual Fund',         # L&T MF (merged with HSBC)
                    'INF582J': 'Union Mutual Fund',
                }
                
                for prefix, amc in isin_prefixes.items():
                    if isin_upper.startswith(prefix):
                        return amc
            
            # Fallback to scheme name matching
            if not scheme_name:
                return "Other"
            
            scheme_lower = scheme_name.lower()
            
            # Map common AMC patterns
            amc_mappings = [
                ('sbi ', 'SBI Mutual Fund'),
                ('kotak ', 'Kotak Mutual Fund'),
                ('icici prudential', 'ICICI Prudential Mutual Fund'),
                ('icici pru', 'ICICI Prudential Mutual Fund'),
                ('aditya birla', 'Aditya Birla Sun Life Mutual Fund'),
                ('absl ', 'Aditya Birla Sun Life Mutual Fund'),
                ('hsbc ', 'HSBC Mutual Fund'),
                ('hdfc ', 'HDFC Mutual Fund'),
                ('sundaram ', 'Sundaram Mutual Fund'),
                ('mirae asset', 'Mirae Asset Mutual Fund'),
                ('mirae ', 'Mirae Asset Mutual Fund'),
                ('nippon india', 'Nippon India Mutual Fund'),
                ('nippon ', 'Nippon India Mutual Fund'),
                ('axis ', 'Axis Mutual Fund'),
                ('tata ', 'Tata Mutual Fund'),
                ('dsp ', 'DSP Mutual Fund'),
                ('uti ', 'UTI Mutual Fund'),
                ('franklin', 'Franklin Templeton Mutual Fund'),
                ('invesco', 'Invesco Mutual Fund'),
                ('motilal oswal', 'Motilal Oswal Mutual Fund'),
                ('canara robeco', 'Canara Robeco Mutual Fund'),
                ('pgim ', 'PGIM India Mutual Fund'),
                ('parag parikh', 'PPFAS Mutual Fund'),
                ('ppfas', 'PPFAS Mutual Fund'),
                ('edelweiss', 'Edelweiss Mutual Fund'),
                ('idfc ', 'IDFC Mutual Fund'),
                ('bandhan ', 'Bandhan Mutual Fund'),
                ('quant ', 'Quant Mutual Fund'),
                ('quantum ', 'Quantum Mutual Fund'),
                ('baroda bnp', 'Baroda BNP Paribas Mutual Fund'),
                ('l&t ', 'L&T Mutual Fund'),
                ('union ', 'Union Mutual Fund'),
                ('mahindra ', 'Mahindra Manulife Mutual Fund'),
                ('jm ', 'JM Financial Mutual Fund'),
                ('lic ', 'LIC Mutual Fund'),
            ]
            
            for pattern, amc in amc_mappings:
                if pattern in scheme_lower:
                    return amc
            
            return "Other"
        
        # Calculate totals and AMC-wise breakdown
        total_cost_value = 0
        total_market_value = 0
        total_withdrawn = 0
        total_stt = 0
        amc_breakdown = {}  # {amc_name: {'cost': 0, 'market': 0}}
        scheme_breakdown = []  # List of {amc, scheme, isin, cost, market, units, stt}
        
        # Direct vs Regular plan totals
        direct_cost = 0
        direct_market = 0
        regular_cost = 0
        regular_market = 0
        
        # Adviser-wise breakdown: {adviser: {'cost': 0, 'market': 0, 'cashflows': []}}
        adviser_breakdown = {}
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            market_value = folio_data.get('market_value', 0) or 0
            closing_balance = folio_data.get('closing_balance', 0) or 0
            cost_value = folio_data.get('cost_value', 0) or 0
            scheme_name = folio_data.get('scheme', '') or ''
            isin = folio_data.get('isin', '') or ''
            amc_from_folio = folio_data.get('amc', '') or ''
            
            # Calculate STT for this folio
            stt_amount = sum(t.get('amount', 0) for t in folio_data.get('transactions', []) 
                            if t.get('transaction_type') in ['STT Paid', 'STT'])
            
            # Only include active holdings (with closing balance and market value)
            if closing_balance > 0:
                # Get AMC name for breakdown (use ISIN first, then scheme name, then folio's amc field)
                amc_name = get_amc_name(scheme_name, isin)
                
                # If still "Other", try using the AMC field from the folio
                if amc_name == "Other" and amc_from_folio:
                    # Normalize the AMC name
                    amc_lower = amc_from_folio.lower()
                    amc_mappings = {
                        'hdfc': 'HDFC Mutual Fund',
                        'hsbc': 'HSBC Mutual Fund',
                        'mirae': 'Mirae Asset Mutual Fund',
                        'sundaram': 'Sundaram Mutual Fund',
                        'sbi': 'SBI Mutual Fund',
                        'icici': 'ICICI Prudential Mutual Fund',
                        'kotak': 'Kotak Mutual Fund',
                        'aditya': 'Aditya Birla Sun Life Mutual Fund',
                        'nippon': 'Nippon India Mutual Fund',
                        'axis': 'Axis Mutual Fund',
                        'dsp': 'DSP Mutual Fund',
                        'tata': 'Tata Mutual Fund',
                        'uti': 'UTI Mutual Fund',
                    }
                    for key, value in amc_mappings.items():
                        if key in amc_lower:
                            amc_name = value
                            break
                
                if amc_name not in amc_breakdown:
                    amc_breakdown[amc_name] = {'cost': 0, 'market': 0, 'dividend': 0, 'tds': 0}
                
                # Use cost_value from parsed data directly - don't recalculate
                # cost_value of 0 is valid (e.g., segregated portfolios)
                
                amc_breakdown[amc_name]['cost'] += cost_value
                amc_breakdown[amc_name]['market'] += market_value
                
                total_cost_value += cost_value
                total_market_value += market_value
                total_stt += stt_amount
                
                # Get scheme name from scheme master if available
                scheme_from_master = self._get_scheme_name_from_master(isin, scheme_name)
                
                # Determine if Direct or Regular plan
                is_direct = 'direct' in scheme_from_master.lower() if scheme_from_master else False
                if is_direct:
                    direct_cost += cost_value
                    direct_market += market_value
                else:
                    regular_cost += cost_value
                    regular_market += market_value
                
                # Track Adviser-wise breakdown
                adviser = folio_data.get('advisor', '')
                scheme_name_for_adviser = folio_data.get('scheme', '')
                adviser_display = self._get_advisor_name(adviser, scheme_name_for_adviser)
                if not adviser_display:
                    adviser_display = 'Unknown'
                if adviser_display not in adviser_breakdown:
                    adviser_breakdown[adviser_display] = {
                        'cost': 0, 
                        'market': 0,
                        'dividend': 0,
                        'tds': 0,
                        'cashflows': []
                    }
                adviser_breakdown[adviser_display]['cost'] += cost_value
                adviser_breakdown[adviser_display]['market'] += market_value
                
                # Build cashflows for XIRR calculation for this adviser
                for trans in folio_data.get('transactions', []):
                    if trans.get('is_nft') or trans.get('is_pledge'):
                        continue
                    if trans.get('transaction_type') in ['STT Paid', 'Stamp Duty']:
                        continue
                    
                    try:
                        trans_date = datetime.strptime(trans.get('date', ''), '%d-%b-%Y')
                        trans_amount = trans.get('amount', 0) or 0
                        if trans_amount > 0:
                            if trans.get('is_redemption'):
                                # Redemption is positive (inflow to investor)
                                adviser_breakdown[adviser_display]['cashflows'].append((trans_date, trans_amount))
                            elif trans.get('is_idcw'):
                                # IDCW/Dividend is positive (inflow to investor)
                                adviser_breakdown[adviser_display]['cashflows'].append((trans_date, trans_amount))
                                # Track dividend amount for this adviser
                                adviser_breakdown[adviser_display]['dividend'] += trans_amount
                            else:
                                # Investment is negative (outflow from investor)
                                adviser_breakdown[adviser_display]['cashflows'].append((trans_date, -trans_amount))
                    except (ValueError, TypeError):
                        pass
                
                # Track market value for this adviser (don't add to cashflows yet - do it once after loop)
                if closing_balance > 0 and market_value > 0:
                    adviser_breakdown[adviser_display]['market_for_xirr'] = adviser_breakdown[adviser_display].get('market_for_xirr', 0) + market_value
                
                # Add to scheme breakdown
                scheme_breakdown.append({
                    'amc': amc_name,
                    'folio': folio_data.get('folio', folio_id),
                    'scheme': scheme_from_master,
                    'isin': isin,
                    'cost': cost_value,
                    'market': market_value,
                    'units': closing_balance,
                    'stt': stt_amount,
                    'adviser': adviser_display
                })
            
            # Calculate withdrawals from transactions
            for trans in folio_data.get('transactions', []):
                if trans.get('is_nft') or trans.get('is_pledge'):
                    continue
                if trans.get('transaction_type') in ['STT Paid', 'Stamp Duty']:
                    continue
                
                amount = trans.get('amount', 0) or 0
                if trans.get('is_redemption'):
                    total_withdrawn += amount
        
        # Calculate total IDCW (Dividend) amount and track by AMC
        total_dividend = 0
        for folio_key, folio_data in self.parsed_data.get('folios', {}).items():
            scheme_name = folio_data.get('scheme', '') or ''
            isin = folio_data.get('isin', '') or ''
            amc_from_folio = folio_data.get('amc', '') or ''
            
            # Get AMC name for this folio
            amc_name = get_amc_name(scheme_name, isin)
            if amc_name == "Other" and amc_from_folio:
                amc_lower = amc_from_folio.lower()
                amc_mappings = {
                    'hdfc': 'HDFC Mutual Fund',
                    'hsbc': 'HSBC Mutual Fund',
                    'mirae': 'Mirae Asset Mutual Fund',
                    'sundaram': 'Sundaram Mutual Fund',
                    'sbi': 'SBI Mutual Fund',
                    'icici': 'ICICI Prudential Mutual Fund',
                    'kotak': 'Kotak Mutual Fund',
                    'aditya': 'Aditya Birla Sun Life Mutual Fund',
                    'nippon': 'Nippon India Mutual Fund',
                }
                for key, value in amc_mappings.items():
                    if key in amc_lower:
                        amc_name = value
                        break
            
            for trans in folio_data.get('transactions', []):
                if trans.get('is_idcw'):
                    dividend_amount = trans.get('amount', 0) or 0
                    total_dividend += dividend_amount
                    # Track by AMC
                    if amc_name in amc_breakdown:
                        amc_breakdown[amc_name]['dividend'] += dividend_amount
        
        # Calculate total TDS amount and track by AMC/Adviser
        total_tds = 0
        for tds_entry in self.parsed_data.get('tds_entries', []):
            tds_amount = tds_entry.get('amount', 0) or 0
            total_tds += tds_amount
            
            # Get AMC from TDS entry
            tds_scheme = tds_entry.get('scheme', '') or ''
            tds_isin = tds_entry.get('isin', '') or ''
            tds_amc = get_amc_name(tds_scheme, tds_isin)
            
            # Track TDS by AMC
            if tds_amc in amc_breakdown:
                amc_breakdown[tds_amc]['tds'] += tds_amount
            
            # Track TDS by adviser (look up from folio)
            tds_folio = tds_entry.get('folio', '')
            for folio_key, folio_data in self.parsed_data.get('folios', {}).items():
                if tds_folio and tds_folio in str(folio_data.get('folio', '')):
                    adviser = folio_data.get('advisor', '')
                    adviser_display = self._get_advisor_name(adviser, folio_data.get('scheme', ''))
                    if adviser_display and adviser_display in adviser_breakdown:
                        adviser_breakdown[adviser_display]['tds'] += tds_amount
                    break
        
        # Portfolio Summary Section
        ws.cell(row=1, column=1, value="PORTFOLIO SUMMARY")
        ws.merge_cells('A1:B1')
        self._style_header(ws, 1, 2)
        
        # Summary headers
        ws.cell(row=3, column=1, value="Metric")
        ws.cell(row=3, column=2, value="Value")
        self._style_header(ws, 3, 2)
        
        ws.cell(row=4, column=1, value="Total Cost Value (Invested)")
        ws.cell(row=4, column=2, value=format_inr(total_cost_value))
        ws.cell(row=5, column=1, value="Total Amount Withdrawn")
        ws.cell(row=5, column=2, value=format_inr(total_withdrawn))
        ws.cell(row=6, column=1, value="Total Dividend Received (IDCW)")
        ws.cell(row=6, column=2, value=format_inr(total_dividend))
        ws.cell(row=7, column=1, value="Total TDS Deducted")
        ws.cell(row=7, column=2, value=format_inr(total_tds))
        ws.cell(row=8, column=1, value="Current Market Value")
        ws.cell(row=8, column=2, value=format_inr(total_market_value))
        
        # Absolute Gain = (Current Market Value + Withdrawn + Dividend + TDS) - Invested
        # TDS is added because it's part of profit (investor gets tax credit)
        absolute_gain = (total_market_value + total_withdrawn + total_dividend + total_tds) - total_cost_value
        ws.cell(row=9, column=1, value="Absolute Gain/Loss")
        ws.cell(row=9, column=2, value=format_inr(absolute_gain))
        # Color code the gain/loss
        if absolute_gain >= 0:
            ws.cell(row=9, column=2).fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
        else:
            ws.cell(row=9, column=2).fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
        
        # AMC-wise Breakdown Section
        row = 11
        ws.cell(row=row, column=1, value="AMC-WISE BREAKDOWN")
        ws.merge_cells(f'A{row}:C{row}')
        self._style_header(ws, row, 3)
        
        row += 2
        ws.cell(row=row, column=1, value="Mutual Fund (AMC)")
        ws.cell(row=row, column=2, value="Cost Value (INR)")
        ws.cell(row=row, column=3, value="Market Value (INR)")
        ws.cell(row=row, column=4, value="Dividend (INR)")
        ws.cell(row=row, column=5, value="TDS (INR)")
        ws.cell(row=row, column=6, value="Profit/Loss (INR)")
        self._style_header(ws, row, 6)
        
        # Sort AMCs by market value (descending)
        sorted_amcs = sorted(amc_breakdown.items(), key=lambda x: x[1]['market'], reverse=True)
        
        amc_total_dividend = 0
        amc_total_tds = 0
        
        for amc_name, values in sorted_amcs:
            if values['market'] > 0 or values['cost'] > 0:  # Only show AMCs with holdings
                row += 1
                # Profit = (Market Value + Dividend + TDS) - Cost
                profit = (values['market'] + values.get('dividend', 0) + values.get('tds', 0)) - values['cost']
                
                ws.cell(row=row, column=1, value=amc_name)
                ws.cell(row=row, column=2, value=format_inr(values['cost']))
                ws.cell(row=row, column=3, value=format_inr(values['market']))
                ws.cell(row=row, column=4, value=format_inr(values.get('dividend', 0)))
                ws.cell(row=row, column=5, value=format_inr(values.get('tds', 0)))
                ws.cell(row=row, column=6, value=format_inr(profit))
                
                # Color code profit/loss
                if profit >= 0:
                    ws.cell(row=row, column=6).fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
                else:
                    ws.cell(row=row, column=6).fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
                
                amc_total_dividend += values.get('dividend', 0)
                amc_total_tds += values.get('tds', 0)
        
        # Total row
        row += 1
        total_profit = (total_market_value + amc_total_dividend + amc_total_tds) - total_cost_value
        ws.cell(row=row, column=1, value="Total")
        ws.cell(row=row, column=1).font = Font(bold=True)
        ws.cell(row=row, column=2, value=format_inr(total_cost_value))
        ws.cell(row=row, column=2).font = Font(bold=True)
        ws.cell(row=row, column=3, value=format_inr(total_market_value))
        ws.cell(row=row, column=3).font = Font(bold=True)
        ws.cell(row=row, column=4, value=format_inr(amc_total_dividend))
        ws.cell(row=row, column=4).font = Font(bold=True)
        ws.cell(row=row, column=5, value=format_inr(amc_total_tds))
        ws.cell(row=row, column=5).font = Font(bold=True)
        ws.cell(row=row, column=6, value=format_inr(total_profit))
        ws.cell(row=row, column=6).font = Font(bold=True)
        
        # Direct vs Regular Bifurcation Section
        row += 2
        ws.cell(row=row, column=1, value="DIRECT vs REGULAR INVESTMENTS")
        ws.merge_cells(f'A{row}:C{row}')
        self._style_header(ws, row, 3)
        
        row += 2
        ws.cell(row=row, column=1, value="Investment Type")
        ws.cell(row=row, column=2, value="Cost Value (INR)")
        ws.cell(row=row, column=3, value="Market Value (INR)")
        self._style_header(ws, row, 3)
        
        row += 1
        ws.cell(row=row, column=1, value="Direct Plans")
        ws.cell(row=row, column=2, value=format_inr(direct_cost))
        ws.cell(row=row, column=3, value=format_inr(direct_market))
        
        row += 1
        ws.cell(row=row, column=1, value="Regular Plans")
        ws.cell(row=row, column=2, value=format_inr(regular_cost))
        ws.cell(row=row, column=3, value=format_inr(regular_market))
        
        row += 1
        ws.cell(row=row, column=1, value="Total")
        ws.cell(row=row, column=1).font = Font(bold=True)
        ws.cell(row=row, column=2, value=format_inr(direct_cost + regular_cost))
        ws.cell(row=row, column=2).font = Font(bold=True)
        ws.cell(row=row, column=3, value=format_inr(direct_market + regular_market))
        ws.cell(row=row, column=3).font = Font(bold=True)
        
        # Adviser-wise Breakdown Section with XIRR
        row += 2
        ws.cell(row=row, column=1, value="ADVISER-WISE BREAKDOWN")
        ws.merge_cells(f'A{row}:G{row}')
        self._style_header(ws, row, 7)
        
        row += 2
        ws.cell(row=row, column=1, value="Adviser")
        ws.cell(row=row, column=2, value="Cost Value (INR)")
        ws.cell(row=row, column=3, value="Market Value (INR)")
        ws.cell(row=row, column=4, value="Dividend (INR)")
        ws.cell(row=row, column=5, value="TDS (INR)")
        ws.cell(row=row, column=6, value="Profit/Loss (INR)")
        ws.cell(row=row, column=7, value="XIRR %")
        self._style_header(ws, row, 7)
        
        # Calculate XIRR for each adviser and sort by market value
        # First, add the final market value to cashflows for XIRR calculation
        for adviser_name, data in adviser_breakdown.items():
            market_for_xirr = data.get('market_for_xirr', 0)
            if market_for_xirr > 0:
                data['cashflows'].append((self.report_date, market_for_xirr))
        
        adviser_data_list = []
        for adviser_name, data in adviser_breakdown.items():
            xirr_pct = 0.0
            if data['cashflows'] and len(data['cashflows']) >= 2:
                try:
                    xirr_pct = calculate_xirr(data['cashflows']) * 100
                except:
                    xirr_pct = 0.0
            
            # Calculate profit including dividend and TDS
            profit = (data['market'] + data.get('dividend', 0) + data.get('tds', 0)) - data['cost']
            
            adviser_data_list.append({
                'name': adviser_name,
                'cost': data['cost'],
                'market': data['market'],
                'dividend': data.get('dividend', 0),
                'tds': data.get('tds', 0),
                'profit': profit,
                'xirr': xirr_pct
            })
        
        # Sort by market value descending
        sorted_advisers = sorted(adviser_data_list, key=lambda x: -x['market'])
        
        total_adviser_cost = 0
        total_adviser_market = 0
        total_adviser_dividend = 0
        total_adviser_tds = 0
        total_adviser_profit = 0
        
        for adv in sorted_advisers:
            if adv['market'] > 0 or adv['cost'] > 0:
                row += 1
                ws.cell(row=row, column=1, value=adv['name'])
                ws.cell(row=row, column=2, value=format_inr(adv['cost']))
                ws.cell(row=row, column=3, value=format_inr(adv['market']))
                ws.cell(row=row, column=4, value=format_inr(adv['dividend']))
                ws.cell(row=row, column=5, value=format_inr(adv['tds']))
                ws.cell(row=row, column=6, value=format_inr(adv['profit']))
                
                # Color code profit/loss
                if adv['profit'] >= 0:
                    ws.cell(row=row, column=6).fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
                else:
                    ws.cell(row=row, column=6).fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
                
                # XIRR column
                xirr_display = f"{adv['xirr']:.2f}%" if adv['xirr'] != 0 else "N/A"
                ws.cell(row=row, column=7, value=xirr_display)
                
                total_adviser_cost += adv['cost']
                total_adviser_market += adv['market']
                total_adviser_dividend += adv['dividend']
                total_adviser_tds += adv['tds']
                total_adviser_profit += adv['profit']
        
        # Total row for advisers
        row += 1
        ws.cell(row=row, column=1, value="Total")
        ws.cell(row=row, column=1).font = Font(bold=True)
        ws.cell(row=row, column=2, value=format_inr(total_adviser_cost))
        ws.cell(row=row, column=2).font = Font(bold=True)
        ws.cell(row=row, column=3, value=format_inr(total_adviser_market))
        ws.cell(row=row, column=3).font = Font(bold=True)
        ws.cell(row=row, column=4, value=format_inr(total_adviser_dividend))
        ws.cell(row=row, column=4).font = Font(bold=True)
        ws.cell(row=row, column=5, value=format_inr(total_adviser_tds))
        ws.cell(row=row, column=5).font = Font(bold=True)
        ws.cell(row=row, column=6, value=format_inr(total_adviser_profit))
        ws.cell(row=row, column=6).font = Font(bold=True)
        
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
            
            # Add TDS Summary section
            row += 2
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
        
        # Add XIRR Basis Holding Period Table
        row += 3
        self._add_xirr_holding_period_table(ws, row, format_inr)
        
        self._auto_width(ws)
    
    def _add_xirr_holding_period_table(self, ws, start_row: int, format_inr):
        """Add XIRR Basis Holding Period table to Summary sheet."""
        from datetime import datetime
        
        # Get active units data with holding period
        active_units = self._get_active_units_data(pan_filter=None)
        
        # Define holding period buckets
        buckets = [
            ("5+ Years", 5 * 365, float('inf')),
            ("3-5 Years", 3 * 365, 5 * 365),
            ("2-3 Years", 2 * 365, 3 * 365),
            ("1-2 Years", 1 * 365, 2 * 365),
            ("Less than 1 Year", 0, 1 * 365)
        ]
        
        # Calculate summary data for each bucket
        summary_data = []
        for bucket_name, min_days, max_days in buckets:
            bucket_units = [
                u for u in active_units 
                if min_days <= u['holding_days'] < max_days
            ]
            
            total_cost = sum(u['cost_value'] for u in bucket_units)
            total_market = sum(u['market_value'] for u in bucket_units)
            total_gain = total_market - total_cost
            gain_pct = (total_gain / total_cost * 100) if total_cost > 0 else 0
            num_holdings = len(bucket_units)
            
            # Calculate average XIRR for the bucket
            xirr_values = [u['xirr'] for u in bucket_units if u['xirr'] is not None]
            avg_xirr = sum(xirr_values) / len(xirr_values) if xirr_values else 0
            
            summary_data.append({
                'period': bucket_name,
                'num_holdings': num_holdings,
                'cost_value': total_cost,
                'market_value': total_market,
                'gain_loss': total_gain,
                'gain_loss_pct': gain_pct,
                'avg_xirr': avg_xirr
            })
        
        # Title
        row = start_row
        ws.cell(row=row, column=1, value="XIRR BASIS HOLDING PERIOD")
        ws.merge_cells(f'A{row}:G{row}')
        self._style_header(ws, row, 7)
        
        # Headers
        row += 2
        headers = [
            "Holding Period", "No. of Holdings", "Cost Value (INR)", 
            "Current Market Value (INR)", "Gain/Loss (INR)", "Gain/Loss %", "Avg XIRR %"
        ]
        
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=row, column=col, value=header)
            cell.fill = self.header_fill
            cell.font = self.header_font
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = self.thin_border
        
        # Data rows
        total_cost = 0
        total_market = 0
        total_holdings = 0
        
        for data in summary_data:
            row += 1
            ws.cell(row=row, column=1, value=data['period'])
            ws.cell(row=row, column=2, value=data['num_holdings'])
            
            ws.cell(row=row, column=3, value=format_inr(data['cost_value']))
            ws.cell(row=row, column=4, value=format_inr(data['market_value']))
            
            cell = ws.cell(row=row, column=5, value=format_inr(data['gain_loss']))
            if data['gain_loss'] < 0:
                cell.font = Font(color="FF0000")
            elif data['gain_loss'] > 0:
                cell.font = Font(color="008000")
            
            ws.cell(row=row, column=6, value=f"{data['gain_loss_pct']:.2f}%")
            
            cell = ws.cell(row=row, column=7, value=f"{data['avg_xirr']:.2f}%")
            if data['avg_xirr'] < 0:
                cell.font = Font(color="FF0000")
            elif data['avg_xirr'] > 0:
                cell.font = Font(color="008000")
            
            # Apply border to data cells
            for col in range(1, 8):
                ws.cell(row=row, column=col).border = self.thin_border
            
            total_cost += data['cost_value']
            total_market += data['market_value']
            total_holdings += data['num_holdings']
        
        # Total row
        row += 1
        ws.cell(row=row, column=1, value="GRAND TOTAL")
        ws.cell(row=row, column=1).font = Font(bold=True)
        
        ws.cell(row=row, column=2, value=total_holdings)
        ws.cell(row=row, column=2).font = Font(bold=True)
        
        ws.cell(row=row, column=3, value=format_inr(total_cost))
        ws.cell(row=row, column=3).font = Font(bold=True)
        
        ws.cell(row=row, column=4, value=format_inr(total_market))
        ws.cell(row=row, column=4).font = Font(bold=True)
        
        total_gain = total_market - total_cost
        cell = ws.cell(row=row, column=5, value=format_inr(total_gain))
        cell.font = Font(bold=True, color="008000" if total_gain >= 0 else "FF0000")
        
        total_gain_pct = (total_gain / total_cost * 100) if total_cost > 0 else 0
        ws.cell(row=row, column=6, value=f"{total_gain_pct:.2f}%")
        ws.cell(row=row, column=6).font = Font(bold=True)
        
        # Apply border to total row
        for col in range(1, 8):
            ws.cell(row=row, column=col).border = self.thin_border
    
    def _create_scheme_breakdown_sheet(self, wb: Workbook):
        """Sheet 2: Scheme-wise Breakdown - Detailed view of all schemes"""
        ws = wb.create_sheet("Scheme Wise Breakdown")
        
        # Helper function to format currency with ₹ and Indian number system
        def format_inr(amount):
            """Format amount in Indian numbering system: X,XX,XX,XXX"""
            if amount is None:
                return "₹ 0.00"
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
        
        # Headers: Removed STT, added XIRR % and Adviser at the end, added % Holdings, added PAN, added Profit
        headers = [
            "ISIN", "Scheme Name", "Folio No.", "PAN", "Total Cost Value (INR)", 
            "Balance Units", "Avg Purchase NAV", "Current NAV", 
            "Market Value (INR)", "Profit (INR)", "% Holdings", "XIRR %", "Adviser"
        ]
        
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        # Collect scheme data
        scheme_data_list = []
        total_cost = 0
        total_market = 0
        
        for folio_id, folio_data in self.parsed_data.get('folios', {}).items():
            market_value = folio_data.get('market_value', 0) or 0
            closing_balance = folio_data.get('closing_balance', 0) or 0
            cost_value = folio_data.get('cost_value', 0) or 0
            scheme_name = folio_data.get('scheme', '') or ''
            isin = folio_data.get('isin', '') or ''
            current_nav = folio_data.get('current_nav', 0) or 0
            adviser_arn = folio_data.get('advisor', '') or 'DIRECT'
            
            # Only include active holdings
            if closing_balance > 0:
                # Calculate average purchase NAV
                # Avg NAV = Total Cost / Total Units (for purchase transactions only)
                avg_nav = cost_value / closing_balance if closing_balance > 0 and cost_value > 0 else 0
                
                # Get scheme name from scheme master if available
                scheme_from_master = self._get_scheme_name_from_master(isin, scheme_name)
                
                # Get adviser display name
                adviser_display = self._get_advisor_name(adviser_arn, scheme_from_master)
                
                # Calculate XIRR for this scheme
                xirr_pct = 0.0
                cashflows = []
                
                for trans in folio_data.get('transactions', []):
                    if trans.get('is_nft') or trans.get('is_pledge'):
                        continue
                    if trans.get('transaction_type') in ['STT Paid', 'Stamp Duty']:
                        continue
                    
                    try:
                        trans_date = datetime.strptime(trans.get('date', ''), '%d-%b-%Y')
                        trans_amount = trans.get('amount', 0) or 0
                        if trans_amount > 0:
                            if trans.get('is_redemption'):
                                cashflows.append((trans_date, trans_amount))
                            else:
                                cashflows.append((trans_date, -trans_amount))
                    except (ValueError, TypeError):
                        pass
                
                # Add current value as final inflow for XIRR
                if market_value > 0:
                    cashflows.append((self.report_date, market_value))
                
                # Calculate XIRR
                if len(cashflows) >= 2:
                    try:
                        xirr_pct = calculate_xirr(cashflows) * 100
                    except:
                        xirr_pct = 0.0
                
                scheme_data_list.append({
                    'folio': folio_data.get('folio', folio_id),
                    'pan': folio_data.get('pan', ''),
                    'scheme': scheme_from_master,
                    'isin': isin,
                    'cost': cost_value,
                    'units': closing_balance,
                    'avg_nav': avg_nav,
                    'current_nav': current_nav,
                    'market': market_value,
                    'xirr': xirr_pct,
                    'adviser': adviser_display
                })
                
                total_cost += cost_value
                total_market += market_value
        
        # Sort by market value descending
        sorted_schemes = sorted(scheme_data_list, key=lambda x: -x['market'])
        
        # Write data rows
        row = 2
        for data in sorted_schemes:
            ws.cell(row=row, column=1, value=data['isin'])
            
            # Truncate scheme name if too long
            scheme_display = data['scheme'][:80] if len(data['scheme']) > 80 else data['scheme']
            ws.cell(row=row, column=2, value=scheme_display)
            ws.cell(row=row, column=3, value=data['folio'])
            ws.cell(row=row, column=4, value=data['pan'])
            
            # Total Cost Value
            cell = ws.cell(row=row, column=5, value=data['cost'])
            cell.number_format = '#,##0.00'
            
            # Balance Units
            cell = ws.cell(row=row, column=6, value=round(data['units'], 3))
            cell.number_format = '#,##0.000'
            
            # Avg Purchase NAV
            cell = ws.cell(row=row, column=7, value=round(data['avg_nav'], 4))
            cell.number_format = '#,##0.0000'
            
            # Current NAV
            cell = ws.cell(row=row, column=8, value=round(data['current_nav'], 4))
            cell.number_format = '#,##0.0000'
            
            # Market Value
            cell = ws.cell(row=row, column=9, value=data['market'])
            cell.number_format = '#,##0.00'
            
            # Profit (Market Value - Cost Value)
            profit = data['market'] - data['cost']
            cell = ws.cell(row=row, column=10, value=profit)
            cell.number_format = '#,##0.00'
            # Color negative profits in red
            if profit < 0:
                cell.font = Font(color="FF0000")
            elif profit > 0:
                cell.font = Font(color="008000")
            
            # % Holdings - percentage of total market value
            pct_holdings = (data['market'] / total_market * 100) if total_market > 0 else 0
            cell = ws.cell(row=row, column=11, value=round(pct_holdings, 2))
            cell.number_format = '0.00"%"'
            
            # XIRR %
            xirr_display = f"{data['xirr']:.2f}%" if data['xirr'] != 0 else "N/A"
            ws.cell(row=row, column=12, value=xirr_display)
            
            # Adviser
            ws.cell(row=row, column=13, value=data['adviser'])
            
            row += 1
        
        # Total row
        ws.cell(row=row, column=1, value="Total")
        ws.cell(row=row, column=1).font = Font(bold=True)
        
        cell = ws.cell(row=row, column=5, value=total_cost)
        cell.number_format = '#,##0.00'
        cell.font = Font(bold=True)
        
        cell = ws.cell(row=row, column=9, value=total_market)
        cell.number_format = '#,##0.00'
        cell.font = Font(bold=True)
        
        # Total Profit
        total_profit = total_market - total_cost
        cell = ws.cell(row=row, column=10, value=total_profit)
        cell.number_format = '#,##0.00'
        cell.font = Font(bold=True)
        if total_profit < 0:
            cell.font = Font(bold=True, color="FF0000")
        elif total_profit > 0:
            cell.font = Font(bold=True, color="008000")
        
        # Total % Holdings = 100%
        cell = ws.cell(row=row, column=11, value=100.00)
        cell.number_format = '0.00"%"'
        cell.font = Font(bold=True)
        
        self._auto_width(ws)
    

    def _create_folio_cards_sheet(self, wb: Workbook):
        """Sheet: Folio Details - Table format view of all folios with detailed info"""
        ws = wb.create_sheet("Folio Details")
        
        # Define headers - ISIN first, up to PAN Status only
        headers = [
            "ISIN", "Scheme Name", "AMC Name", "Folio No", "PAN", "KYC", "PAN Status"
        ]
        
        # Write headers
        for col, header in enumerate(headers, 1):
            ws.cell(row=1, column=col, value=header)
        self._style_header(ws, 1, len(headers))
        
        # Write data rows
        row = 2
        for folio_key, folio_data in self.parsed_data.get('folios', {}).items():
            # Get scheme name from master using ISIN
            isin = folio_data.get('isin', '')
            scheme_from_master = self._get_scheme_name_from_master(isin, folio_data.get('scheme', ''))
            
            # Row data - up to PAN Status only
            row_data = [
                isin,
                scheme_from_master,
                folio_data.get('amc', ''),
                folio_data.get('folio', ''),
                folio_data.get('pan', ''),
                folio_data.get('kyc_status', ''),
                folio_data.get('pan_status', '')
            ]
            
            for col, value in enumerate(row_data, 1):
                ws.cell(row=row, column=col, value=value)
            
            row += 1
        
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
            
            ws.cell(row=row, column=1, value=scheme_name if scheme_name else '')
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
