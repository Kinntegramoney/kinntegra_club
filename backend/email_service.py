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
        
        # Debug log config (without password)
        logger.info(f"Email config: host={config['host']}, port={config['port']}, username={config['username']}, from={config['from_address']}")
        
        if not config['username'] or not config['password']:
            logger.error("SMTP credentials are missing! Check MAIL_USERNAME and MAIL_PASSWORD in .env")
            return False
        
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
        
        # Always BCC to donotreply@kinntegraa.club for record keeping
        auto_bcc = ['donotreply@kinntegraa.club']
        if bcc:
            recipients.extend(bcc)
            recipients.extend(auto_bcc)
        else:
            recipients.extend(auto_bcc)
        
        # Create SSL context and send
        context = ssl.create_default_context()
        
        logger.info(f"Connecting to SMTP server {config['host']}:{config['port']}...")
        with smtplib.SMTP_SSL(config['host'], config['port'], context=context) as server:
            logger.info("Connected, attempting login...")
            server.login(config['username'], config['password'])
            logger.info(f"Login successful, sending email to {to_email}...")
            server.sendmail(config['from_address'], recipients, message.as_string())
        
        logger.info(f"Email sent successfully to {to_email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return False


# ==================== EMAIL TEMPLATES ====================
# Brand Colors matching Kinntegraa website UI:
# - Primary Gold: #D4A853, #B8860B
# - Amber/Brown: #78716C, #92400E
# - Dark Background: #1E1B4B
# - Green accent: #22C55E
# - Clean white cards with subtle shadows

def get_email_template_base(content: str, footer_text: str = "") -> str:
    """Generate base email template with Kinntegraa branding"""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{ 
                font-family: 'Segoe UI', Arial, sans-serif; 
                line-height: 1.6; 
                color: #1f2937; 
                margin: 0;
                padding: 0;
                background-color: #f3f4f6;
            }}
            .wrapper {{
                background-color: #f3f4f6;
                padding: 40px 20px;
            }}
            .container {{ 
                max-width: 600px; 
                margin: 0 auto; 
                background: white;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }}
            .header {{ 
                background: linear-gradient(135deg, #1E1B4B 0%, #312E81 100%);
                color: white; 
                padding: 30px; 
                text-align: center;
            }}
            .logo {{
                width: 50px;
                height: 50px;
                background: linear-gradient(135deg, #D4A853, #B8860B);
                border-radius: 12px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                font-weight: bold;
                color: white;
                margin-bottom: 15px;
            }}
            .header h1 {{
                margin: 10px 0 5px 0;
                font-size: 24px;
                font-weight: 600;
            }}
            .header p {{
                margin: 0;
                opacity: 0.85;
                font-size: 14px;
            }}
            .content {{ 
                padding: 30px; 
            }}
            .greeting {{
                font-size: 16px;
                margin-bottom: 20px;
            }}
            .credentials {{ 
                background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%);
                padding: 24px; 
                border-radius: 12px; 
                margin: 24px 0;
                border-left: 4px solid #D4A853;
            }}
            .credentials h3 {{
                margin: 0 0 16px 0;
                color: #92400E;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }}
            .credential-item {{ 
                background: white;
                padding: 12px 16px;
                border-radius: 8px;
                margin: 8px 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }}
            .credential-label {{ 
                color: #6b7280; 
                font-size: 12px; 
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }}
            .credential-value {{ 
                font-size: 16px; 
                font-weight: 600; 
                color: #1f2937; 
                font-family: 'Courier New', monospace;
                background: #f3f4f6;
                padding: 4px 12px;
                border-radius: 4px;
            }}
            .button {{ 
                display: inline-block; 
                background: linear-gradient(135deg, #D4A853, #B8860B);
                color: white; 
                padding: 14px 32px; 
                text-decoration: none; 
                border-radius: 8px;
                font-weight: 600;
                font-size: 14px;
                box-shadow: 0 2px 4px rgba(212, 168, 83, 0.3);
            }}
            .button:hover {{
                background: linear-gradient(135deg, #B8860B, #92400E);
            }}
            .info-box {{
                background: #EFF6FF;
                border: 1px solid #BFDBFE;
                padding: 16px;
                border-radius: 8px;
                margin: 20px 0;
            }}
            .info-box.warning {{
                background: #FEF3C7;
                border-color: #FCD34D;
            }}
            .info-box.success {{
                background: #DCFCE7;
                border-color: #86EFAC;
            }}
            .features {{
                background: #f9fafb;
                padding: 20px;
                border-radius: 12px;
                margin: 20px 0;
            }}
            .feature-item {{
                padding: 10px 0;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                gap: 10px;
            }}
            .feature-item:last-child {{
                border-bottom: none;
            }}
            .feature-icon {{
                color: #22C55E;
                font-weight: bold;
            }}
            .badge {{
                background: linear-gradient(135deg, #D4A853, #B8860B);
                color: white;
                padding: 6px 16px;
                border-radius: 20px;
                font-size: 13px;
                font-weight: 600;
                display: inline-block;
            }}
            .footer {{ 
                background: #f9fafb;
                text-align: center; 
                padding: 24px;
                color: #6b7280; 
                font-size: 12px;
                border-top: 1px solid #e5e7eb;
            }}
            .footer p {{
                margin: 4px 0;
            }}
            .social-links {{
                margin: 16px 0;
            }}
            .divider {{
                height: 1px;
                background: #e5e7eb;
                margin: 24px 0;
            }}
        </style>
    </head>
    <body>
        <div class="wrapper">
            <div class="container">
                {content}
                <div class="footer">
                    {footer_text}
                    <p style="margin-top: 12px;">© 2026 Kinntegraa L.L.C-FZ. All rights reserved.</p>
                    <p>Dubai, UAE</p>
                    <p style="color: #9ca3af; margin-top: 8px;">This is an automated message. Please do not reply to this email.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """


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
    
    content = f"""
                <div class="header">
                    <div class="logo">K</div>
                    <h1>Welcome to Kinntegraa</h1>
                    <p>Your Investment Management Portal</p>
                </div>
                <div class="content">
                    <p class="greeting">Dear <strong>{client_name}</strong>,</p>
                    
                    <p>Welcome to Kinntegraa! Your investment portal account has been created by the representative of Kinntegraa - <strong>{broker_name}</strong>. You can now access the platform to view opportunities and manage your investments.</p>
                    
                    <div class="info-box" style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 16px; margin: 20px 0;">
                        <strong>🌐 Login Website:</strong><br>
                        <a href="{login_url}" style="color: #1976d2; font-size: 18px; font-weight: bold;">{login_url}</a>
                    </div>
                    
                    <div class="credentials">
                        <h3>🔐 Your Login Credentials</h3>
                        <div class="credential-item">
                            <span class="credential-label">PAN (Username)</span>
                            <span class="credential-value">{pan}</span>
                        </div>
                        <div class="credential-item">
                            <span class="credential-label">Password</span>
                            <span class="credential-value">{password}</span>
                        </div>
                        <div class="credential-item">
                            <span class="credential-label">PIN (2-Step Verification)</span>
                            <span class="credential-value">{pin}</span>
                        </div>
                    </div>
                    
                    <center>
                        <a href="{login_url}" class="button">Login to Portal →</a>
                    </center>
                    
                    <div class="info-box warning" style="margin-top: 24px;">
                        <strong>🔒 Security Notice:</strong><br>
                        Please keep your credentials safe and do not share them with anyone. We recommend changing your password after your first login.
                    </div>
                </div>
    """
    
    footer = f"<p>If you have any questions, please contact your broker <strong>{broker_name}</strong>.</p>"
    
    html_content = get_email_template_base(content, footer)
    
    plain_content = f"""
    Welcome to Kinntegraa - Your Investment Portal
    
    Dear {client_name},
    
    Your account has been created by the representative of Kinntegraa - {broker_name}.
    
    ==========================================
    LOGIN WEBSITE: {login_url}
    ==========================================
    
    Login Credentials:
    - PAN (Username): {pan}
    - Password: {password}
    - PIN: {pin}
    
    Please keep your credentials safe and change your password after first login.
    
    Best regards,
    Kinntegraa Team
    
    © 2026 Kinntegraa L.L.C-FZ, Dubai, UAE
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
    """Send welcome email to a new sub-broker (Kinntegraa Club member) with login credentials"""
    
    subject = "Welcome to Kinntegraa Club - Your Exclusive Member Access"
    
    content = f"""
                <div class="header">
                    <div class="logo">K</div>
                    <h1>Welcome to Kinntegraa Club</h1>
                    <p>Exclusive Member Access</p>
                </div>
                <div class="content">
                    <p class="greeting">Dear <strong>{subbroker_name}</strong>,</p>
                    
                    <p>Congratulations! You have been onboarded as an exclusive club member by <strong>{broker_name}</strong>.</p>
                    
                    <center style="margin: 24px 0;">
                        <span class="badge">🏆 Member Code: {partner_code}</span>
                    </center>
                    
                    <div class="info-box" style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 16px; margin: 20px 0;">
                        <strong>🌐 Login Website:</strong><br>
                        <a href="{login_url}" style="color: #1976d2; font-size: 18px; font-weight: bold;">{login_url}</a>
                    </div>
                    
                    <div class="credentials">
                        <h3>🔐 Your Login Credentials</h3>
                        <div class="credential-item">
                            <span class="credential-label">PAN (Username)</span>
                            <span class="credential-value">{pan}</span>
                        </div>
                        <div class="credential-item">
                            <span class="credential-label">Password</span>
                            <span class="credential-value">{password}</span>
                        </div>
                        <div class="credential-item">
                            <span class="credential-label">PIN (2-Step Verification)</span>
                            <span class="credential-value">{pin}</span>
                        </div>
                    </div>
                    
                    <div class="features">
                        <h3 style="margin-top: 0; color: #1f2937;">As a Club Member, You Can:</h3>
                        <div class="feature-item">
                            <span class="feature-icon">✓</span>
                            <span>View and share investment opportunities with your clients</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">✓</span>
                            <span>Manage your client portfolio efficiently</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">✓</span>
                            <span>Track investments and returns in real-time</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">✓</span>
                            <span>Access detailed analytics and comprehensive reports</span>
                        </div>
                    </div>
                    
                    <center>
                        <a href="{login_url}" class="button">Access Kinntegraa Club →</a>
                    </center>
                    
                    <div class="info-box success" style="margin-top: 24px;">
                        <strong>🎉 Welcome Aboard!</strong><br>
                        We're excited to have you as part of the Kinntegraa Club. Start exploring opportunities and grow your client portfolio today!
                    </div>
                </div>
    """
    
    footer = f"<p>If you have any questions, please contact <strong>{broker_name}</strong>.</p>"
    
    html_content = get_email_template_base(content, footer)
    
    plain_content = f"""
    Welcome to Kinntegraa Club - Exclusive Member Access
    
    Dear {subbroker_name},
    
    Congratulations! You have been onboarded as a club member by {broker_name}.
    
    Member Code: {partner_code}
    
    Login Credentials:
    - PAN (Username): {pan}
    - Password: {password}
    - PIN: {pin}
    
    Login URL: {login_url}
    
    As a Club Member, You Can:
    - View and share investment opportunities
    - Manage your client portfolio
    - Track investments and returns
    - Access detailed analytics and reports
    
    Best regards,
    Kinntegraa Club Team
    
    © 2026 Kinntegraa L.L.C-FZ, Dubai, UAE
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
                    <p>&copy; 2026 Kinntegraa. All rights reserved.</p>
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
    personal_message: Optional[str] = None,
    include_photos: bool = True
) -> bool:
    """Send real estate opportunity details to a client"""
    
    subject = f"Property Investment: {property_details.get('building_name', 'Property')} - {property_details.get('location', '')}"
    
    # Build photos section if enabled and photos exist
    photos_html = ""
    if include_photos:
        images = property_details.get('images', [])
        if images:
            photos_list = []
            for i, img in enumerate(images[:4]):  # Limit to 4 photos
                img_url = img if isinstance(img, str) else img.get('url', '')
                if img_url:
                    # Ensure full URL
                    if not img_url.startswith('http'):
                        img_url = f"https://kinntegraa.club{img_url}"
                    photos_list.append(f'<img src="{img_url}" alt="Property Photo {i+1}" style="width: 48%; height: 150px; object-fit: cover; border-radius: 8px; margin: 4px;">')
            
            if photos_list:
                photos_html = f'''
                <div style="margin: 20px 0; padding: 15px; background: #f3f4f6; border-radius: 10px;">
                    <div style="font-size: 14px; font-weight: bold; color: #374151; margin-bottom: 10px;">📸 Property Photos</div>
                    <div style="display: flex; flex-wrap: wrap; justify-content: space-between;">
                        {"".join(photos_list)}
                    </div>
                </div>
                '''
    
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
                    
                    {photos_html}
                    
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
                    <p>&copy; 2026 Kinntegraa. All rights reserved.</p>
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
    
    content = f"""
                <div class="header">
                    <div class="logo">K</div>
                    <h1>Password Reset</h1>
                    <p>Your credentials have been updated</p>
                </div>
                <div class="content">
                    <p class="greeting">Dear <strong>{recipient_name}</strong>,</p>
                    
                    <p>Your password has been reset successfully. Here are your new login credentials:</p>
                    
                    <div class="credentials">
                        <h3>🔐 New Credentials</h3>
                        <div class="credential-item">
                            <span class="credential-label">New Password</span>
                            <span class="credential-value">{new_password}</span>
                        </div>
                        <div class="credential-item">
                            <span class="credential-label">New PIN</span>
                            <span class="credential-value">{new_pin}</span>
                        </div>
                    </div>
                    
                    <center>
                        <a href="https://kinntegraa.club/login" class="button">Login Now →</a>
                    </center>
                    
                    <div class="info-box warning" style="margin-top: 24px;">
                        <strong>⚠️ Security Alert:</strong><br>
                        If you did not request this password reset, please contact support immediately.
                    </div>
                </div>
    """
    
    html_content = get_email_template_base(content, "")
    
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
    
    content = f"""
                <div class="header">
                    <div class="logo">K</div>
                    <h1>Your Login Credentials</h1>
                    <p>Access your investment portal</p>
                </div>
                <div class="content">
                    <p class="greeting">Dear <strong>{name}</strong>,</p>
                    
                    <p>Here are your login credentials for the Kinntegraa platform:</p>
                    
                    <div class="credentials">
                        <h3>🔐 Login Credentials</h3>
                        <div class="credential-item">
                            <span class="credential-label">PAN (Username)</span>
                            <span class="credential-value">{pan}</span>
                        </div>
                        <div class="credential-item">
                            <span class="credential-label">Password</span>
                            <span class="credential-value">{password}</span>
                        </div>
                        <div class="credential-item">
                            <span class="credential-label">PIN (2-Step Verification)</span>
                            <span class="credential-value">{pin}</span>
                        </div>
                    </div>
                    
                    <div class="info-box" style="margin-bottom: 24px;">
                        <strong>🔒 Security Tips:</strong>
                        <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                            <li>Change your password after first login</li>
                            <li>Never share your credentials with anyone</li>
                            <li>Use a strong, unique password</li>
                        </ul>
                    </div>
                    
                    <center>
                        <a href="https://kinntegraa.club/login" class="button">Login Now →</a>
                    </center>
                </div>
    """
    
    html_content = get_email_template_base(content, "")
    
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
                    <p>&copy; 2026 Kinntegraa. All rights reserved.</p>
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


def send_password_reset_link_email(
    recipient_email: str,
    recipient_name: str,
    reset_token: str,
    base_url: str = "https://kinntegraa.club"
) -> bool:
    """Send password reset link email (self-service reset)"""
    
    reset_url = f"{base_url}/forgot-password?token={reset_token}"
    
    subject = "Password Reset Request - Kinntegraa"
    
    content = f"""
                <div class="header">
                    <div class="logo">K</div>
                    <h1>Password Reset Request</h1>
                    <p>We received your request</p>
                </div>
                <div class="content">
                    <p class="greeting">Dear <strong>{recipient_name}</strong>,</p>
                    
                    <p>We received a request to reset your password. Click the button below to set a new password and PIN:</p>
                    
                    <center style="margin: 30px 0;">
                        <a href="{reset_url}" class="button">Reset Password →</a>
                    </center>
                    
                    <div class="info-box warning">
                        <strong>⚠️ Security Notice:</strong><br>
                        This link will expire in 1 hour. If you did not request this reset, please ignore this email or contact support.
                    </div>
                    
                    <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
                        If the button doesn't work, copy and paste this link into your browser:<br>
                        <a href="{reset_url}" style="color: #D4A853; word-break: break-all;">{reset_url}</a>
                    </p>
                </div>
    """
    
    html_content = get_email_template_base(content, "")
    
    plain_content = f"""
    Password Reset Request
    
    Dear {recipient_name},
    
    We received a request to reset your password. Click the link below to set a new password:
    
    {reset_url}
    
    This link expires in 1 hour.
    
    If you did not request this reset, please ignore this email.
    
    Best regards,
    Kinntegraa Team
    
    © 2026 Kinntegraa L.L.C-FZ, Dubai, UAE
    """
    
    return send_email(recipient_email, subject, html_content, plain_content)


def send_prepayment_notification_email(
    client_name: str,
    client_email: str,
    bond_name: str,
    opportunity_id: str,
    prepayment_date: str,
    prepaid_amount: float,
    prepayment_percentage: float,
    original_principal: float,
    remaining_principal: float,
    remaining_percentage: float,
    total_prepaid_to_date: float,
    total_prepaid_percentage: float,
    revised_cashflows: list = None,
    broker_name: str = "Your Broker"
) -> bool:
    """
    Send notification to client when a principal prepayment is recorded.
    
    Args:
        client_name: Name of the client
        client_email: Email address of the client
        bond_name: Name of the bond/opportunity
        opportunity_id: Unique identifier of the bond
        prepayment_date: Date of the prepayment
        prepaid_amount: Amount of principal prepaid in this transaction
        prepayment_percentage: Percentage of total principal prepaid in this transaction
        original_principal: Original total principal amount
        remaining_principal: Remaining principal after this prepayment
        remaining_percentage: Percentage of principal remaining
        total_prepaid_to_date: Total principal prepaid to date (including previous prepayments)
        total_prepaid_percentage: Total percentage prepaid to date
        revised_cashflows: List of revised future cashflows (optional)
        broker_name: Name of the broker
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    
    subject = f"Principal Prepayment Recorded - {bond_name}"
    
    # Build revised schedule HTML if cashflows provided
    revised_schedule_html = ""
    if revised_cashflows and len(revised_cashflows) > 0:
        rows_html = ""
        for cf in revised_cashflows[:10]:  # Limit to 10 entries
            cf_date = cf.get('date', 'N/A')
            cf_type = cf.get('type', 'interest').capitalize()
            revised_amt = cf.get('interest_component', 0)
            is_amended = cf.get('is_amended', False)
            
            change_indicator = ""
            if is_amended:
                change_indicator = '<span style="color: #EF4444; font-size: 11px;"> (↓ Reduced)</span>'
            
            rows_html += f"""
            <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px 12px; font-size: 13px;">{cf_date}</td>
                <td style="padding: 10px 12px; font-size: 13px;">{cf_type}</td>
                <td style="padding: 10px 12px; text-align: right; font-family: monospace; font-size: 13px;">
                    ₹{revised_amt:,.2f}{change_indicator}
                </td>
            </tr>
            """
        
        revised_schedule_html = f"""
            <div style="margin-top: 24px;">
                <h3 style="color: #1f2937; margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                    📅 Revised Payment Schedule
                </h3>
                <p style="font-size: 13px; color: #6b7280; margin-bottom: 12px;">
                    Future interest payments have been recalculated based on your reduced principal balance.
                </p>
                <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 8px; overflow: hidden;">
                    <thead>
                        <tr style="background: #f3f4f6;">
                            <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #6b7280; text-transform: uppercase;">Date</th>
                            <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #6b7280; text-transform: uppercase;">Type</th>
                            <th style="padding: 10px 12px; text-align: right; font-size: 12px; color: #6b7280; text-transform: uppercase;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows_html}
                    </tbody>
                </table>
                <p style="font-size: 11px; color: #9ca3af; margin-top: 8px; font-style: italic;">
                    * Only showing next 10 scheduled payments. Log in to your portal for complete schedule.
                </p>
            </div>
        """
    
    content = f"""
                <div class="header">
                    <div class="logo">K</div>
                    <h1>Principal Prepayment</h1>
                    <p>Your investment has been updated</p>
                </div>
                <div class="content">
                    <p class="greeting">Dear <strong>{client_name}</strong>,</p>
                    
                    <p>A principal prepayment has been recorded for your investment. Here are the details:</p>
                    
                    <div class="credentials">
                        <h3>📋 Prepayment Details</h3>
                        <div class="credential-item">
                            <span class="credential-label">Opportunity ID</span>
                            <span class="credential-value">{opportunity_id}</span>
                        </div>
                        <div class="credential-item">
                            <span class="credential-label">Opportunity</span>
                            <span class="credential-value" style="font-family: inherit; font-size: 14px;">{bond_name}</span>
                        </div>
                        <div class="credential-item">
                            <span class="credential-label">Prepayment Date</span>
                            <span class="credential-value">{prepayment_date}</span>
                        </div>
                    </div>
                    
                    <div style="background: linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%); padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #22C55E;">
                        <h3 style="margin: 0 0 16px 0; color: #166534; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                            💰 Amount Received
                        </h3>
                        <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 16px; border-radius: 8px; margin-bottom: 12px;">
                            <div>
                                <span style="color: #6b7280; font-size: 12px; display: block;">Principal Prepaid</span>
                                <span style="font-size: 24px; font-weight: 700; color: #166534;">₹{prepaid_amount:,.2f}</span>
                            </div>
                            <div style="text-align: right;">
                                <span style="color: #6b7280; font-size: 12px; display: block;">Of Total Principal</span>
                                <span style="font-size: 24px; font-weight: 700; color: #166534;">{prepayment_percentage:.2f}%</span>
                            </div>
                        </div>
                    </div>
                    
                    <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
                        <h3 style="margin: 0 0 16px 0; color: #1f2937; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
                            📊 Investment Summary
                        </h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div style="background: white; padding: 12px; border-radius: 8px;">
                                <span style="color: #6b7280; font-size: 11px; text-transform: uppercase; display: block;">Original Principal</span>
                                <span style="font-size: 16px; font-weight: 600; color: #1f2937;">₹{original_principal:,.2f}</span>
                            </div>
                            <div style="background: white; padding: 12px; border-radius: 8px;">
                                <span style="color: #6b7280; font-size: 11px; text-transform: uppercase; display: block;">Total Prepaid</span>
                                <span style="font-size: 16px; font-weight: 600; color: #166534;">₹{total_prepaid_to_date:,.2f}</span>
                                <span style="font-size: 11px; color: #6b7280;"> ({total_prepaid_percentage:.2f}%)</span>
                            </div>
                            <div style="background: white; padding: 12px; border-radius: 8px; grid-column: span 2;">
                                <span style="color: #6b7280; font-size: 11px; text-transform: uppercase; display: block;">Remaining Principal</span>
                                <span style="font-size: 18px; font-weight: 700; color: #D4A853;">₹{remaining_principal:,.2f}</span>
                                <span style="font-size: 12px; color: #6b7280;"> ({remaining_percentage:.2f}% remaining)</span>
                            </div>
                        </div>
                    </div>
                    
                    {revised_schedule_html}
                    
                    <div class="info-box" style="margin-top: 24px;">
                        <strong>ℹ️ What this means:</strong><br>
                        <ul style="margin: 10px 0 0 0; padding-left: 20px; font-size: 13px; color: #374151;">
                            <li>Your principal has been partially returned early</li>
                            <li>Future interest payments will be calculated on the reduced principal amount</li>
                            <li>Your overall returns may be lower than originally projected</li>
                            <li>Any reinvestment tags for affected payments have been updated</li>
                        </ul>
                    </div>
                    
                    <center style="margin-top: 24px;">
                        <a href="https://kinntegraa.club/login" class="button">View Full Details →</a>
                    </center>
                </div>
    """
    
    footer = f"<p>If you have any questions, please contact your broker <strong>{broker_name}</strong> or reach out to us at <a href='mailto:care@kinntegraa.com' style='color: #D4A853;'>care@kinntegraa.com</a></p>"
    
    html_content = get_email_template_base(content, footer)
    
    plain_content = f"""
    Principal Prepayment Notification
    
    Dear {client_name},
    
    A principal prepayment has been recorded for your investment:
    
    Opportunity: {bond_name}
    Opportunity ID: {opportunity_id}
    Prepayment Date: {prepayment_date}
    
    AMOUNT RECEIVED:
    - Principal Prepaid: ₹{prepaid_amount:,.2f} ({prepayment_percentage:.2f}% of total)
    
    INVESTMENT SUMMARY:
    - Original Principal: ₹{original_principal:,.2f}
    - Total Prepaid to Date: ₹{total_prepaid_to_date:,.2f} ({total_prepaid_percentage:.2f}%)
    - Remaining Principal: ₹{remaining_principal:,.2f} ({remaining_percentage:.2f}%)
    
    WHAT THIS MEANS:
    - Your principal has been partially returned early
    - Future interest payments will be calculated on the reduced principal
    - Your reinvestment tags for affected payments have been updated
    
    Log in to your portal for full details: https://kinntegraa.club/login
    
    If you have questions, please contact your broker {broker_name}.
    
    Best regards,
    Kinntegraa Team
    
    © 2026 Kinntegraa L.L.C-FZ, Dubai, UAE
    """
    
    return send_email(client_email, subject, html_content, plain_content)

def send_holdings_report_email(
    client_name: str,
    client_email: str,
    holdings_data: list,
    total_invested: float,
    total_expected: float,
    total_profit: float,
    cc_emails: list = None
) -> bool:
    """
    Send holdings report email to client with optional sub-broker CC.
    
    Args:
        client_name: Client's name
        client_email: Client's email address
        holdings_data: List of holding dictionaries with bond details
        total_invested: Total investment amount
        total_expected: Total expected returns
        total_profit: Total profit
        cc_emails: List of CC email addresses (e.g., sub-broker email)
    """
    subject = "Your Investment Holdings Report - Kinntegraa"
    
    # Format currency
    def fmt_inr(amount):
        return f"₹{amount:,.2f}"
    
    # Build holdings table rows
    holdings_rows = ""
    for h in holdings_data:
        holdings_rows += f"""
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">{h.get('bond_name', 'N/A')}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">{h.get('units', 0)}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace;">{fmt_inr(h.get('invested_amount', 0))}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace;">{fmt_inr(h.get('gross_expected', 0))}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-family: monospace; color: {'#22C55E' if h.get('profit', 0) >= 0 else '#DC2626'};">{fmt_inr(h.get('profit', 0))}</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">{h.get('expected_xirr', '-')}%</td>
                <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">{h.get('actual_xirr', '-')}%</td>
            </tr>
        """
    
    content = f"""
                <div class="header">
                    <div class="logo">K</div>
                    <h1>Holdings Report</h1>
                    <p>Your Investment Summary</p>
                </div>
                <div class="content">
                    <p class="greeting">Dear <strong>{client_name}</strong>,</p>
                    
                    <p>Please find below your current investment holdings with Kinntegraa.</p>
                    
                    <!-- Summary Cards -->
                    <div style="display: flex; gap: 15px; margin: 25px 0;">
                        <div style="flex: 1; background: linear-gradient(135deg, #FEF3C7, #FDE68A); padding: 20px; border-radius: 10px; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #92400E; text-transform: uppercase; letter-spacing: 0.5px;">Total Invested</p>
                            <p style="margin: 5px 0 0; font-size: 20px; font-weight: 700; color: #78350F;">{fmt_inr(total_invested)}</p>
                        </div>
                        <div style="flex: 1; background: linear-gradient(135deg, #DBEAFE, #BFDBFE); padding: 20px; border-radius: 10px; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #1E40AF; text-transform: uppercase; letter-spacing: 0.5px;">Expected Returns</p>
                            <p style="margin: 5px 0 0; font-size: 20px; font-weight: 700; color: #1E3A8A;">{fmt_inr(total_expected)}</p>
                        </div>
                        <div style="flex: 1; background: linear-gradient(135deg, #D1FAE5, #A7F3D0); padding: 20px; border-radius: 10px; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #065F46; text-transform: uppercase; letter-spacing: 0.5px;">Total Profit</p>
                            <p style="margin: 5px 0 0; font-size: 20px; font-weight: 700; color: #047857;">{fmt_inr(total_profit)}</p>
                        </div>
                    </div>
                    
                    <!-- Holdings Table -->
                    <div style="overflow-x: auto; margin: 20px 0;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                            <thead>
                                <tr style="background: #1E1B4B; color: white;">
                                    <th style="padding: 12px; text-align: left;">Scheme</th>
                                    <th style="padding: 12px; text-align: center;">Units</th>
                                    <th style="padding: 12px; text-align: right;">Investment</th>
                                    <th style="padding: 12px; text-align: right;">Expected</th>
                                    <th style="padding: 12px; text-align: right;">Profit</th>
                                    <th style="padding: 12px; text-align: center;">Exp. XIRR</th>
                                    <th style="padding: 12px; text-align: center;">Act. XIRR</th>
                                </tr>
                            </thead>
                            <tbody>
                                {holdings_rows}
                            </tbody>
                            <tfoot>
                                <tr style="background: #F3F4F6; font-weight: 600;">
                                    <td style="padding: 12px;" colspan="2">Total</td>
                                    <td style="padding: 12px; text-align: right; font-family: monospace;">{fmt_inr(total_invested)}</td>
                                    <td style="padding: 12px; text-align: right; font-family: monospace;">{fmt_inr(total_expected)}</td>
                                    <td style="padding: 12px; text-align: right; font-family: monospace; color: #22C55E;">{fmt_inr(total_profit)}</td>
                                    <td colspan="2"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    
                    <div class="info-box">
                        <strong>📊 About Your Report:</strong><br>
                        This report shows your current holdings as of today. Expected XIRR is based on the original schedule, while Actual XIRR reflects any prepayments or changes.
                    </div>
                    
                    <p style="margin-top: 20px;">For detailed cashflow information, please log in to your Kinntegraa dashboard.</p>
                </div>
    """
    
    footer = "<p>For any queries, please contact your relationship manager.</p>"
    
    html_content = get_email_template_base(content, footer)
    
    plain_content = f"""
    Holdings Report - Kinntegraa
    
    Dear {client_name},
    
    Please find below your current investment holdings with Kinntegraa.
    
    SUMMARY
    -------
    Total Invested: {fmt_inr(total_invested)}
    Expected Returns: {fmt_inr(total_expected)}
    Total Profit: {fmt_inr(total_profit)}
    
    For detailed cashflow information, please log in to your Kinntegraa dashboard.
    
    Best regards,
    Kinntegraa Team
    
    © 2026 Kinntegraa L.L.C-FZ, Dubai, UAE
    """
    
    return send_email(client_email, subject, html_content, plain_content, cc=cc_emails)


# ==================== APPROVAL WORKFLOW EMAILS ====================

def send_client_approval_request_email(
    client_name: str,
    client_email: str,
    approval_token: str,
    broker_name: str,
    base_url: str = "https://kinntegraa.club"
) -> bool:
    """Send approval request email to client after broker approves their account"""
    
    approve_url = f"{base_url}/api/approval-workflow/client-approve?token={approval_token}&action=approve"
    reject_url = f"{base_url}/api/approval-workflow/client-approve?token={approval_token}&action=reject"
    
    subject = "Action Required: Confirm Your Kinntegraa Account"
    
    content = f"""
                <div class="header">
                    <div class="logo">K</div>
                    <h1>Account Confirmation Required</h1>
                    <p>Your Kinntegraa Investment Account</p>
                </div>
                <div class="content">
                    <p class="greeting">Dear <strong>{client_name}</strong>,</p>
                    
                    <p>Great news! <strong>{broker_name}</strong> has approved the creation of your investment account on the Kinntegraa platform.</p>
                    
                    <div class="info-box success">
                        <strong>What happens next?</strong><br>
                        Please confirm your account by clicking the button below. Once confirmed, you will receive your login credentials via email.
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{approve_url}" style="display: inline-block; background: linear-gradient(135deg, #22C55E, #16A34A); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 10px;">
                            ✓ Confirm My Account
                        </a>
                    </div>
                    
                    <div class="info-box warning">
                        <strong>⚠️ Important:</strong><br>
                        This link expires in 7 days. If you did not request this account, please click the decline button below.
                    </div>
                    
                    <div style="text-align: center; margin: 20px 0;">
                        <a href="{reject_url}" style="display: inline-block; background: #6B7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 14px;">
                            Decline Account
                        </a>
                    </div>
                    
                    <div class="features">
                        <h3 style="margin-top: 0; color: #1f2937;">With Your Kinntegraa Account, You Can:</h3>
                        <div class="feature-item">
                            <span class="feature-icon">✓</span>
                            <span>View exclusive investment opportunities</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">✓</span>
                            <span>Track your portfolio in real-time</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">✓</span>
                            <span>Manage reinvestments and cashflows</span>
                        </div>
                        <div class="feature-item">
                            <span class="feature-icon">✓</span>
                            <span>Access detailed investment analytics</span>
                        </div>
                    </div>
                </div>
    """
    
    footer = f"<p>This request was initiated by <strong>{broker_name}</strong>. If you have questions, please contact them directly.</p>"
    
    html_content = get_email_template_base(content, footer)
    
    plain_content = f"""
    Account Confirmation Required - Kinntegraa
    
    Dear {client_name},
    
    Great news! {broker_name} has approved the creation of your investment account on the Kinntegraa platform.
    
    CONFIRM YOUR ACCOUNT:
    Click here to confirm: {approve_url}
    
    Or decline: {reject_url}
    
    This link expires in 7 days.
    
    WITH YOUR KINNTEGRAA ACCOUNT, YOU CAN:
    - View exclusive investment opportunities
    - Track your portfolio in real-time
    - Manage reinvestments and cashflows
    - Access detailed investment analytics
    
    If you have questions, please contact {broker_name}.
    
    Best regards,
    Kinntegraa Team
    
    © 2026 Kinntegraa L.L.C-FZ, Dubai, UAE
    """
    
    return send_email(client_email, subject, html_content, plain_content)


def send_reinvestment_client_approval_email(
    client_name: str,
    client_email: str,
    total_amount: float,
    cashflows_count: int,
    approval_token: str,
    broker_name: str,
    base_url: str = "https://kinntegraa.club"
) -> bool:
    """Send reinvestment approval request email to client"""
    
    approve_url = f"{base_url}/api/approval-workflow/reinvestment-approve?token={approval_token}&action=approve"
    reject_url = f"{base_url}/api/approval-workflow/reinvestment-approve?token={approval_token}&action=reject"
    
    subject = f"Action Required: Approve Reinvestment of ₹{total_amount:,.0f}"
    
    content = f"""
                <div class="header">
                    <div class="logo">K</div>
                    <h1>Reinvestment Approval Required</h1>
                    <p>Your Investment Decision</p>
                </div>
                <div class="content">
                    <p class="greeting">Dear <strong>{client_name}</strong>,</p>
                    
                    <p>Your broker <strong>{broker_name}</strong> has prepared a reinvestment plan for your upcoming cashflows and requires your approval to proceed.</p>
                    
                    <div style="background: linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%); padding: 24px; border-radius: 12px; margin: 24px 0; text-align: center;">
                        <div style="font-size: 14px; color: #6366F1; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                            Total Reinvestment Amount
                        </div>
                        <div style="font-size: 36px; font-weight: 700; color: #4338CA;">
                            ₹{total_amount:,.2f}
                        </div>
                        <div style="font-size: 14px; color: #6B7280; margin-top: 8px;">
                            Across {cashflows_count} cashflow(s)
                        </div>
                    </div>
                    
                    <div class="info-box">
                        <strong>What happens when you approve?</strong><br>
                        Your reinvestment instructions will be processed automatically when the cashflows mature. The funds will be reinvested according to the plan prepared by your broker.
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{approve_url}" style="display: inline-block; background: linear-gradient(135deg, #22C55E, #16A34A); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 10px;">
                            ✓ Approve Reinvestment
                        </a>
                    </div>
                    
                    <div class="info-box warning">
                        <strong>⚠️ Important:</strong><br>
                        This approval link expires in 7 days. If you do not approve, the cashflows will remain in your account without automatic reinvestment.
                    </div>
                    
                    <div style="text-align: center; margin: 20px 0;">
                        <a href="{reject_url}" style="display: inline-block; background: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 14px;">
                            Decline Reinvestment
                        </a>
                    </div>
                </div>
    """
    
    footer = f"<p>This reinvestment plan was prepared by <strong>{broker_name}</strong>. Contact them for any questions.</p>"
    
    html_content = get_email_template_base(content, footer)
    
    plain_content = f"""
    Reinvestment Approval Required - Kinntegraa
    
    Dear {client_name},
    
    Your broker {broker_name} has prepared a reinvestment plan for your upcoming cashflows.
    
    REINVESTMENT DETAILS:
    - Total Amount: ₹{total_amount:,.2f}
    - Number of Cashflows: {cashflows_count}
    
    APPROVE REINVESTMENT:
    Click here to approve: {approve_url}
    
    Or decline: {reject_url}
    
    This link expires in 7 days.
    
    WHAT HAPPENS WHEN YOU APPROVE?
    Your reinvestment instructions will be processed automatically when the cashflows mature.
    
    If you have questions, please contact {broker_name}.
    
    Best regards,
    Kinntegraa Team
    
    © 2026 Kinntegraa L.L.C-FZ, Dubai, UAE
    """
    
    return send_email(client_email, subject, html_content, plain_content)

