"""
Email Service Module for Kinntegraa Platform
Handles sending emails via SMTP for:
- Welcome emails to clients/sub-brokers with login credentials
- Opportunity sharing (bonds and real estate)
- System notifications
"""

import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)


def get_mail_config():
    """Get mail configuration from environment variables"""
    return {
        'host': os.environ.get('MAIL_HOST', 'mail.kinntegraa.club'),
        'port': int(os.environ.get('MAIL_PORT', 465)),
        'username': os.environ.get('MAIL_USERNAME', ''),
        'password': os.environ.get('MAIL_PASSWORD', ''),
        'from_address': os.environ.get('MAIL_FROM_ADDRESS', 'donotreply@kinntegraa.club'),
        'from_name': os.environ.get('MAIL_FROM_NAME', 'Kinntegraa')
    }


def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    plain_content: Optional[str] = None,
    cc: Optional[List[str]] = None,
    bcc: Optional[List[str]] = None
) -> bool:
    """
    Send an email using SMTP SSL (outgoing only, no incoming mail)
    
    Args:
        to_email: Recipient email address
        subject: Email subject
        html_content: HTML body of the email
        plain_content: Plain text fallback (optional)
        cc: List of CC recipients (optional)
        bcc: List of BCC recipients (optional)
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    try:
        # Get config dynamically
        config = get_mail_config()
        
        # Create message
        message = MIMEMultipart("alternative")
        message["Subject"] = subject
        message["From"] = f"{config['from_name']} <{config['from_address']}>"
        message["To"] = to_email
        
        # Set Reply-To to discourage replies (no-reply address)
        message["Reply-To"] = config['from_address']
        
        # Add headers to indicate this is an automated/no-reply email
        message["X-Auto-Response-Suppress"] = "All"
        message["Auto-Submitted"] = "auto-generated"
        message["Precedence"] = "bulk"
        
        if cc:
            message["Cc"] = ", ".join(cc)
        
        # Add plain text part
        if plain_content:
            part1 = MIMEText(plain_content, "plain")
            message.attach(part1)
        
        # Add HTML part
        part2 = MIMEText(html_content, "html")
        message.attach(part2)
        
        # Build recipient list
        recipients = [to_email]
        if cc:
            recipients.extend(cc)
        if bcc:
            recipients.extend(bcc)
        
        # Create SSL context and send
        context = ssl.create_default_context()
        
        with smtplib.SMTP_SSL(config['host'], config['port'], context=context) as server:
            server.login(config['username'], config['password'])
            server.sendmail(config['from_address'], recipients, message.as_string())
        
        logger.info(f"Email sent successfully to {to_email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return False


def send_welcome_email_client(
    client_name: str,
    client_email: str,
    pan: str,
    password: str,
    pin: str,
    broker_name: str,
    login_url: str = "https://kinntegraa.club/login"
) -> bool:
    """Send welcome email to a new client with login credentials"""
    
    subject = "Welcome to Kinntegraa - Your Investment Portal Access"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #4F46E5, #7C3AED); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }}
            .credentials {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4F46E5; }}
            .credential-item {{ margin: 10px 0; }}
            .credential-label {{ color: #6b7280; font-size: 12px; text-transform: uppercase; }}
            .credential-value {{ font-size: 18px; font-weight: bold; color: #1f2937; font-family: monospace; }}
            .button {{ display: inline-block; background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
            .footer {{ text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }}
            .warning {{ background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin-top: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0;">Welcome to Kinntegraa</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Your Investment Management Portal</p>
            </div>
            <div class="content">
                <p>Dear <strong>{client_name}</strong>,</p>
                
                <p>Welcome to Kinntegraa! Your account has been created by <strong>{broker_name}</strong>. You can now access the investment portal to view opportunities and manage your investments.</p>
                
                <div class="credentials">
                    <h3 style="margin-top: 0; color: #4F46E5;">Your Login Credentials</h3>
                    <div class="credential-item">
                        <div class="credential-label">PAN Number (Username)</div>
                        <div class="credential-value">{pan}</div>
                    </div>
                    <div class="credential-item">
                        <div class="credential-label">Password</div>
                        <div class="credential-value">{password}</div>
                    </div>
                    <div class="credential-item">
                        <div class="credential-label">PIN (for 2-step verification)</div>
                        <div class="credential-value">{pin}</div>
                    </div>
                </div>
                
                <center>
                    <a href="{login_url}" class="button">Login to Portal</a>
                </center>
                
                <div class="warning">
                    <strong>⚠️ Security Notice:</strong> Please keep your credentials safe and do not share them with anyone. We recommend changing your password after your first login.
                </div>
                
                <div class="footer">
                    <p>If you have any questions, please contact your broker or our support team.</p>
                    <p>&copy; 2025 Kinntegraa. All rights reserved.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    plain_content = f"""
    Welcome to Kinntegraa - Your Investment Portal
    
    Dear {client_name},
    
    Your account has been created by {broker_name}.
    
    Login Credentials:
    - PAN (Username): {pan}
    - Password: {password}
    - PIN: {pin}
    
    Login URL: {login_url}
    
    Please keep your credentials safe and change your password after first login.
    
    Best regards,
    Kinntegraa Team
    """
    
    return send_email(client_email, subject, html_content, plain_content)


def send_welcome_email_subbroker(
    subbroker_name: str,
    subbroker_email: str,
    pan: str,
    password: str,
    pin: str,
    partner_code: str,
    broker_name: str,
    login_url: str = "https://kinntegraa.club/login"
) -> bool:
    """Send welcome email to a new sub-broker with login credentials"""
    
    subject = "Welcome to Kinntegraa Club - Your Portal Access"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #7C3AED, #EC4899); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }}
            .credentials {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #7C3AED; }}
            .credential-item {{ margin: 10px 0; }}
            .credential-label {{ color: #6b7280; font-size: 12px; text-transform: uppercase; }}
            .credential-value {{ font-size: 18px; font-weight: bold; color: #1f2937; font-family: monospace; }}
            .partner-badge {{ background: linear-gradient(135deg, #7C3AED, #EC4899); color: white; display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 14px; }}
            .button {{ display: inline-block; background: #7C3AED; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
            .footer {{ text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }}
            .features {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }}
            .feature-item {{ padding: 8px 0; border-bottom: 1px solid #e5e7eb; }}
            .feature-item:last-child {{ border-bottom: none; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0;">Welcome to Kinntegraa Club</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Exclusive Member Access</p>
            </div>
            <div class="content">
                <p>Dear <strong>{subbroker_name}</strong>,</p>
                
                <p>Congratulations! You have been onboarded as a member by <strong>{broker_name}</strong>.</p>
                
                <center>
                    <span class="partner-badge">Member Code: {partner_code}</span>
                </center>
                
                <div class="credentials">
                    <h3 style="margin-top: 0; color: #7C3AED;">Your Login Credentials</h3>
                    <div class="credential-item">
                        <div class="credential-label">PAN Number (Username)</div>
                        <div class="credential-value">{pan}</div>
                    </div>
                    <div class="credential-item">
                        <div class="credential-label">Password</div>
                        <div class="credential-value">{password}</div>
                    </div>
                    <div class="credential-item">
                        <div class="credential-label">PIN (for 2-step verification)</div>
                        <div class="credential-value">{pin}</div>
                    </div>
                </div>
                
                <div class="features">
                    <h3 style="margin-top: 0;">As a Club Member, You Can:</h3>
                    <div class="feature-item">✅ View and share investment opportunities with your clients</div>
                    <div class="feature-item">✅ Manage your client portfolio</div>
                    <div class="feature-item">✅ Track investments and returns</div>
                    <div class="feature-item">✅ Access detailed analytics and reports</div>
                </div>
                
                <center>
                    <a href="{login_url}" class="button">Access Kinntegraa Club</a>
                </center>
                
                <div class="footer">
                    <p>If you have any questions, please contact {broker_name} or our support team.</p>
                    <p>&copy; 2025 Kinntegraa Club. All rights reserved.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    plain_content = f"""
    Welcome to Kinntegraa Club
    
    Dear {subbroker_name},
    
    Congratulations! You have been onboarded as a member by {broker_name}.
    
    Member Code: {partner_code}
    
    Login Credentials:
    - PAN (Username): {pan}
    - Password: {password}
    - PIN: {pin}
    
    Login URL: {login_url}
    
    Best regards,
    Kinntegraa Club Team
    """
    
    return send_email(subbroker_email, subject, html_content, plain_content)


def send_bond_opportunity_email(
    recipient_email: str,
    recipient_name: str,
    bond_details: dict,
    sender_name: str,
    personal_message: Optional[str] = None
) -> bool:
    """Send bond opportunity details to a client"""
    
    subject = f"Investment Opportunity: {bond_details.get('issuer', 'Bond')} - {bond_details.get('coupon_rate', 0)}% Returns"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #4F46E5, #3B82F6); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }}
            .bond-card {{ background: white; padding: 25px; border-radius: 10px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .bond-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e5e7eb; }}
            .bond-name {{ font-size: 20px; font-weight: bold; color: #1f2937; }}
            .bond-rate {{ background: #10B981; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; }}
            .details-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }}
            .detail-item {{ padding: 10px; background: #f3f4f6; border-radius: 6px; }}
            .detail-label {{ font-size: 12px; color: #6b7280; text-transform: uppercase; }}
            .detail-value {{ font-size: 16px; font-weight: bold; color: #1f2937; }}
            .message-box {{ background: #EEF2FF; border-left: 4px solid #4F46E5; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0; }}
            .footer {{ text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }}
            .cta {{ text-align: center; margin: 25px 0; }}
            .button {{ display: inline-block; background: #4F46E5; color: white; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: bold; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0;">📈 Investment Opportunity</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">NCD Bond - High Yield Returns</p>
            </div>
            <div class="content">
                <p>Dear <strong>{recipient_name}</strong>,</p>
                
                <p><strong>{sender_name}</strong> has shared an exciting investment opportunity with you:</p>
                
                {f'<div class="message-box"><strong>Personal Message:</strong><br>{personal_message}</div>' if personal_message else ''}
                
                <div class="bond-card">
                    <div class="bond-header">
                        <div class="bond-name">{bond_details.get('issuer', 'Bond Opportunity')}</div>
                        <div class="bond-rate">{bond_details.get('coupon_rate', 0)}% p.a.</div>
                    </div>
                    
                    <div class="details-grid">
                        <div class="detail-item">
                            <div class="detail-label">Face Value</div>
                            <div class="detail-value">₹{bond_details.get('face_value', 0):,.0f}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Maturity Date</div>
                            <div class="detail-value">{bond_details.get('maturity_date', 'N/A')}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Interest Payment</div>
                            <div class="detail-value">{bond_details.get('interest_frequency', 'Monthly')}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Available Units</div>
                            <div class="detail-value">{bond_details.get('available_units', 0):,}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Credit Rating</div>
                            <div class="detail-value">{bond_details.get('credit_rating', 'N/A')}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Minimum Investment</div>
                            <div class="detail-value">₹{bond_details.get('minimum_investment', 0):,.0f}</div>
                        </div>
                    </div>
                </div>
                
                <div class="cta">
                    <a href="https://kinntegraa.club/login" class="button">View Full Details & Invest</a>
                </div>
                
                <div class="footer">
                    <p>This opportunity is subject to availability. Please login to view complete details and invest.</p>
                    <p>&copy; 2025 Kinntegraa. All rights reserved.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    plain_content = f"""
    Investment Opportunity: {bond_details.get('issuer', 'Bond')}
    
    Dear {recipient_name},
    
    {sender_name} has shared an investment opportunity with you:
    
    {f"Personal Message: {personal_message}" if personal_message else ""}
    
    Bond Details:
    - Issuer: {bond_details.get('issuer', 'N/A')}
    - Coupon Rate: {bond_details.get('coupon_rate', 0)}% p.a.
    - Face Value: ₹{bond_details.get('face_value', 0):,.0f}
    - Maturity Date: {bond_details.get('maturity_date', 'N/A')}
    - Credit Rating: {bond_details.get('credit_rating', 'N/A')}
    
    Login to view full details: https://kinntegraa.club/login
    
    Best regards,
    Kinntegraa Team
    """
    
    return send_email(recipient_email, subject, html_content, plain_content)


def send_real_estate_opportunity_email(
    recipient_email: str,
    recipient_name: str,
    property_details: dict,
    sender_name: str,
    personal_message: Optional[str] = None
) -> bool:
    """Send real estate opportunity details to a client"""
    
    subject = f"Property Investment: {property_details.get('building_name', 'Property')} - {property_details.get('location', '')}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #EC4899, #F59E0B); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }}
            .property-card {{ background: white; padding: 25px; border-radius: 10px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .property-header {{ margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e5e7eb; }}
            .property-name {{ font-size: 22px; font-weight: bold; color: #1f2937; }}
            .property-location {{ color: #6b7280; margin-top: 5px; }}
            .price-tag {{ background: linear-gradient(135deg, #EC4899, #F59E0B); color: white; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0; }}
            .price-value {{ font-size: 28px; font-weight: bold; }}
            .details-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }}
            .detail-item {{ padding: 10px; background: #f3f4f6; border-radius: 6px; }}
            .detail-label {{ font-size: 12px; color: #6b7280; text-transform: uppercase; }}
            .detail-value {{ font-size: 16px; font-weight: bold; color: #1f2937; }}
            .xirr-highlight {{ background: #10B981; color: white; padding: 10px 20px; border-radius: 20px; display: inline-block; margin: 15px 0; }}
            .message-box {{ background: #FDF2F8; border-left: 4px solid #EC4899; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0; }}
            .footer {{ text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }}
            .button {{ display: inline-block; background: #EC4899; color: white; padding: 14px 35px; text-decoration: none; border-radius: 6px; font-weight: bold; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0;">🏠 Property Investment</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Off-Plan Real Estate Opportunity</p>
            </div>
            <div class="content">
                <p>Dear <strong>{recipient_name}</strong>,</p>
                
                <p><strong>{sender_name}</strong> has shared an exciting property investment opportunity with you:</p>
                
                {f'<div class="message-box"><strong>Personal Message:</strong><br>{personal_message}</div>' if personal_message else ''}
                
                <div class="property-card">
                    <div class="property-header">
                        <div class="property-name">{property_details.get('building_name', 'Property')}</div>
                        <div class="property-location">📍 {property_details.get('location', 'N/A')} | Unit: {property_details.get('unit_number', 'N/A')}</div>
                    </div>
                    
                    <div class="price-tag">
                        <div style="font-size: 12px; opacity: 0.9;">Total Investment</div>
                        <div class="price-value">AED {property_details.get('total_cost', 0):,.0f}</div>
                    </div>
                    
                    <center>
                        <span class="xirr-highlight">Expected XIRR: {property_details.get('expected_xirr', 'N/A')}%</span>
                    </center>
                    
                    <div class="details-grid">
                        <div class="detail-item">
                            <div class="detail-label">Property Type</div>
                            <div class="detail-value">{property_details.get('apartment_type', 'N/A')}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Area</div>
                            <div class="detail-value">{property_details.get('total_area', 0):,.0f} sq.ft</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Price per Sq.ft</div>
                            <div class="detail-value">AED {property_details.get('price_per_sqft', 0):,.0f}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Max Co-Owners</div>
                            <div class="detail-value">{property_details.get('max_co_owners', 4)}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Expected Handover</div>
                            <div class="detail-value">{property_details.get('handover_date', 'N/A')}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Available Share</div>
                            <div class="detail-value">{100 - property_details.get('invested_percentage', 0)}%</div>
                        </div>
                    </div>
                </div>
                
                <center>
                    <a href="https://kinntegraa.club/login" class="button">View Full Details & Invest</a>
                </center>
                
                <div class="footer">
                    <p>This opportunity is subject to availability. Login to view payment schedule and XIRR calculator.</p>
                    <p>&copy; 2025 Kinntegraa. All rights reserved.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    plain_content = f"""
    Property Investment Opportunity: {property_details.get('building_name', 'Property')}
    
    Dear {recipient_name},
    
    {sender_name} has shared a property investment opportunity with you:
    
    {f"Personal Message: {personal_message}" if personal_message else ""}
    
    Property Details:
    - Building: {property_details.get('building_name', 'N/A')}
    - Location: {property_details.get('location', 'N/A')}
    - Unit: {property_details.get('unit_number', 'N/A')}
    - Total Cost: AED {property_details.get('total_cost', 0):,.0f}
    - Area: {property_details.get('total_area', 0):,.0f} sq.ft
    - Expected XIRR: {property_details.get('expected_xirr', 'N/A')}%
    
    Login to view full details: https://kinntegraa.club/login
    
    Best regards,
    Kinntegraa Team
    """
    
    return send_email(recipient_email, subject, html_content, plain_content)


def send_password_reset_email(
    recipient_email: str,
    recipient_name: str,
    new_password: str,
    new_pin: str
) -> bool:
    """Send password reset email"""
    
    subject = "Kinntegraa - Your Password Has Been Reset"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: #EF4444; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }}
            .credentials {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #EF4444; }}
            .credential-item {{ margin: 10px 0; }}
            .credential-label {{ color: #6b7280; font-size: 12px; text-transform: uppercase; }}
            .credential-value {{ font-size: 18px; font-weight: bold; color: #1f2937; font-family: monospace; }}
            .button {{ display: inline-block; background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
            .footer {{ text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0;">🔐 Password Reset</h1>
            </div>
            <div class="content">
                <p>Dear <strong>{recipient_name}</strong>,</p>
                
                <p>Your password has been reset. Here are your new credentials:</p>
                
                <div class="credentials">
                    <div class="credential-item">
                        <div class="credential-label">New Password</div>
                        <div class="credential-value">{new_password}</div>
                    </div>
                    <div class="credential-item">
                        <div class="credential-label">New PIN</div>
                        <div class="credential-value">{new_pin}</div>
                    </div>
                </div>
                
                <center>
                    <a href="https://kinntegraa.club/login" class="button">Login Now</a>
                </center>
                
                <p style="margin-top: 20px; color: #EF4444;"><strong>⚠️ Important:</strong> If you did not request this password reset, please contact support immediately.</p>
                
                <div class="footer">
                    <p>&copy; 2025 Kinntegraa. All rights reserved.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    return send_email(recipient_email, subject, html_content)


def send_credentials_email(
    email: str,
    name: str,
    pan: str,
    password: str,
    pin: str
) -> bool:
    """Send login credentials email to client (resend credentials)"""
    
    subject = "Kinntegraa - Your Login Credentials"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #D4A853, #B8860B); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }}
            .credentials {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #D4A853; }}
            .credential-item {{ margin: 15px 0; }}
            .credential-label {{ color: #6b7280; font-size: 12px; text-transform: uppercase; }}
            .credential-value {{ font-size: 18px; font-weight: bold; color: #1f2937; font-family: monospace; }}
            .button {{ display: inline-block; background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
            .footer {{ text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }}
            .security-note {{ background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; border-radius: 4px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0;">🔑 Your Login Credentials</h1>
            </div>
            <div class="content">
                <p>Dear <strong>{name}</strong>,</p>
                
                <p>Here are your login credentials for the Kinntegraa platform:</p>
                
                <div class="credentials">
                    <div class="credential-item">
                        <div class="credential-label">PAN (Username)</div>
                        <div class="credential-value">{pan}</div>
                    </div>
                    <div class="credential-item">
                        <div class="credential-label">Password</div>
                        <div class="credential-value">{password}</div>
                    </div>
                    <div class="credential-item">
                        <div class="credential-label">PIN</div>
                        <div class="credential-value">{pin}</div>
                    </div>
                </div>
                
                <div class="security-note">
                    <strong>🔒 Security Tips:</strong>
                    <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                        <li>Change your password after first login</li>
                        <li>Never share your credentials with anyone</li>
                        <li>Use a strong, unique password</li>
                    </ul>
                </div>
                
                <center>
                    <a href="https://kinntegraa.club/login" class="button">Login Now</a>
                </center>
                
                <div class="footer">
                    <p>&copy; 2025 Kinntegraa. All rights reserved.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    return send_email(email, subject, html_content)


def send_reinvestment_approval_email(
    client_email: str,
    client_name: str,
    entries_html: str,
    total_amount: float,
    approval_token: str,
    entries_count: int,
    base_url: str = "https://kinntegraa.club"
) -> bool:
    """Send reinvestment approval request email to client"""
    
    approve_url = f"{base_url}/api/reinvestment/approve-via-link?token={approval_token}&action=approve"
    reject_url = f"{base_url}/api/reinvestment/approve-via-link?token={approval_token}&action=reject"
    
    subject = f"Reinvestment Approval Required - {entries_count} Entry(ies) | ₹{total_amount:,.2f}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 700px; margin: 0 auto; padding: 20px; }}
            .header {{ background: linear-gradient(135deg, #D4A853, #B8860B); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }}
            .summary {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #D4A853; }}
            .amount {{ font-size: 28px; font-weight: bold; color: #22C55E; }}
            table {{ width: 100%; border-collapse: collapse; margin: 20px 0; background: white; }}
            th {{ background: #D4A853; color: white; padding: 12px 8px; text-align: left; }}
            td {{ padding: 10px 8px; border-bottom: 1px solid #e5e7eb; }}
            .button {{ display: inline-block; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px; }}
            .approve-btn {{ background: #22C55E; color: white; }}
            .reject-btn {{ background: #EF4444; color: white; }}
            .footer {{ text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }}
            .warning {{ background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; border-radius: 4px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0;">Reinvestment Approval</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Action Required</p>
            </div>
            <div class="content">
                <p>Dear <strong>{client_name}</strong>,</p>
                
                <p>Your broker has tagged the following upcoming cashflows for reinvestment. Please review and approve or reject these entries.</p>
                
                <div class="summary">
                    <p style="margin: 0; color: #6b7280;">Total Reinvestment Amount</p>
                    <p class="amount" style="margin: 5px 0;">₹{total_amount:,.2f}</p>
                    <p style="margin: 0; font-size: 14px; color: #6b7280;">{entries_count} entry(ies) pending approval</p>
                </div>
                
                <table>
                    <thead>
                        <tr>
                            <th>Opportunity</th>
                            <th>Expected Date</th>
                            <th>Tag Type</th>
                            <th style="text-align: right;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries_html}
                    </tbody>
                </table>
                
                <div class="warning">
                    <strong>⚠️ Important:</strong> By approving, you authorize the reinvestment of these funds into new opportunities selected by your broker. This action cannot be undone.
                </div>
                
                <center style="margin: 30px 0;">
                    <a href="{approve_url}" class="button approve-btn">✓ APPROVE ALL</a>
                    <a href="{reject_url}" class="button reject-btn">✗ REJECT ALL</a>
                </center>
                
                <p style="font-size: 12px; color: #6b7280; text-align: center;">
                    This approval link will expire in 7 days. If you have any questions, please contact your broker.
                </p>
                
                <div class="footer">
                    <p>&copy; 2025 Kinntegraa. All rights reserved.</p>
                    <p>License No: 1922240.01</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    plain_content = f"""
    Reinvestment Approval Required
    
    Dear {client_name},
    
    Your broker has tagged {entries_count} cashflow(s) for reinvestment.
    Total Amount: ₹{total_amount:,.2f}
    
    To APPROVE: {approve_url}
    To REJECT: {reject_url}
    
    This link expires in 7 days.
    
    Best regards,
    Kinntegraa Team
    """
    
    return send_email(client_email, subject, html_content, plain_content)


def send_password_reset_email(
    recipient_email: str,
    recipient_name: str,
    reset_token: str,
    base_url: str = "https://kinntegraa.club"
) -> bool:
    """Send password reset link email"""
    
    reset_url = f"{base_url}/forgot-password?token={reset_token}"
    
    subject = "Password Reset Request - Kinntegraa"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .header {{ background: #D4A853; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
            .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }}
            .button {{ display: inline-block; background: #D4A853; color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: bold; }}
            .footer {{ text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }}
            .warning {{ background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 15px; margin: 20px 0; border-radius: 4px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0;">Password Reset</h1>
            </div>
            <div class="content">
                <p>Dear <strong>{recipient_name}</strong>,</p>
                
                <p>We received a request to reset your password. Click the button below to set a new password and PIN:</p>
                
                <center>
                    <a href="{reset_url}" class="button">Reset Password</a>
                </center>
                
                <div class="warning">
                    <strong>⚠️ Security Notice:</strong> This link will expire in 1 hour. If you did not request this reset, please ignore this email or contact support.
                </div>
                
                <p style="font-size: 12px; color: #6b7280;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <a href="{reset_url}">{reset_url}</a>
                </p>
                
                <div class="footer">
                    <p>&copy; 2025 Kinntegraa. All rights reserved.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """
    
    plain_content = f"""
    Password Reset Request
    
    Dear {recipient_name},
    
    We received a request to reset your password. Click the link below to set a new password:
    
    {reset_url}
    
    This link expires in 1 hour.
    
    If you did not request this reset, please ignore this email.
    
    Best regards,
    Kinntegraa Team
    """
    
    return send_email(recipient_email, subject, html_content, plain_content)
