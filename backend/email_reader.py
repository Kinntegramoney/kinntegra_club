"""
Email Reader Module for Processing Repayment Notifications
Reads emails from updates@kinntegraa.club and extracts repayment data
"""

import imaplib
import email
from email.header import decode_header
from bs4 import BeautifulSoup
import re
import os
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional
import asyncio
import uuid
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

def name_similarity(name1: str, name2: str) -> float:
    """Calculate similarity ratio between two names (0.0 to 1.0)"""
    if not name1 or not name2:
        return 0.0
    # Normalize names: lowercase, strip, remove extra spaces
    n1 = ' '.join(name1.lower().strip().split())
    n2 = ' '.join(name2.lower().strip().split())
    return SequenceMatcher(None, n1, n2).ratio()


def get_working_day_range(target_date: datetime, days_tolerance: int = 3) -> List[str]:
    """
    Get a list of dates within ±N working days of the target date.
    Working days exclude Saturday (5) and Sunday (6).
    
    Args:
        target_date: The reference date
        days_tolerance: Number of working days to include on each side
    
    Returns:
        List of date strings in YYYY-MM-DD format
    """
    date_list = [target_date.strftime('%Y-%m-%d')]
    
    # Go forward N working days
    count = 0
    current = target_date
    while count < days_tolerance:
        current = current + timedelta(days=1)
        # Skip weekends (Saturday=5, Sunday=6)
        if current.weekday() < 5:  # Monday=0 to Friday=4
            date_list.append(current.strftime('%Y-%m-%d'))
            count += 1
        # Also add weekend dates in case payment was recorded on weekend
        elif count < days_tolerance:
            date_list.append(current.strftime('%Y-%m-%d'))
    
    # Go backward N working days
    count = 0
    current = target_date
    while count < days_tolerance:
        current = current - timedelta(days=1)
        # Skip weekends
        if current.weekday() < 5:
            date_list.append(current.strftime('%Y-%m-%d'))
            count += 1
        # Also add weekend dates
        elif count < days_tolerance:
            date_list.append(current.strftime('%Y-%m-%d'))
    
    return list(set(date_list))  # Remove duplicates

# Email configuration
IMAP_SERVER = os.environ.get('EMAIL_IMAP_SERVER', 'mail.kinntegraa.club')
IMAP_PORT = int(os.environ.get('EMAIL_IMAP_PORT', 993))
EMAIL_ADDRESS = os.environ.get('EMAIL_ADDRESS', 'updates@kinntegraa.club')
EMAIL_PASSWORD = os.environ.get('EMAIL_PASSWORD', '')

class RepaymentEmailReader:
    """Reads and parses repayment notification emails"""
    
    def __init__(self):
        self.imap = None
        self.connected = False
    
    def connect(self) -> bool:
        """Connect to IMAP server"""
        try:
            self.imap = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
            self.imap.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
            self.connected = True
            logger.info(f"Connected to email server: {IMAP_SERVER}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to email server: {e}")
            self.connected = False
            return False
    
    def disconnect(self):
        """Disconnect from IMAP server"""
        if self.imap:
            try:
                self.imap.logout()
            except:
                pass
            self.connected = False
    
    def fetch_repayment_emails(self, days_back: int = 7, folder: str = None) -> List[Dict]:
        """
        Fetch repayment notification emails from the last N days
        Subject line pattern: 'altGraaf | Returns Initiated - '
        Searches in INBOX.Altgraaf.Repayments folder by default
        """
        if not self.connected:
            if not self.connect():
                return []
        
        emails_data = []
        
        try:
            # Use the exact folder path from the mail server
            target_folder = folder or 'INBOX.Altgraaf.Repayments'
            
            try:
                status, _ = self.imap.select(target_folder)
                if status != 'OK':
                    logger.error(f"Could not select folder: {target_folder}")
                    # Fallback to INBOX
                    self.imap.select('INBOX')
                else:
                    logger.info(f"Successfully selected folder: {target_folder}")
            except Exception as e:
                logger.error(f"Error selecting folder {target_folder}: {e}")
                self.imap.select('INBOX')
            
            # Calculate date range
            since_date = (datetime.now() - timedelta(days=days_back)).strftime('%d-%b-%Y')
            
            # Search for emails with specific subject pattern
            search_criteria = f'(SINCE "{since_date}" SUBJECT "altGraaf | Returns Initiated")'
            status, messages = self.imap.search(None, search_criteria)
            
            if status != 'OK':
                logger.error("Failed to search emails")
                return []
            
            email_ids = messages[0].split()
            logger.info(f"Found {len(email_ids)} repayment emails")
            
            for email_id in email_ids:
                try:
                    # Fetch email
                    status, msg_data = self.imap.fetch(email_id, '(RFC822)')
                    if status != 'OK':
                        continue
                    
                    # Parse email
                    raw_email = msg_data[0][1]
                    msg = email.message_from_bytes(raw_email)
                    
                    # Get subject
                    subject, encoding = decode_header(msg['Subject'])[0]
                    if isinstance(subject, bytes):
                        subject = subject.decode(encoding or 'utf-8')
                    
                    # Get date - log raw date for debugging
                    email_date = msg['Date']
                    logger.debug(f"Raw email date header: {email_date}")
                    
                    # Get email body (HTML)
                    html_body = self._get_html_body(msg)
                    
                    if html_body:
                        # Parse repayment details from HTML
                        repayment_data = self._parse_repayment_email(html_body, subject, email_date)
                        if repayment_data:
                            repayment_data['email_id'] = email_id.decode()
                            repayment_data['raw_subject'] = subject
                            repayment_data['raw_email_date'] = email_date  # Keep raw date for reference
                            emails_data.append(repayment_data)
                
                except Exception as e:
                    logger.error(f"Error processing email {email_id}: {e}")
                    continue
            
        except Exception as e:
            logger.error(f"Error fetching emails: {e}")
        
        return emails_data
    
    def _get_html_body(self, msg) -> Optional[str]:
        """Extract HTML body from email message"""
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                if content_type == 'text/html':
                    try:
                        return part.get_payload(decode=True).decode('utf-8')
                    except:
                        return part.get_payload(decode=True).decode('latin-1')
        else:
            if msg.get_content_type() == 'text/html':
                return msg.get_payload(decode=True).decode('utf-8')
        return None
    
    def _parse_repayment_email(self, html_body: str, subject: str, email_date: str) -> Optional[Dict]:
        """
        Parse repayment details from email HTML body
        Extracts: client name, bond name, opportunity ID, amounts, dates
        """
        try:
            soup = BeautifulSoup(html_body, 'html.parser')
            text = soup.get_text(separator='\n')
            
            # Extract Opportunity ID from subject or body
            # Pattern: CD followed by letters and digits (e.g., CDNRE001, CDUCIC01, CDHBP001)
            # Supports 2-7 letters followed by 1-5 digits
            opportunity_match = re.search(r'(CD[A-Z]{1,6}\d{1,5})', subject) or re.search(r'(CD[A-Z]{1,6}\d{1,5})', text)
            opportunity_id = opportunity_match.group(1) if opportunity_match else None
            
            # Extract company name from subject (after "Returns Initiated - ")
            subject_company_match = re.search(r'Returns Initiated\s*-\s*(.+)$', subject, re.IGNORECASE)
            company_from_subject = subject_company_match.group(1).strip().replace('\r', '').replace('\n', ' ') if subject_company_match else None
            
            # Extract client name (Dear <Name>)
            # Handle various formats: "Dear Name,", "Dear Name\n", "Dear Mr. Name", "Dear Name (huf)," etc.
            client_match = re.search(r'Dear\s+(?:Mr\.?\s+|Mrs\.?\s+|Ms\.?\s+)?([A-Za-z][A-Za-z\s\.\(\)]+?)(?:[\n\r,]|$)', text)
            if not client_match:
                # Try alternative pattern for "Hi Name" or "Hello Name"
                client_match = re.search(r'(?:Hi|Hello)\s+([A-Za-z][A-Za-z\s]+?)(?:[\n\r,]|$)', text)
            
            # Clean up client name - remove trailing (huf), (HUF), etc.
            client_name = client_match.group(1).strip() if client_match else None
            if client_name:
                # Remove (huf), (HUF), etc. from end of name
                client_name = re.sub(r'\s*\([^)]*\)\s*$', '', client_name).strip()
            
            # Log for debugging
            if client_name:
                logger.info(f"Extracted client name from email: {client_name}")
            else:
                # Log first 200 chars of text for debugging
                logger.warning(f"Could not extract client name from email. Text starts with: {text[:200]}")
            
            # Extract company/bond name from body
            company_match = re.search(r'investment\s+in\s+([A-Za-z\s&]+(?:Pvt|Private|Ltd|Limited)[A-Za-z\s]*)', text, re.IGNORECASE)
            company_name = company_match.group(1).strip() if company_match else company_from_subject
            
            # Extract repayment date
            date_match = re.search(r'Repayment\s+Date[:\s]*([A-Za-z]+\s+\d{1,2}[,\s]+\d{4})', text, re.IGNORECASE)
            repayment_date = None
            if date_match:
                try:
                    date_str = date_match.group(1).replace(',', '')
                    repayment_date = datetime.strptime(date_str, '%b %d %Y').strftime('%Y-%m-%d')
                except:
                    pass
            
            # Extract amounts using regex patterns
            def extract_amount(pattern, text):
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    amount_str = match.group(1).replace(',', '').replace(' ', '')
                    try:
                        return float(amount_str)
                    except:
                        pass
                return None  # Return None instead of 0.0 to distinguish "not found" from "actually zero"
            
            # Total Gross Amount Repaid - try multiple patterns
            gross_amount = extract_amount(r'Total\s+Gross\s+Amount\s+Repaid[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)', text)
            if gross_amount is None:
                gross_amount = extract_amount(r'Gross\s+Amount[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)', text)
            if gross_amount is None:
                gross_amount = 0.0
            
            # Principal - try multiple patterns
            principal = extract_amount(r'Principal[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)', text)
            if principal is None:
                principal = extract_amount(r'Principal\s+Amount[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)', text)
            if principal is None:
                principal = 0.0
            
            # Interest - try multiple patterns
            interest = extract_amount(r'Interest[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)', text)
            if interest is None:
                interest = extract_amount(r'Interest\s+Amount[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)', text)
            if interest is None:
                interest = 0.0
            
            # Net Amount Repaid (Net of TDS) - try multiple patterns
            net_amount = extract_amount(r'Net\s+Amount\s+Repaid[:\s]*(?:\(Net\s+of\s+TDS\*?\))?[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)', text)
            if net_amount is None:
                net_amount = extract_amount(r'Net\s+Amount[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)', text)
            if net_amount is None:
                net_amount = 0.0
            
            # Calculate TDS if we have gross and net
            tds_amount = gross_amount - net_amount if gross_amount > 0 and net_amount > 0 else 0.0
            
            # Validation: If principal + interest don't add up to gross, recalculate
            if principal > 0 and interest > 0:
                calculated_gross = principal + interest
                # If parsed gross differs significantly from calculated, use calculated
                if abs(calculated_gross - gross_amount) > 1:
                    logger.warning(f"Gross amount mismatch: parsed={gross_amount}, calculated={calculated_gross}. Using calculated.")
                    gross_amount = calculated_gross
            
            # If we have gross but no breakdown, try to infer
            if gross_amount > 0 and principal == 0 and interest == 0:
                # Can't determine breakdown, leave as is
                logger.warning(f"No principal/interest breakdown found for gross amount {gross_amount}")
            
            # Parse email date - preserve the exact time shown in the email header without timezone conversion
            # User wants to see the same time as shown in their email client
            normalized_email_date = email_date
            try:
                # Extract date components directly from the email date string
                # Format: "Sun, 23 Feb 2026 16:36:00 +0000" or "Sun, 23 Feb 2026 20:36:00 +0530"
                date_match = re.search(r'(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})', email_date)
                if date_match:
                    day, month, year, hour, minute = date_match.groups()
                    month_map = {'Jan':'01','Feb':'02','Mar':'03','Apr':'04','May':'05','Jun':'06',
                                'Jul':'07','Aug':'08','Sep':'09','Oct':'10','Nov':'11','Dec':'12'}
                    normalized_email_date = f"{year}-{month_map.get(month,'01')}-{day.zfill(2)} {hour.zfill(2)}:{minute}"
                else:
                    # Fallback
                    from email.utils import parsedate_to_datetime
                    parsed_dt = parsedate_to_datetime(email_date)
                    normalized_email_date = parsed_dt.strftime('%Y-%m-%d %H:%M')
            except Exception as e:
                logger.warning(f"Could not parse email date '{email_date}': {e}")
            
            return {
                'opportunity_id': opportunity_id,
                'client_name': client_name,
                'company_name': company_name,
                'repayment_date': repayment_date,
                'gross_amount': gross_amount,
                'principal': principal,
                'interest': interest,
                'tds_amount': tds_amount,
                'net_amount': net_amount,
                'email_date': normalized_email_date,
                'parsed_at': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error parsing email body: {e}")
            return None
    
    def mark_as_processed(self, email_id: str):
        """Mark email as processed by adding a flag or moving to folder"""
        try:
            if self.connected:
                # Add a custom flag or move to processed folder
                self.imap.store(email_id.encode(), '+FLAGS', '\\Seen')
        except Exception as e:
            logger.error(f"Error marking email as processed: {e}")


async def process_repayment_emails(db, days_back: int = 7, force_reprocess: bool = False) -> Dict:
    """
    Main function to process repayment emails and update cashflows
    Args:
        db: Database connection
        days_back: Number of days to look back for emails
        force_reprocess: If True, re-process emails even if already read
    Returns summary of processed emails
    """
    reader = RepaymentEmailReader()
    results = {
        'total_emails': 0,
        'processed': 0,
        'matched': 0,
        'holdings_updated': 0,
        'actual_repayments_created': 0,
        'errors': [],
        'details': []
    }
    
    try:
        if not reader.connect():
            results['errors'].append('Failed to connect to email server')
            return results
        
        emails = reader.fetch_repayment_emails(days_back)
        results['total_emails'] = len(emails)
        
        for email_data in emails:
            try:
                # Find matching bond by opportunity_id
                opportunity_id = email_data.get('opportunity_id')
                company_name = email_data.get('company_name')
                client_name = email_data.get('client_name')
                
                # Debug logging
                logger.info(f"Processing email: opp_id={opportunity_id}, company={company_name}, client_name={repr(client_name)}")
                
                # Look up bond by opportunity_id (bond code) or company name
                search_criteria = []
                if opportunity_id:
                    search_criteria.extend([
                        {'id': opportunity_id},
                        {'bond_code': opportunity_id},
                        {'name': {'$regex': opportunity_id, '$options': 'i'}}
                    ])
                if company_name:
                    # Create regex patterns for company name matching
                    # Handle variations like "UC INCLUSIVE CREDIT" vs "Uc Inclusive Credit Private Limited"
                    company_words = company_name.upper().split()[:3]  # Take first 3 words
                    if company_words:
                        company_pattern = '.*'.join(company_words)
                        search_criteria.append({'name': {'$regex': company_pattern, '$options': 'i'}})
                
                if not search_criteria:
                    results['errors'].append("No opportunity ID or company name found in email")
                    continue
                
                bond = await db.Ncd_Master.find_one({'$or': search_criteria})
                
                if not bond:
                    results['errors'].append(f"Bond not found for: {opportunity_id or company_name}")
                    continue
                
                bond_id = bond.get('id')
                repayment_date = email_data.get('repayment_date')
                
                # Try to find client by name matching using 95% similarity
                client = None
                client_id = None
                matched_client_name = None
                match_similarity = 0
                
                if client_name:
                    # Get all clients and find best match with 95%+ similarity
                    all_clients = await db.Private_Investor.find({}, {'_id': 0, 'id': 1, 'name': 1, 'pan_number': 1}).to_list(1000)
                    
                    best_match = None
                    best_similarity = 0
                    
                    for c in all_clients:
                        c_name = c.get('name', '')
                        similarity = name_similarity(client_name, c_name)
                        if similarity > best_similarity:
                            best_similarity = similarity
                            best_match = c
                    
                    # Accept match if 95%+ similar
                    if best_match and best_similarity >= 0.95:
                        client = best_match
                        client_id = client.get('id')
                        matched_client_name = client.get('name')
                        match_similarity = best_similarity
                        logger.info(f"Client matched: '{client_name}' -> '{matched_client_name}' ({best_similarity:.1%} similarity)")
                    else:
                        # Store best match even if below threshold for display
                        if best_match and best_similarity > 0.5:
                            matched_client_name = best_match.get('name')
                            match_similarity = best_similarity
                        logger.warning(f"No client match >= 95% for '{client_name}'. Best: {best_similarity:.1%}")
                
                # Try to find matching trade by comparing email amount against expected cashflows
                matched_trade = None
                matched_trade_id = None
                matched_trade_date = None
                matched_trade_units = 0
                
                gross_amount = email_data.get('gross_amount', 0)
                principal_from_email = email_data.get('principal', 0)
                interest_from_email = email_data.get('interest', 0)
                repayment_date = email_data.get('repayment_date')
                repayment_year_month = repayment_date[:7] if repayment_date else ''
                
                # Determine if this is a prepayment (principal only, no interest)
                is_prepayment = principal_from_email > 0 and (not interest_from_email or interest_from_email == 0)
                
                # STRATEGY: Match trade by expected cashflows
                # IMPORTANT: Only search trades for matched client
                # Only search ALL trades if client_name from email is empty
                if bond_id:
                    if client_id:
                        # Client matched - search their trades only
                        trades = await db.Ncd_Investment_Details.find({
                            "client_id": client_id,
                            "bond_id": bond_id,
                            "status": {"$ne": "cancelled"}
                        }, {"_id": 0}).to_list(100)
                    elif not client_name:
                        # No client name in email - search ALL trades to identify client
                        trades = await db.Ncd_Investment_Details.find({
                            "bond_id": bond_id,
                            "status": {"$ne": "cancelled"}
                        }, {"_id": 0}).to_list(500)
                    else:
                        # Client name exists but no match found - don't auto-match
                        # User will need to manually select the client
                        trades = []
                    
                    # For regular repayments (not prepayments):
                    # Match by comparing email gross_amount against expected cashflow amounts for each trade
                    if not is_prepayment and gross_amount > 0:
                        for trade in trades:
                            trade_units = trade.get('units', 0)
                            if trade_units <= 0:
                                continue
                            
                            # Get expected cashflows for this trade from holding_cashflows
                            trade_cashflows = await db.holding_cashflows.find({
                                "trade_id": trade.get('id'),
                                "is_repaid": {"$ne": True}
                            }, {"_id": 0}).to_list(100)
                            
                            # Also try to get from bond's cashflows_per_unit if holding_cashflows not found
                            if not trade_cashflows:
                                bond_data = await db.Ncd_Master.find_one({"id": bond_id}, {"_id": 0, "cashflows_per_unit": 1})
                                if bond_data and bond_data.get('cashflows_per_unit'):
                                    for cf in bond_data['cashflows_per_unit']:
                                        # Calculate expected amount for this trade's units
                                        interest_per_unit = cf.get('interest_per_unit', 0)
                                        principal_per_unit = cf.get('principal_per_unit', 0)
                                        expected_gross = (interest_per_unit + principal_per_unit) * trade_units
                                        trade_cashflows.append({
                                            'date': cf.get('date', '')[:10],
                                            'gross_amount': round(expected_gross, 2),
                                            'net_amount': round(expected_gross - (interest_per_unit * trade_units * 0.1), 2)
                                        })
                            
                            # Match email amount against expected cashflows with ₹1 tolerance
                            for cf in trade_cashflows:
                                cf_date = str(cf.get('date', ''))[:10]
                                cf_year_month = cf_date[:7] if cf_date else ''
                                expected_gross = cf.get('gross_amount', 0)
                                
                                # Check if amounts match within ₹1 tolerance AND same month
                                gross_match = abs(gross_amount - expected_gross) <= 1
                                month_match = cf_year_month == repayment_year_month if repayment_year_month else True
                                
                                if gross_match and month_match:
                                    matched_trade = trade
                                    matched_trade_id = trade.get('id')
                                    matched_trade_date = str(trade.get('investment_date', ''))[:10]
                                    matched_trade_units = trade_units
                                    
                                    # If client was unknown, now we found them from the trade!
                                    if not client_id and trade.get('client_id'):
                                        client_id = trade.get('client_id')
                                        # Get the client details
                                        matched_client = await db.Private_Investor.find_one({"id": client_id}, {"_id": 0})
                                        if matched_client:
                                            matched_client_name = matched_client.get('name')
                                            match_similarity = 1.0  # Perfect match by amount
                                            logger.info(f"Client identified from trade by amount match: {matched_client_name}")
                                    
                                    logger.info(f"Trade matched by expected cashflow: {gross_amount} ≈ {expected_gross} for trade {matched_trade_date} with {trade_units} units")
                                    break
                            
                            if matched_trade:
                                break
                    
                    # For single trade or prepayments, use simple fallback (only if client is known)
                    if not matched_trade and trades and client_id:
                        client_trades = [t for t in trades if t.get('client_id') == client_id]
                        if len(client_trades) == 1:
                            # Only one trade for this client - use it
                            matched_trade = client_trades[0]
                            matched_trade_id = matched_trade.get('id')
                            matched_trade_date = str(matched_trade.get('investment_date', ''))[:10]
                            matched_trade_units = matched_trade.get('units', 0)
                        elif is_prepayment and client_trades:
                            # Prepayment with multiple trades - will need manual selection
                            logger.warning(f"Prepayment with multiple trades for client {client_id}, bond {bond_id} - requires manual assignment")
                        elif client_trades:
                            # No match found for regular repayment - use first trade as fallback
                            matched_trade = client_trades[0]
                            matched_trade_id = matched_trade.get('id')
                            matched_trade_date = str(matched_trade.get('investment_date', ''))[:10]
                            matched_trade_units = matched_trade.get('units', 0)
                            logger.warning(f"No exact cashflow match for {gross_amount}, defaulting to first trade")
                    
                    # NEW: For prepayments when client is unknown, try to match by unit calculation
                    # Prepayment amount / units = per-unit value (should be a clean integer)
                    # We look for a trade where: prepayment_amount / trade_units is a clean integer
                    if not matched_trade and is_prepayment and gross_amount > 0:
                        for trade in trades:
                            trade_units = trade.get('units', 0)
                            if trade_units <= 0:
                                continue
                            
                            # Calculate per-unit prepayment value
                            per_unit_value = gross_amount / trade_units
                            
                            # Check if it's a clean integer (within 0.01 tolerance)
                            is_clean_integer = abs(per_unit_value - round(per_unit_value)) < 0.01
                            
                            if is_clean_integer:
                                matched_trade = trade
                                matched_trade_id = trade.get('id')
                                matched_trade_date = str(trade.get('investment_date', ''))[:10]
                                matched_trade_units = trade_units
                                
                                # If client was unknown, now we found them
                                if not client_id and trade.get('client_id'):
                                    client_id = trade.get('client_id')
                                    matched_client = await db.Private_Investor.find_one({"id": client_id}, {"_id": 0})
                                    if matched_client:
                                        matched_client_name = matched_client.get('name')
                                        match_similarity = 1.0
                                        logger.info(f"Client identified from prepayment: {matched_client_name} (units: {trade_units}, per-unit: {round(per_unit_value)})")
                                
                                logger.info(f"Prepayment matched: {gross_amount} / {trade_units} = {round(per_unit_value)} (clean integer)")
                                break
                
                # Create email read log entry
                email_log_id = str(uuid.uuid4())
                email_read_at = datetime.now(timezone.utc)
                holding_updated = False
                holding_updated_at = None
                cashflows_count = 0
                
                # Find matching cashflows by bond_id and date (with ±3 WORKING days tolerance)
                if repayment_date:
                    # Parse the repayment date
                    try:
                        repay_dt = datetime.strptime(repayment_date, '%Y-%m-%d')
                    except:
                        repay_dt = None
                    
                    # Build date range for matching (±3 working days tolerance)
                    if repay_dt:
                        date_patterns = get_working_day_range(repay_dt, days_tolerance=3)
                    else:
                        date_patterns = [repayment_date]
                    
                    # Build regex pattern for date range
                    date_regex_pattern = '|'.join([f'^{d}' for d in date_patterns])
                    
                    # Update cashflows for this date range
                    update_result = await db.holding_cashflows.update_many(
                        {
                            'bond_id': bond_id,
                            'date': {'$regex': date_regex_pattern},
                            'is_repaid': {'$ne': True}  # Only update if not already repaid
                        },
                        {
                            '$set': {
                                'is_repaid': True,
                                'repaid_date': repayment_date,
                                'repaid_actual_amount': email_data.get('gross_amount'),  # Use GROSS amount for XIRR calculation
                                'repaid_net_amount': email_data.get('net_amount'),  # Store net amount separately for display
                                'repaid_tds': email_data.get('tds_amount'),  # Store TDS amount
                                'email_processed': True,
                                'email_processed_at': datetime.now().isoformat(),
                                'email_data': email_data,
                                'email_log_id': email_log_id
                            }
                        }
                    )
                    
                    if update_result.modified_count > 0:
                        results['matched'] += 1
                        results['holdings_updated'] += update_result.modified_count
                        holding_updated = True
                        holding_updated_at = datetime.now(timezone.utc)
                        cashflows_count = update_result.modified_count
                        
                        # Create actual_repayment records for each trade that has this bond
                        # This ensures the repaid amounts show up in Holdings Report
                        
                        # Build trade query - if we have client_id, use it; otherwise find by bond only
                        trade_query = {
                            "bond_id": bond_id,
                            "status": {"$ne": "cancelled"}
                        }
                        if client_id:
                            trade_query["client_id"] = client_id
                        
                        trades = await db.Ncd_Investment_Details.find(trade_query, {"_id": 0}).to_list(100)
                        
                        # If no client_id but we found trades, use their client_ids
                        # NOTE: actual_repayments are NO LONGER created automatically
                        # They will be created when user approves the email log entry
                        # The matched_trade info is stored in the email_log for display
                        
                        results['details'].append({
                            'bond_name': bond.get('name'),
                            'bond_id': bond_id,
                            'repayment_date': repayment_date,
                            'gross_amount': email_data.get('gross_amount'),
                            'net_amount': email_data.get('net_amount'),
                            'cashflows_updated': update_result.modified_count,
                            'client_name': client.get('name') if client else client_name,
                            'client_id': client_id
                        })
                
                # Log individual email read entry with matched client/trade info
                email_log_entry = {
                    'id': email_log_id,
                    'email_from': 'altGraaf',
                    'email_subject': email_data.get('raw_subject', ''),
                    'email_date': email_data.get('email_date'),
                    'email_read_at': email_read_at.isoformat(),
                    'client_id': client_id,
                    'client_name': client_name,  # Original name from email
                    'client_pan': client.get('pan_number') if client else None,
                    'matched_client_id': client_id,
                    'matched_client_name': matched_client_name,
                    'match_similarity': match_similarity,
                    'matched_trade_id': matched_trade_id,
                    'matched_trade_date': matched_trade_date,
                    'matched_trade_units': matched_trade_units,
                    'bond_id': bond_id,
                    'bond_name': bond.get('name'),
                    'bond_code': bond.get('bond_code') or opportunity_id,
                    'repayment_date': repayment_date,
                    'gross_amount': email_data.get('gross_amount'),
                    'principal': email_data.get('principal'),
                    'interest': email_data.get('interest'),
                    'net_amount': email_data.get('net_amount'),
                    'tds_amount': email_data.get('tds_amount'),
                    'approved': False,  # Requires approval before creating actual_repayment
                    'holding_updated': holding_updated,
                    'holding_updated_at': holding_updated_at.isoformat() if holding_updated_at else None,
                    'cashflows_updated_count': cashflows_count,
                    'created_at': datetime.now(timezone.utc).isoformat(),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }
                await db.email_read_logs.insert_one(email_log_entry)
                
                results['processed'] += 1
                reader.mark_as_processed(email_data.get('email_id', ''))
                
            except Exception as e:
                results['errors'].append(f"Error processing email: {str(e)}")
        
        # Log processed emails
        await db.email_processing_logs.insert_one({
            'processed_at': datetime.now().isoformat(),
            'results': results
        })
        
    except Exception as e:
        results['errors'].append(f"Processing error: {str(e)}")
        logger.error(f"Email processing error: {e}")
    
    finally:
        reader.disconnect()
    
    return results



async def reprocess_email_logs(db, days_back: int = 30) -> Dict:
    """
    Re-process existing email_read_logs that are missing actual_repayments.
    This creates actual_repayments for emails that were read but didn't have
    repayment records created.
    """
    results = {
        'total_logs': 0,
        'processed': 0,
        'actual_repayments_created': 0,
        'skipped': 0,
        'errors': []
    }
    
    try:
        # Get email_read_logs that don't have actual_repayments
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_back)
        
        # Find all email_read_logs
        email_logs = await db.email_read_logs.find({
            "created_at": {"$gte": cutoff_date.isoformat()}
        }, {"_id": 0}).to_list(10000)
        
        results['total_logs'] = len(email_logs)
        
        for log in email_logs:
            try:
                log_id = log.get('id')
                bond_id = log.get('bond_id')
                client_id = log.get('client_id')
                client_name = log.get('client_name', '')
                repayment_date = log.get('repayment_date')
                gross_amount = log.get('gross_amount', 0)
                principal = log.get('principal', 0)
                interest = log.get('interest', 0)
                net_amount = log.get('net_amount', gross_amount)
                tds = log.get('tds_amount', 0)
                
                if not bond_id or not repayment_date or not gross_amount:
                    results['skipped'] += 1
                    continue
                
                # Check if actual_repayments already exist for this email_log
                existing = await db.actual_repayments.find_one({"email_log_id": log_id})
                if existing:
                    results['skipped'] += 1
                    continue
                
                # If client_id is missing, try to find by client_name using 95% similarity
                if not client_id and client_name:
                    # Get all clients and find best match with 95%+ similarity
                    clients = await db.Private_Investor.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
                    
                    best_match = None
                    best_similarity = 0
                    
                    for cl in clients:
                        cl_name = cl.get('name', '')
                        similarity = name_similarity(client_name, cl_name)
                        if similarity > best_similarity:
                            best_similarity = similarity
                            best_match = cl
                    
                    # Accept match if 95%+ similar
                    if best_match and best_similarity >= 0.95:
                        client_id = best_match.get('id')
                        logger.info(f"Reprocess: Client matched '{client_name}' -> '{best_match.get('name')}' ({best_similarity:.1%})")
                
                if not client_id:
                    results['skipped'] += 1
                    results['errors'].append(f"No client match for: {client_name}")
                    continue
                
                # Get trades for this bond/client
                trades = await db.Ncd_Investment_Details.find({
                    "bond_id": bond_id,
                    "client_id": client_id,
                    "status": {"$ne": "cancelled"}
                }, {"_id": 0}).to_list(100)
                
                if not trades:
                    # Try matching by bond_id only and checking client names in trades with 95% similarity
                    all_trades = await db.Ncd_Investment_Details.find({
                        "bond_id": bond_id,
                        "status": {"$ne": "cancelled"}
                    }, {"_id": 0}).to_list(100)
                    
                    for trade in all_trades:
                        trade_client = trade.get('client_name', '')
                        similarity = name_similarity(client_name, trade_client)
                        if similarity >= 0.95:
                            trades.append(trade)
                            if not client_id:
                                client_id = trade.get('client_id')
                
                if not trades:
                    results['skipped'] += 1
                    continue
                
                # Get bond info for expected cashflows
                bond = await db.Ncd_Master.find_one({"id": bond_id}, {"_id": 0})
                expected_cashflows = bond.get('cashflows', []) if bond else []
                
                # Build lookup for expected amounts by date and by pre-decimal amount + month
                expected_by_date = {}
                expected_by_amount_month = {}  # Map (integer amount, year-month) for same-month matching
                for cf in expected_cashflows:
                    cf_date = str(cf.get('date', ''))[:10] if cf.get('date') else ''
                    cf_net = cf.get('net_amount', 0) or cf.get('amount', 0) or 0
                    if cf_date and cf_net:
                        expected_by_date[cf_date] = cf_net
                        # Index by integer amount AND year-month for fuzzy matching (same month only)
                        amount_int = int(cf_net)
                        year_month = cf_date[:7]  # YYYY-MM
                        key = (amount_int, year_month)
                        if key not in expected_by_amount_month:
                            expected_by_amount_month[key] = {'date': cf_date, 'amount': cf_net}
                
                # NEW LOGIC: Match email to SPECIFIC trade by comparing against expected cashflows
                # For regular repayments (not prepayments):
                # - Each trade has pre-calculated expected cashflows (different amounts based on units)
                # - Match email gross_amount against expected cashflow amounts with ₹1 tolerance
                
                matched_trade = None
                matched_trade_units = 0
                
                # Determine if this is a prepayment
                is_prepayment = (principal and principal > 0 and (not interest or interest == 0))
                repayment_year_month = str(repayment_date)[:7] if repayment_date else ''
                
                # For regular repayments with multiple trades, match by expected cashflows
                if not is_prepayment and len(trades) > 1:
                    for trade in trades:
                        trade_units = trade.get('units', 0)
                        if trade_units <= 0:
                            continue
                        
                        # Get expected cashflows for this trade from holding_cashflows
                        trade_cashflows = await db.holding_cashflows.find({
                            "trade_id": trade.get('id'),
                            "is_repaid": {"$ne": True}
                        }, {"_id": 0}).to_list(100)
                        
                        # Also try to get from bond's cashflows_per_unit if holding_cashflows not found
                        if not trade_cashflows and bond:
                            cashflows_per_unit = bond.get('cashflows_per_unit', [])
                            for cf in cashflows_per_unit:
                                interest_per_unit = cf.get('interest_per_unit', 0)
                                principal_per_unit = cf.get('principal_per_unit', 0)
                                expected_gross = (interest_per_unit + principal_per_unit) * trade_units
                                trade_cashflows.append({
                                    'date': cf.get('date', '')[:10],
                                    'gross_amount': round(expected_gross, 2),
                                    'net_amount': round(expected_gross - (interest_per_unit * trade_units * 0.1), 2)
                                })
                        
                        # Match email amount against expected cashflows with ₹1 tolerance
                        for cf in trade_cashflows:
                            cf_date = str(cf.get('date', ''))[:10]
                            cf_year_month = cf_date[:7] if cf_date else ''
                            expected_gross = cf.get('gross_amount', 0)
                            
                            # Check if amounts match within ₹1 tolerance AND same month
                            gross_match = abs(gross_amount - expected_gross) <= 1
                            month_match = cf_year_month == repayment_year_month if repayment_year_month else True
                            
                            if gross_match and month_match:
                                matched_trade = trade
                                matched_trade_units = trade_units
                                logger.info(f"Reprocess: Trade matched by expected cashflow: {gross_amount} ≈ {expected_gross} for trade with {trade_units} units")
                                break
                        
                        if matched_trade:
                            break
                
                # For single trade or if no match found, use simple fallback
                if not matched_trade and trades:
                    if len(trades) == 1:
                        matched_trade = trades[0]
                        matched_trade_units = matched_trade.get('units', 0)
                    elif is_prepayment:
                        # For prepayments with multiple trades, don't auto-match
                        logger.warning("Reprocess: Prepayment with multiple trades - skipping auto-match")
                    else:
                        # Fallback to first trade
                        matched_trade = trades[0]
                        matched_trade_units = matched_trade.get('units', 0)
                        logger.warning(f"Reprocess: No exact match for {gross_amount}, defaulting to first trade")
                
                # If no specific match, fall back to proportional distribution across all trades
                if matched_trade:
                    # Single trade match - create repayment only for this trade
                    trades_to_process = [matched_trade]
                    total_units = matched_trade_units
                else:
                    # No specific match - distribute proportionally
                    trades_to_process = [t for t in trades if t.get('units', 0) > 0]
                    total_units = sum(t.get('units', 0) for t in trades_to_process)
                
                for trade in trades_to_process:
                    trade_units = trade.get('units', 0)
                    if trade_units <= 0 or total_units <= 0:
                        continue
                    
                    # Calculate amounts for this trade
                    if matched_trade:
                        # Exact match - use full email amounts
                        trade_gross = gross_amount
                        # FIXED: Only use gross_amount as fallback if principal is truly missing (None or not in log)
                        # Don't use gross as fallback if principal is explicitly 0 (no principal in this payment)
                        trade_principal = principal if principal and principal > 0 else 0
                        trade_interest = interest if interest and interest > 0 else 0
                        trade_net = net_amount if net_amount and net_amount > 0 else gross_amount
                        trade_tds = tds
                        
                        # If we have gross but no principal/interest breakdown, 
                        # and this looks like a regular payment (not prepayment), 
                        # try to estimate breakdown from expected cashflow
                        if trade_gross > 0 and trade_principal == 0 and trade_interest == 0:
                            # Check if this trade has expected cashflows to get ratio
                            for cf in expected_cashflows:
                                cf_principal = cf.get('principal_per_unit', 0) or 0
                                cf_interest = cf.get('interest_per_unit', 0) or 0
                                if cf_principal > 0 or cf_interest > 0:
                                    total_per_unit = cf_principal + cf_interest
                                    if total_per_unit > 0:
                                        principal_ratio = cf_principal / total_per_unit
                                        interest_ratio = cf_interest / total_per_unit
                                        trade_principal = round(trade_gross * principal_ratio, 2)
                                        trade_interest = round(trade_gross * interest_ratio, 2)
                                        # Recalculate TDS (10% of interest)
                                        trade_tds = round(trade_interest * 0.10, 2)
                                        trade_net = round(trade_gross - trade_tds, 2)
                                        logger.info(f"Estimated breakdown from cashflow: P={trade_principal}, I={trade_interest}, TDS={trade_tds}")
                                    break
                    else:
                        # Proportional distribution
                        proportion = trade_units / total_units
                        trade_gross = round(gross_amount * proportion, 2)
                        trade_principal = round(principal * proportion, 2) if principal and principal > 0 else 0
                        trade_interest = round(interest * proportion, 2) if interest and interest > 0 else 0
                        trade_net = round(net_amount * proportion, 2) if net_amount else trade_gross
                        trade_tds = round(tds * proportion, 2)
                    
                    # Calculate per-unit amount for this trade
                    per_unit_amount = round(trade_gross / trade_units, 2) if trade_units > 0 else 0
                    
                    investment_date = trade.get('investment_date', '')
                    investment_date_str = str(investment_date)[:10] if investment_date else ''
                    
                    # Find expected amount for this repayment
                    repayment_date_short = str(repayment_date)[:10] if repayment_date else ''
                    repayment_year_month = repayment_date_short[:7] if repayment_date_short else ''
                    expected_amount = expected_by_date.get(repayment_date_short, 0)
                    matched_expected_date = repayment_date_short if expected_amount else None
                    
                    # If no date match, try matching by pre-decimal amount within SAME MONTH only
                    if not expected_amount and trade_net > 0 and repayment_year_month:
                        net_int = int(trade_net)
                        key = (net_int, repayment_year_month)
                        if key in expected_by_amount_month:
                            matched_cf = expected_by_amount_month[key]
                            expected_amount = matched_cf['amount']
                            matched_expected_date = matched_cf['date']
                    
                    # Calculate variance (actual - expected)
                    variance = round(trade_net - expected_amount, 2) if expected_amount else None
                    
                    # Check if actual_repayment already exists for this specific email log + trade
                    existing_trade = await db.actual_repayments.find_one({
                        "trade_id": trade.get('id'),
                        "email_log_id": log_id
                    })
                    
                    if not existing_trade:
                        # Determine payment type based on principal/interest
                        is_prepayment = (trade_principal and trade_principal > 0 and (not trade_interest or trade_interest == 0))
                        payment_type = "prepayment" if is_prepayment else "interest_payment"
                        
                        repayment_record = {
                            "id": str(uuid.uuid4()),
                            "client_id": trade.get('client_id') or client_id,
                            "client_name": trade.get('client_name') or client_name,
                            "bond_id": bond_id,
                            "bond_name": log.get('bond_name') or trade.get('bond_name'),
                            "bond_code": log.get('bond_code') or trade.get('bond_code'),
                            "repayment_date": repayment_date,
                            "expected_date": matched_expected_date,
                            "investment_date": investment_date_str,
                            "gross_amount": trade_gross,
                            "principal": trade_principal,
                            "interest": trade_interest,
                            "net_amount": trade_net,
                            "expected_amount": expected_amount if expected_amount else None,
                            "variance": variance,
                            "tds": trade_tds,
                            "units": trade_units,
                            "per_unit_amount": per_unit_amount,
                            "payment_type": payment_type,
                            "is_prepayment": is_prepayment,
                            "email_log_id": log_id,
                            "trade_id": trade.get('id'),
                            "source": "reprocess_email_logs",
                            "created_at": datetime.now(timezone.utc).isoformat()
                        }
                        await db.actual_repayments.insert_one(repayment_record)
                        results['actual_repayments_created'] += 1
                        
                        # ALSO update holding_cashflows with ±3 WORKING days tolerance
                        if repayment_date:
                            try:
                                repay_dt = datetime.strptime(repayment_date, '%Y-%m-%d')
                                date_patterns = get_working_day_range(repay_dt, days_tolerance=3)
                                date_regex_pattern = '|'.join([f'^{d}' for d in date_patterns])
                                
                                await db.holding_cashflows.update_many(
                                    {
                                        'trade_id': trade.get('id'),
                                        'date': {'$regex': date_regex_pattern},
                                        'is_repaid': {'$ne': True}
                                    },
                                    {
                                        '$set': {
                                            'is_repaid': True,
                                            'repaid_date': repayment_date,
                                            'repaid_actual_amount': trade_gross,
                                            'repaid_net_amount': trade_net,
                                            'repaid_tds': trade_tds,
                                            'email_processed': True,
                                            'email_log_id': log_id
                                        }
                                    }
                                )
                            except Exception as e:
                                logger.warning(f"Error updating holding_cashflows: {e}")
                
                results['processed'] += 1
                
            except Exception as e:
                results['errors'].append(f"Error processing log {log.get('id')}: {str(e)}")
        
    except Exception as e:
        results['errors'].append(f"Processing error: {str(e)}")
        logger.error(f"Reprocess email logs error: {e}")
    
    return results


def test_email_connection() -> Dict:
    """Test email connection and return status"""
    reader = RepaymentEmailReader()
    result = {
        'connected': False,
        'server': IMAP_SERVER,
        'port': IMAP_PORT,
        'email': EMAIL_ADDRESS,
        'error': None,
        'folders': []
    }
    
    try:
        if reader.connect():
            result['connected'] = True
            # List available folders
            try:
                status, folders = reader.imap.list()
                if status == 'OK':
                    result['folders'] = [f.decode() for f in folders]
            except:
                pass
            
            # Try to get mailbox status
            reader.imap.select('INBOX')
            status, data = reader.imap.status('INBOX', '(MESSAGES UNSEEN)')
            if status == 'OK':
                result['mailbox_status'] = data[0].decode()
        reader.disconnect()
    except Exception as e:
        result['error'] = str(e)
    
    return result


def list_all_emails(days_back: int = 30) -> List[Dict]:
    """List all emails in inbox for debugging - shows subjects"""
    reader = RepaymentEmailReader()
    emails_list = []
    
    try:
        if not reader.connect():
            return []
        
        reader.imap.select('INBOX')
        since_date = (datetime.now() - timedelta(days=days_back)).strftime('%d-%b-%Y')
        
        # Search for ALL emails since date
        search_criteria = f'(SINCE "{since_date}")'
        status, messages = reader.imap.search(None, search_criteria)
        
        if status != 'OK':
            return []
        
        email_ids = messages[0].split()
        
        for email_id in email_ids[:50]:  # Limit to 50 for safety
            try:
                status, msg_data = reader.imap.fetch(email_id, '(RFC822)')
                if status != 'OK':
                    continue
                
                raw_email = msg_data[0][1]
                msg = email.message_from_bytes(raw_email)
                
                subject, encoding = decode_header(msg['Subject'])[0]
                if isinstance(subject, bytes):
                    subject = subject.decode(encoding or 'utf-8')
                
                emails_list.append({
                    'id': email_id.decode(),
                    'subject': subject,
                    'from': msg['From'],
                    'date': msg['Date']
                })
            except Exception:
                continue
        
        reader.disconnect()
    except Exception:
        pass
    
    return emails_list
