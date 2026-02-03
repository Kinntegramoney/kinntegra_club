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

logger = logging.getLogger(__name__)

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
                    
                    # Get date
                    email_date = msg['Date']
                    
                    # Get email body (HTML)
                    html_body = self._get_html_body(msg)
                    
                    if html_body:
                        # Parse repayment details from HTML
                        repayment_data = self._parse_repayment_email(html_body, subject, email_date)
                        if repayment_data:
                            repayment_data['email_id'] = email_id.decode()
                            repayment_data['raw_subject'] = subject
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
            # Pattern: CDNRE001, CDXXX001, etc.
            opportunity_match = re.search(r'([A-Z]{2,5}\d{3,5})', subject) or re.search(r'([A-Z]{2,5}\d{3,5})', text)
            opportunity_id = opportunity_match.group(1) if opportunity_match else None
            
            # Extract company name from subject (after "Returns Initiated - ")
            subject_company_match = re.search(r'Returns Initiated\s*-\s*(.+)$', subject, re.IGNORECASE)
            company_from_subject = subject_company_match.group(1).strip().replace('\r', '').replace('\n', ' ') if subject_company_match else None
            
            # Extract client name (Dear <Name>)
            client_match = re.search(r'Dear\s+([A-Za-z\s]+?)(?:\n|,)', text)
            client_name = client_match.group(1).strip() if client_match else None
            
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
                return 0.0
            
            # Total Gross Amount Repaid
            gross_amount = extract_amount(r'Total\s+Gross\s+Amount\s+Repaid[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)', text)
            
            # Principal
            principal = extract_amount(r'Principal[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)', text)
            
            # Interest
            interest = extract_amount(r'Interest[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)', text)
            
            # Net Amount Repaid (Net of TDS)
            net_amount = extract_amount(r'Net\s+Amount\s+Repaid[:\s]*(?:\(Net\s+of\s+TDS\*?\))?[:\s]*₹?\s*([\d,]+(?:\.\d{2})?)', text)
            
            # Calculate TDS if we have gross and net
            tds_amount = gross_amount - net_amount if gross_amount > 0 and net_amount > 0 else 0.0
            
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
                'email_date': email_date,
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


async def process_repayment_emails(db, days_back: int = 7) -> Dict:
    """
    Main function to process repayment emails and update cashflows
    Returns summary of processed emails
    """
    reader = RepaymentEmailReader()
    results = {
        'total_emails': 0,
        'processed': 0,
        'matched': 0,
        'holdings_updated': 0,
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
                    results['errors'].append(f"No opportunity ID or company name found in email")
                    continue
                
                bond = await db.bonds.find_one({'$or': search_criteria})
                
                if not bond:
                    results['errors'].append(f"Bond not found for: {opportunity_id or company_name}")
                    continue
                
                bond_id = bond.get('id')
                repayment_date = email_data.get('repayment_date')
                
                # Try to find client by name matching
                client = None
                client_id = None
                if client_name:
                    # Search for client by name (fuzzy match)
                    name_parts = client_name.strip().split()
                    if name_parts:
                        name_pattern = '.*'.join(name_parts[:2])  # First two words
                        client = await db.clients.find_one({
                            'name': {'$regex': name_pattern, '$options': 'i'}
                        }, {'_id': 0, 'id': 1, 'name': 1, 'pan_number': 1})
                        if client:
                            client_id = client.get('id')
                
                # Create email read log entry
                email_log_id = str(uuid.uuid4())
                email_read_at = datetime.now(timezone.utc)
                holding_updated = False
                holding_updated_at = None
                cashflows_count = 0
                
                # Find matching cashflows by bond_id and date
                if repayment_date:
                    # Update cashflows for this date
                    update_result = await db.holding_cashflows.update_many(
                        {
                            'bond_id': bond_id,
                            'date': {'$regex': f'^{repayment_date}'}
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
                
                # Log individual email read entry
                email_log_entry = {
                    'id': email_log_id,
                    'email_from': 'altGraaf',
                    'email_subject': email_data.get('raw_subject', ''),
                    'email_date': email_data.get('email_date'),
                    'email_read_at': email_read_at.isoformat(),
                    'client_id': client_id,
                    'client_name': client.get('name') if client else client_name,
                    'client_pan': client.get('pan_number') if client else None,
                    'bond_id': bond_id,
                    'bond_name': bond.get('name'),
                    'bond_code': bond.get('bond_code') or opportunity_id,
                    'repayment_date': repayment_date,
                    'gross_amount': email_data.get('gross_amount'),
                    'net_amount': email_data.get('net_amount'),
                    'tds_amount': email_data.get('tds_amount'),
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
            except Exception as e:
                continue
        
        reader.disconnect()
    except Exception as e:
        pass
    
    return emails_list
