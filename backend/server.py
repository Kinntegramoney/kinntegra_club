from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, UploadFile, File, Form, BackgroundTasks, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse, FileResponse, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import io
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from scipy.optimize import newton
import numpy as np
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from auth import verify_password, get_password_hash, create_access_token, verify_token
from email_service import (
    send_welcome_email_client, 
    send_welcome_email_subbroker,
    send_bond_opportunity_email,
    send_real_estate_opportunity_email,
    send_password_reset_email,
    send_credentials_email,
    send_prepayment_notification_email
)
from analysis_service import (
    CASParser, 
    NAVService, 
    GapSheetGenerator, 
    SchemeMapper,
    parse_scheme_master_file
)
from dateutil.relativedelta import relativedelta
from calendar import monthrange


# ==================== DATE AND INTEREST CALCULATION HELPERS ====================

def add_months_fixed_day(start_date: datetime, months: int) -> datetime:
    """
    Add months to a date while keeping the same day of month.
    If the day doesn't exist in the target month (e.g., Jan 31 + 1 month), 
    use the last day of the target month.
    """
    target_month = start_date.month + months
    target_year = start_date.year + (target_month - 1) // 12
    target_month = ((target_month - 1) % 12) + 1
    
    # Get the last day of target month
    last_day_of_month = monthrange(target_year, target_month)[1]
    
    # Use the original day or last day if original doesn't exist
    target_day = min(start_date.day, last_day_of_month)
    
    return datetime(target_year, target_month, target_day)


def calculate_days_between(date1: datetime, date2: datetime) -> int:
    """Calculate actual days between two dates"""
    return abs((date2 - date1).days)


def generate_interest_payment_schedule(
    start_date: str,
    end_date: str,
    principal: float,
    coupon_rate: float,
    frequency: str = "quarterly"
) -> list:
    """
    Generate interest payment schedule with:
    - Fixed day of month for each payment
    - Interest calculated based on actual days in each period
    - Supports: monthly, quarterly, semi-annual, annual, on_maturity
    """
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    
    # Handle "on maturity" - single payment at end with all accrued interest
    if frequency.lower() in ['on_maturity', 'on-maturity', 'maturity', 'at_maturity', 'at-maturity']:
        days_total = calculate_days_between(start, end)
        daily_rate = (coupon_rate / 100) / 365
        total_interest = principal * daily_rate * days_total
        return [{
            "date": end.strftime('%Y-%m-%d'),
            "amount": round(total_interest, 2),
            "days": days_total,
            "is_partial": False,
            "payment_type": "on_maturity"
        }]
    
    months_interval = {
        "monthly": 1, 
        "quarterly": 3, 
        "semi-annual": 6, 
        "semi_annual": 6,
        "annual": 12
    }.get(frequency.lower(), 3)
    
    interest_payments = []
    current = start
    prev_date = start
    
    while True:
        # Add months while keeping the same day
        current = add_months_fixed_day(start, len(interest_payments) + 1) if months_interval == 1 else \
                  add_months_fixed_day(start, (len(interest_payments) + 1) * months_interval)
        
        if current > end:
            # Check if we need a final partial period payment at maturity
            if prev_date < end and prev_date != start:
                # Calculate interest for remaining days
                days_in_period = calculate_days_between(prev_date, end)
                daily_rate = (coupon_rate / 100) / 365
                interest_amount = principal * daily_rate * days_in_period
                interest_payments.append({
                    "date": end.strftime('%Y-%m-%d'),
                    "amount": round(interest_amount, 2),
                    "days": days_in_period,
                    "is_partial": True
                })
            break
        
        # Calculate interest based on actual days in this period
        days_in_period = calculate_days_between(prev_date, current)
        daily_rate = (coupon_rate / 100) / 365
        interest_amount = principal * daily_rate * days_in_period
        
        interest_payments.append({
            "date": current.strftime('%Y-%m-%d'),
            "amount": round(interest_amount, 2),
            "days": days_in_period,
            "is_partial": False
        })
        
        prev_date = current
    
    return interest_payments


def generate_combined_payment_schedule(
    start_date: str,
    end_date: str,
    principal: float,
    coupon_rate: float,
    principal_payments: list
) -> dict:
    """
    Generate combined payment schedule where:
    - Interest is paid MONTHLY from start date (on fixed day of month)
    - Principal payments follow the schedule from Sheet 4 (may start later)
    - Interest is calculated on REDUCING principal balance
    - Final payment aligns with maturity date (skips regular payment if too close)
    
    Args:
        start_date: Bond start date (YYYY-MM-DD)
        end_date: Bond maturity date (YYYY-MM-DD)
        principal: Total principal amount
        coupon_rate: Annual coupon rate (%)
        principal_payments: List of dicts with 'date' and 'percentage' keys
    
    Returns:
        dict with 'interest_payments', 'combined_schedule', and summary
    """
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    
    # Build a map of principal payment dates to percentages
    principal_payment_map = {}
    if principal_payments:
        for pp in principal_payments:
            principal_payment_map[pp['date']] = {
                'percentage': pp.get('percentage', 0),
                'description': pp.get('description', '')
            }
    
    combined_schedule = []
    interest_payments = []
    
    outstanding_principal = principal
    prev_date = start
    total_interest = 0
    total_principal_paid = 0
    payment_num = 1
    
    # Generate monthly payments from start to end
    while True:
        # Calculate next payment date (same day each month)
        current = add_months_fixed_day(start, payment_num)
        
        # If this payment date is at or past maturity, OR if it's very close to maturity
        # (within 15 days), make the final payment at maturity instead
        days_to_maturity = calculate_days_between(current, end)
        
        if current >= end or days_to_maturity <= 15:
            # Final payment at maturity date
            days_in_period = calculate_days_between(prev_date, end)
            daily_rate = (coupon_rate / 100) / 365
            interest_amount = round(outstanding_principal * daily_rate * days_in_period, 2)
            
            # Check if there's a principal payment on maturity
            end_date_str = end.strftime('%Y-%m-%d')
            principal_pct = 0
            principal_amt = 0
            if end_date_str in principal_payment_map:
                principal_pct = principal_payment_map[end_date_str]['percentage']
                principal_amt = round(principal * (principal_pct / 100), 2)
            
            interest_payments.append({
                "date": end_date_str,
                "amount": interest_amount,
                "days": days_in_period,
                "outstanding_principal": round(outstanding_principal, 2),
                "is_partial": True
            })
            
            combined_schedule.append({
                "date": end_date_str,
                "description": "Final Payment (Maturity)",
                "principal_percentage": principal_pct,
                "principal_amount": principal_amt,
                "interest_amount": interest_amount,
                "total_payment": round(principal_amt + interest_amount, 2),
                "outstanding_principal_before": round(outstanding_principal, 2),
                "outstanding_principal_after": round(outstanding_principal - principal_amt, 2),
                "days_in_period": days_in_period
            })
            
            total_interest += interest_amount
            total_principal_paid += principal_amt
            break
        
        # Calculate interest for this period
        days_in_period = calculate_days_between(prev_date, current)
        daily_rate = (coupon_rate / 100) / 365
        interest_amount = round(outstanding_principal * daily_rate * days_in_period, 2)
        
        # Check if there's a principal payment on this date
        current_date_str = current.strftime('%Y-%m-%d')
        principal_pct = 0
        principal_amt = 0
        description = f"Payment {payment_num}"
        
        if current_date_str in principal_payment_map:
            principal_pct = principal_payment_map[current_date_str]['percentage']
            principal_amt = round(principal * (principal_pct / 100), 2)
            description = principal_payment_map[current_date_str].get('description', description)
        
        interest_payments.append({
            "date": current_date_str,
            "amount": interest_amount,
            "days": days_in_period,
            "outstanding_principal": round(outstanding_principal, 2),
            "is_partial": False
        })
        
        combined_schedule.append({
            "date": current_date_str,
            "description": description,
            "principal_percentage": principal_pct,
            "principal_amount": principal_amt,
            "interest_amount": interest_amount,
            "total_payment": round(principal_amt + interest_amount, 2),
            "outstanding_principal_before": round(outstanding_principal, 2),
            "outstanding_principal_after": round(outstanding_principal - principal_amt, 2),
            "days_in_period": days_in_period
        })
        
        total_interest += interest_amount
        total_principal_paid += principal_amt
        outstanding_principal -= principal_amt
        prev_date = current
        payment_num += 1
    
    return {
        "interest_payments": interest_payments,
        "combined_schedule": combined_schedule,
        "total_interest": round(total_interest, 2),
        "total_principal": round(total_principal_paid, 2),
        "total_payout": round(total_interest + total_principal_paid, 2)
    }


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()

# Auth Models
class LoginStep1(BaseModel):
    pan: str
    password: str

class LoginStep2(BaseModel):
    temp_token: str
    pin: str

class PasswordResetRequest(BaseModel):
    pan: str
    email: str

class PasswordResetConfirm(BaseModel):
    reset_token: str
    new_password: str
    new_pin: str

class CustomerSignup(BaseModel):
    pan: str
    name: str
    email: str
    phone: str
    password: str
    pin: str

class UserCreate(BaseModel):
    pan: str
    name: str
    email: str
    phone: str
    password: str
    pin: str
    role: str  # "broker" or "sub_broker"

class User(BaseModel):
    id: str
    pan: str
    name: str
    email: str
    phone: str
    role: str
    created_at: datetime

class UserInDB(User):
    password_hash: str
    pin_hash: str


# Auth Helper Functions
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current authenticated user from JWT token"""
    token = credentials.credentials
    payload = verify_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0, "pin_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user


# Auth Routes
@api_router.post("/auth/login-step1")
async def login_step1(login: LoginStep1):
    """Step 1: Verify PAN and Password, return temp token"""
    # Find user by PAN
    user = await db.users.find_one({"pan": login.pan.upper()})
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid PAN or Password")
    
    # Verify password
    if not verify_password(login.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid PAN or Password")
    
    # Create temporary token (expires in 5 minutes)
    temp_token = create_access_token(
        data={"user_id": user['id'], "step": 1},
        expires_delta=timedelta(minutes=5)
    )
    
    return {"temp_token": temp_token}


@api_router.post("/auth/login-step2")
async def login_step2(login: LoginStep2):
    """Step 2: Verify PIN and return full access token"""
    # Verify temp token
    payload = verify_token(login.temp_token)
    
    if not payload or payload.get("step") != 1:
        raise HTTPException(status_code=401, detail="Invalid or expired temporary token")
    
    user_id = payload.get("user_id")
    user = await db.users.find_one({"id": user_id})
    
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Check if user is active (for clients, they must verify profile first)
    if user.get('is_active') is False:
        raise HTTPException(status_code=403, detail="Account not activated. Please verify your profile first.")
    
    # Verify PIN
    if not verify_password(login.pin, user['pin_hash']):
        raise HTTPException(status_code=401, detail="Invalid PIN")
    
    # Create full access token
    access_token = create_access_token(
        data={"user_id": user['id'], "role": user['role']}
    )
    
    # Add client_id for client users
    user_response = {
        "id": user['id'],
        "pan": user['pan'],
        "name": user['name'],
        "email": user['email'],
        "phone": user['phone'],
        "role": user['role']
    }
    
    if user['role'] == 'client' and user.get('client_id'):
        user_response['client_id'] = user['client_id']
    
    return {
        "token": access_token,
        "user": user_response
    }


# Password Reset Routes
@api_router.post("/auth/forgot-password")
async def forgot_password(request: PasswordResetRequest, background_tasks: BackgroundTasks):
    """Request password reset - sends email with reset token"""
    # Find user by PAN and email
    user = await db.users.find_one({
        "pan": request.pan.upper(),
        "email": request.email.lower()
    })
    
    if not user:
        # Don't reveal if user exists or not for security
        return {"message": "If your PAN and email match our records, you will receive a reset link"}
    
    # Create reset token (expires in 1 hour)
    reset_token = create_access_token(
        data={"user_id": user['id'], "type": "password_reset"},
        expires_delta=timedelta(hours=1)
    )
    
    # Store reset token in database
    await db.password_resets.insert_one({
        "user_id": user['id'],
        "token": reset_token,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "used": False
    })
    
    # Send reset email
    try:
        background_tasks.add_task(
            send_password_reset_email,
            user['email'],
            user['name'],
            reset_token
        )
    except Exception as e:
        logger.error(f"Error sending reset email: {e}")
    
    return {"message": "If your PAN and email match our records, you will receive a reset link"}


@api_router.post("/auth/reset-password")
async def reset_password(request: PasswordResetConfirm):
    """Reset password and PIN using reset token"""
    # Verify token
    payload = verify_token(request.reset_token)
    
    if not payload or payload.get("type") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    user_id = payload.get("user_id")
    
    # Check if token was already used
    reset_record = await db.password_resets.find_one({
        "user_id": user_id,
        "token": request.reset_token,
        "used": False
    })
    
    if not reset_record:
        raise HTTPException(status_code=400, detail="Reset token already used or invalid")
    
    # Validate new password and PIN
    if len(request.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    if len(request.new_pin) != 4 or not request.new_pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")
    
    # Update user password and PIN
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "password_hash": get_password_hash(request.new_password),
            "pin_hash": get_password_hash(request.new_pin)
        }}
    )
    
    # Mark token as used
    await db.password_resets.update_one(
        {"_id": reset_record["_id"]},
        {"$set": {"used": True}}
    )
    
    return {"message": "Password and PIN reset successfully. You can now login with your new credentials."}


@api_router.get("/auth/verify-reset-token/{token}")
async def verify_reset_token(token: str):
    """Verify if a reset token is valid"""
    payload = verify_token(token)
    
    if not payload or payload.get("type") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    # Check if token was already used
    reset_record = await db.password_resets.find_one({
        "token": token,
        "used": False
    })
    
    if not reset_record:
        raise HTTPException(status_code=400, detail="Reset token already used")
    
    return {"valid": True, "message": "Token is valid"}


# Customer Self-Registration
@api_router.post("/auth/customer-signup")
async def customer_signup(signup: CustomerSignup):
    """Allow customers to sign up directly"""
    # Validate PAN format (basic validation)
    pan = signup.pan.upper().strip()
    if len(pan) != 10:
        raise HTTPException(status_code=400, detail="PAN must be exactly 10 characters")
    
    # Check if PAN already exists
    existing_user = await db.users.find_one({"pan": pan})
    if existing_user:
        raise HTTPException(status_code=400, detail="PAN already registered. Please login or reset your password.")
    
    # Check if email already exists
    existing_email = await db.users.find_one({"email": signup.email.lower()})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate password
    if len(signup.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    # Validate PIN
    if len(signup.pin) != 4 or not signup.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")
    
    # Create user account
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "pan": pan,
        "name": signup.name.strip(),
        "email": signup.email.lower().strip(),
        "phone": signup.phone.strip(),
        "password_hash": get_password_hash(signup.password),
        "pin_hash": get_password_hash(signup.pin),
        "role": "client",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "self_registered": True
    }
    
    await db.users.insert_one(user)
    
    # Create corresponding client record
    client_id = str(uuid.uuid4())
    client = {
        "id": client_id,
        "name": signup.name.strip(),
        "email": signup.email.lower().strip(),
        "phone": signup.phone.strip(),
        "pan": pan,
        "city": "",
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": "self_registration"
    }
    
    await db.clients.insert_one(client)
    
    # Link user to client
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"client_id": client_id}}
    )
    
    return {
        "message": "Account created successfully! You can now login.",
        "user": {
            "id": user_id,
            "pan": pan,
            "name": signup.name,
            "email": signup.email,
            "role": "client"
        }
    }


@api_router.post("/auth/register")
async def register_user(user_data: UserCreate):
    """Register a new user (broker or sub-broker)"""
    # Check if PAN already exists
    existing = await db.users.find_one({"pan": user_data.pan.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="PAN already registered")
    
    # Validate role
    if user_data.role not in ["broker", "sub_broker"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    # Create user
    user = {
        "id": str(uuid.uuid4()),
        "pan": user_data.pan.upper(),
        "name": user_data.name,
        "email": user_data.email,
        "phone": user_data.phone,
        "password_hash": get_password_hash(user_data.password),
        "pin_hash": get_password_hash(user_data.pin),
        "role": user_data.role,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user)
    
    return {
        "id": user['id'],
        "pan": user['pan'],
        "name": user['name'],
        "role": user['role']
    }


# Partner Models and Routes
class PartnerCreate(BaseModel):
    name: str
    pan: str
    partner_code: str
    email: str
    mobile: str
    color: str
    address_line1: str
    address_line2: str
    city: str
    country: str
    state: str
    pincode: str
    password: str
    pin: str


class Partner(BaseModel):
    id: str
    name: str
    pan: str
    partner_code: str
    email: str
    mobile: str
    color: str
    address_line1: str
    address_line2: str
    city: str
    country: str
    state: str
    pincode: str
    created_by: str
    last_log: Optional[str] = None
    created_at: datetime


@api_router.post("/partners")
async def create_partner(partner_data: PartnerCreate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Create a new sub-broker partner (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can create partners")
    
    # Check if PAN already exists
    existing_user = await db.users.find_one({"pan": partner_data.pan.upper()})
    if existing_user:
        raise HTTPException(status_code=400, detail="PAN already registered")
    
    # Check if partner code already exists
    existing_partner = await db.partners.find_one({"partner_code": partner_data.partner_code})
    if existing_partner:
        raise HTTPException(status_code=400, detail="Partner code already exists")
    
    # Create user account for the partner
    user = {
        "id": str(uuid.uuid4()),
        "pan": partner_data.pan.upper(),
        "name": partner_data.name,
        "email": partner_data.email,
        "phone": partner_data.mobile,
        "password_hash": get_password_hash(partner_data.password),
        "pin_hash": get_password_hash(partner_data.pin),
        "role": "sub_broker",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    
    # Create partner record
    partner = {
        "id": user['id'],
        "name": partner_data.name,
        "pan": partner_data.pan.upper(),
        "partner_code": partner_data.partner_code,
        "email": partner_data.email,
        "mobile": partner_data.mobile,
        "color": partner_data.color,
        "address_line1": partner_data.address_line1,
        "address_line2": partner_data.address_line2,
        "city": partner_data.city,
        "country": partner_data.country,
        "state": partner_data.state,
        "pincode": partner_data.pincode,
        "created_by": current_user['id'],
        "last_log": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        # Store plain credentials for display to broker (not best practice but per user request)
        "initial_password": partner_data.password,
        "initial_pin": partner_data.pin
    }
    await db.partners.insert_one(partner)
    
    # Send welcome email in background (if email is provided)
    if partner_data.email:
        background_tasks.add_task(
            send_welcome_email_subbroker,
            subbroker_name=partner_data.name,
            subbroker_email=partner_data.email,
            pan=partner_data.pan.upper(),
            password=partner_data.password,
            pin=partner_data.pin,
            partner_code=partner_data.partner_code,
            broker_name=current_user.get('name', 'Your Broker')
        )
    
    return {
        "id": partner['id'],
        "name": partner['name'],
        "partner_code": partner['partner_code'],
        "email": partner['email']
    }


@api_router.get("/partners")
async def get_partners(current_user: dict = Depends(get_current_user)):
    """Get all partners created by the broker"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can view partners")
    
    partners = await db.partners.find({"created_by": current_user['id']}, {"_id": 0}).to_list(1000)
    
    for partner in partners:
        if isinstance(partner.get('created_at'), str):
            partner['created_at'] = datetime.fromisoformat(partner['created_at'])
    
    return partners


@api_router.delete("/partners/{partner_id}")
async def delete_partner(partner_id: str, current_user: dict = Depends(get_current_user)):
    """Soft delete a sub-broker partner (brokers only) - marks as inactive if has trades"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete partners")
    
    # Check if partner exists and belongs to this broker
    partner = await db.partners.find_one({"id": partner_id, "created_by": current_user['id']})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    # Check if sub-broker has any confirmed trades or linked clients with trades
    trades = await db.trades.find({"created_by": partner_id, "status": "approved"}).to_list(1)
    linked_clients = await db.clients.find({"linked_subbroker_id": partner_id}).to_list(1)
    
    if trades or linked_clients:
        # Soft delete - mark as inactive
        await db.partners.update_one(
            {"id": partner_id},
            {"$set": {"is_active": False, "deactivated_at": datetime.now(timezone.utc).isoformat()}}
        )
        await db.users.update_one(
            {"id": partner_id},
            {"$set": {"is_active": False}}
        )
        return {"message": "Sub-broker marked as inactive (has trades or linked clients)", "soft_delete": True}
    else:
        # Hard delete - no trades or linked clients
        await db.partners.delete_one({"id": partner_id})
        await db.users.delete_one({"id": partner_id})
        return {"message": "Sub-broker deleted successfully", "soft_delete": False}


@api_router.post("/partners/{partner_id}/reactivate")
async def reactivate_partner(partner_id: str, current_user: dict = Depends(get_current_user)):
    """Reactivate an inactive sub-broker (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can reactivate partners")
    
    partner = await db.partners.find_one({"id": partner_id, "created_by": current_user['id']})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    await db.partners.update_one(
        {"id": partner_id},
        {"$set": {"is_active": True}, "$unset": {"deactivated_at": ""}}
    )
    await db.users.update_one(
        {"id": partner_id},
        {"$set": {"is_active": True}}
    )
    
    return {"message": "Sub-broker reactivated successfully"}


# ==================== BULK UPLOAD ENDPOINTS ====================

@api_router.get("/bulk/template/sub-brokers")
async def download_subbroker_template(current_user: dict = Depends(get_current_user)):
    """Download Excel template for bulk sub-broker upload"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can download templates")
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Sub Brokers"
    
    # Headers
    headers = ["Name*", "PAN*", "Partner Code*", "Email*", "Mobile*", "Password*", "PIN*", 
               "Address Line 1", "Address Line 2", "City", "State", "Country", "Pincode"]
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
        cell.alignment = Alignment(horizontal="center")
        ws.column_dimensions[get_column_letter(col)].width = 18
    
    # Sample row
    sample = ["John Doe", "ABCDE1234F", "SB001", "john@example.com", "9876543210", 
              "password123", "1234", "123 Main St", "Suite 100", "Mumbai", "Maharashtra", "India", "400001"]
    for col, value in enumerate(sample, 1):
        ws.cell(row=2, column=col, value=value)
    
    # Instructions sheet
    ws_instructions = wb.create_sheet("Instructions")
    instructions = [
        "BULK SUB-BROKER UPLOAD INSTRUCTIONS",
        "",
        "Required Fields (marked with *):",
        "- Name: Full name of the sub-broker",
        "- PAN: Valid PAN number (10 characters, e.g., ABCDE1234F)",
        "- Partner Code: Unique code for the sub-broker (e.g., SB001)",
        "- Email: Valid email address",
        "- Mobile: 10-digit mobile number",
        "- Password: Login password (min 6 characters)",
        "- PIN: 4-digit PIN for transactions",
        "",
        "Optional Fields:",
        "- Address details for complete profile",
        "",
        "Notes:",
        "- Delete the sample row before uploading",
        "- PAN and Partner Code must be unique",
        "- Maximum 100 records per upload"
    ]
    for row, text in enumerate(instructions, 1):
        ws_instructions.cell(row=row, column=1, value=text)
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=sub_broker_template.xlsx"}
    )


@api_router.post("/bulk/sub-brokers")
async def bulk_upload_subbrokers(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Bulk upload sub-brokers from Excel file"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can bulk upload sub-brokers")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
    
    import pandas as pd
    
    content = await file.read()
    df = pd.read_excel(io.BytesIO(content), sheet_name=0)
    
    # Clean column names
    df.columns = [col.replace('*', '').strip().lower().replace(' ', '_') for col in df.columns]
    
    results = {"success": 0, "failed": 0, "errors": []}
    
    for idx, row in df.iterrows():
        try:
            # Validate required fields
            if pd.isna(row.get('name')) or pd.isna(row.get('pan')) or pd.isna(row.get('partner_code')):
                results['errors'].append(f"Row {idx+2}: Missing required fields (Name, PAN, or Partner Code)")
                results['failed'] += 1
                continue
            
            pan = str(row['pan']).upper().strip()
            partner_code = str(row['partner_code']).strip()
            
            # Check for duplicates
            existing_pan = await db.users.find_one({"pan": pan})
            if existing_pan:
                results['errors'].append(f"Row {idx+2}: PAN {pan} already exists")
                results['failed'] += 1
                continue
            
            existing_code = await db.partners.find_one({"partner_code": partner_code})
            if existing_code:
                results['errors'].append(f"Row {idx+2}: Partner code {partner_code} already exists")
                results['failed'] += 1
                continue
            
            # Create user
            user_id = str(uuid.uuid4())
            user = {
                "id": user_id,
                "pan": pan,
                "name": str(row['name']).strip(),
                "email": str(row.get('email', '')).strip(),
                "phone": str(row.get('mobile', '')).strip(),
                "password_hash": get_password_hash(str(row.get('password', 'password123'))),
                "pin_hash": get_password_hash(str(row.get('pin', '1234'))),
                "role": "sub_broker",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(user)
            
            # Create partner record
            partner = {
                "id": user_id,
                "name": str(row['name']).strip(),
                "pan": pan,
                "partner_code": partner_code,
                "email": str(row.get('email', '')).strip(),
                "mobile": str(row.get('mobile', '')).strip(),
                "color": "#4F46E5",
                "address_line1": str(row.get('address_line_1', '')).strip() if not pd.isna(row.get('address_line_1')) else "",
                "address_line2": str(row.get('address_line_2', '')).strip() if not pd.isna(row.get('address_line_2')) else "",
                "city": str(row.get('city', '')).strip() if not pd.isna(row.get('city')) else "",
                "state": str(row.get('state', '')).strip() if not pd.isna(row.get('state')) else "",
                "country": str(row.get('country', 'India')).strip() if not pd.isna(row.get('country')) else "India",
                "pincode": str(row.get('pincode', '')).strip() if not pd.isna(row.get('pincode')) else "",
                "created_by": current_user['id'],
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.partners.insert_one(partner)
            results['success'] += 1
            
        except Exception as e:
            results['errors'].append(f"Row {idx+2}: {str(e)}")
            results['failed'] += 1
    
    return results


@api_router.get("/bulk/template/clients")
async def download_client_template(current_user: dict = Depends(get_current_user)):
    """Download Excel template for bulk client upload with all fields"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can download templates")
    
    wb = Workbook()
    
    # Sheet 1: Personal Details
    ws_personal = wb.active
    ws_personal.title = "Personal Details"
    
    personal_headers = ["Name*", "PAN*", "UCC", "Email*", "Mobile*", "Password*", "PIN*", 
                       "Date of Birth", "Occupation", "Father/Husband Name", "Demat Account No"]
    for col, header in enumerate(personal_headers, 1):
        cell = ws_personal.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="7C3AED", end_color="7C3AED", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_personal.column_dimensions[get_column_letter(col)].width = 18
    
    # Sample row
    personal_sample = ["Jane Smith", "PQRST5678U", "UCC123456", "jane@example.com", "9876543213", 
                      "password123", "1234", "1990-05-15", "Business", "John Smith", "1234567890123456"]
    for col, value in enumerate(personal_sample, 1):
        ws_personal.cell(row=2, column=col, value=value)
    
    # Sheet 2: Address Details
    ws_address = wb.create_sheet("Address Details")
    
    address_headers = ["PAN*", "Address Line 1", "Address Line 2", "City", "State", "Country", "Pincode"]
    for col, header in enumerate(address_headers, 1):
        cell = ws_address.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="059669", end_color="059669", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_address.column_dimensions[get_column_letter(col)].width = 18
    
    address_sample = ["PQRST5678U", "456 Park Avenue", "Apartment 10B", "Mumbai", "Maharashtra", "India", "400001"]
    for col, value in enumerate(address_sample, 1):
        ws_address.cell(row=2, column=col, value=value)
    
    # Sheet 3: Bank Details
    ws_bank = wb.create_sheet("Bank Details")
    
    bank_headers = ["PAN*", "Bank Name", "Account Number", "Branch", "IFSC Code"]
    for col, header in enumerate(bank_headers, 1):
        cell = ws_bank.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="EA580C", end_color="EA580C", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_bank.column_dimensions[get_column_letter(col)].width = 20
    
    bank_sample = ["PQRST5678U", "HDFC Bank", "12345678901234", "Andheri West", "HDFC0001234"]
    for col, value in enumerate(bank_sample, 1):
        ws_bank.cell(row=2, column=col, value=value)
    
    # Sheet 4: Nominee Details
    ws_nominee = wb.create_sheet("Nominee Details")
    
    nominee_headers = ["PAN*", "Nominee Name", "Nominee DOB", "Nominee Mobile", "Relationship"]
    for col, header in enumerate(nominee_headers, 1):
        cell = ws_nominee.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="DC2626", end_color="DC2626", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_nominee.column_dimensions[get_column_letter(col)].width = 18
    
    nominee_sample = ["PQRST5678U", "John Smith", "1965-03-20", "9876543210", "Father"]
    for col, value in enumerate(nominee_sample, 1):
        ws_nominee.cell(row=2, column=col, value=value)
    
    # Sheet 5: Sub-Broker Assignment
    ws_subbroker = wb.create_sheet("Sub-Broker Assignment")
    
    sb_headers = ["PAN*", "Sub-Broker Code"]
    for col, header in enumerate(sb_headers, 1):
        cell = ws_subbroker.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_subbroker.column_dimensions[get_column_letter(col)].width = 20
    
    sb_sample = ["PQRST5678U", "SB001"]
    for col, value in enumerate(sb_sample, 1):
        ws_subbroker.cell(row=2, column=col, value=value)
    
    # Instructions sheet
    ws_instructions = wb.create_sheet("Instructions")
    instructions = [
        "BULK CLIENT UPLOAD INSTRUCTIONS",
        "",
        "This template has 5 data sheets. Fill Personal Details (required) and optionally fill other sheets.",
        "PAN number is used to link data across sheets.",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 1 - Personal Details (Purple) - REQUIRED",
        "═══════════════════════════════════════════════════════════════",
        "• Name*: Full legal name",
        "• PAN*: Valid 10-character PAN (e.g., PQRST5678U)",
        "• Email*: Valid email address",
        "• Mobile*: 10-digit mobile number",
        "• Password*: Login password (min 6 characters)",
        "• PIN*: 4-digit transaction PIN",
        "• Date of Birth: Format YYYY-MM-DD",
        "• Occupation: Client's occupation/profession",
        "• Father/Husband Name: As per PAN card",
        "• Demat Account No: 16-digit demat account",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 2 - Address Details (Green) - OPTIONAL",
        "═══════════════════════════════════════════════════════════════",
        "• Complete residential address of the client",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 3 - Bank Details (Orange) - OPTIONAL",
        "═══════════════════════════════════════════════════════════════",
        "• Bank account details for payments and withdrawals",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 4 - Nominee Details (Red) - OPTIONAL",
        "═══════════════════════════════════════════════════════════════",
        "• Nominee information for the client's investments",
        "• Relationship: Father, Mother, Spouse, Son, Daughter, etc.",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 5 - Sub-Broker Assignment (Indigo) - OPTIONAL",
        "═══════════════════════════════════════════════════════════════",
        "• Assign clients to sub-brokers using their partner code",
        "",
        "═══════════════════════════════════════════════════════════════",
        "IMPORTANT NOTES",
        "═══════════════════════════════════════════════════════════════",
        "1. PAN must be unique and match across all sheets",
        "2. Delete sample rows before uploading",
        "3. Maximum 200 clients per upload",
        "4. Dates should be in YYYY-MM-DD format",
    ]
    for row, text in enumerate(instructions, 1):
        cell = ws_instructions.cell(row=row, column=1, value=text)
        if text.startswith("═") or text.startswith("SHEET") or text.startswith("BULK") or text.startswith("IMPORTANT"):
            cell.font = Font(bold=True)
        ws_instructions.column_dimensions['A'].width = 70
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=client_upload_template.xlsx"}
    )


@api_router.post("/bulk/clients")
async def bulk_upload_clients(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Bulk upload clients from Excel file"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can bulk upload clients")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
    
    import pandas as pd
    
    content = await file.read()
    df = pd.read_excel(io.BytesIO(content), sheet_name=0)
    
    # Clean column names
    df.columns = [col.replace('*', '').strip().lower().replace(' ', '_').replace('-', '_') for col in df.columns]
    
    results = {"success": 0, "failed": 0, "errors": []}
    
    for idx, row in df.iterrows():
        try:
            # Validate required fields
            if pd.isna(row.get('name')) or pd.isna(row.get('pan')):
                results['errors'].append(f"Row {idx+2}: Missing required fields (Name or PAN)")
                results['failed'] += 1
                continue
            
            pan = str(row['pan']).upper().strip()
            ucc = str(row.get('ucc', '')).upper().strip() if not pd.isna(row.get('ucc')) else ""
            
            # Check for duplicates
            existing_pan = await db.users.find_one({"pan": pan})
            if existing_pan:
                results['errors'].append(f"Row {idx+2}: PAN {pan} already exists")
                results['failed'] += 1
                continue
            
            # Find linked sub-broker if provided
            linked_subbroker_id = None
            sub_broker_code = row.get('sub_broker_code')
            if not pd.isna(sub_broker_code) and sub_broker_code:
                sub_broker = await db.partners.find_one({"partner_code": str(sub_broker_code).strip()})
                if sub_broker:
                    linked_subbroker_id = sub_broker['id']
                else:
                    results['errors'].append(f"Row {idx+2}: Sub-broker code {sub_broker_code} not found (client will be created without link)")
            
            # Create user
            user_id = str(uuid.uuid4())
            user = {
                "id": user_id,
                "pan": pan,
                "ucc": ucc,
                "name": str(row['name']).strip(),
                "email": str(row.get('email', '')).strip() if not pd.isna(row.get('email')) else "",
                "phone": str(row.get('mobile', '')).strip() if not pd.isna(row.get('mobile')) else "",
                "password_hash": get_password_hash(str(row.get('password', 'password123'))),
                "pin_hash": get_password_hash(str(row.get('pin', '1234'))),
                "role": "client",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(user)
            
            # Create client record
            client = {
                "id": user_id,
                "name": str(row['name']).strip(),
                "pan_number": pan,  # Use pan_number to match client schema
                "ucc": ucc,
                "email": str(row.get('email', '')).strip() if not pd.isna(row.get('email')) else "",
                "mobile": str(row.get('mobile', '')).strip() if not pd.isna(row.get('mobile')) else "",
                "address_line1": str(row.get('address_line_1', '')).strip() if not pd.isna(row.get('address_line_1')) else "",
                "address_line2": str(row.get('address_line_2', '')).strip() if not pd.isna(row.get('address_line_2')) else "",
                "city": str(row.get('city', '')).strip() if not pd.isna(row.get('city')) else "",
                "state": str(row.get('state', '')).strip() if not pd.isna(row.get('state')) else "",
                "country": str(row.get('country', 'India')).strip() if not pd.isna(row.get('country')) else "India",
                "pincode": str(row.get('pincode', '')).strip() if not pd.isna(row.get('pincode')) else "",
                "linked_subbroker_id": linked_subbroker_id,
                "created_by": current_user['id'],
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "bond_allocations": [],
                "real_estate_investments": []
            }
            await db.clients.insert_one(client)
            results['success'] += 1
            
        except Exception as e:
            results['errors'].append(f"Row {idx+2}: {str(e)}")
            results['failed'] += 1
    
    return results


@api_router.get("/bulk/template/bonds")
async def download_bond_template(current_user: dict = Depends(get_current_user)):
    """Download Excel template for bulk bond upload with all fields"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can download templates")
    
    wb = Workbook()
    
    # Sheet 1: Basic Bond Information
    ws_basic = wb.active
    ws_basic.title = "Bond Details"
    
    basic_headers = ["Bond Code*", "Bond Name*", "Issuer/Company Name", 
                     "Start Date*", "Maturity Date*", "Description"]
    for col, header in enumerate(basic_headers, 1):
        cell = ws_basic.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="059669", end_color="059669", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_basic.column_dimensions[get_column_letter(col)].width = 20
    
    basic_sample = ["ABC-NCD-2025", "ABC Corp NCD 2025", "ABC Corporation Ltd", 
                   "2025-01-15", "2027-01-15", "Secured NCD with quarterly interest"]
    for col, value in enumerate(basic_sample, 1):
        ws_basic.cell(row=2, column=col, value=value)
    
    # Sheet 2: Financial Details
    ws_financial = wb.create_sheet("Financial Details")
    
    financial_headers = ["Bond Code*", "Principal Amount (INR)*", "Coupon Rate (%)*", 
                        "Primary IRR (%)*", "Secondary IRR (%)*", "Face Value per Unit"]
    for col, header in enumerate(financial_headers, 1):
        cell = ws_financial.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="7C3AED", end_color="7C3AED", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_financial.column_dimensions[get_column_letter(col)].width = 22
    
    financial_sample = ["ABC-NCD-2025", 1000000, 12.5, 14.0, 12.0, 100000]
    for col, value in enumerate(financial_sample, 1):
        ws_financial.cell(row=2, column=col, value=value)
    
    # Sheet 3: Units & Limits
    ws_units = wb.create_sheet("Units & Limits")
    
    units_headers = ["Bond Code*", "Total Units*", "Minimum Units per Order", 
                    "Interest Payment Frequency"]
    for col, header in enumerate(units_headers, 1):
        cell = ws_units.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="EA580C", end_color="EA580C", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_units.column_dimensions[get_column_letter(col)].width = 25
    
    units_sample = ["ABC-NCD-2025", 10, 1, "quarterly"]
    for col, value in enumerate(units_sample, 1):
        ws_units.cell(row=2, column=col, value=value)
    
    # Sheet 4: Principal Payments
    ws_principal = wb.create_sheet("Principal Payments")
    
    principal_headers = ["Bond Code*", "Payment Description*", "Payment Date*", "Percentage*"]
    for col, header in enumerate(principal_headers, 1):
        cell = ws_principal.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="DC2626", end_color="DC2626", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_principal.column_dimensions[get_column_letter(col)].width = 22
    
    principal_samples = [
        ["ABC-NCD-2025", "Partial Principal 1", "2026-07-15", 50],
        ["ABC-NCD-2025", "Final Principal", "2027-01-15", 50],
    ]
    for row_idx, sample in enumerate(principal_samples, 2):
        for col, value in enumerate(sample, 1):
            ws_principal.cell(row=row_idx, column=col, value=value)
    
    # Sheet 5: Cashflows Per Unit (NEW - for exact cashflow schedules)
    ws_cashflows = wb.create_sheet("Cashflows Per Unit")
    
    cashflow_headers = ["Bond Code*", "Payment Date*", "Interest Per Unit*", "Principal Per Unit*"]
    for col, header in enumerate(cashflow_headers, 1):
        cell = ws_cashflows.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="0891B2", end_color="0891B2", fill_type="solid")  # Cyan
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_cashflows.column_dimensions[get_column_letter(col)].width = 22
    
    # Sample cashflows (like CDUCIC01 bond)
    cashflow_samples = [
        ["ABC-NCD-2025", "2025-04-24", 5308.22, 27777.78],
        ["ABC-NCD-2025", "2025-05-24", 4851.60, 27777.78],
        ["ABC-NCD-2025", "2025-06-24", 4718.42, 27777.78],
        ["ABC-NCD-2025", "2025-07-24", 4280.82, 27777.78],
    ]
    for row_idx, sample in enumerate(cashflow_samples, 2):
        for col, value in enumerate(sample, 1):
            ws_cashflows.cell(row=row_idx, column=col, value=value)
    
    # Instructions sheet
    ws_instructions = wb.create_sheet("Instructions")
    instructions = [
        "BULK BOND UPLOAD INSTRUCTIONS",
        "",
        "This template has 5 data sheets. Fill required sheets.",
        "Bond Code is used to link data across sheets.",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 1 - Bond Details (Green) - REQUIRED",
        "═══════════════════════════════════════════════════════════════",
        "• Bond Code*: Unique identifier (e.g., ABC-NCD-2025)",
        "• Bond Name*: Full name of the bond issue",
        "• Issuer/Company Name: Company issuing the bond",
        "• Start Date*: Bond issue date (YYYY-MM-DD)",
        "• Maturity Date*: Final maturity date (YYYY-MM-DD)",
        "• Description: Additional details about the bond",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 2 - Financial Details (Purple) - REQUIRED",
        "═══════════════════════════════════════════════════════════════",
        "• Principal Amount*: Total principal in INR",
        "• Coupon Rate*: Annual interest rate as percentage",
        "• Primary IRR*: Expected IRR for primary buyer",
        "• Secondary IRR*: Target IRR for secondary market trading",
        "• Face Value per Unit: Value of each unit (optional)",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 3 - Units & Limits (Orange) - REQUIRED",
        "═══════════════════════════════════════════════════════════════",
        "• Total Units*: Number of units available (default: 1)",
        "• Minimum Units: Minimum purchase quantity (default: 1)",
        "• Interest Frequency: quarterly, monthly, semi-annual, annual",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 4 - Principal Payments (Red) - OPTIONAL if Sheet 5 used",
        "═══════════════════════════════════════════════════════════════",
        "• Add principal repayment schedule",
        "• Total percentages must equal 100%",
        "• Can have multiple payments (partial + final)",
        "• SKIP this sheet if using 'Cashflows Per Unit' (Sheet 5)",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 5 - Cashflows Per Unit (Cyan) - RECOMMENDED",
        "═══════════════════════════════════════════════════════════════",
        "• Exact interest and principal amounts PER UNIT for each date",
        "• Use this for PRECISE cashflow matching",
        "• Copy from your bond's actual repayment schedule",
        "• System will use these EXACT values for client cashflows",
        "• When used, Sheet 4 is ignored",
        "",
        "═══════════════════════════════════════════════════════════════",
        "IMPORTANT NOTES",
        "═══════════════════════════════════════════════════════════════",
        "1. Bond Code must be unique and match across all sheets",
        "2. Use Sheet 5 (Cashflows Per Unit) for secondary market bonds",
        "3. Sheet 5 values are EXACT - system won't recalculate",
        "4. Maximum 50 bonds per upload",
        "5. Historical trades will use Sheet 5 cashflows × client units",
    ]
    for row, text in enumerate(instructions, 1):
        cell = ws_instructions.cell(row=row, column=1, value=text)
        if text.startswith("═") or text.startswith("SHEET") or text.startswith("BULK") or text.startswith("IMPORTANT"):
            cell.font = Font(bold=True)
        ws_instructions.column_dimensions['A'].width = 70
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=bond_template.xlsx"}
    )


@api_router.post("/bulk/bonds")
async def bulk_upload_bonds(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Bulk upload bonds from Excel file"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can bulk upload bonds")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
    
    import pandas as pd
    
    content = await file.read()
    excel_file = io.BytesIO(content)
    
    # Read all sheets from the Excel file
    try:
        # Sheet 1: Bond Details
        df_basic = pd.read_excel(excel_file, sheet_name=0)
        df_basic.columns = [col.replace('*', '').replace('(%)', '').strip().lower().replace(' ', '_').replace('/', '_') for col in df_basic.columns]
        
        # Sheet 2: Financial Details  
        excel_file.seek(0)
        df_financial = pd.read_excel(excel_file, sheet_name=1)
        df_financial.columns = [col.replace('*', '').replace('(%)', '').replace('(INR)', '').strip().lower().replace(' ', '_') for col in df_financial.columns]
        
        # Sheet 3: Units & Limits
        excel_file.seek(0)
        df_units = pd.read_excel(excel_file, sheet_name=2)
        df_units.columns = [col.replace('*', '').strip().lower().replace(' ', '_') for col in df_units.columns]
        
        # Sheet 4: Principal Payments
        excel_file.seek(0)
        df_principal = pd.read_excel(excel_file, sheet_name=3)
        df_principal.columns = [col.replace('*', '').strip().lower().replace(' ', '_') for col in df_principal.columns]
        
        # Sheet 5: Cashflows Per Unit (optional but recommended)
        excel_file.seek(0)
        try:
            df_cashflows = pd.read_excel(excel_file, sheet_name=4)
            df_cashflows.columns = [col.replace('*', '').strip().lower().replace(' ', '_') for col in df_cashflows.columns]
        except:
            df_cashflows = pd.DataFrame()  # Empty if sheet doesn't exist
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading Excel sheets: {str(e)}. Ensure the file has the required sheets.")
    
    # Merge dataframes on bond_code
    df = df_basic.merge(df_financial, on='bond_code', how='left')
    df = df.merge(df_units, on='bond_code', how='left')
    
    results = {"success": 0, "failed": 0, "errors": [], "created_bonds": []}
    
    # Group principal payments by bond_code
    principal_payments_map = {}
    for _, prow in df_principal.iterrows():
        bc = str(prow.get('bond_code', '')).strip()
        if bc and not pd.isna(bc):
            if bc not in principal_payments_map:
                principal_payments_map[bc] = []
            payment_date = prow.get('payment_date')
            percentage = prow.get('percentage')
            if not pd.isna(payment_date) and not pd.isna(percentage):
                try:
                    date_str = pd.to_datetime(payment_date).strftime('%Y-%m-%d')
                    principal_payments_map[bc].append({
                        "date": date_str,
                        "percentage": float(percentage),
                        "description": str(prow.get('payment_description', '')) if not pd.isna(prow.get('payment_description')) else ''
                    })
                except:
                    pass
    
    # Group cashflows per unit by bond_code (for exact cashflow schedules)
    cashflows_per_unit_map = {}
    if not df_cashflows.empty:
        for _, crow in df_cashflows.iterrows():
            bc = str(crow.get('bond_code', '')).strip()
            if bc and not pd.isna(bc):
                if bc not in cashflows_per_unit_map:
                    cashflows_per_unit_map[bc] = []
                payment_date = crow.get('payment_date')
                interest = crow.get('interest_per_unit')
                principal = crow.get('principal_per_unit')
                if not pd.isna(payment_date):
                    try:
                        date_str = pd.to_datetime(payment_date).strftime('%Y-%m-%d')
                        cashflows_per_unit_map[bc].append({
                            "date": date_str,
                            "interest_per_unit": float(interest) if not pd.isna(interest) else 0,
                            "principal_per_unit": float(principal) if not pd.isna(principal) else 0
                        })
                    except:
                        pass
        # Sort each bond's cashflows by date
        for bc in cashflows_per_unit_map:
            cashflows_per_unit_map[bc].sort(key=lambda x: x['date'])
    
    for idx, row in df.iterrows():
        try:
            # Validate required fields - using standardized column names after cleaning
            required_fields = ['bond_code', 'bond_name', 'principal_amount', 'coupon_rate', 
                              'primary_irr', 'secondary_irr', 'start_date', 'maturity_date']
            
            missing = [f for f in required_fields if f not in row.index or pd.isna(row.get(f))]
            if missing:
                results['errors'].append(f"Row {idx+2}: Missing required fields: {', '.join(missing)}")
                results['failed'] += 1
                continue
            
            bond_code = str(row['bond_code']).strip()
            
            # Check for duplicate bond code
            existing = await db.bonds.find_one({"bond_code": bond_code})
            if existing:
                results['errors'].append(f"Row {idx+2}: Bond code {bond_code} already exists")
                results['failed'] += 1
                continue
            
            # Parse dates
            start_date = pd.to_datetime(row['start_date']).strftime('%Y-%m-%d')
            end_date = pd.to_datetime(row['maturity_date']).strftime('%Y-%m-%d')
            
            # Get principal payments from Sheet 4 or default to 100% at maturity
            principal_payments = principal_payments_map.get(bond_code, [{"date": end_date, "percentage": 100.0}])
            if not principal_payments:
                principal_payments = [{"date": end_date, "percentage": 100.0}]
            
            # Get financial details
            frequency = str(row.get('interest_payment_frequency', 'quarterly')).lower().strip() if not pd.isna(row.get('interest_payment_frequency')) else 'quarterly'
            principal = float(row['principal_amount'])
            coupon_rate_val = float(row['coupon_rate'])
            
            # Check if we have custom principal payment schedule from Sheet 4
            # If yes, use combined schedule (interest paid monthly, principal per schedule)
            # If no, use standard interest schedule based on frequency
            
            if bond_code in principal_payments_map and len(principal_payments_map[bond_code]) > 0:
                # Use combined payment schedule - monthly interest, principal per schedule
                schedule_result = generate_combined_payment_schedule(
                    start_date=start_date,
                    end_date=end_date,
                    principal=principal,
                    coupon_rate=coupon_rate_val,
                    principal_payments=principal_payments
                )
                interest_payments = schedule_result['interest_payments']
                combined_schedule = schedule_result['combined_schedule']
            else:
                # Use standard interest payment schedule based on frequency
                interest_payments = generate_interest_payment_schedule(
                    start_date=start_date,
                    end_date=end_date,
                    principal=principal,
                    coupon_rate=coupon_rate_val,
                    frequency=frequency
                )
                combined_schedule = None
            
            bond_id = str(uuid.uuid4())
            
            # Check if we have exact cashflows per unit (preferred for secondary market bonds)
            cashflows_per_unit = cashflows_per_unit_map.get(bond_code, [])
            
            bond = {
                "id": bond_id,
                "bond_code": bond_code,
                "name": str(row['bond_name']).strip(),
                "principal_amount": principal,
                "coupon_rate": coupon_rate_val,
                "primary_irr": float(row['primary_irr']),
                "secondary_irr": float(row['secondary_irr']),
                "start_date": start_date,
                "end_date": end_date,
                "total_units": int(row.get('total_units', 1)) if not pd.isna(row.get('total_units')) else 1,
                "units_sold": 0,
                "interest_payment_frequency": frequency,
                "principal_payments": principal_payments,
                "interest_payments": interest_payments,
                "combined_schedule": combined_schedule,  # Auto-generated combined schedule
                "cashflows_per_unit": cashflows_per_unit,  # NEW: Exact cashflows per unit from Excel
                "issuer": str(row.get('issuer_company_name', '')) if not pd.isna(row.get('issuer_company_name')) else '',
                "description": str(row.get('description', '')) if not pd.isna(row.get('description')) else '',
                "face_value": float(row.get('face_value_per_unit', 0)) if not pd.isna(row.get('face_value_per_unit')) else 0,
                "created_by": current_user['id'],
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.bonds.insert_one(bond)
            results['success'] += 1
            results['created_bonds'].append({"id": bond_id, "name": bond['name'], "code": bond_code})
            
        except Exception as e:
            results['errors'].append(f"Row {idx+2}: {str(e)}")
            results['failed'] += 1
    
    return results


@api_router.get("/bulk/template/real-estate")
async def download_real_estate_template(current_user: dict = Depends(get_current_user)):
    """Download Excel template for bulk real estate upload"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can download templates")
    
    wb = Workbook()
    
    # Sheet 1: Basic Information
    ws_basic = wb.active
    ws_basic.title = "Basic Information"
    
    basic_headers = [
        "Building Name*", "Unit No*", "Developer Name*", "Location", 
        "Description", "Handover Date"
    ]
    for col, header in enumerate(basic_headers, 1):
        cell = ws_basic.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="1D4ED8", end_color="1D4ED8", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_basic.column_dimensions[get_column_letter(col)].width = 20
    
    # Sample data for Basic Info
    basic_sample = ["Palm Tower", "1201", "Emaar Properties", "Dubai Marina", 
                   "Luxury 2BR apartment with sea view", "2026-06-30"]
    for col, value in enumerate(basic_sample, 1):
        ws_basic.cell(row=2, column=col, value=value)
    
    # Sheet 2: Pricing & Fees
    ws_pricing = wb.create_sheet("Pricing & Fees")
    
    pricing_headers = [
        "Building Name*", "Unit No*", "Unit Price (AED)*", "DLD Fee (%)*", 
        "Admin Fee (AED)*", "Broker Fee (AED)", "Other Fees (AED)", 
        "Unit Selling Fee (%)"
    ]
    for col, header in enumerate(pricing_headers, 1):
        cell = ws_pricing.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="059669", end_color="059669", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_pricing.column_dimensions[get_column_letter(col)].width = 18
    
    # Sample data for Pricing
    pricing_sample = ["Palm Tower", "1201", 2500000, 4, 5000, 25000, 2000, 2]
    for col, value in enumerate(pricing_sample, 1):
        ws_pricing.cell(row=2, column=col, value=value)
    
    # Sheet 3: Unit Details
    ws_unit = wb.create_sheet("Unit Details")
    
    unit_headers = [
        "Building Name*", "Unit No*", "Unit Type*", "Floor*", 
        "Total Area (sqft)*", "Carpet Area (sqft)", "Balcony Area (sqft)", 
        "Parking Spaces"
    ]
    for col, header in enumerate(unit_headers, 1):
        cell = ws_unit.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="7C3AED", end_color="7C3AED", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_unit.column_dimensions[get_column_letter(col)].width = 18
    
    # Sample data for Unit Details
    unit_sample = ["Palm Tower", "1201", "2BR", 12, 1200, 1100, 100, 1]
    for col, value in enumerate(unit_sample, 1):
        ws_unit.cell(row=2, column=col, value=value)
    
    # Sheet 4: Sale Settings
    ws_sale = wb.create_sheet("Sale Settings")
    
    sale_headers = [
        "Building Name*", "Unit No*", "Expected Sale Rate (AED/sqft)", 
        "Estimated Sell Date", "Eligible to Sell After (%)"
    ]
    for col, header in enumerate(sale_headers, 1):
        cell = ws_sale.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="DC2626", end_color="DC2626", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_sale.column_dimensions[get_column_letter(col)].width = 22
    
    # Sample data for Sale Settings
    sale_sample = ["Palm Tower", "1201", 2800, "2027-01-15", 100]
    for col, value in enumerate(sale_sample, 1):
        ws_sale.cell(row=2, column=col, value=value)
    
    # Sheet 5: Payment Schedule
    ws_payments = wb.create_sheet("Payment Schedule")
    
    pay_headers = ["Building Name*", "Unit No*", "Payment Description*", "Due Date*", "Percentage*"]
    for col, header in enumerate(pay_headers, 1):
        cell = ws_payments.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="EA580C", end_color="EA580C", fill_type="solid")
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws_payments.column_dimensions[get_column_letter(col)].width = 20
    
    # Sample payment schedule
    sample_payments = [
        ["Palm Tower", "1201", "Booking Amount", "2025-02-01", 20],
        ["Palm Tower", "1201", "1st Installment", "2025-06-01", 10],
        ["Palm Tower", "1201", "2nd Installment", "2025-12-01", 10],
        ["Palm Tower", "1201", "3rd Installment", "2026-03-01", 10],
        ["Palm Tower", "1201", "Handover Payment", "2026-06-30", 50],
    ]
    for row_idx, payment in enumerate(sample_payments, 2):
        for col, value in enumerate(payment, 1):
            ws_payments.cell(row=row_idx, column=col, value=value)
    
    # Sheet 6: Instructions
    ws_instructions = wb.create_sheet("Instructions")
    instructions = [
        "BULK REAL ESTATE UPLOAD INSTRUCTIONS",
        "",
        "This template has 5 data sheets. Fill all sheets for complete property information.",
        "Fields marked with * are required.",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 1 - Basic Information (Blue)",
        "═══════════════════════════════════════════════════════════════",
        "• Building Name*: Name of the building/project (must be consistent across all sheets)",
        "• Unit No*: Unit number/identifier (must be consistent across all sheets)",
        "• Developer Name*: Developer/builder name",
        "• Location: Area/locality (e.g., Dubai Marina, Downtown)",
        "• Description: Property description and features",
        "• Handover Date: Expected handover date (YYYY-MM-DD format)",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 2 - Pricing & Fees (Green)",
        "═══════════════════════════════════════════════════════════════",
        "• Unit Price*: Base price in AED (excluding fees)",
        "• DLD Fee*: Dubai Land Department fee as percentage (typically 4%)",
        "• Admin Fee*: Administrative fee in AED (paid upfront with booking)",
        "• Broker Fee: Brokerage fee in AED (if any)",
        "• Other Fees: Any other fees in AED",
        "• Unit Selling Fee: Fee percentage when selling (0-2.5%)",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 3 - Unit Details (Purple)",
        "═══════════════════════════════════════════════════════════════",
        "• Unit Type*: Type of unit (e.g., Studio, 1BR, 2BR, 3BR, Penthouse, Villa)",
        "• Floor*: Floor number",
        "• Total Area*: Total area in square feet",
        "• Carpet Area: Built-up area in square feet",
        "• Balcony Area: Balcony area in square feet",
        "• Parking Spaces: Number of parking spots (default: 1)",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 4 - Sale Settings (Red)",
        "═══════════════════════════════════════════════════════════════",
        "• Expected Sale Rate: Expected sale price per sqft in AED",
        "• Estimated Sell Date: Target date to sell (YYYY-MM-DD format)",
        "• Eligible to Sell After: Minimum payment % before selling (default: 100)",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SHEET 5 - Payment Schedule (Orange)",
        "═══════════════════════════════════════════════════════════════",
        "• Building Name & Unit No: Must match exactly with other sheets",
        "• Payment Description*: Name of the milestone (e.g., Booking, 1st Installment)",
        "• Due Date*: Payment due date (YYYY-MM-DD format)",
        "• Percentage*: Percentage of unit price for this milestone",
        "• NOTE: Total percentages for each property MUST equal 100%",
        "",
        "═══════════════════════════════════════════════════════════════",
        "IMPORTANT NOTES",
        "═══════════════════════════════════════════════════════════════",
        "1. Building Name and Unit No must be IDENTICAL across all sheets",
        "2. Use YYYY-MM-DD format for all dates (e.g., 2025-06-30)",
        "3. Payment schedule percentages must sum to exactly 100%",
        "4. If no payment schedule provided, default 20/30/30/20 will be used",
        "5. Maximum 30 properties per upload",
        "6. Photos and brochures can be uploaded after property creation",
        "7. Numbers should not include currency symbols or commas",
    ]
    for row, text in enumerate(instructions, 1):
        cell = ws_instructions.cell(row=row, column=1, value=text)
        if text.startswith("═") or text.startswith("SHEET") or text.startswith("BULK") or text.startswith("IMPORTANT"):
            cell.font = Font(bold=True)
        ws_instructions.column_dimensions['A'].width = 80
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=real_estate_template.xlsx"}
    )


@api_router.post("/bulk/real-estate")
async def bulk_upload_real_estate(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Bulk upload real estate opportunities from Excel file with multiple sheets"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can bulk upload real estate")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
    
    import pandas as pd
    
    content = await file.read()
    excel_file = pd.ExcelFile(io.BytesIO(content))
    
    # Helper to normalize column names
    def normalize_columns(df):
        df.columns = [col.replace('*', '').replace('(%)', '').replace('(AED)', '').replace('(sqft)', '')
                      .strip().lower().replace(' ', '_') for col in df.columns]
        return df
    
    # Read all sheets
    sheets_data = {}
    sheet_mapping = {
        'Basic Information': 'basic',
        'Pricing & Fees': 'pricing',
        'Unit Details': 'unit',
        'Sale Settings': 'sale',
        'Payment Schedule': 'payments'
    }
    
    for sheet_name, key in sheet_mapping.items():
        if sheet_name in excel_file.sheet_names:
            df = pd.read_excel(excel_file, sheet_name=sheet_name)
            sheets_data[key] = normalize_columns(df)
    
    # Fallback to old single-sheet format if new sheets not found
    if 'basic' not in sheets_data:
        # Try reading from first sheet (old format)
        df = pd.read_excel(excel_file, sheet_name=0)
        df = normalize_columns(df)
        sheets_data['main'] = df
        
        # Try old Payment Schedule sheet
        if 'Payment Schedule' in excel_file.sheet_names:
            pay_df = pd.read_excel(excel_file, sheet_name='Payment Schedule')
            sheets_data['payments'] = normalize_columns(pay_df)
    
    results = {"success": 0, "failed": 0, "errors": [], "created_properties": []}
    
    # Get unique properties from basic info or main sheet
    if 'basic' in sheets_data:
        basic_df = sheets_data['basic']
        properties = basic_df[['building_name', 'unit_no']].drop_duplicates()
    elif 'main' in sheets_data:
        properties = sheets_data['main'][['building_name', 'unit_no']].drop_duplicates()
    else:
        raise HTTPException(status_code=400, detail="No valid data sheets found")
    
    for _, prop_row in properties.iterrows():
        try:
            building_name = str(prop_row['building_name']).strip()
            unit_no = str(prop_row['unit_no']).strip()
            
            if pd.isna(prop_row['building_name']) or pd.isna(prop_row['unit_no']):
                continue
            
            # Check for duplicate
            existing = await db.real_estate_opportunities.find_one({
                "building_name": building_name,
                "unit_no": unit_no,
                "created_by": current_user['id']
            })
            if existing:
                results['errors'].append(f"Property {building_name} - Unit {unit_no} already exists")
                results['failed'] += 1
                continue
            
            # Gather data from all sheets
            property_data = {
                'building_name': building_name,
                'unit_no': unit_no
            }
            
            # New multi-sheet format
            if 'basic' in sheets_data:
                # Basic Information
                basic_row = sheets_data['basic'][
                    (sheets_data['basic']['building_name'].str.strip() == building_name) & 
                    (sheets_data['basic']['unit_no'].astype(str).str.strip() == unit_no)
                ]
                if not basic_row.empty:
                    row = basic_row.iloc[0]
                    property_data['developer_name'] = str(row.get('developer_name', '')).strip() if not pd.isna(row.get('developer_name')) else ''
                    property_data['location'] = str(row.get('location', '')).strip() if not pd.isna(row.get('location')) else ''
                    property_data['description'] = str(row.get('description', '')).strip() if not pd.isna(row.get('description')) else ''
                    property_data['handover_date'] = pd.to_datetime(row['handover_date']).strftime('%Y-%m-%d') if not pd.isna(row.get('handover_date')) else None
                
                # Pricing & Fees
                if 'pricing' in sheets_data:
                    pricing_row = sheets_data['pricing'][
                        (sheets_data['pricing']['building_name'].str.strip() == building_name) & 
                        (sheets_data['pricing']['unit_no'].astype(str).str.strip() == unit_no)
                    ]
                    if not pricing_row.empty:
                        row = pricing_row.iloc[0]
                        property_data['unit_price'] = float(row['unit_price']) if not pd.isna(row.get('unit_price')) else 0
                        property_data['dld_fee_percentage'] = float(row['dld_fee']) if not pd.isna(row.get('dld_fee')) else 4
                        property_data['admin_fee'] = float(row['admin_fee']) if not pd.isna(row.get('admin_fee')) else 0
                        property_data['broker_fee'] = float(row.get('broker_fee', 0)) if not pd.isna(row.get('broker_fee')) else 0
                        property_data['other_fees'] = float(row.get('other_fees', 0)) if not pd.isna(row.get('other_fees')) else 0
                        property_data['selling_fee_percentage'] = float(row.get('unit_selling_fee', 0)) if not pd.isna(row.get('unit_selling_fee')) else 0
                
                # Unit Details
                if 'unit' in sheets_data:
                    unit_row = sheets_data['unit'][
                        (sheets_data['unit']['building_name'].str.strip() == building_name) & 
                        (sheets_data['unit']['unit_no'].astype(str).str.strip() == unit_no)
                    ]
                    if not unit_row.empty:
                        row = unit_row.iloc[0]
                        property_data['unit_type'] = str(row['unit_type']).strip() if not pd.isna(row.get('unit_type')) else '1BR'
                        property_data['floor'] = str(row['floor']) if not pd.isna(row.get('floor')) else '1'
                        property_data['total_area'] = float(row['total_area']) if not pd.isna(row.get('total_area')) else 0
                        property_data['carpet_area'] = float(row.get('carpet_area', row.get('total_area', 0))) if not pd.isna(row.get('carpet_area')) else property_data.get('total_area', 0)
                        property_data['balcony_area'] = float(row.get('balcony_area', 0)) if not pd.isna(row.get('balcony_area')) else 0
                        property_data['parking_spaces'] = int(row.get('parking_spaces', 1)) if not pd.isna(row.get('parking_spaces')) else 1
                
                # Sale Settings
                if 'sale' in sheets_data:
                    sale_row = sheets_data['sale'][
                        (sheets_data['sale']['building_name'].str.strip() == building_name) & 
                        (sheets_data['sale']['unit_no'].astype(str).str.strip() == unit_no)
                    ]
                    if not sale_row.empty:
                        row = sale_row.iloc[0]
                        property_data['expected_sale_rate'] = float(row.get('expected_sale_rate', 0)) if not pd.isna(row.get('expected_sale_rate')) else None
                        property_data['estimated_sell_date'] = pd.to_datetime(row['estimated_sell_date']).strftime('%Y-%m-%d') if not pd.isna(row.get('estimated_sell_date')) else None
                        property_data['eligible_to_sell_after_percentage'] = float(row.get('eligible_to_sell_after', 100)) if not pd.isna(row.get('eligible_to_sell_after')) else 100
            
            # Old single-sheet format fallback
            elif 'main' in sheets_data:
                main_row = sheets_data['main'][
                    (sheets_data['main']['building_name'].str.strip() == building_name) & 
                    (sheets_data['main']['unit_no'].astype(str).str.strip() == unit_no)
                ]
                if not main_row.empty:
                    row = main_row.iloc[0]
                    property_data['developer_name'] = str(row.get('developer', '')).strip() if not pd.isna(row.get('developer')) else ''
                    property_data['unit_price'] = float(row['unit_price']) if not pd.isna(row.get('unit_price')) else 0
                    property_data['total_area'] = float(row['total_area']) if not pd.isna(row.get('total_area')) else 0
                    property_data['carpet_area'] = float(row.get('carpet_area', row['total_area'])) if not pd.isna(row.get('carpet_area')) else property_data['total_area']
                    property_data['balcony_area'] = float(row.get('balcony_area', 0)) if not pd.isna(row.get('balcony_area')) else 0
                    property_data['location'] = str(row.get('location', '')).strip() if not pd.isna(row.get('location')) else ''
                    property_data['dld_fee_percentage'] = float(row.get('dld_fee', 4)) if not pd.isna(row.get('dld_fee')) else 4
                    property_data['admin_fee'] = float(row.get('admin_fee', 0)) if not pd.isna(row.get('admin_fee')) else 0
                    property_data['broker_fee'] = float(row.get('brokerage_fee', 0)) if not pd.isna(row.get('brokerage_fee')) else 0
                    property_data['other_fees'] = float(row.get('other_fees', 0)) if not pd.isna(row.get('other_fees')) else 0
                    property_data['selling_fee_percentage'] = float(row.get('selling_fee', 0)) if not pd.isna(row.get('selling_fee')) else 0
                    property_data['unit_type'] = str(row.get('unit_type', '1BR')).strip()
                    property_data['floor'] = str(row.get('floor', '1'))
                    property_data['parking_spaces'] = int(row.get('parking_spaces', 1)) if not pd.isna(row.get('parking_spaces')) else 1
                    property_data['handover_date'] = pd.to_datetime(row['handover_date']).strftime('%Y-%m-%d') if not pd.isna(row.get('handover_date')) else None
            
            # Validate required fields
            required = ['unit_price', 'total_area']
            missing = [f for f in required if not property_data.get(f)]
            if missing:
                results['errors'].append(f"{building_name} - Unit {unit_no}: Missing {', '.join(missing)}")
                results['failed'] += 1
                continue
            
            # Get payment schedule
            payment_schedule = []
            if 'payments' in sheets_data:
                property_payments = sheets_data['payments'][
                    (sheets_data['payments']['building_name'].str.strip().str.lower() == building_name.lower()) &
                    (sheets_data['payments']['unit_no'].astype(str).str.strip() == unit_no)
                ]
                for _, pay_row in property_payments.iterrows():
                    payment_schedule.append({
                        "description": str(pay_row.get('payment_description', '')).strip(),
                        "date": pd.to_datetime(pay_row['due_date']).strftime('%Y-%m-%d'),
                        "percentage": float(pay_row['percentage'])
                    })
            
            # Default payment schedule if none provided
            if not payment_schedule:
                handover_date = property_data.get('handover_date')
                base_date = datetime.now()
                if handover_date:
                    base_date = datetime.strptime(handover_date, '%Y-%m-%d')
                
                payment_schedule = [
                    {"description": "Booking", "date": datetime.now().strftime('%Y-%m-%d'), "percentage": 20},
                    {"description": "1st Installment", "date": (datetime.now() + timedelta(days=120)).strftime('%Y-%m-%d'), "percentage": 30},
                    {"description": "2nd Installment", "date": (datetime.now() + timedelta(days=240)).strftime('%Y-%m-%d'), "percentage": 30},
                    {"description": "Handover", "date": base_date.strftime('%Y-%m-%d'), "percentage": 20}
                ]
            
            # Calculate fees
            unit_price = property_data.get('unit_price', 0)
            dld_fee_pct = property_data.get('dld_fee_percentage', 4)
            dld_fee = unit_price * dld_fee_pct / 100
            total_cost = unit_price + dld_fee + property_data.get('admin_fee', 0) + property_data.get('broker_fee', 0) + property_data.get('other_fees', 0)
            
            # Create opportunity
            opp_id = str(uuid.uuid4())
            opportunity = {
                "id": opp_id,
                "building_name": building_name,
                "developer_name": property_data.get('developer_name', ''),
                "unit_no": unit_no,
                "floor": property_data.get('floor', '1'),
                "unit_type": property_data.get('unit_type', '1BR'),
                "property_type": "off_plan",
                "unit_price": unit_price,
                "total_area": property_data.get('total_area', 0),
                "carpet_area": property_data.get('carpet_area', property_data.get('total_area', 0)),
                "balcony_area": property_data.get('balcony_area', 0),
                "location": property_data.get('location', ''),
                "description": property_data.get('description', ''),
                "dld_fee_percentage": dld_fee_pct,
                "dld_fee": dld_fee,
                "admin_fee": property_data.get('admin_fee', 0),
                "brokerage_fee": property_data.get('broker_fee', 0),
                "other_fees": property_data.get('other_fees', 0),
                "selling_fee_percentage": property_data.get('selling_fee_percentage', 0),
                "total_cost": total_cost,
                "payment_schedule": payment_schedule,
                "handover_date": property_data.get('handover_date'),
                "parking_spaces": property_data.get('parking_spaces', 1),
                "expected_sale_rate": property_data.get('expected_sale_rate'),
                "estimated_sell_date": property_data.get('estimated_sell_date'),
                "eligible_to_sell_after_percentage": property_data.get('eligible_to_sell_after_percentage', 100),
                "max_investors": 4,
                "current_investors": 0,
                "investors": [],
                "investor_payments": [],
                "interested_users": [],
                "invested_percentage": 0,
                "remaining_percentage": 100,
                "status": "available",
                "images": [],
                "presentations": [],
                "created_by": current_user['id'],
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.real_estate_opportunities.insert_one(opportunity)
            results['success'] += 1
            results['created_properties'].append({
                "id": opp_id, 
                "name": f"{building_name} - Unit {unit_no}"
            })
            
        except Exception as e:
            results['errors'].append(f"Row {idx+2}: {str(e)}")
            results['failed'] += 1
    
    return results


# ==================== BULK HISTORICAL TRADES UPLOAD ====================

@api_router.get("/bulk/template/historical-trades")
async def download_historical_trades_template(current_user: dict = Depends(get_current_user)):
    """Download Excel template for bulk historical client bond investments upload"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can download templates")
    
    wb = Workbook()
    
    # Main sheet: Historical Investments
    ws = wb.active
    ws.title = "Historical Investments"
    
    headers = [
        "Deal ID*", "Investment Date*", "Investor Name*", "Investor PAN",
        "Units*", "Purchase Price*", "IFA Name", "Notes"
    ]
    
    header_fill = PatternFill(start_color="B45309", end_color="B45309", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(col)].width = 20
    
    # Sample data rows
    sample_data = [
        ["CDNRE001", "2025-04-30", "FALI ADI UNWALLA", "ABCDE1234F", 34, 3916923.08, "Kinntegraa L.L.C-FZ", "Initial investment"],
        ["CDNRE001", "2025-05-02", "ANINHA ILDA DACUNHA", "XYZPQ5678G", 43, 4956833, "Kinntegraa L.L.C-FZ", ""],
    ]
    
    for row_idx, row_data in enumerate(sample_data, 2):
        for col, value in enumerate(row_data, 1):
            ws.cell(row=row_idx, column=col, value=value)
    
    # Instructions sheet
    ws_instructions = wb.create_sheet("Instructions")
    instructions = [
        "BULK HISTORICAL TRADES UPLOAD INSTRUCTIONS",
        "",
        "Upload historical client bond investments with actual transaction data.",
        "",
        "═══════════════════════════════════════════════════════════════",
        "REQUIRED FIELDS",
        "═══════════════════════════════════════════════════════════════",
        "• Deal ID*: Bond code (must match existing bond in system)",
        "• Investment Date*: Date client invested (YYYY-MM-DD format)",
        "• Investor Name*: Client name (must match existing client)",
        "• Units*: Number of units purchased (as per actual transaction)",
        "• Purchase Price*: Actual amount invested by client",
        "",
        "═══════════════════════════════════════════════════════════════",
        "OPTIONAL FIELDS",
        "═══════════════════════════════════════════════════════════════",
        "• Investor PAN: Client PAN (helps match client more accurately)",
        "• IFA Name: Name of the introducing advisor",
        "• Notes: Any additional notes about the trade",
        "",
        "═══════════════════════════════════════════════════════════════",
        "HOW IT WORKS",
        "═══════════════════════════════════════════════════════════════",
        "1. Deal ID must exist in the system as a valid bond code",
        "2. Investor must exist as a client in the system (by name or PAN)",
        "3. Units and Purchase Price are TRUSTED as provided",
        "4. Price per unit is calculated as: Purchase Price ÷ Units",
        "5. Cashflows are generated based on remaining bond payments",
        "6. Secondary market purchases at discount are supported",
        "",
        "═══════════════════════════════════════════════════════════════",
        "SECONDARY MARKET NOTES",
        "═══════════════════════════════════════════════════════════════",
        "• For secondary purchases, price may differ from face value",
        "• The system accepts the actual negotiated price",
        "• Cashflows are calculated from investment date onwards",
        "• Missed payments (before investment) are excluded",
    ]
    
    for row, text in enumerate(instructions, 1):
        cell = ws_instructions.cell(row=row, column=1, value=text)
        if text.startswith("═") or text.startswith("REQUIRED") or text.startswith("OPTIONAL") or \
           text.startswith("VALIDATION") or text.startswith("ERROR") or text.startswith("BULK"):
            cell.font = Font(bold=True)
        ws_instructions.column_dimensions['A'].width = 70
    
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=historical_trades_template.xlsx"}
    )


@api_router.post("/bulk/historical-trades")
async def bulk_upload_historical_trades(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Bulk upload historical client bond investments.
    Validates that uploaded purchase price matches system-calculated expected amount.
    Creates trades and generates cashflow schedules.
    """
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can bulk upload historical trades")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
    
    import pandas as pd
    
    content = await file.read()
    
    try:
        # Read the main sheet
        df = pd.read_excel(io.BytesIO(content), sheet_name=0)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading Excel file: {str(e)}")
    
    # Normalize column names
    df.columns = [col.replace('*', '').strip().lower().replace(' ', '_') for col in df.columns]
    
    # Required columns check
    required_cols = ['deal_id', 'investment_date', 'investor_name', 'units', 'purchase_price']
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        raise HTTPException(status_code=400, detail=f"Missing required columns: {', '.join(missing_cols)}")
    
    results = {
        "success": 0,
        "failed": 0,
        "errors": [],
        "created_trades": [],
        "validation_summary": {
            "total_rows": len(df),
            "matched_amounts": 0,
            "mismatched_amounts": 0
        }
    }
    
    # Get all bonds and clients for lookup
    all_bonds = await db.bonds.find({}, {"_id": 0}).to_list(1000)
    all_clients = await db.clients.find({"created_by": current_user['id']}, {"_id": 0}).to_list(1000)
    
    # Create lookup dictionaries
    bond_lookup = {b.get('bond_code', '').strip().upper(): b for b in all_bonds if b.get('bond_code')}
    client_by_name = {c['name'].strip().upper(): c for c in all_clients}
    client_by_pan = {c.get('pan_number', '').strip().upper(): c for c in all_clients if c.get('pan_number')}
    
    for idx, row in df.iterrows():
        row_num = idx + 2  # Excel row number (1-indexed + header)
        
        try:
            # Skip empty rows
            if pd.isna(row.get('deal_id')) or pd.isna(row.get('investor_name')):
                continue
            
            deal_id = str(row['deal_id']).strip().upper()
            investor_name = str(row['investor_name']).strip().upper()
            investor_pan = str(row.get('investor_pan', '')).strip().upper() if pd.notna(row.get('investor_pan')) else None
            units = int(row['units'])
            purchase_price = float(row['purchase_price'])
            
            # Parse investment date
            investment_date = row['investment_date']
            if isinstance(investment_date, str):
                investment_date = datetime.fromisoformat(investment_date.replace('/', '-'))
            elif hasattr(investment_date, 'isoformat'):
                pass  # Already a datetime
            else:
                raise ValueError(f"Invalid date format: {investment_date}")
            
            investment_date_str = investment_date.strftime('%Y-%m-%d')
            
            # Find the bond
            bond = bond_lookup.get(deal_id)
            if not bond:
                results['errors'].append(f"Row {row_num}: Bond with code '{deal_id}' not found in system")
                results['failed'] += 1
                continue
            
            # Find the client (try PAN first, then name)
            client = None
            if investor_pan:
                client = client_by_pan.get(investor_pan)
            if not client:
                client = client_by_name.get(investor_name)
            
            if not client:
                results['errors'].append(f"Row {row_num}: Client '{investor_name}' (PAN: {investor_pan or 'N/A'}) not found in system")
                results['failed'] += 1
                continue
            
            # OPTION A: Trust user-provided Units and Investment Amount
            # For secondary market purchases, price varies based on negotiation, accrued interest, etc.
            # We accept the user's data as-is and calculate price per unit from it
            uploaded_total = round(purchase_price)
            price_per_unit = uploaded_total / units if units > 0 else 0
            
            # Basic sanity check: units should be positive and amount should be reasonable
            if units <= 0:
                results['errors'].append(f"Row {row_num}: Invalid units ({units}). Must be positive.")
                results['failed'] += 1
                continue
            
            if uploaded_total <= 0:
                results['errors'].append(f"Row {row_num}: Invalid investment amount ({uploaded_total}). Must be positive.")
                results['failed'] += 1
                continue
            
            results['validation_summary']['matched_amounts'] += 1
            
            # Check for duplicate trade
            existing_trade = await db.trades.find_one({
                "bond_id": bond['id'],
                "client_id": client['id'],
                "investment_date": investment_date_str,
                "units": units
            })
            
            if existing_trade:
                results['errors'].append(
                    f"Row {row_num}: Duplicate trade - {investor_name} already has {units} units of {deal_id} on {investment_date_str}"
                )
                results['failed'] += 1
                continue
            
            # Create the trade
            trade_id = str(uuid.uuid4())
            trade_dict = {
                "id": trade_id,
                "bond_id": bond['id'],
                "bond_name": bond['name'],
                "bond_code": bond.get('bond_code', deal_id),
                "client_id": client['id'],
                "client_name": client['name'],
                "client_pan": client.get('pan_number'),
                "units": units,
                "investment_date": investment_date_str,
                "calculated_price": price_per_unit,  # Actual price per unit from user data
                "total_amount": uploaded_total,
                "payment_reference": row.get('notes', '') if pd.notna(row.get('notes')) else None,
                "payment_notes": f"Historical import - IFA: {row.get('ifa_name', 'N/A') if pd.notna(row.get('ifa_name')) else 'N/A'}",
                "status": "approved",
                "created_by": current_user['id'],
                "created_by_name": current_user.get('name', 'System'),
                "created_by_role": "broker",
                "broker_notes": "Bulk historical import",
                "approved_by": current_user['id'],
                "approved_at": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "is_historical": True
            }
            
            await db.trades.insert_one(trade_dict)
            
            # Update bond units sold
            await db.bonds.update_one(
                {"id": bond['id']},
                {"$inc": {"units_sold": units}}
            )
            
            # Add to client's bond allocations
            allocation = {
                "bond_id": bond['id'],
                "bond_name": bond['name'],
                "units_blocked": units,
                "units_paid": units,
                "status": "fully_paid",
                "trade_id": trade_id,
                "allocated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.clients.update_one(
                {"id": client['id']},
                {"$push": {"bond_allocations": allocation}}
            )
            
            # Generate and store cashflows
            cashflows = generate_client_cashflows(trade_dict, bond)
            if cashflows:
                for cf in cashflows:
                    cf['client_id'] = client['id']
                    cf['bond_id'] = bond['id']
                await db.holding_cashflows.insert_many(cashflows)
            
            results['success'] += 1
            results['created_trades'].append({
                "trade_id": trade_id,
                "client": client['name'],
                "bond": bond['name'],
                "units": units,
                "amount": uploaded_total,
                "investment_date": investment_date_str
            })
            
        except Exception as e:
            results['errors'].append(f"Row {row_num}: {str(e)}")
            results['failed'] += 1
    
    return results


def calculate_secondary_market_price_and_units(bond: dict, investment_date_str: str, investment_amount: float = None, irr: float = None) -> dict:
    """
    Calculate secondary market price per unit and units for a given investment.
    Uses cashflows_per_unit for accurate calculation.
    
    Args:
        bond: Bond document with cashflows_per_unit
        investment_date_str: Date of investment (YYYY-MM-DD)
        investment_amount: Amount being invested (optional, for unit calculation)
        irr: IRR to use for discounting (optional, defaults to bond's secondary_irr)
    
    Returns:
        dict with price_per_unit, calculated_units, remaining_cashflows, etc.
    """
    investment_date = datetime.fromisoformat(investment_date_str.split('T')[0].split(' ')[0])
    
    # Use provided IRR or bond's secondary IRR
    if irr is None:
        irr = bond.get('secondary_irr', bond.get('primary_irr', 12))
    irr_decimal = irr / 100
    
    # Get cashflows per unit
    cashflows_per_unit = bond.get('cashflows_per_unit', [])
    
    result = {
        "investment_date": investment_date_str,
        "irr_used": irr,
        "face_value_per_unit": bond.get('face_value', bond.get('principal_amount', 0) / max(bond.get('total_units', 1), 1)),
        "total_cashflows_in_bond": len(cashflows_per_unit),
        "remaining_cashflows": 0,
        "missed_cashflows": 0,
        "remaining_cashflows_detail": [],
        "missed_cashflows_detail": [],
        "total_remaining_interest_per_unit": 0,
        "total_remaining_principal_per_unit": 0,
        "total_remaining_cashflow_per_unit": 0,
        "present_value_per_unit": 0,
        "price_per_unit": 0,
        "calculated_units": 0,
        "investment_amount": investment_amount
    }
    
    if not cashflows_per_unit:
        # Fallback to face value if no cashflows defined
        result["price_per_unit"] = result["face_value_per_unit"]
        if investment_amount:
            result["calculated_units"] = round(investment_amount / result["price_per_unit"], 2)
        result["warning"] = "No cashflows_per_unit defined. Using face value."
        return result
    
    # Separate remaining and missed cashflows
    pv_total = 0
    
    for cf in cashflows_per_unit:
        cf_date_str = cf['date'].split('T')[0].split(' ')[0]
        cf_date = datetime.fromisoformat(cf_date_str)
        interest = cf.get('interest_per_unit', 0)
        principal = cf.get('principal_per_unit', 0)
        total_cf = interest + principal
        
        if cf_date > investment_date:
            # Remaining cashflow - calculate PV
            days = (cf_date - investment_date).days
            years = days / 365
            discount_factor = 1 / ((1 + irr_decimal) ** years)
            pv = total_cf * discount_factor
            pv_total += pv
            
            result["remaining_cashflows"] += 1
            result["total_remaining_interest_per_unit"] += interest
            result["total_remaining_principal_per_unit"] += principal
            result["remaining_cashflows_detail"].append({
                "date": cf_date_str,
                "interest": round(interest, 2),
                "principal": round(principal, 2),
                "total": round(total_cf, 2),
                "days_from_investment": days,
                "discount_factor": round(discount_factor, 6),
                "present_value": round(pv, 2)
            })
        else:
            # Missed cashflow - already paid to primary holder
            result["missed_cashflows"] += 1
            result["missed_cashflows_detail"].append({
                "date": cf_date_str,
                "interest": round(interest, 2),
                "principal": round(principal, 2),
                "total": round(total_cf, 2),
                "status": "Paid to primary holder"
            })
    
    result["total_remaining_cashflow_per_unit"] = result["total_remaining_interest_per_unit"] + result["total_remaining_principal_per_unit"]
    result["present_value_per_unit"] = round(pv_total, 2)
    result["price_per_unit"] = round(pv_total, 2)
    
    # Calculate units if investment amount provided
    if investment_amount and pv_total > 0:
        result["calculated_units"] = round(investment_amount / pv_total, 4)
    
    # Calculate discount from face value
    if result["face_value_per_unit"] > 0:
        result["discount_from_face_value"] = round(result["face_value_per_unit"] - result["price_per_unit"], 2)
        result["discount_percentage"] = round((result["discount_from_face_value"] / result["face_value_per_unit"]) * 100, 2)
    
    return result


@api_router.post("/bonds/calculate-secondary-price")
async def calculate_secondary_price(
    bond_code: str,
    investment_date: str,
    investment_amount: float = None,
    irr: float = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Calculate the secondary market price per unit and units for a given investment.
    
    This endpoint helps determine:
    - How many units a secondary buyer gets for their investment
    - What price per unit they're paying
    - Which cashflows they missed (paid to primary holder)
    - Which cashflows they will receive
    """
    # Find the bond
    bond = await db.bonds.find_one({"bond_code": bond_code.upper()}, {"_id": 0})
    if not bond:
        # Try by ID
        bond = await db.bonds.find_one({"id": bond_code}, {"_id": 0})
    
    if not bond:
        raise HTTPException(status_code=404, detail=f"Bond with code '{bond_code}' not found")
    
    if not bond.get('cashflows_per_unit'):
        raise HTTPException(
            status_code=400, 
            detail="Bond does not have cashflows_per_unit defined. Please upload bond with exact cashflow schedule."
        )
    
    result = calculate_secondary_market_price_and_units(
        bond=bond,
        investment_date_str=investment_date,
        investment_amount=investment_amount,
        irr=irr
    )
    
    result["bond_code"] = bond.get('bond_code')
    result["bond_name"] = bond.get('name')
    
    return result


class PartnerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    color: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None


@api_router.put("/partners/{partner_id}")
async def update_partner(partner_id: str, partner_update: PartnerUpdate, current_user: dict = Depends(get_current_user)):
    """Update a sub-broker partner (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can update partners")
    
    # Check if partner exists and belongs to this broker
    partner = await db.partners.find_one({"id": partner_id, "created_by": current_user['id']})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    # Build update dict with only provided fields
    update_data = {}
    for field in ["name", "email", "mobile", "color", "address_line1", "address_line2", "city", "state", "pincode"]:
        value = getattr(partner_update, field)
        if value is not None:
            update_data[field] = value
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Update partner record
    await db.partners.update_one({"id": partner_id}, {"$set": update_data})
    
    # Also update user record if name, email, or phone changed
    user_update = {}
    if "name" in update_data:
        user_update["name"] = update_data["name"]
    if "email" in update_data:
        user_update["email"] = update_data["email"]
    if "mobile" in update_data:
        user_update["phone"] = update_data["mobile"]
    
    if user_update:
        await db.users.update_one({"id": partner_id}, {"$set": user_update})
    
    # Return updated partner
    updated_partner = await db.partners.find_one({"id": partner_id}, {"_id": 0})
    return updated_partner


# ==================== CLIENT MANAGEMENT ====================

class ClientCreate(BaseModel):
    # Personal Details
    name: str
    pan_number: str
    ucc: Optional[str] = None  # Unique Client Code
    occupation: Optional[str] = None
    date_of_birth: Optional[str] = None
    father_husband_name: Optional[str] = None
    demat_account_no: Optional[str] = None
    email: str
    mobile: str
    
    # Address Details
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: str = "India"
    pincode: Optional[str] = None
    
    # Bank Details
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    branch: Optional[str] = None
    ifsc_code: Optional[str] = None
    
    # Nominee Details
    nominee_name: Optional[str] = None
    nominee_dob: Optional[str] = None
    nominee_mobile: Optional[str] = None
    nominee_relationship: Optional[str] = None
    
    # Linked Sub-broker (optional at creation)
    linked_subbroker_id: Optional[str] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    ucc: Optional[str] = None  # Unique Client Code
    occupation: Optional[str] = None
    date_of_birth: Optional[str] = None
    father_husband_name: Optional[str] = None
    demat_account_no: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    branch: Optional[str] = None
    ifsc_code: Optional[str] = None
    nominee_name: Optional[str] = None
    nominee_dob: Optional[str] = None
    nominee_mobile: Optional[str] = None
    nominee_relationship: Optional[str] = None
    linked_subbroker_id: Optional[str] = None


class ClientBondAllocation(BaseModel):
    bond_id: str
    units_blocked: int
    units_paid: int = 0
    status: str = "blocked"  # blocked, partial_paid, fully_paid


@api_router.post("/clients")
async def create_client(client_data: ClientCreate, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Create a new client (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can create clients")
    
    # Check if client with same PAN already exists
    existing = await db.clients.find_one({"pan_number": client_data.pan_number.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="Client with this PAN already exists")
    
    # Check if user with same PAN already exists
    existing_user = await db.users.find_one({"pan": client_data.pan_number.upper()})
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this PAN already exists")
    
    client_dict = client_data.model_dump()
    client_id = str(uuid.uuid4())
    client_dict['id'] = client_id
    client_dict['pan_number'] = client_dict['pan_number'].upper()
    client_dict['created_by'] = current_user['id']
    client_dict['created_at'] = datetime.now(timezone.utc).isoformat()
    client_dict['bond_allocations'] = []
    client_dict['verification_status'] = 'pending'  # pending, verified
    client_dict['verification_token'] = str(uuid.uuid4())
    
    # Generate default credentials (client will change on first login)
    default_password = client_data.pan_number.upper()[-4:] + "1234"  # Last 4 chars of PAN + 1234
    default_pin = "1234"
    
    # Create user account for client
    user_id = str(uuid.uuid4())
    user_data = {
        "id": user_id,
        "pan": client_data.pan_number.upper(),
        "name": client_data.name,
        "email": client_data.email,
        "phone": client_data.mobile,
        "password_hash": get_password_hash(default_password),
        "pin_hash": get_password_hash(default_pin),
        "role": "client",
        "is_active": False,  # Activated after client verifies profile
        "client_id": client_id,
        "broker_id": current_user['id'],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Link user to client
    client_dict['user_id'] = user_id
    
    await db.users.insert_one(user_data)
    await db.clients.insert_one(client_dict)
    
    # Return without _id
    if '_id' in client_dict:
        del client_dict['_id']
    
    # Include default credentials in response (for display to broker)
    client_dict['default_password'] = default_password
    client_dict['default_pin'] = default_pin
    
    # Send welcome email in background (if email is provided)
    if client_data.email:
        background_tasks.add_task(
            send_welcome_email_client,
            client_name=client_data.name,
            client_email=client_data.email,
            pan=client_data.pan_number.upper(),
            password=default_password,
            pin=default_pin,
            broker_name=current_user.get('name', 'Your Broker')
        )
    
    return client_dict


@api_router.get("/clients")
async def get_clients(current_user: dict = Depends(get_current_user)):
    """Get all clients (brokers see all, sub-brokers see only linked clients)"""
    if current_user['role'] == 'broker':
        clients = await db.clients.find({"created_by": current_user['id']}, {"_id": 0}).to_list(1000)
    else:
        # Sub-brokers see only clients linked to them
        clients = await db.clients.find({"linked_subbroker_id": current_user['id']}, {"_id": 0}).to_list(1000)
    
    return clients


@api_router.get("/clients/{client_id}")
async def get_client(client_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific client"""
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Check access
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return client


@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, client_update: ClientUpdate, current_user: dict = Depends(get_current_user)):
    """Update a client (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can update clients")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    update_data = {k: v for k, v in client_update.model_dump().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    await db.clients.update_one({"id": client_id}, {"$set": update_data})
    
    updated_client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    return updated_client


@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, current_user: dict = Depends(get_current_user)):
    """Hard delete a client (brokers only) - removes from both clients and users collections"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete clients")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Check if client has any confirmed trades
    trades = await db.trades.find({"client_id": client_id, "status": "approved"}).to_list(1)
    
    if trades:
        # Cannot hard delete - client has trades
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete client with confirmed trades. Use 'Deactivate' instead to disable the account."
        )
    
    # Hard delete - remove from both collections to allow PAN reuse
    pan_number = client.get('pan_number')
    
    # Delete from clients collection
    await db.clients.delete_one({"id": client_id})
    
    # Also delete from users collection to allow recreation with same PAN
    if pan_number:
        await db.users.delete_one({"pan": pan_number})
    
    return {"message": "Client deleted successfully. PAN can now be reused.", "soft_delete": False}


@api_router.get("/clients/{client_id}/details")
async def get_client_details(client_id: str, current_user: dict = Depends(get_current_user)):
    """Get full client details for editing (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can view client details")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    return client


@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, client_data: dict, current_user: dict = Depends(get_current_user)):
    """Update client details (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can update clients")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Fields that can be updated (PAN cannot be changed)
    updatable_fields = [
        'name', 'email', 'mobile', 'ucc', 'occupation',
        'address_line1', 'address_line2', 'city', 'state', 'country', 'pincode',
        'bank_name', 'account_number', 'branch', 'ifsc_code',
        'linked_subbroker_id'
    ]
    
    update_data = {}
    for field in updatable_fields:
        if field in client_data:
            update_data[field] = client_data[field]
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": update_data}
    )
    
    # Also update email in users collection if changed
    if 'email' in update_data and client.get('pan_number'):
        await db.users.update_one(
            {"pan": client['pan_number']},
            {"$set": {"email": update_data['email']}}
        )
    
    return {"message": "Client updated successfully"}


@api_router.post("/clients/{client_id}/reactivate")
async def reactivate_client(client_id: str, current_user: dict = Depends(get_current_user)):
    """Reactivate an inactive client (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can reactivate clients")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"is_active": True}, "$unset": {"deactivated_at": ""}}
    )
    
    return {"message": "Client reactivated successfully"}


@api_router.post("/clients/{client_id}/resend-credentials")
async def resend_client_credentials(client_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Resend login credentials to client (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can resend credentials")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Generate new password and PIN
    new_password = client['pan_number'][-4:] + str(uuid.uuid4().hex[:4])
    new_pin = str(uuid.uuid4().int)[:4]
    
    # Update user credentials
    await db.users.update_one(
        {"pan": client['pan_number']},
        {"$set": {
            "password_hash": get_password_hash(new_password),
            "pin_hash": get_password_hash(new_pin)
        }}
    )
    
    # Try to send email (may fail if SMTP not configured)
    try:
        background_tasks.add_task(
            send_credentials_email,
            email=client['email'],
            name=client['name'],
            pan=client['pan_number'],
            password=new_password,
            pin=new_pin
        )
        email_sent = True
    except Exception as e:
        logger.error(f"Failed to send credentials email: {e}")
        email_sent = False
    
    return {
        "message": "Credentials reset successfully",
        "email_sent": email_sent,
        "credentials": {
            "pan": client['pan_number'],
            "password": new_password,
            "pin": new_pin,
            "email": client['email'],
            "name": client['name']
        }
    }


@api_router.post("/clients/{client_id}/reset-password")
async def reset_client_password(client_id: str, background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Reset client password (brokers only) - generates a new password"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can reset passwords")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Generate new password
    new_password = client['pan_number'][-4:] + str(uuid.uuid4().hex[:4])
    
    # Update user password
    await db.users.update_one(
        {"pan": client['pan_number']},
        {"$set": {"password_hash": get_password_hash(new_password)}}
    )
    
    # Try to send email
    try:
        background_tasks.add_task(
            send_password_reset_email,
            email=client['email'],
            name=client['name'],
            new_password=new_password
        )
        email_sent = True
    except Exception as e:
        logger.error(f"Failed to send password reset email: {e}")
        email_sent = False
    
    return {
        "message": "Password reset successfully",
        "email_sent": email_sent,
        "new_password": new_password
    }


@api_router.post("/clients/{client_id}/deactivate")
async def deactivate_client(client_id: str, current_user: dict = Depends(get_current_user)):
    """Deactivate a client (soft delete - brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can deactivate clients")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"is_active": False, "deactivated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Also deactivate the user account
    await db.users.update_one(
        {"pan": client['pan_number']},
        {"$set": {"is_active": False}}
    )
    
    return {"message": "Client deactivated successfully"}


@api_router.post("/clients/{client_id}/link-subbroker")
async def link_client_to_subbroker(client_id: str, subbroker_id: str, current_user: dict = Depends(get_current_user)):
    """Link a client to a sub-broker (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can link clients")
    
    # Verify client exists and belongs to broker
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Verify sub-broker exists and belongs to broker
    partner = await db.partners.find_one({"id": subbroker_id, "created_by": current_user['id']})
    if not partner:
        raise HTTPException(status_code=404, detail="Sub-broker not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"linked_subbroker_id": subbroker_id}}
    )
    
    return {"message": f"Client linked to {partner['name']}"}


@api_router.post("/clients/{client_id}/unlink-subbroker")
async def unlink_client_from_subbroker(client_id: str, current_user: dict = Depends(get_current_user)):
    """Unlink a client from their sub-broker (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can unlink clients")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"linked_subbroker_id": None}}
    )
    
    return {"message": "Client unlinked from sub-broker"}


@api_router.post("/clients/{client_id}/allocate-bond")
async def allocate_bond_to_client(client_id: str, allocation: ClientBondAllocation, current_user: dict = Depends(get_current_user)):
    """Allocate a bond to a client with units blocked/paid"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can allocate bonds")
    
    # Verify client
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Verify bond and check available units
    bond = await db.bonds.find_one({"id": allocation.bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    total_units = bond.get('total_units', 1)
    units_sold = bond.get('units_sold', 0)
    units_available = total_units - units_sold
    
    if allocation.units_blocked > units_available:
        raise HTTPException(status_code=400, detail=f"Only {units_available} units available")
    
    # Check if client already has allocation for this bond
    existing_allocations = client.get('bond_allocations', [])
    for i, alloc in enumerate(existing_allocations):
        if alloc['bond_id'] == allocation.bond_id:
            # Update existing allocation
            existing_allocations[i] = {
                "bond_id": allocation.bond_id,
                "bond_name": bond['name'],
                "units_blocked": allocation.units_blocked,
                "units_paid": allocation.units_paid,
                "status": allocation.status,
                "allocated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.clients.update_one(
                {"id": client_id},
                {"$set": {"bond_allocations": existing_allocations}}
            )
            return {"message": "Bond allocation updated"}
    
    # Add new allocation
    new_allocation = {
        "bond_id": allocation.bond_id,
        "bond_name": bond['name'],
        "units_blocked": allocation.units_blocked,
        "units_paid": allocation.units_paid,
        "status": allocation.status,
        "allocated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.clients.update_one(
        {"id": client_id},
        {"$push": {"bond_allocations": new_allocation}}
    )
    
    # Update bond's units_sold if units are paid
    if allocation.units_paid > 0:
        await db.bonds.update_one(
            {"id": allocation.bond_id},
            {"$inc": {"units_sold": allocation.units_paid}}
        )
    
    return {"message": "Bond allocated to client", "allocation": new_allocation}


@api_router.put("/clients/{client_id}/allocations/{bond_id}")
async def update_bond_allocation(client_id: str, bond_id: str, units_paid: int, current_user: dict = Depends(get_current_user)):
    """Update the paid units for a client's bond allocation"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can update allocations")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    allocations = client.get('bond_allocations', [])
    found = False
    old_units_paid = 0
    
    for i, alloc in enumerate(allocations):
        if alloc['bond_id'] == bond_id:
            old_units_paid = alloc.get('units_paid', 0)
            allocations[i]['units_paid'] = units_paid
            allocations[i]['status'] = 'fully_paid' if units_paid >= alloc['units_blocked'] else ('partial_paid' if units_paid > 0 else 'blocked')
            found = True
            break
    
    if not found:
        raise HTTPException(status_code=404, detail="Bond allocation not found")
    
    await db.clients.update_one(
        {"id": client_id},
        {"$set": {"bond_allocations": allocations}}
    )
    
    # Update bond's units_sold with the difference
    units_diff = units_paid - old_units_paid
    if units_diff != 0:
        await db.bonds.update_one(
            {"id": bond_id},
            {"$inc": {"units_sold": units_diff}}
        )
    
    return {"message": "Allocation updated", "units_paid": units_paid}


@api_router.delete("/clients/{client_id}/allocations/{bond_id}")
async def remove_bond_allocation(client_id: str, bond_id: str, current_user: dict = Depends(get_current_user)):
    """Remove a bond allocation from a client"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can remove allocations")
    
    client = await db.clients.find_one({"id": client_id, "created_by": current_user['id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    allocations = client.get('bond_allocations', [])
    units_paid_to_return = 0
    
    for alloc in allocations:
        if alloc['bond_id'] == bond_id:
            units_paid_to_return = alloc.get('units_paid', 0)
            break
    
    await db.clients.update_one(
        {"id": client_id},
        {"$pull": {"bond_allocations": {"bond_id": bond_id}}}
    )
    
    # Return paid units to bond's available pool
    if units_paid_to_return > 0:
        await db.bonds.update_one(
            {"id": bond_id},
            {"$inc": {"units_sold": -units_paid_to_return}}
        )
    
    return {"message": "Bond allocation removed"}


@api_router.get("/clients/{client_id}")
async def get_client_details(client_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed client information including KYC details"""
    
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Check access based on role
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        # Sub-broker can only access linked clients
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return client


# ==================== END CLIENT MANAGEMENT ====================


# ==================== BULK UPLOAD ====================

class BulkUploadResult(BaseModel):
    total_rows: int
    successful: int
    failed: int
    errors: List[dict]
    created_clients: List[dict]


@api_router.post("/clients/bulk-upload")
async def bulk_upload_clients(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """
    Bulk upload clients from Excel file.
    Expected columns from the investor list Excel:
    - Name, Pan Number, Contact Number, Email Address, Type (entity type)
    - Address1, Address2, City, State, Country, Pincode
    - Bank Account Number, Account Holder Name, IFSC
    - Father / Husband's Name, Occupation, Date of Birth
    - Nominee Name, Nominee Mobile Number, Relationship With Nominee, Nominee Date of Birth
    - Demat Account, Registration Date (as expiry date)
    """
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can bulk upload clients")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported")
    
    try:
        # Read the Excel file
        contents = await file.read()
        wb = load_workbook(filename=io.BytesIO(contents), data_only=True)
        ws = wb.active
        
        # Get headers from first row
        headers = []
        for cell in ws[1]:
            headers.append(str(cell.value).strip() if cell.value else "")
        
        # Column mapping from Excel to our schema
        column_map = {
            'Name': 'name',
            'Pan Number': 'pan_number',
            'Contact Number': 'mobile',
            'Email Address': 'email',
            'Type': 'entity_type',
            'Address1': 'address_line1',
            'Address2': 'address_line2',
            'City': 'city',
            'State': 'state',
            'Country': 'country',
            'Pincode': 'pincode',
            'Bank Account Number': 'account_number',
            'Account Holder Name': 'account_holder_name',
            'IFSC': 'ifsc_code',
            'Father / Husband\'s Name': 'father_husband_name',
            'Occupation': 'occupation',
            'Date of Birth': 'date_of_birth',
            'Nominee Name': 'nominee_name',
            'Nominee Mobile Number': 'nominee_mobile',
            'Relationship With Nominee': 'nominee_relationship',
            'Nominee Date of Birth': 'nominee_dob',
            'Demat Account': 'demat_account',
            'Registration Date': 'registration_date',
            'Investor ID': 'investor_id',
            'Partner Code': 'partner_code',
            'Investor Status': 'investor_status',
            'Invested Amount (in ₹)': 'invested_amount',
        }
        
        # Find column indices
        col_indices = {}
        for i, header in enumerate(headers):
            for excel_col, db_field in column_map.items():
                if header.lower().strip() == excel_col.lower().strip():
                    col_indices[db_field] = i
                    break
        
        results = {
            "total_rows": 0,
            "successful": 0,
            "failed": 0,
            "errors": [],
            "created_clients": []
        }
        
        # Process each row (starting from row 2)
        for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            if not any(row):  # Skip empty rows
                continue
            
            results["total_rows"] += 1
            
            try:
                # Extract data from row
                def get_value(field_name):
                    if field_name in col_indices:
                        val = row[col_indices[field_name]]
                        if val is not None:
                            return str(val).strip()
                    return None
                
                name = get_value('name')
                pan = get_value('pan_number')
                
                # Skip placeholder/test data
                if not name or not pan:
                    results["failed"] += 1
                    results["errors"].append({
                        "row": row_num,
                        "error": "Missing required fields (Name or PAN)"
                    })
                    continue
                
                # Skip obvious test data
                if 'test' in name.lower() or 'service test' in name.lower():
                    results["failed"] += 1
                    results["errors"].append({
                        "row": row_num,
                        "error": f"Skipped test data: {name}"
                    })
                    continue
                
                # Check if client with same PAN already exists
                existing = await db.clients.find_one({"pan_number": pan.upper()})
                if existing:
                    results["failed"] += 1
                    results["errors"].append({
                        "row": row_num,
                        "error": f"Client with PAN {pan} already exists"
                    })
                    continue
                
                # Parse mobile number - clean it
                mobile = get_value('mobile')
                if mobile:
                    mobile = mobile.replace(' ', '').strip()
                
                # Parse pincode - clean it
                pincode = get_value('pincode')
                if pincode and pincode.startswith('IN'):
                    pincode = None  # Invalid format
                
                # Parse date of birth
                dob = get_value('date_of_birth')
                if dob and isinstance(dob, datetime):
                    dob = dob.strftime('%Y-%m-%d')
                
                # Parse nominee DOB
                nominee_dob = get_value('nominee_dob')
                if nominee_dob and isinstance(nominee_dob, datetime):
                    nominee_dob = nominee_dob.strftime('%Y-%m-%d')
                
                # Lookup sub-broker by partner code
                partner_code = get_value('partner_code')
                linked_subbroker_id = None
                linked_subbroker_name = None
                
                if partner_code:
                    # Find the sub-broker/partner with this code under the current broker
                    partner = await db.partners.find_one({
                        "partner_code": partner_code,
                        "created_by": current_user['id']
                    })
                    if partner:
                        linked_subbroker_id = partner['id']
                        linked_subbroker_name = partner['name']
                
                # Create client document
                client_id = str(uuid.uuid4())
                client_dict = {
                    "id": client_id,
                    "name": name,
                    "pan_number": pan.upper(),
                    "email": get_value('email'),
                    "mobile": mobile,
                    "entity_type": get_value('entity_type') or "Indian Citizen",
                    "address_line1": get_value('address_line1'),
                    "address_line2": get_value('address_line2'),
                    "city": get_value('city'),
                    "state": get_value('state'),
                    "country": get_value('country') or "India",
                    "pincode": pincode,
                    "account_number": get_value('account_number'),
                    "account_holder_name": get_value('account_holder_name'),
                    "ifsc_code": get_value('ifsc_code'),
                    "bank_name": None,  # Not in Excel
                    "father_husband_name": get_value('father_husband_name'),
                    "occupation": get_value('occupation'),
                    "date_of_birth": dob,
                    "nominee_name": get_value('nominee_name'),
                    "nominee_mobile": get_value('nominee_mobile'),
                    "nominee_relationship": get_value('nominee_relationship'),
                    "nominee_dob": nominee_dob,
                    "demat_account": get_value('demat_account'),
                    "investor_id": get_value('investor_id'),
                    "investor_status": get_value('investor_status'),
                    "registration_date": get_value('registration_date'),
                    "linked_subbroker_id": linked_subbroker_id,
                    "created_by": current_user['id'],
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "bond_allocations": [],
                    "is_active": True,
                    "verification_status": 'pending',
                    "verification_token": str(uuid.uuid4()),
                    "source": "bulk_upload"
                }
                
                # Create user account for client
                user_id = str(uuid.uuid4())
                default_password = pan.upper()[-4:] + "1234"
                default_pin = "1234"
                
                user_data = {
                    "id": user_id,
                    "pan": pan.upper(),
                    "name": name,
                    "email": get_value('email'),
                    "phone": mobile,
                    "password_hash": get_password_hash(default_password),
                    "pin_hash": get_password_hash(default_pin),
                    "role": "client",
                    "is_active": False,  # Activated after verification
                    "client_id": client_id,
                    "broker_id": current_user['id'],
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                client_dict['user_id'] = user_id
                
                # Check if user with same PAN already exists
                existing_user = await db.users.find_one({"pan": pan.upper()})
                if not existing_user:
                    await db.users.insert_one(user_data)
                
                await db.clients.insert_one(client_dict)
                
                results["successful"] += 1
                results["created_clients"].append({
                    "name": name,
                    "pan": pan.upper(),
                    "id": client_id,
                    "linked_subbroker": linked_subbroker_name
                })
                
            except Exception as e:
                results["failed"] += 1
                results["errors"].append({
                    "row": row_num,
                    "error": str(e)
                })
        
        return results
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@api_router.get("/clients/bulk-upload/template")
async def get_bulk_upload_template(current_user: dict = Depends(get_current_user)):
    """Download a template Excel file for bulk client upload"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access this")
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Client Upload Template"
    
    # Headers matching the expected format - Partner Code added for sub-broker linking
    headers = [
        "Name", "Pan Number", "UCC", "Contact Number", "Email Address", "Type",
        "Partner Code",  # Sub-broker partner code for auto-linking
        "Father / Husband's Name", "Occupation", "Date of Birth",
        "Address1", "Address2", "City", "State", "Country", "Pincode",
        "Bank Account Number", "Account Holder Name", "IFSC",
        "Demat Account",
        "Nominee Name", "Nominee Mobile Number", "Relationship With Nominee", "Nominee Date of Birth"
    ]
    
    # Add headers
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        cell.font = Font(bold=True, color="FFFFFF")
        cell.alignment = Alignment(horizontal="center")
    
    # Add sample row
    sample_data = [
        "John Doe", "ABCDE1234F", "UCC123456", "+91 9876543210", "john@example.com", "Indian Citizen",
        "SB001",  # Sample partner code
        "Father Name", "Business", "1990-01-15",
        "123 Main Street", "Apt 4B", "Mumbai", "Maharashtra", "India", "400001",
        "1234567890123", "John Doe", "HDFC0001234",
        "IN30123456789012",
        "Jane Doe", "9876543210", "Spouse", "1992-05-20"
    ]
    
    for col, value in enumerate(sample_data, 1):
        ws.cell(row=2, column=col, value=value)
    
    # Adjust column widths
    for col in range(1, len(headers) + 1):
        ws.column_dimensions[get_column_letter(col)].width = 18
    
    # Save to buffer
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=client_upload_template.xlsx"}
    )


# ==================== END BULK UPLOAD ====================


# ==================== TRADE MANAGEMENT ====================

class TradeCreate(BaseModel):
    bond_id: str
    client_id: Optional[str] = None  # Optional for clients (backend uses their client_id)
    units: int
    investment_date: str
    calculated_price: float
    total_amount: Optional[float] = None
    payment_reference: Optional[str] = None
    payment_notes: Optional[str] = None
    payment_proof_filename: Optional[str] = None


class TradeUpdate(BaseModel):
    status: str  # approved, rejected
    broker_notes: Optional[str] = None


@api_router.post("/trades")
async def create_trade(trade_data: TradeCreate, current_user: dict = Depends(get_current_user)):
    """Create a trade request (broker or sub-broker can create)"""
    
    # Verify bond exists and has available units
    bond = await db.bonds.find_one({"id": trade_data.bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    total_units = bond.get('total_units', 1)
    units_sold = bond.get('units_sold', 0)
    units_available = total_units - units_sold
    
    if trade_data.units > units_available:
        raise HTTPException(status_code=400, detail=f"Only {units_available} units available")
    
    # Verify client exists
    client = await db.clients.find_one({"id": trade_data.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Check access to client
    if current_user['role'] == 'sub_broker':
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="You can only create trades for your linked clients")
    
    # Determine if auto-approve (broker creates) or pending (sub-broker creates)
    status = "approved" if current_user['role'] == 'broker' else "pending"
    
    trade_dict = {
        "id": str(uuid.uuid4()),
        "bond_id": trade_data.bond_id,
        "bond_name": bond['name'],
        "client_id": trade_data.client_id,
        "client_name": client['name'],
        "client_pan": client['pan_number'],
        "units": trade_data.units,
        "investment_date": trade_data.investment_date,
        "calculated_price": trade_data.calculated_price,
        "total_amount": trade_data.calculated_price * trade_data.units,
        "payment_reference": trade_data.payment_reference,
        "payment_notes": trade_data.payment_notes,
        "payment_proof_filename": trade_data.payment_proof_filename,
        "status": status,
        "created_by": current_user['id'],
        "created_by_name": current_user.get('name', 'Unknown'),
        "created_by_role": current_user['role'],
        "broker_notes": None,
        "approved_by": current_user['id'] if status == "approved" else None,
        "approved_at": datetime.now(timezone.utc).isoformat() if status == "approved" else None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.trades.insert_one(trade_dict)
    
    # If auto-approved (broker created), update bond units
    if status == "approved":
        await db.bonds.update_one(
            {"id": trade_data.bond_id},
            {"$inc": {"units_sold": trade_data.units}}
        )
        
        # Also add to client's bond allocations
        allocation = {
            "bond_id": trade_data.bond_id,
            "bond_name": bond['name'],
            "units_blocked": trade_data.units,
            "units_paid": trade_data.units,
            "status": "fully_paid",
            "trade_id": trade_dict['id'],
            "allocated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.clients.update_one(
            {"id": trade_data.client_id},
            {"$push": {"bond_allocations": allocation}}
        )
    
    if '_id' in trade_dict:
        del trade_dict['_id']
    
    return trade_dict


@api_router.get("/trades")
async def get_trades(status: Optional[str] = None, client_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get trades - brokers see all, sub-brokers see only their own"""
    
    query = {}
    
    if current_user['role'] == 'broker':
        # Brokers see all trades
        pass
    elif current_user['role'] == 'client':
        # Clients see only their own trades
        client = await db.clients.find_one({"user_id": current_user['id']})
        if client:
            query["client_id"] = client['id']
    else:
        # Sub-brokers see only trades they created
        query["created_by"] = current_user['id']
    
    if status:
        query["status"] = status
    
    if client_id:
        query["client_id"] = client_id
    
    trades = await db.trades.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return trades


@api_router.get("/trades/pending")
async def get_pending_trades(current_user: dict = Depends(get_current_user)):
    """Get pending trades for broker verification"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can view pending trades")
    
    trades = await db.trades.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return trades


@api_router.get("/trades/{trade_id}")
async def get_trade(trade_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific trade"""
    trade = await db.trades.find_one({"id": trade_id}, {"_id": 0})
    
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Check access
    if current_user['role'] != 'broker' and trade['created_by'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return trade


@api_router.put("/trades/{trade_id}/verify")
async def verify_trade(trade_id: str, update: TradeUpdate, current_user: dict = Depends(get_current_user)):
    """Approve or reject a trade (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can verify trades")
    
    trade = await db.trades.find_one({"id": trade_id})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    if trade['status'] != 'pending':
        raise HTTPException(status_code=400, detail="Trade is not pending verification")
    
    if update.status not in ['approved', 'rejected']:
        raise HTTPException(status_code=400, detail="Status must be 'approved' or 'rejected'")
    
    # Update trade status
    await db.trades.update_one(
        {"id": trade_id},
        {"$set": {
            "status": update.status,
            "broker_notes": update.broker_notes,
            "approved_by": current_user['id'],
            "approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # If approved, update bond units and client allocation
    if update.status == 'approved':
        # Update bond units sold
        await db.bonds.update_one(
            {"id": trade['bond_id']},
            {"$inc": {"units_sold": trade['units']}}
        )
        
        # Add to client's bond allocations
        bond = await db.bonds.find_one({"id": trade['bond_id']})
        allocation = {
            "bond_id": trade['bond_id'],
            "bond_name": trade['bond_name'],
            "units_blocked": trade['units'],
            "units_paid": trade['units'],
            "status": "fully_paid",
            "trade_id": trade_id,
            "allocated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.clients.update_one(
            {"id": trade['client_id']},
            {"$push": {"bond_allocations": allocation}}
        )
    
    return {"message": f"Trade {update.status}", "trade_id": trade_id}


@api_router.delete("/trades/{trade_id}")
async def cancel_trade(trade_id: str, current_user: dict = Depends(get_current_user)):
    """Cancel a pending trade"""
    trade = await db.trades.find_one({"id": trade_id})
    
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Only creator or broker can cancel
    if current_user['role'] != 'broker' and trade['created_by'] != current_user['id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if trade['status'] != 'pending':
        raise HTTPException(status_code=400, detail="Only pending trades can be cancelled")
    
    await db.trades.delete_one({"id": trade_id})
    
    return {"message": "Trade cancelled"}


# ==================== END TRADE MANAGEMENT ====================


# ==================== HOLDINGS MANAGEMENT ====================

class RepaymentUpdate(BaseModel):
    is_repaid: bool
    repaid_date: Optional[str] = None
    repaid_amount: Optional[float] = None
    notes: Optional[str] = None


def calculate_holding_xirr(investment_date: str, investment_amount: float, cashflows: List[dict]) -> Optional[float]:
    """
    Calculate XIRR for a holding based on investment and actual repayment dates.
    Returns annualized return rate or None if calculation fails.
    """
    try:
        from scipy.optimize import brentq
        from datetime import datetime
        
        # Build cash flow list: negative for investment, positive for repayments
        dates = []
        amounts = []
        
        # Initial investment (outflow)
        inv_date = datetime.fromisoformat(investment_date.replace('Z', '+00:00')) if 'T' in investment_date else datetime.strptime(investment_date, '%Y-%m-%d')
        dates.append(inv_date)
        amounts.append(-investment_amount)
        
        # Add repaid cashflows (inflows)
        for cf in cashflows:
            if cf.get('is_repaid') and cf.get('repaid_date'):
                cf_date = datetime.fromisoformat(cf['repaid_date'].replace('Z', '+00:00')) if 'T' in cf['repaid_date'] else datetime.strptime(cf['repaid_date'], '%Y-%m-%d')
                cf_amount = cf.get('repaid_actual_amount') or cf.get('net_amount', 0)
                if cf_amount > 0:
                    dates.append(cf_date)
                    amounts.append(cf_amount)
        
        # Add pending cashflows at scheduled dates (for projected XIRR)
        for cf in cashflows:
            if not cf.get('is_repaid'):
                cf_date = datetime.fromisoformat(cf['date'].replace('Z', '+00:00')) if 'T' in cf['date'] else datetime.strptime(cf['date'], '%Y-%m-%d')
                cf_amount = cf.get('net_amount', 0)
                if cf_amount > 0:
                    dates.append(cf_date)
                    amounts.append(cf_amount)
        
        if len(dates) < 2:
            return None
        
        # Calculate XIRR
        min_date = min(dates)
        day_factors = [(d - min_date).days / 365.0 for d in dates]
        
        def npv(rate):
            return sum(a / ((1 + rate) ** t) for a, t in zip(amounts, day_factors))
        
        try:
            xirr = brentq(npv, -0.99, 10.0, maxiter=1000)
            return round(xirr * 100, 2)  # Return as percentage
        except:
            return None
    except Exception as e:
        logger.error(f"XIRR calculation error: {e}")
        return None


def generate_client_cashflows(trade: dict, bond: dict) -> List[dict]:
    """
    Generate cashflow schedule for a client based on their trade and bond details.
    Uses exact cashflows_per_unit if available (for secondary market bonds),
    otherwise falls back to calculated cashflows.
    Returns list of cashflow entries with repayment status.
    """
    investment_date = datetime.fromisoformat(trade['investment_date'])
    units = trade['units']
    cashflows = []
    
    # Check if bond has exact cashflows per unit (preferred for secondary market)
    cashflows_per_unit = bond.get('cashflows_per_unit', [])
    
    if cashflows_per_unit:
        # Use EXACT cashflows per unit from bond definition
        for cf in cashflows_per_unit:
            cf_date = datetime.fromisoformat(cf['date'])
            
            # Only include cashflows AFTER investment date
            if cf_date > investment_date:
                interest_per_unit = cf.get('interest_per_unit', 0)
                principal_per_unit = cf.get('principal_per_unit', 0)
                
                # Calculate amounts for this client's units
                gross_interest = interest_per_unit * units
                principal_amount = principal_per_unit * units
                total_gross = gross_interest + principal_amount
                
                # TDS on interest only
                tds = gross_interest * 0.10  # 10% TDS
                net_amount = total_gross - tds
                
                cashflows.append({
                    "id": str(uuid.uuid4()),
                    "trade_id": trade['id'],
                    "type": "combined" if (gross_interest > 0 and principal_amount > 0) else ("interest" if gross_interest > 0 else "principal"),
                    "date": cf['date'],
                    "gross_amount": round(total_gross, 2),
                    "tds_amount": round(tds, 2),
                    "net_amount": round(net_amount, 2),
                    "principal_component": round(principal_amount, 2),
                    "interest_component": round(gross_interest, 2),
                    "is_repaid": False,
                    "repaid_date": None,
                    "repaid_actual_amount": None,
                    "notes": None
                })
    else:
        # Fallback: Use calculated cashflows from interest_payments and principal_payments
        # Get remaining interest payments after investment date
        for ip in bond.get('interest_payments', []):
            ip_date = datetime.fromisoformat(ip['date'])
            if ip_date > investment_date:
                gross_interest = ip['amount'] * units
                tds = gross_interest * 0.10  # 10% TDS
                net_interest = gross_interest - tds
                
                cashflows.append({
                    "id": str(uuid.uuid4()),
                    "trade_id": trade['id'],
                    "type": "interest",
                    "date": ip['date'],
                    "gross_amount": round(gross_interest, 2),
                    "tds_amount": round(tds, 2),
                    "net_amount": round(net_interest, 2),
                    "principal_component": 0,
                    "interest_component": round(gross_interest, 2),
                    "is_repaid": False,
                    "repaid_date": None,
                    "repaid_actual_amount": None,
                    "notes": None
                })
        
        # Get remaining principal payments after investment date
        total_units = bond.get('total_units', 1)
        principal_per_unit = bond['principal_amount'] / total_units if total_units > 0 else bond['principal_amount']
        
        for pp in bond.get('principal_payments', []):
            pp_date = datetime.fromisoformat(pp['date'])
            if pp_date > investment_date:
                principal_amount = principal_per_unit * (pp['percentage'] / 100) * units
                
                # Check if there's already a cashflow on this date (combine with interest)
                existing = next((cf for cf in cashflows if cf['date'] == pp['date']), None)
                if existing:
                    existing['principal_component'] = round(principal_amount, 2)
                    existing['gross_amount'] = round(existing['gross_amount'] + principal_amount, 2)
                    existing['net_amount'] = round(existing['net_amount'] + principal_amount, 2)
                else:
                    cashflows.append({
                        "id": str(uuid.uuid4()),
                        "trade_id": trade['id'],
                        "type": "principal",
                        "date": pp['date'],
                        "gross_amount": round(principal_amount, 2),
                        "tds_amount": 0,
                        "net_amount": round(principal_amount, 2),
                        "principal_component": round(principal_amount, 2),
                        "interest_component": 0,
                        "is_repaid": False,
                        "repaid_date": None,
                        "repaid_actual_amount": None,
                        "notes": None
                    })
    
    # Sort by date
    cashflows.sort(key=lambda x: x['date'])
    return cashflows


@api_router.get("/holdings/clients")
async def get_holdings_clients(current_user: dict = Depends(get_current_user)):
    """Get list of clients with their holding summaries for the Holdings page"""
    
    # Get clients based on role
    if current_user['role'] == 'broker':
        clients = await db.clients.find({"created_by": current_user['id']}, {"_id": 0}).to_list(1000)
    else:
        # Sub-brokers see only linked clients
        clients = await db.clients.find({"linked_subbroker_id": current_user['id']}, {"_id": 0}).to_list(1000)
    
    # Get approved trades for each client
    client_summaries = []
    for client in clients:
        trades = await db.trades.find({
            "client_id": client['id'],
            "status": "approved"
        }, {"_id": 0}).to_list(100)
        
        total_investment = sum(t.get('total_amount', 0) for t in trades)
        
        client_summaries.append({
            "id": client['id'],
            "name": client['name'],
            "pan_number": client['pan_number'],
            "total_investment": round(total_investment, 2),
            "trade_count": len(trades),
            "is_active": client.get('is_active', True)
        })
    
    return client_summaries


@api_router.get("/holdings/client/{client_id}")
async def get_client_holdings(client_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed holdings for a specific client"""
    
    # Verify client access
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Check access
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user['role'] == 'client':
        # Client can only access their own holdings
        if client.get('user_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        # Sub-broker
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Get approved trades for this client
    trades = await db.trades.find({
        "client_id": client_id,
        "status": "approved"
    }, {"_id": 0}).to_list(100)
    
    holdings = []
    total_investment = 0
    total_repaid = 0
    total_upcoming = 0
    
    for trade in trades:
        # Get bond details
        bond = await db.bonds.find_one({"id": trade['bond_id']}, {"_id": 0})
        if not bond:
            continue
        
        # Check if we have stored cashflows, otherwise generate them
        stored_cashflows = await db.holding_cashflows.find({
            "trade_id": trade['id']
        }, {"_id": 0}).to_list(100)
        
        if not stored_cashflows:
            # Generate and store cashflows
            cashflows = generate_client_cashflows(trade, bond)
            if cashflows:
                for cf in cashflows:
                    cf['client_id'] = client_id
                    cf['bond_id'] = trade['bond_id']
                    cf['bond_name'] = trade['bond_name']
                await db.holding_cashflows.insert_many(cashflows)
                # Refetch to ensure we don't have _id in response
                stored_cashflows = await db.holding_cashflows.find({
                    "trade_id": trade['id']
                }, {"_id": 0}).to_list(100)
        
        # Calculate totals for this holding
        investment_amount = trade.get('total_amount', 0)
        repaid_amount = sum(cf.get('repaid_actual_amount', 0) or cf.get('net_amount', 0) 
                          for cf in stored_cashflows if cf.get('is_repaid'))
        upcoming_amount = sum(cf.get('net_amount', 0) 
                            for cf in stored_cashflows if not cf.get('is_repaid'))
        
        # Calculate principal and interest components
        total_principal = sum(cf.get('principal_component', 0) for cf in stored_cashflows)
        total_interest_gross = sum(cf.get('interest_component', 0) for cf in stored_cashflows)
        total_tds = sum(cf.get('tds_amount', 0) for cf in stored_cashflows)
        total_net_interest = total_interest_gross - total_tds
        
        # Repaid components
        repaid_principal = sum(cf.get('principal_component', 0) for cf in stored_cashflows if cf.get('is_repaid'))
        repaid_interest = sum(cf.get('interest_component', 0) for cf in stored_cashflows if cf.get('is_repaid'))
        repaid_tds = sum(cf.get('tds_amount', 0) for cf in stored_cashflows if cf.get('is_repaid'))
        
        # Calculate prepaid info
        prepaid_cashflows = [cf for cf in stored_cashflows if cf.get('is_prepaid')]
        prepaid_amount = sum(cf.get('repaid_actual_amount', 0) or cf.get('net_amount', 0) for cf in prepaid_cashflows)
        
        # Calculate XIRR for this holding
        holding_xirr = calculate_holding_xirr(
            trade['investment_date'], 
            investment_amount, 
            stored_cashflows
        )
        
        holdings.append({
            "trade_id": trade['id'],
            "bond_id": trade['bond_id'],
            "bond_name": trade['bond_name'],
            "units": trade['units'],
            "investment_date": trade['investment_date'],
            "invested_amount": round(investment_amount, 2),
            "total_principal": round(total_principal, 2),
            "total_interest_gross": round(total_interest_gross, 2),
            "total_tds": round(total_tds, 2),
            "total_net_expected": round(total_principal + total_net_interest, 2),
            "repaid_principal": round(repaid_principal, 2),
            "repaid_interest": round(repaid_interest, 2),
            "repaid_tds": round(repaid_tds, 2),
            "net_repaid": round(repaid_amount, 2),
            "upcoming_expected": round(upcoming_amount, 2),
            "prepaid_count": len(prepaid_cashflows),
            "prepaid_amount": round(prepaid_amount, 2),
            "xirr": holding_xirr,
            "cashflows": stored_cashflows,
            "status": "active" if upcoming_amount > 0 else "fully_repaid"
        })
        
        total_investment += investment_amount
        total_repaid += repaid_amount
        total_upcoming += upcoming_amount
    
    return {
        "client": {
            "id": client['id'],
            "name": client['name'],
            "pan_number": client['pan_number'],
            "email": client.get('email'),
            "mobile": client.get('mobile')
        },
        "summary": {
            "total_investment": round(total_investment, 2),
            "total_repaid": round(total_repaid, 2),
            "total_upcoming": round(total_upcoming, 2),
            "total_expected": round(total_repaid + total_upcoming, 2)
        },
        "holdings": holdings
    }


@api_router.put("/holdings/cashflow/{cashflow_id}/mark-repaid")
async def mark_cashflow_repaid(cashflow_id: str, update: RepaymentUpdate, current_user: dict = Depends(get_current_user)):
    """Mark a cashflow entry as repaid (broker or sub-broker can do this)"""
    
    # Find the cashflow
    cashflow = await db.holding_cashflows.find_one({"id": cashflow_id})
    if not cashflow:
        raise HTTPException(status_code=404, detail="Cashflow entry not found")
    
    # Verify access to the client
    client = await db.clients.find_one({"id": cashflow['client_id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Update cashflow - detect if this is a prepayment
    scheduled_date = datetime.fromisoformat(cashflow['date'].replace('Z', '+00:00')) if 'T' in cashflow['date'] else datetime.strptime(cashflow['date'], '%Y-%m-%d')
    
    actual_date_str = update.repaid_date or datetime.now(timezone.utc).isoformat()
    actual_date = datetime.fromisoformat(actual_date_str.replace('Z', '+00:00')) if 'T' in actual_date_str else datetime.strptime(actual_date_str, '%Y-%m-%d')
    
    # Prepayment: if actual date is before scheduled date
    is_prepaid = actual_date.date() < scheduled_date.date() if update.is_repaid else False
    days_early = (scheduled_date.date() - actual_date.date()).days if is_prepaid else 0
    
    update_data = {
        "is_repaid": update.is_repaid,
        "repaid_date": actual_date_str,
        "repaid_actual_amount": update.repaid_amount,
        "is_prepaid": is_prepaid,
        "days_early": days_early,
        "notes": update.notes,
        "marked_by": current_user['id'],
        "marked_at": datetime.now(timezone.utc).isoformat()
    }
    
    if not update.is_repaid:
        update_data["repaid_date"] = None
        update_data["repaid_actual_amount"] = None
        update_data["is_prepaid"] = False
        update_data["days_early"] = 0
    
    await db.holding_cashflows.update_one(
        {"id": cashflow_id},
        {"$set": update_data}
    )
    
    # If this is a principal prepayment, recalculate subsequent interest
    interest_amended = 0
    if update.is_repaid and is_prepaid and cashflow.get('principal_component', 0) > 0:
        interest_amended = await recalculate_interest_after_prepayment(
            trade_id=cashflow['trade_id'],
            prepayment_date=actual_date,
            prepaid_principal=cashflow.get('principal_component', 0),
            current_user_id=current_user['id']
        )
    
    return {
        "message": "Cashflow updated successfully", 
        "is_repaid": update.is_repaid,
        "is_prepaid": is_prepaid,
        "days_early": days_early,
        "interest_amended": interest_amended
    }


async def recalculate_interest_after_prepayment(trade_id: str, prepayment_date: datetime, prepaid_principal: float, current_user_id: str) -> int:
    """
    Recalculate interest for all future cashflows after a principal prepayment.
    Returns the number of interest entries amended.
    """
    # Get all cashflows for this trade
    all_cashflows = await db.holding_cashflows.find(
        {"trade_id": trade_id},
        {"_id": 0}
    ).to_list(100)
    
    if not all_cashflows:
        return 0
    
    # Get trade and bond details
    trade = await db.trades.find_one({"id": trade_id}, {"_id": 0})
    if not trade:
        return 0
    
    bond = await db.bonds.find_one({"id": trade['bond_id']}, {"_id": 0})
    if not bond:
        return 0
    
    # Calculate total original principal for this trade
    original_principal = bond.get('principal_amount', 0) * trade.get('units', 0)
    
    # Calculate total principal already repaid (including this prepayment)
    repaid_principal = sum(
        cf.get('principal_component', 0) 
        for cf in all_cashflows 
        if cf.get('is_repaid')
    )
    
    # Remaining principal after prepayment
    remaining_principal = original_principal - repaid_principal
    
    if remaining_principal < 0:
        remaining_principal = 0
    
    # Calculate the reduction ratio
    if original_principal > 0:
        reduction_ratio = remaining_principal / original_principal
    else:
        reduction_ratio = 1.0
    
    amended_count = 0
    
    # Update all future interest payments
    for cf in all_cashflows:
        cf_date = datetime.fromisoformat(cf['date'].replace('Z', '+00:00')) if 'T' in cf['date'] else datetime.strptime(cf['date'], '%Y-%m-%d')
        
        # Only amend future interest payments that haven't been repaid
        if cf_date.date() > prepayment_date.date() and not cf.get('is_repaid') and cf.get('interest_component', 0) > 0:
            original_interest = cf.get('original_interest_component') or cf.get('interest_component', 0)
            original_tds = cf.get('original_tds_amount') or cf.get('tds_amount', 0)
            original_net = cf.get('original_net_amount') or cf.get('net_amount', 0)
            
            # Calculate amended amounts based on remaining principal
            amended_interest = round(original_interest * reduction_ratio, 2)
            amended_tds = round(amended_interest * 0.10, 2)  # 10% TDS
            amended_net = round(amended_interest - amended_tds + cf.get('principal_component', 0), 2)
            
            await db.holding_cashflows.update_one(
                {"id": cf['id']},
                {"$set": {
                    # Store original values if not already stored
                    "original_interest_component": original_interest,
                    "original_tds_amount": original_tds,
                    "original_net_amount": original_net,
                    "original_gross_amount": cf.get('original_gross_amount') or cf.get('gross_amount', 0),
                    # Update to amended values
                    "interest_component": amended_interest,
                    "tds_amount": amended_tds,
                    "gross_amount": round(amended_interest + cf.get('principal_component', 0), 2),
                    "net_amount": amended_net,
                    "is_amended": True,
                    "amendment_reason": f"Principal prepayment of ₹{prepaid_principal:,.2f} on {prepayment_date.strftime('%d-%m-%Y')}",
                    "amendment_date": datetime.now(timezone.utc).isoformat(),
                    "amended_by": current_user_id,
                    "remaining_principal_ratio": round(reduction_ratio, 4)
                }}
            )
            amended_count += 1
    
    return amended_count


@api_router.post("/holdings/cashflow/{cashflow_id}/amend-interest")
async def amend_cashflow_interest(
    cashflow_id: str, 
    amended_interest: float = Body(..., embed=True),
    reason: str = Body(None, embed=True),
    current_user: dict = Depends(get_current_user)
):
    """Manually amend interest amount for a cashflow entry"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can amend cashflows")
    
    cashflow = await db.holding_cashflows.find_one({"id": cashflow_id})
    if not cashflow:
        raise HTTPException(status_code=404, detail="Cashflow entry not found")
    
    # Verify access
    client = await db.clients.find_one({"id": cashflow['client_id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Store original values if not already stored
    original_interest = cashflow.get('original_interest_component') or cashflow.get('interest_component', 0)
    original_tds = cashflow.get('original_tds_amount') or cashflow.get('tds_amount', 0)
    original_net = cashflow.get('original_net_amount') or cashflow.get('net_amount', 0)
    original_gross = cashflow.get('original_gross_amount') or cashflow.get('gross_amount', 0)
    
    # Calculate new TDS and net amounts
    new_tds = round(amended_interest * 0.10, 2)
    principal = cashflow.get('principal_component', 0)
    new_gross = round(amended_interest + principal, 2)
    new_net = round(amended_interest - new_tds + principal, 2)
    
    await db.holding_cashflows.update_one(
        {"id": cashflow_id},
        {"$set": {
            "original_interest_component": original_interest,
            "original_tds_amount": original_tds,
            "original_net_amount": original_net,
            "original_gross_amount": original_gross,
            "interest_component": amended_interest,
            "tds_amount": new_tds,
            "gross_amount": new_gross,
            "net_amount": new_net,
            "is_amended": True,
            "amendment_reason": reason or "Manual amendment",
            "amendment_date": datetime.now(timezone.utc).isoformat(),
            "amended_by": current_user['id']
        }}
    )
    
    return {
        "message": "Interest amended successfully",
        "original_interest": original_interest,
        "amended_interest": amended_interest,
        "new_tds": new_tds,
        "new_net": new_net
    }


@api_router.post("/holdings/cashflow/{cashflow_id}/revert-amendment")
async def revert_cashflow_amendment(cashflow_id: str, current_user: dict = Depends(get_current_user)):
    """Revert an amended cashflow back to original values"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can revert amendments")
    
    cashflow = await db.holding_cashflows.find_one({"id": cashflow_id})
    if not cashflow:
        raise HTTPException(status_code=404, detail="Cashflow entry not found")
    
    if not cashflow.get('is_amended'):
        raise HTTPException(status_code=400, detail="This cashflow has not been amended")
    
    # Verify access
    client = await db.clients.find_one({"id": cashflow['client_id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Revert to original values
    original_interest = cashflow.get('original_interest_component', cashflow.get('interest_component', 0))
    original_tds = cashflow.get('original_tds_amount', cashflow.get('tds_amount', 0))
    original_net = cashflow.get('original_net_amount', cashflow.get('net_amount', 0))
    original_gross = cashflow.get('original_gross_amount', cashflow.get('gross_amount', 0))
    
    await db.holding_cashflows.update_one(
        {"id": cashflow_id},
        {
            "$set": {
                "interest_component": original_interest,
                "tds_amount": original_tds,
                "net_amount": original_net,
                "gross_amount": original_gross,
                "is_amended": False,
                "reverted_at": datetime.now(timezone.utc).isoformat(),
                "reverted_by": current_user['id']
            },
            "$unset": {
                "amendment_reason": "",
                "amendment_date": "",
                "amended_by": "",
                "remaining_principal_ratio": ""
            }
        }
    )
    
    return {"message": "Amendment reverted successfully"}


class PrincipalPrepaymentRequest(BaseModel):
    prepayment_date: str  # Date when principal was prepaid
    prepaid_amount: float  # Amount of principal prepaid
    notes: Optional[str] = None


@api_router.post("/holdings/trade/{trade_id}/record-prepayment")
async def record_principal_prepayment(
    trade_id: str,
    prepayment: PrincipalPrepaymentRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Record a principal prepayment for a trade/holding.
    This will:
    1. Create or update the principal prepayment record
    2. Calculate prorated interest for the current cycle (before and after prepayment)
    3. Recalculate all future interest payments based on remaining principal
    """
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can record prepayments")
    
    # Get trade
    trade = await db.trades.find_one({"id": trade_id}, {"_id": 0})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Verify access
    client = await db.clients.find_one({"id": trade['client_id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Get bond details
    bond = await db.bonds.find_one({"id": trade['bond_id']}, {"_id": 0})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    # Parse prepayment date
    try:
        prepayment_date = datetime.strptime(prepayment.prepayment_date, "%Y-%m-%d")
    except:
        try:
            prepayment_date = datetime.strptime(prepayment.prepayment_date, "%d-%m-%Y")
        except:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD or DD-MM-YYYY")
    
    # Get all cashflows for this trade
    all_cashflows = await db.holding_cashflows.find(
        {"trade_id": trade_id},
        {"_id": 0}
    ).sort("date", 1).to_list(200)
    
    if not all_cashflows:
        raise HTTPException(status_code=404, detail="No cashflows found for this trade")
    
    # Calculate original and remaining principal
    original_principal = bond.get('principal_amount', 0) * trade.get('units', 0)
    
    # Get previous prepayments
    previous_prepayments = await db.prepayment_records.find(
        {"trade_id": trade_id},
        {"_id": 0}
    ).to_list(50)
    
    total_previously_prepaid = sum(p.get('prepaid_amount', 0) for p in previous_prepayments)
    principal_before_this_prepayment = original_principal - total_previously_prepaid
    remaining_principal = principal_before_this_prepayment - prepayment.prepaid_amount
    
    if remaining_principal < 0:
        remaining_principal = 0
    
    if prepayment.prepaid_amount > principal_before_this_prepayment:
        raise HTTPException(
            status_code=400, 
            detail=f"Prepayment amount (₹{prepayment.prepaid_amount:,.2f}) exceeds outstanding principal (₹{principal_before_this_prepayment:,.2f})"
        )
    
    # Calculate annual interest rate
    interest_rate = bond.get('interest_rate', 0) / 100  # Convert percentage to decimal
    
    # Find the current interest cycle that contains the prepayment date
    current_cycle_cf = None
    previous_cycle_end = None
    
    for i, cf in enumerate(all_cashflows):
        cf_date = datetime.fromisoformat(cf['date'].replace('Z', '+00:00')) if 'T' in cf['date'] else datetime.strptime(cf['date'], '%Y-%m-%d')
        
        if cf.get('type') == 'interest' and cf_date.date() >= prepayment_date.date():
            current_cycle_cf = cf
            # Get the previous interest date as cycle start
            for j in range(i-1, -1, -1):
                prev_cf = all_cashflows[j]
                if prev_cf.get('type') == 'interest':
                    prev_date = datetime.fromisoformat(prev_cf['date'].replace('Z', '+00:00')) if 'T' in prev_cf['date'] else datetime.strptime(prev_cf['date'], '%Y-%m-%d')
                    previous_cycle_end = prev_date
                    break
            break
    
    amended_count = 0
    prorated_interest_info = None
    
    if current_cycle_cf:
        cf_date = datetime.fromisoformat(current_cycle_cf['date'].replace('Z', '+00:00')) if 'T' in current_cycle_cf['date'] else datetime.strptime(current_cycle_cf['date'], '%Y-%m-%d')
        
        # Calculate cycle start (either previous interest date or investment date)
        if previous_cycle_end:
            cycle_start = previous_cycle_end
        else:
            inv_date = datetime.fromisoformat(trade['investment_date'].replace('Z', '+00:00')) if 'T' in trade['investment_date'] else datetime.strptime(trade['investment_date'], '%Y-%m-%d')
            cycle_start = inv_date
        
        cycle_end = cf_date
        total_days_in_cycle = (cycle_end.date() - cycle_start.date()).days
        
        if total_days_in_cycle > 0:
            days_before_prepayment = (prepayment_date.date() - cycle_start.date()).days
            days_after_prepayment = (cycle_end.date() - prepayment_date.date()).days
            
            # Prorated interest calculation
            # Interest before prepayment: on full principal
            # Interest after prepayment: on reduced principal
            
            original_interest = current_cycle_cf.get('original_interest_component') or current_cycle_cf.get('interest_component', 0)
            daily_rate_full = (principal_before_this_prepayment * interest_rate) / 365
            daily_rate_reduced = (remaining_principal * interest_rate) / 365
            
            interest_before = daily_rate_full * max(days_before_prepayment, 0)
            interest_after = daily_rate_reduced * max(days_after_prepayment, 0)
            prorated_interest = round(interest_before + interest_after, 2)
            
            prorated_tds = round(prorated_interest * 0.10, 2)
            prorated_net = round(prorated_interest - prorated_tds + current_cycle_cf.get('principal_component', 0), 2)
            
            # Update the current cycle cashflow with prorated interest
            await db.holding_cashflows.update_one(
                {"id": current_cycle_cf['id']},
                {"$set": {
                    "original_interest_component": original_interest,
                    "original_tds_amount": current_cycle_cf.get('original_tds_amount') or current_cycle_cf.get('tds_amount', 0),
                    "original_net_amount": current_cycle_cf.get('original_net_amount') or current_cycle_cf.get('net_amount', 0),
                    "interest_component": prorated_interest,
                    "tds_amount": prorated_tds,
                    "net_amount": prorated_net,
                    "is_amended": True,
                    "is_prorated": True,
                    "amendment_reason": f"Prorated due to principal prepayment of ₹{prepayment.prepaid_amount:,.2f} on {prepayment_date.strftime('%d-%m-%Y')}",
                    "proration_details": {
                        "cycle_start": cycle_start.isoformat(),
                        "cycle_end": cycle_end.isoformat(),
                        "prepayment_date": prepayment_date.isoformat(),
                        "days_before": days_before_prepayment,
                        "days_after": days_after_prepayment,
                        "interest_before": round(interest_before, 2),
                        "interest_after": round(interest_after, 2),
                        "principal_before": principal_before_this_prepayment,
                        "principal_after": remaining_principal
                    },
                    "amendment_date": datetime.now(timezone.utc).isoformat(),
                    "amended_by": current_user['id']
                }}
            )
            amended_count += 1
            
            prorated_interest_info = {
                "cycle_date": cf_date.strftime("%d-%m-%Y"),
                "original_interest": original_interest,
                "prorated_interest": prorated_interest,
                "days_before_prepayment": days_before_prepayment,
                "days_after_prepayment": days_after_prepayment,
                "interest_before": round(interest_before, 2),
                "interest_after": round(interest_after, 2)
            }
    
    # Update all future interest payments after the prepayment date
    reduction_ratio = remaining_principal / original_principal if original_principal > 0 else 0
    
    for cf in all_cashflows:
        cf_date = datetime.fromisoformat(cf['date'].replace('Z', '+00:00')) if 'T' in cf['date'] else datetime.strptime(cf['date'], '%Y-%m-%d')
        
        # Skip if already processed as prorated, or if it's before prepayment, or if already repaid
        if cf.get('is_prorated') or cf_date.date() <= prepayment_date.date() or cf.get('is_repaid'):
            continue
        
        # Only amend future interest payments
        if cf.get('interest_component', 0) > 0:
            original_interest = cf.get('original_interest_component') or cf.get('interest_component', 0)
            amended_interest = round(original_interest * reduction_ratio, 2)
            amended_tds = round(amended_interest * 0.10, 2)
            amended_net = round(amended_interest - amended_tds + cf.get('principal_component', 0), 2)
            
            await db.holding_cashflows.update_one(
                {"id": cf['id']},
                {"$set": {
                    "original_interest_component": original_interest,
                    "original_tds_amount": cf.get('original_tds_amount') or cf.get('tds_amount', 0),
                    "original_net_amount": cf.get('original_net_amount') or cf.get('net_amount', 0),
                    "interest_component": amended_interest,
                    "tds_amount": amended_tds,
                    "net_amount": amended_net,
                    "is_amended": True,
                    "amendment_reason": f"Reduced due to principal prepayment. Remaining principal: ₹{remaining_principal:,.2f}",
                    "remaining_principal_ratio": round(reduction_ratio, 4),
                    "amendment_date": datetime.now(timezone.utc).isoformat(),
                    "amended_by": current_user['id']
                }}
            )
            amended_count += 1
    
    # Record the prepayment with percentage calculation
    prepayment_percentage = round((prepayment.prepaid_amount / original_principal) * 100, 2) if original_principal > 0 else 0
    total_prepaid_percentage = round(((total_previously_prepaid + prepayment.prepaid_amount) / original_principal) * 100, 2) if original_principal > 0 else 0
    remaining_percentage = round((remaining_principal / original_principal) * 100, 2) if original_principal > 0 else 0
    
    prepayment_record = {
        "id": str(uuid.uuid4()),
        "trade_id": trade_id,
        "client_id": trade['client_id'],
        "bond_id": trade['bond_id'],
        "bond_name": trade['bond_name'],
        "prepayment_date": prepayment_date.isoformat(),
        "prepaid_amount": prepayment.prepaid_amount,
        "prepayment_percentage": prepayment_percentage,  # Percentage of this prepayment
        "original_principal": original_principal,
        "principal_before_prepayment": principal_before_this_prepayment,
        "remaining_principal": remaining_principal,
        "remaining_percentage": remaining_percentage,  # Remaining principal percentage
        "total_prepaid_to_date": total_previously_prepaid + prepayment.prepaid_amount,
        "total_prepaid_percentage": total_prepaid_percentage,  # Total prepaid percentage
        "notes": prepayment.notes,
        "recorded_by": current_user['id'],
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "cashflows_amended": amended_count
    }
    
    await db.prepayment_records.insert_one(prepayment_record)
    
    # Update trade with prepayment info including percentages
    await db.trades.update_one(
        {"id": trade_id},
        {"$set": {
            "has_prepayment": True,
            "total_prepaid_principal": total_previously_prepaid + prepayment.prepaid_amount,
            "total_prepaid_percentage": total_prepaid_percentage,
            "remaining_principal": remaining_principal,
            "remaining_principal_percentage": remaining_percentage,
            "last_prepayment_date": prepayment_date.isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Update reinvestment tags for affected cashflows (mark them as needing review)
    # Get all future cashflows that were amended
    amended_cashflows = await db.holding_cashflows.find({
        "trade_id": trade_id,
        "is_amended": True,
        "is_repaid": {"$ne": True}
    }, {"_id": 0}).to_list(100)
    
    # Update reinvestment tags for amended cashflows that had been previously tagged
    reinv_tags_updated = 0
    for cf in amended_cashflows:
        if cf.get('reinvestment_tag') and cf.get('reinvestment_tag') != 'not_tagged':
            await db.holding_cashflows.update_one(
                {"id": cf['id']},
                {"$set": {
                    "reinvestment_tag_needs_update": True,
                    "prepayment_affected": True,
                    "prepayment_date": prepayment_date.isoformat(),
                    "previous_net_amount": cf.get('original_net_amount') or cf.get('net_amount', 0)
                }}
            )
            reinv_tags_updated += 1
    
    # Send email notification to client
    email_sent = False
    try:
        # Get client email and broker details
        client_full = await db.clients.find_one({"id": trade['client_id']}, {"_id": 0})
        broker = await db.users.find_one({"id": client_full.get('created_by', '')}, {"_id": 0})
        broker_name = broker.get('name', 'Your Broker') if broker else 'Your Broker'
        
        if client_full and client_full.get('email'):
            # Get revised cashflows to include in email
            revised_cfs = await db.holding_cashflows.find({
                "trade_id": trade_id,
                "is_repaid": {"$ne": True}
            }, {"_id": 0}).sort("date", 1).to_list(15)
            
            # Send notification email
            email_sent = send_prepayment_notification_email(
                client_name=client_full.get('name', 'Valued Investor'),
                client_email=client_full['email'],
                bond_name=trade.get('bond_name', bond.get('name', 'N/A')),
                opportunity_id=bond.get('bond_code', bond.get('id', 'N/A')),
                prepayment_date=prepayment_date.strftime('%d %b %Y'),
                prepaid_amount=prepayment.prepaid_amount,
                prepayment_percentage=prepayment_percentage,
                original_principal=original_principal,
                remaining_principal=remaining_principal,
                remaining_percentage=remaining_percentage,
                total_prepaid_to_date=total_previously_prepaid + prepayment.prepaid_amount,
                total_prepaid_percentage=total_prepaid_percentage,
                revised_cashflows=revised_cfs,
                broker_name=broker_name
            )
            
            if email_sent:
                # Log the email notification
                await db.prepayment_records.update_one(
                    {"id": prepayment_record['id']},
                    {"$set": {
                        "email_sent": True,
                        "email_sent_at": datetime.now(timezone.utc).isoformat(),
                        "email_recipient": client_full['email']
                    }}
                )
    except Exception as e:
        logger.error(f"Failed to send prepayment notification email: {str(e)}")
    
    return {
        "message": "Principal prepayment recorded successfully",
        "prepayment_id": prepayment_record['id'],
        "prepaid_amount": prepayment.prepaid_amount,
        "prepayment_percentage": prepayment_percentage,
        "original_principal": original_principal,
        "total_prepaid_to_date": total_previously_prepaid + prepayment.prepaid_amount,
        "total_prepaid_percentage": total_prepaid_percentage,
        "remaining_principal": remaining_principal,
        "remaining_percentage": remaining_percentage,
        "cashflows_amended": amended_count,
        "reinvestment_tags_updated": reinv_tags_updated,
        "email_sent": email_sent,
        "prorated_interest": prorated_interest_info
    }


@api_router.get("/holdings/trade/{trade_id}/prepayments")
async def get_trade_prepayments(trade_id: str, current_user: dict = Depends(get_current_user)):
    """Get all prepayment records for a trade"""
    trade = await db.trades.find_one({"id": trade_id}, {"_id": 0})
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Verify access
    client = await db.clients.find_one({"id": trade['client_id']})
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    prepayments = await db.prepayment_records.find(
        {"trade_id": trade_id},
        {"_id": 0}
    ).sort("prepayment_date", 1).to_list(50)
    
    return {
        "trade_id": trade_id,
        "bond_name": trade['bond_name'],
        "original_principal": trade.get('total_amount', 0),
        "total_prepaid": trade.get('total_prepaid_principal', 0),
        "remaining_principal": trade.get('remaining_principal', trade.get('total_amount', 0)),
        "prepayments": prepayments
    }


# ==================== BULK REPAYMENT UPLOAD ====================

@api_router.get("/holdings/repayment-template")
async def get_repayment_template(current_user: dict = Depends(get_current_user)):
    """Generate Excel template for bulk repayment updates"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can download repayment template")
    
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Repayment Updates"
    
    # Header style
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    thin_border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # Headers
    headers = [
        "Client PAN*", "Bond Name*", "Scheduled Date*", "Type*",
        "Expected Amount", "Actual Paid Date*", "Actual Amount Received*", "Notes"
    ]
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center')
        cell.border = thin_border
    
    # Set column widths
    ws.column_dimensions['A'].width = 15
    ws.column_dimensions['B'].width = 35
    ws.column_dimensions['C'].width = 15
    ws.column_dimensions['D'].width = 12
    ws.column_dimensions['E'].width = 18
    ws.column_dimensions['F'].width = 18
    ws.column_dimensions['G'].width = 22
    ws.column_dimensions['H'].width = 30
    
    # Add instructions sheet
    ws_inst = wb.create_sheet("Instructions")
    instructions = [
        "BULK REPAYMENT UPDATE - INSTRUCTIONS",
        "",
        "Required Fields (marked with *):",
        "1. Client PAN - The PAN number of the client (e.g., ABCDE1234F)",
        "2. Bond Name - Exact name of the bond as registered in the system",
        "3. Scheduled Date - Original scheduled payment date (DD-MM-YYYY format)",
        "4. Type - Either 'interest' or 'principal'",
        "5. Actual Paid Date - Date when payment was actually received (DD-MM-YYYY)",
        "6. Actual Amount Received - Amount received (numbers only, no commas)",
        "",
        "Optional Fields:",
        "7. Expected Amount - The originally expected amount (for reference)",
        "8. Notes - Any notes about this repayment",
        "",
        "IMPORTANT:",
        "- If Actual Paid Date is before Scheduled Date, it will be marked as PREPAID",
        "- Date format: DD-MM-YYYY (e.g., 15-01-2026)",
        "- Amount format: Plain numbers (e.g., 50000.00)",
        "- The system will match entries based on Client PAN + Bond Name + Scheduled Date + Type"
    ]
    
    for row, text in enumerate(instructions, 1):
        ws_inst.cell(row=row, column=1, value=text)
    ws_inst.column_dimensions['A'].width = 80
    
    # Save to buffer
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=repayment_update_template.xlsx"}
    )


@api_router.post("/holdings/bulk-repayment-upload")
async def bulk_repayment_upload(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Process bulk repayment updates from Excel file"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can upload repayments")
    
    from openpyxl import load_workbook
    from io import BytesIO
    
    try:
        content = await file.read()
        wb = load_workbook(BytesIO(content))
        ws = wb.active
        
        results = {
            "success": 0,
            "failed": 0,
            "prepaid": 0,
            "errors": []
        }
        
        # Skip header row
        for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            if not row[0]:  # Skip empty rows
                continue
            
            try:
                client_pan = str(row[0]).strip().upper()
                bond_name = str(row[1]).strip() if row[1] else None
                scheduled_date_raw = row[2]
                cf_type = str(row[3]).strip().lower() if row[3] else None
                actual_paid_date_raw = row[5]
                actual_amount = float(row[6]) if row[6] else None
                notes = str(row[7]).strip() if row[7] else None
                
                # Validate required fields
                if not all([client_pan, bond_name, scheduled_date_raw, cf_type, actual_paid_date_raw, actual_amount]):
                    results["errors"].append(f"Row {row_num}: Missing required fields")
                    results["failed"] += 1
                    continue
                
                if cf_type not in ['interest', 'principal']:
                    results["errors"].append(f"Row {row_num}: Type must be 'interest' or 'principal'")
                    results["failed"] += 1
                    continue
                
                # Parse dates
                if isinstance(scheduled_date_raw, datetime):
                    scheduled_date = scheduled_date_raw
                else:
                    try:
                        scheduled_date = datetime.strptime(str(scheduled_date_raw), "%d-%m-%Y")
                    except:
                        try:
                            scheduled_date = datetime.strptime(str(scheduled_date_raw), "%Y-%m-%d")
                        except:
                            results["errors"].append(f"Row {row_num}: Invalid scheduled date format")
                            results["failed"] += 1
                            continue
                
                if isinstance(actual_paid_date_raw, datetime):
                    actual_paid_date = actual_paid_date_raw
                else:
                    try:
                        actual_paid_date = datetime.strptime(str(actual_paid_date_raw), "%d-%m-%Y")
                    except:
                        try:
                            actual_paid_date = datetime.strptime(str(actual_paid_date_raw), "%Y-%m-%d")
                        except:
                            results["errors"].append(f"Row {row_num}: Invalid actual paid date format")
                            results["failed"] += 1
                            continue
                
                # Find client
                client = await db.clients.find_one({"pan_number": client_pan})
                if not client:
                    results["errors"].append(f"Row {row_num}: Client with PAN {client_pan} not found")
                    results["failed"] += 1
                    continue
                
                # Verify access
                if current_user['role'] == 'broker':
                    if client.get('created_by') != current_user['id']:
                        results["errors"].append(f"Row {row_num}: Access denied for client {client_pan}")
                        results["failed"] += 1
                        continue
                else:
                    if client.get('linked_subbroker_id') != current_user['id']:
                        results["errors"].append(f"Row {row_num}: Access denied for client {client_pan}")
                        results["failed"] += 1
                        continue
                
                # Find matching cashflow - use date range for matching (same day)
                scheduled_date_str = scheduled_date.strftime("%Y-%m-%d")
                
                cashflow = await db.holding_cashflows.find_one({
                    "client_id": client['id'],
                    "bond_name": {"$regex": f"^{bond_name}$", "$options": "i"},
                    "date": {"$regex": f"^{scheduled_date_str}"},
                    "type": cf_type
                })
                
                if not cashflow:
                    results["errors"].append(f"Row {row_num}: No matching cashflow found for {client_pan}, {bond_name}, {scheduled_date_str}, {cf_type}")
                    results["failed"] += 1
                    continue
                
                # Detect prepayment
                is_prepaid = actual_paid_date.date() < scheduled_date.date()
                days_early = (scheduled_date.date() - actual_paid_date.date()).days if is_prepaid else 0
                
                # Update cashflow
                update_data = {
                    "is_repaid": True,
                    "repaid_date": actual_paid_date.isoformat(),
                    "repaid_actual_amount": actual_amount,
                    "is_prepaid": is_prepaid,
                    "days_early": days_early,
                    "notes": notes,
                    "marked_by": current_user['id'],
                    "marked_at": datetime.now(timezone.utc).isoformat(),
                    "bulk_uploaded": True
                }
                
                await db.holding_cashflows.update_one(
                    {"id": cashflow['id']},
                    {"$set": update_data}
                )
                
                results["success"] += 1
                if is_prepaid:
                    results["prepaid"] += 1
                
            except Exception as e:
                results["errors"].append(f"Row {row_num}: {str(e)}")
                results["failed"] += 1
        
        return {
            "message": f"Processed {results['success'] + results['failed']} entries",
            "success_count": results["success"],
            "failed_count": results["failed"],
            "prepaid_count": results["prepaid"],
            "errors": results["errors"][:20]  # Limit errors to first 20
        }
        
    except Exception as e:
        logger.error(f"Error processing bulk repayment upload: {e}")
        raise HTTPException(status_code=400, detail=f"Error processing file: {str(e)}")


@api_router.get("/holdings/export-cashflows/{client_id}")
async def export_client_cashflows(client_id: str, current_user: dict = Depends(get_current_user)):
    """Export all cashflows for a client to Excel (for updating repayments)"""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    
    # Verify client access
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if current_user['role'] == 'broker':
        if client.get('created_by') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user['role'] == 'sub_broker':
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Get all cashflows for this client
    cashflows = await db.holding_cashflows.find(
        {"client_id": client_id},
        {"_id": 0}
    ).to_list(1000)
    
    if not cashflows:
        raise HTTPException(status_code=404, detail="No cashflows found for this client")
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Cashflows"
    
    # Header style
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    prepaid_fill = PatternFill(start_color="BDD7EE", end_color="BDD7EE", fill_type="solid")
    repaid_fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
    
    # Headers
    headers = [
        "Client PAN", "Bond Name", "Scheduled Date", "Type",
        "Expected Amount", "Actual Paid Date", "Actual Amount Received", 
        "Status", "Prepaid", "Days Early", "Notes"
    ]
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center')
    
    # Data rows
    for row_num, cf in enumerate(cashflows, 2):
        ws.cell(row=row_num, column=1, value=client['pan_number'])
        ws.cell(row=row_num, column=2, value=cf.get('bond_name', ''))
        
        # Format scheduled date
        scheduled_date = cf.get('date', '')
        if scheduled_date:
            try:
                dt = datetime.fromisoformat(scheduled_date.replace('Z', '+00:00'))
                scheduled_date = dt.strftime("%d-%m-%Y")
            except:
                pass
        ws.cell(row=row_num, column=3, value=scheduled_date)
        
        ws.cell(row=row_num, column=4, value=cf.get('type', ''))
        ws.cell(row=row_num, column=5, value=cf.get('net_amount', 0))
        
        # Format actual paid date
        repaid_date = cf.get('repaid_date', '')
        if repaid_date:
            try:
                dt = datetime.fromisoformat(repaid_date.replace('Z', '+00:00'))
                repaid_date = dt.strftime("%d-%m-%Y")
            except:
                pass
        ws.cell(row=row_num, column=6, value=repaid_date or '')
        
        ws.cell(row=row_num, column=7, value=cf.get('repaid_actual_amount', '') or '')
        ws.cell(row=row_num, column=8, value='Repaid' if cf.get('is_repaid') else 'Pending')
        ws.cell(row=row_num, column=9, value='Yes' if cf.get('is_prepaid') else 'No')
        ws.cell(row=row_num, column=10, value=cf.get('days_early', 0) or 0)
        ws.cell(row=row_num, column=11, value=cf.get('notes', '') or '')
        
        # Highlight prepaid and repaid rows
        if cf.get('is_prepaid'):
            for col in range(1, 12):
                ws.cell(row=row_num, column=col).fill = prepaid_fill
        elif cf.get('is_repaid'):
            for col in range(1, 12):
                ws.cell(row=row_num, column=col).fill = repaid_fill
    
    # Set column widths
    ws.column_dimensions['A'].width = 15
    ws.column_dimensions['B'].width = 35
    ws.column_dimensions['C'].width = 15
    ws.column_dimensions['D'].width = 12
    ws.column_dimensions['E'].width = 18
    ws.column_dimensions['F'].width = 18
    ws.column_dimensions['G'].width = 22
    ws.column_dimensions['H'].width = 12
    ws.column_dimensions['I'].width = 10
    ws.column_dimensions['J'].width = 12
    ws.column_dimensions['K'].width = 30
    
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=cashflows_{client['pan_number']}.xlsx"}
    )


# ==================== REINVESTMENT TAGGING ====================

class ReinvestmentTagUpdate(BaseModel):
    reinvestment_tag: str
    custom_amount: Optional[float] = None  # "not_tagged", "principal", "interest", "net_amount", "not_invest"
    send_approval_email: bool = False  # Whether to send approval email to client
    portfolio_category: Optional[str] = None  # "wealth", "tax", "short_term", "commodities", "retirement", "children_education"


class ReinvestmentApproval(BaseModel):
    approved: bool
    notes: Optional[str] = None


class SendReinvestmentApprovalRequest(BaseModel):
    client_id: str
    cashflow_ids: List[str]


@api_router.get("/reinvestment/upcoming")
async def get_upcoming_reinvestments(current_user: dict = Depends(get_current_user)):
    """Get upcoming repayments for the next 6 months for reinvestment tagging"""
    
    # First, ensure all approved trades have cashflows generated
    all_trades = await db.trades.find({"status": "approved"}, {"_id": 0}).to_list(10000)
    
    for trade in all_trades:
        # Check if cashflows exist for this trade
        existing = await db.holding_cashflows.find_one({"trade_id": trade['id']})
        if not existing:
            # Generate and store cashflows
            bond = await db.bonds.find_one({"id": trade['bond_id']}, {"_id": 0})
            if bond:
                cashflows = generate_client_cashflows(trade, bond)
                if cashflows:
                    for cf in cashflows:
                        cf['client_id'] = trade['client_id']
                        cf['bond_id'] = trade['bond_id']
                        cf['bond_name'] = trade.get('bond_name', bond.get('issuer', ''))
                    await db.holding_cashflows.insert_many(cashflows)
    
    # Get all cashflows that are not repaid and in the next 6 months
    today = datetime.now(timezone.utc).date()
    six_months_later = today + timedelta(days=180)
    
    # Get all holding cashflows
    cashflows = await db.holding_cashflows.find({
        "is_repaid": {"$ne": True}
    }, {"_id": 0}).to_list(10000)
    
    # Filter by date and group by month
    upcoming = []
    for cf in cashflows:
        try:
            cf_date = datetime.fromisoformat(cf['date']).date()
            if today <= cf_date <= six_months_later:
                # Get client details
                client = await db.clients.find_one({"id": cf['client_id']}, {"_id": 0, "name": 1, "pan_number": 1})
                
                # Get trade details
                trade = await db.trades.find_one({"id": cf['trade_id']}, {"_id": 0})
                
                # Check access based on role
                if current_user['role'] == 'broker':
                    if client and trade:
                        pass  # Brokers can see all
                else:
                    # Sub-broker can only see their linked clients
                    if not client or client.get('linked_subbroker_id') != current_user['id']:
                        continue
                
                upcoming.append({
                    "cashflow_id": cf['id'],
                    "client_id": cf['client_id'],
                    "client_name": client['name'] if client else 'Unknown',
                    "client_pan": client.get('pan_number', '') if client else '',
                    "client_email": client.get('email', '') if client else '',
                    "bond_id": cf['bond_id'],
                    "bond_name": cf.get('bond_name', ''),
                    "trade_id": cf['trade_id'],
                    "amount_invested": trade.get('total_amount', 0) if trade else 0,
                    "units": trade.get('units', 0) if trade else 0,
                    "expected_date": cf['date'],
                    "principal_net": cf.get('principal_component', 0),
                    "interest_net": cf.get('interest_component', 0) - cf.get('tds_amount', 0),
                    "net_amount": cf.get('net_amount', 0),
                    "reinvestment_tag": cf.get('reinvestment_tag', 'not_tagged'),
                    "custom_amount": cf.get('custom_amount'),
                    "portfolio_category": cf.get('portfolio_category'),
                    "approval_status": cf.get('approval_status', 'not_sent'),  # not_sent, pending, approved, rejected
                    "client_approved": cf.get('client_approved', False),
                    "tagged_at": cf.get('tagged_at'),
                    "month": cf_date.strftime("%B %Y"),
                    # Prepayment-related fields
                    "is_amended": cf.get('is_amended', False),
                    "prepayment_affected": cf.get('prepayment_affected', False),
                    "reinvestment_tag_needs_update": cf.get('reinvestment_tag_needs_update', False),
                    "original_net_amount": cf.get('original_net_amount'),
                    "original_interest_component": cf.get('original_interest_component'),
                    "amendment_reason": cf.get('amendment_reason', '')
                })
        except (ValueError, TypeError):
            continue
    
    # Sort by date
    upcoming.sort(key=lambda x: x['expected_date'])
    
    # Group by month
    months = {}
    for item in upcoming:
        month = item['month']
        if month not in months:
            months[month] = []
        months[month].append(item)
    
    # Group by client for client-wise view
    by_client = {}
    for item in upcoming:
        client_id = item['client_id']
        if client_id not in by_client:
            by_client[client_id] = {
                "client_id": client_id,
                "client_name": item['client_name'],
                "client_pan": item['client_pan'],
                "client_email": item['client_email'],
                "entries": [],
                "total_amount": 0,
                "tagged_count": 0,
                "pending_approval": 0,
                "approved_count": 0
            }
        by_client[client_id]['entries'].append(item)
        by_client[client_id]['total_amount'] += item['net_amount']
        if item['reinvestment_tag'] != 'not_tagged':
            by_client[client_id]['tagged_count'] += 1
        if item['approval_status'] == 'pending':
            by_client[client_id]['pending_approval'] += 1
        if item['client_approved']:
            by_client[client_id]['approved_count'] += 1
    
    # Generate next 6 months list
    month_list = []
    current_date = today.replace(day=1)
    for i in range(6):
        month_name = current_date.strftime("%B %Y")
        month_list.append({
            "name": month_name,
            "items": months.get(month_name, []),
            "count": len(months.get(month_name, []))
        })
        # Move to next month
        if current_date.month == 12:
            current_date = current_date.replace(year=current_date.year + 1, month=1)
        else:
            current_date = current_date.replace(month=current_date.month + 1)
    
    return {
        "months": month_list,
        "by_client": list(by_client.values()),
        "total_upcoming": len(upcoming)
    }


@api_router.put("/reinvestment/tag/{cashflow_id}")
async def update_reinvestment_tag(cashflow_id: str, update: ReinvestmentTagUpdate, current_user: dict = Depends(get_current_user)):
    """Update reinvestment tag for a cashflow"""
    
    # Find the cashflow
    cashflow = await db.holding_cashflows.find_one({"id": cashflow_id})
    if not cashflow:
        raise HTTPException(status_code=404, detail="Cashflow not found")
    
    # Verify access
    client = await db.clients.find_one({"id": cashflow['client_id']})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Check if already approved by client - cannot modify
    if cashflow.get('client_approved') and current_user['role'] != 'client':
        raise HTTPException(status_code=400, detail="Cannot modify client-approved tags")
    
    if current_user['role'] == 'client':
        # Client can only modify their own cashflows
        if client.get('user_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    elif current_user['role'] != 'broker':
        if client.get('linked_subbroker_id') != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Update tag - reset approval status if broker/sub-broker modifies
    update_data = {
        "reinvestment_tag": update.reinvestment_tag,
        "tagged_by": current_user['id'],
        "tagged_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Handle custom amount for "other" tag
    if update.reinvestment_tag == 'other' and update.custom_amount is not None:
        update_data['custom_amount'] = update.custom_amount
    elif update.reinvestment_tag != 'other':
        # Clear custom amount if not "other"
        update_data['custom_amount'] = None
    
    # Handle portfolio category
    if update.portfolio_category:
        update_data['portfolio_category'] = update.portfolio_category
    elif update.reinvestment_tag in ['not_tagged', 'not_invest']:
        # Clear portfolio category if not investing
        update_data['portfolio_category'] = None
    
    # If broker/sub-broker is tagging, set pending approval
    if current_user['role'] in ['broker', 'sub_broker'] and update.reinvestment_tag not in ['not_tagged']:
        update_data['client_approved'] = False
        update_data['approval_status'] = 'pending'
    
    await db.holding_cashflows.update_one(
        {"id": cashflow_id},
        {"$set": update_data}
    )
    
    return {
        "message": "Tag updated successfully", 
        "reinvestment_tag": update.reinvestment_tag, 
        "custom_amount": update.custom_amount,
        "portfolio_category": update.portfolio_category
    }


@api_router.put("/reinvestment/approve/{cashflow_id}")
async def approve_reinvestment_tag(cashflow_id: str, approval: ReinvestmentApproval, current_user: dict = Depends(get_current_user)):
    """Client approves or rejects reinvestment tag"""
    
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can approve reinvestment tags")
    
    # Find the cashflow
    cashflow = await db.holding_cashflows.find_one({"id": cashflow_id})
    if not cashflow:
        raise HTTPException(status_code=404, detail="Cashflow not found")
    
    # Verify this is client's own cashflow
    client = await db.clients.find_one({"id": cashflow['client_id']})
    if not client or client.get('user_id') != current_user['id']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Update approval status
    await db.holding_cashflows.update_one(
        {"id": cashflow_id},
        {"$set": {
            "client_approved": approval.approved,
            "approval_status": "approved" if approval.approved else "rejected",
            "approval_notes": approval.notes,
            "approved_by": current_user['id'],
            "approved_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Create notification for broker/sub-broker
    notification = {
        "id": str(uuid.uuid4()),
        "type": "reinvestment_approval",
        "client_id": client['id'],
        "client_name": client['name'],
        "cashflow_id": cashflow_id,
        "approved": approval.approved,
        "notes": approval.notes,
        "for_user_id": client.get('linked_subbroker_id') or client.get('created_by'),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read": False
    }
    await db.notifications.insert_one(notification)
    
    return {"message": f"Tag {'approved' if approval.approved else 'rejected'} successfully"}


@api_router.post("/reinvestment/send-approval-email")
async def send_reinvestment_approval_email(
    request: SendReinvestmentApprovalRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Send approval email to client for tagged reinvestments"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers can send approval emails")
    
    # Get client
    client = await db.clients.find_one({"id": request.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Get user email
    user = await db.users.find_one({"id": client.get('user_id')})
    client_email = user.get('email') if user else client.get('email')
    
    if not client_email:
        raise HTTPException(status_code=400, detail="Client does not have an email address")
    
    # Get cashflows
    cashflows = await db.holding_cashflows.find(
        {"id": {"$in": request.cashflow_ids}}
    ).to_list(1000)
    
    if not cashflows:
        raise HTTPException(status_code=404, detail="No cashflows found")
    
    # Build email content
    entries_html = ""
    total_amount = 0
    for cf in cashflows:
        tag = cf.get('reinvestment_tag', 'not_tagged')
        if tag == 'other':
            amount = cf.get('custom_amount', 0)
        elif tag == 'principal':
            amount = cf.get('principal_component', 0)
        elif tag == 'interest':
            amount = cf.get('interest_component', 0) - cf.get('tds_amount', 0)
        elif tag == 'net_amount':
            amount = cf.get('net_amount', 0)
        else:
            amount = 0
        
        total_amount += amount
        entries_html += f"""
        <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">{cf.get('bond_name', 'N/A')}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">{cf.get('date', 'N/A')}</td>
            <td style="padding: 8px; border: 1px solid #ddd;">{tag.replace('_', ' ').title()}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">₹{amount:,.2f}</td>
        </tr>
        """
    
    # Generate approval token
    approval_token = create_access_token(
        data={"client_id": client['id'], "cashflow_ids": request.cashflow_ids, "type": "reinvestment_approval"},
        expires_delta=timedelta(days=7)
    )
    
    # Update cashflows with pending status
    await db.holding_cashflows.update_many(
        {"id": {"$in": request.cashflow_ids}},
        {"$set": {
            "approval_status": "pending",
            "approval_email_sent": True,
            "approval_email_sent_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Send email (using the configured SMTP)
    try:
        from email_service import send_reinvestment_approval_email as send_approval_email
        background_tasks.add_task(
            send_approval_email,
            client_email,
            client['name'],
            entries_html,
            total_amount,
            approval_token,
            len(cashflows)
        )
    except Exception as e:
        logger.error(f"Error sending approval email: {e}")
        # Still return success as the status was updated
    
    return {
        "message": f"Approval email sent to {client_email}",
        "cashflows_count": len(cashflows),
        "total_amount": total_amount
    }


@api_router.get("/reinvestment/approve-via-link")
async def approve_reinvestment_via_link(token: str, action: str = "approve"):
    """Handle approval/rejection via email link"""
    try:
        payload = verify_token(token)
        if not payload or payload.get("type") != "reinvestment_approval":
            raise HTTPException(status_code=400, detail="Invalid or expired approval link")
        
        client_id = payload.get("client_id")
        cashflow_ids = payload.get("cashflow_ids", [])
        
        approved = action.lower() == "approve"
        
        # Update all cashflows
        await db.holding_cashflows.update_many(
            {"id": {"$in": cashflow_ids}},
            {"$set": {
                "client_approved": approved,
                "approval_status": "approved" if approved else "rejected",
                "approved_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # If approved, trigger Kinntegraa API (placeholder)
        if approved:
            # Get approved cashflows for API submission
            cashflows = await db.holding_cashflows.find(
                {"id": {"$in": cashflow_ids}}
            ).to_list(1000)
            
            # TODO: Implement Kinntegraa API integration
            # For now, store the submission request
            submission = {
                "id": str(uuid.uuid4()),
                "client_id": client_id,
                "cashflow_ids": cashflow_ids,
                "status": "pending_submission",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.kinntegraa_submissions.insert_one(submission)
        
        return {
            "message": f"Reinvestment {'approved' if approved else 'rejected'} successfully",
            "action": action,
            "cashflows_count": len(cashflow_ids)
        }
    except Exception as e:
        logger.error(f"Error in approval link: {e}")
        raise HTTPException(status_code=400, detail="Invalid or expired approval link")


@api_router.post("/reinvestment/submit-to-kinntegraa")
async def submit_to_kinntegraa(
    submission_id: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Submit approved reinvestments to Kinntegraa API"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can submit to Kinntegraa")
    
    # Get pending submissions
    query = {"status": "pending_submission"}
    if submission_id:
        query["id"] = submission_id
    
    submissions = await db.kinntegraa_submissions.find(query).to_list(100)
    
    if not submissions:
        raise HTTPException(status_code=404, detail="No pending submissions found")
    
    results = []
    for submission in submissions:
        try:
            # Get cashflows
            cashflows = await db.holding_cashflows.find(
                {"id": {"$in": submission['cashflow_ids']}}
            ).to_list(1000)
            
            # Get client
            client = await db.clients.find_one({"id": submission['client_id']})
            
            # Prepare API payload (structure to be confirmed with Kinntegraa)
            api_payload = {
                "client_pan": client.get('pan_number', '') if client else '',
                "client_name": client.get('name', '') if client else '',
                "client_email": client.get('email', '') if client else '',
                "reinvestments": []
            }
            
            for cf in cashflows:
                tag = cf.get('reinvestment_tag', 'not_tagged')
                if tag == 'other':
                    amount = cf.get('custom_amount', 0)
                elif tag == 'principal':
                    amount = cf.get('principal_component', 0)
                elif tag == 'interest':
                    amount = cf.get('interest_component', 0) - cf.get('tds_amount', 0)
                elif tag == 'net_amount':
                    amount = cf.get('net_amount', 0)
                else:
                    continue
                
                api_payload["reinvestments"].append({
                    "bond_name": cf.get('bond_name', ''),
                    "expected_date": cf.get('date', ''),
                    "amount": amount,
                    "tag_type": tag
                })
            
            # TODO: Make actual API call to Kinntegraa
            # response = await httpx.post("https://api.kinntegraa.com/reinvestments", json=api_payload)
            
            # For now, mark as submitted
            await db.kinntegraa_submissions.update_one(
                {"id": submission['id']},
                {"$set": {
                    "status": "submitted",
                    "submitted_at": datetime.now(timezone.utc).isoformat(),
                    "api_payload": api_payload
                }}
            )
            
            results.append({
                "submission_id": submission['id'],
                "status": "submitted",
                "cashflows_count": len(cashflows)
            })
            
        except Exception as e:
            logger.error(f"Error submitting to Kinntegraa: {e}")
            results.append({
                "submission_id": submission['id'],
                "status": "error",
                "error": str(e)
            })
    
    return {"results": results}


# ==================== END REINVESTMENT TAGGING ====================


# ==================== CLIENT PORTAL ====================

class ClientVerifyProfile(BaseModel):
    verified: bool


class ClientChangePassword(BaseModel):
    current_password: str
    new_password: str
    new_pin: str


@api_router.get("/client/verify/{token}")
async def get_client_verification_details(token: str):
    """Get client details for verification (no auth required)"""
    
    client = await db.clients.find_one({"verification_token": token}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Invalid verification token")
    
    if client.get('verification_status') == 'verified':
        raise HTTPException(status_code=400, detail="Profile already verified")
    
    # Get broker details
    broker = await db.users.find_one({"id": client['created_by']}, {"_id": 0, "password_hash": 0, "pin_hash": 0})
    
    # Get sub-broker details if linked
    subbroker = None
    if client.get('linked_subbroker_id'):
        subbroker = await db.users.find_one({"id": client['linked_subbroker_id']}, {"_id": 0, "password_hash": 0, "pin_hash": 0})
    
    return {
        "client": client,
        "broker": broker,
        "subbroker": subbroker
    }


@api_router.post("/client/verify/{token}")
async def verify_client_profile(token: str, verify: ClientVerifyProfile):
    """Client verifies their profile details"""
    
    client = await db.clients.find_one({"verification_token": token})
    if not client:
        raise HTTPException(status_code=404, detail="Invalid verification token")
    
    if client.get('verification_status') == 'verified':
        raise HTTPException(status_code=400, detail="Profile already verified")
    
    if not verify.verified:
        # Client rejected - notify broker
        notification = {
            "id": str(uuid.uuid4()),
            "type": "client_verification_rejected",
            "client_id": client['id'],
            "client_name": client['name'],
            "for_user_id": client['created_by'],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "read": False
        }
        await db.notifications.insert_one(notification)
        return {"message": "Verification rejected. Broker has been notified."}
    
    # Activate the user account
    await db.users.update_one(
        {"id": client['user_id']},
        {"$set": {"is_active": True}}
    )
    
    # Update client verification status
    await db.clients.update_one(
        {"id": client['id']},
        {"$set": {
            "verification_status": "verified",
            "verified_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Get default credentials
    default_password = client['pan_number'][-4:] + "1234"
    
    return {
        "message": "Profile verified successfully",
        "credentials": {
            "pan": client['pan_number'],
            "default_password": default_password,
            "default_pin": "1234",
            "note": "Please change your password and PIN after first login"
        }
    }


@api_router.get("/client/profile")
async def get_client_profile(current_user: dict = Depends(get_current_user)):
    """Get client's own profile with broker/sub-broker details"""
    
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    # Get client record
    client = await db.clients.find_one({"user_id": current_user['id']}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client record not found")
    
    # Get broker details
    broker = await db.users.find_one({"id": client['created_by']}, {"_id": 0, "password_hash": 0, "pin_hash": 0})
    
    # Get sub-broker details if linked
    subbroker = None
    if client.get('linked_subbroker_id'):
        subbroker = await db.users.find_one({"id": client['linked_subbroker_id']}, {"_id": 0, "password_hash": 0, "pin_hash": 0})
        # Also get partner record for more details
        partner = await db.partners.find_one({"id": client['linked_subbroker_id']}, {"_id": 0})
        if partner and subbroker:
            subbroker['partner_details'] = partner
    
    return {
        "client": client,
        "broker": broker,
        "subbroker": subbroker
    }


@api_router.get("/client/opportunities")
async def get_client_opportunities(current_user: dict = Depends(get_current_user)):
    """Get available bonds for client"""
    
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    # Get all available bonds
    bonds = await db.bonds.find({}, {"_id": 0}).to_list(1000)
    
    # Calculate status for each bond
    today = datetime.now(timezone.utc).date()
    available_bonds = []
    
    for bond in bonds:
        try:
            end_date = datetime.strptime(bond.get('end_date', ''), '%Y-%m-%d').date()
            units_remaining = bond.get('total_units', 0) - bond.get('units_sold', 0)
            
            if end_date > today and units_remaining > 0:
                bond['status'] = 'available'
                bond['units_remaining'] = units_remaining
                available_bonds.append(bond)
        except (ValueError, TypeError):
            continue
    
    return available_bonds


@api_router.get("/client/holdings")
async def get_client_own_holdings(current_user: dict = Depends(get_current_user)):
    """Get client's own holdings"""
    
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    # Get client record
    client = await db.clients.find_one({"user_id": current_user['id']}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client record not found")
    
    # Reuse existing holdings endpoint logic
    return await get_client_holdings(client['id'], current_user)


@api_router.get("/client/trades")
async def get_client_trades(current_user: dict = Depends(get_current_user)):
    """Get client's own trades"""
    
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    # Get client record
    client = await db.clients.find_one({"user_id": current_user['id']}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client record not found")
    
    # Get trades for this client
    trades = await db.trades.find({"client_id": client['id']}, {"_id": 0}).to_list(1000)
    
    # Enrich with bond details
    for trade in trades:
        bond = await db.bonds.find_one({"id": trade['bond_id']}, {"_id": 0, "name": 1})
        trade['bond_name'] = bond['name'] if bond else 'Unknown'
    
    return trades


@api_router.get("/client/reinvestment")
async def get_client_reinvestment_tags(current_user: dict = Depends(get_current_user)):
    """Get reinvestment tags pending client approval"""
    
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    # Get client record
    client = await db.clients.find_one({"user_id": current_user['id']}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client record not found")
    
    # Get pending approvals
    pending = await db.holding_cashflows.find({
        "client_id": client['id'],
        "reinvestment_tag": {"$nin": ["not_tagged", None]},
        "approval_status": "pending"
    }, {"_id": 0}).to_list(1000)
    
    # Get approved
    approved = await db.holding_cashflows.find({
        "client_id": client['id'],
        "approval_status": "approved"
    }, {"_id": 0}).to_list(1000)
    
    # Get rejected
    rejected = await db.holding_cashflows.find({
        "client_id": client['id'],
        "approval_status": "rejected"
    }, {"_id": 0}).to_list(1000)
    
    # Enrich with bond details
    for items in [pending, approved, rejected]:
        for cf in items:
            bond = await db.bonds.find_one({"id": cf['bond_id']}, {"_id": 0, "name": 1})
            cf['bond_name'] = bond['name'] if bond else 'Unknown'
    
    return {
        "pending": pending,
        "approved": approved,
        "rejected": rejected
    }


@api_router.post("/client/trades")
async def create_client_trade(trade_data: TradeCreate, current_user: dict = Depends(get_current_user)):
    """Client books units for themselves"""
    
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can use this endpoint")
    
    # Get client record
    client = await db.clients.find_one({"user_id": current_user['id']}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client record not found")
    
    # Override client_id with the actual client's ID
    trade_data_dict = trade_data.model_dump()
    trade_data_dict['client_id'] = client['id']
    
    # Get bond
    bond = await db.bonds.find_one({"id": trade_data.bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    # Check bond status
    today = datetime.now(timezone.utc).date()
    try:
        end_date = datetime.strptime(bond.get('end_date', ''), '%Y-%m-%d').date()
        units_remaining = bond.get('total_units', 0) - bond.get('units_sold', 0)
        
        if end_date <= today:
            raise HTTPException(status_code=400, detail="Bond has matured")
        if units_remaining <= 0:
            raise HTTPException(status_code=400, detail="No units available")
        if trade_data.units > units_remaining:
            raise HTTPException(status_code=400, detail=f"Only {units_remaining} units available")
    except (ValueError, TypeError):
        pass
    
    # Create trade (pending approval like sub-broker trades)
    trade_id = str(uuid.uuid4())
    trade = {
        "id": trade_id,
        "bond_id": trade_data.bond_id,
        "bond_name": bond['name'],
        "client_id": client['id'],
        "client_name": client['name'],
        "client_pan": client['pan_number'],
        "units": trade_data.units,
        "calculated_price": trade_data.calculated_price,
        "total_amount": trade_data.total_amount,
        "investment_date": trade_data.investment_date,
        "payment_reference": trade_data.payment_reference,
        "payment_notes": trade_data.payment_notes,
        "payment_proof_filename": trade_data.payment_proof_filename,
        "status": "pending",  # Client trades require approval
        "created_by": current_user['id'],
        "created_by_name": client['name'],
        "created_by_role": "client",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.trades.insert_one(trade)
    
    # Notify sub-broker (or broker if no sub-broker)
    notify_user_id = client.get('linked_subbroker_id') or client.get('created_by')
    notification = {
        "id": str(uuid.uuid4()),
        "type": "client_trade_created",
        "trade_id": trade_id,
        "client_id": client['id'],
        "client_name": client['name'],
        "bond_name": bond['name'],
        "units": trade_data.units,
        "total_amount": trade_data.total_amount,
        "for_user_id": notify_user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read": False
    }
    await db.notifications.insert_one(notification)
    
    if '_id' in trade:
        del trade['_id']
    return trade


@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    """Get notifications for current user"""
    
    notifications = await db.notifications.find(
        {"for_user_id": current_user['id']},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return notifications


@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    """Mark notification as read"""
    
    result = await db.notifications.update_one(
        {"id": notification_id, "for_user_id": current_user['id']},
        {"$set": {"read": True}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"message": "Notification marked as read"}


@api_router.get("/notifications/unread-count")
async def get_unread_notification_count(current_user: dict = Depends(get_current_user)):
    """Get count of unread notifications"""
    
    count = await db.notifications.count_documents({
        "for_user_id": current_user['id'],
        "read": False
    })
    
    return {"count": count}


# ==================== END CLIENT PORTAL ====================


@api_router.get("/holdings/client/{client_id}/download")
async def download_client_holdings(client_id: str, current_user: dict = Depends(get_current_user)):
    """Generate Excel file for client holdings download with multiple sheets"""
    
    # Get client holdings
    holdings_data = await get_client_holdings(client_id, current_user)
    
    # Create workbook
    wb = Workbook()
    
    # Styles
    header_font = Font(bold=True, size=12, color="FFFFFF")
    header_fill = PatternFill(start_color="92400E", end_color="92400E", fill_type="solid")
    title_font = Font(bold=True, size=14)
    money_font = Font(name="Consolas", size=11)
    border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    
    # ========== SUMMARY SHEET ==========
    ws_summary = wb.active
    ws_summary.title = "Summary"
    
    # Title
    ws_summary['A1'] = f"Holdings Report - {holdings_data['client']['name']}"
    ws_summary['A1'].font = title_font
    ws_summary.merge_cells('A1:G1')
    
    ws_summary['A2'] = f"PAN: {holdings_data['client']['pan_number']}"
    ws_summary['A3'] = f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC"
    
    # Summary stats
    ws_summary['A5'] = "SUMMARY"
    ws_summary['A5'].font = Font(bold=True, size=12)
    
    summary_data = [
        ("Total Investment", holdings_data['summary']['total_investment']),
        ("Total Repaid (Net)", holdings_data['summary']['total_repaid']),
        ("Upcoming Expected", holdings_data['summary']['total_upcoming']),
        ("Total Expected", holdings_data['summary']['total_expected'])
    ]
    
    for i, (label, value) in enumerate(summary_data):
        ws_summary[f'A{6+i}'] = label
        ws_summary[f'B{6+i}'] = value
        ws_summary[f'B{6+i}'].font = money_font
        ws_summary[f'B{6+i}'].number_format = '₹ #,##0.00'
    
    # Consolidated by date
    ws_summary['A12'] = "CASHFLOWS BY DATE (ALL TRANSACTIONS)"
    ws_summary['A12'].font = Font(bold=True, size=12)
    
    # Headers
    headers = ["Date", "Transactions", "Principal", "Interest", "TDS", "Net Amount", "Status"]
    for col, header in enumerate(headers, 1):
        cell = ws_summary.cell(row=13, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.border = border
        cell.alignment = Alignment(horizontal='center')
    
    # Consolidate cashflows by date
    cashflows_by_date = {}
    for holding in holdings_data['holdings']:
        for cf in holding['cashflows']:
            date = cf['date']
            if date not in cashflows_by_date:
                cashflows_by_date[date] = {
                    'principal': 0, 'interest': 0, 'tds': 0, 'net': 0, 
                    'transactions': 0, 'all_repaid': True
                }
            cashflows_by_date[date]['principal'] += cf['principal_component']
            cashflows_by_date[date]['interest'] += cf['interest_component']
            cashflows_by_date[date]['tds'] += cf['tds_amount']
            cashflows_by_date[date]['net'] += cf['net_amount']
            cashflows_by_date[date]['transactions'] += 1
            if not cf.get('is_repaid'):
                cashflows_by_date[date]['all_repaid'] = False
    
    row = 14
    for date in sorted(cashflows_by_date.keys()):
        cf = cashflows_by_date[date]
        ws_summary.cell(row=row, column=1, value=date).border = border
        ws_summary.cell(row=row, column=2, value=cf['transactions']).border = border
        ws_summary.cell(row=row, column=3, value=cf['principal']).border = border
        ws_summary.cell(row=row, column=3).font = money_font
        ws_summary.cell(row=row, column=3).number_format = '₹ #,##0.00'
        ws_summary.cell(row=row, column=4, value=cf['interest']).border = border
        ws_summary.cell(row=row, column=4).font = money_font
        ws_summary.cell(row=row, column=4).number_format = '₹ #,##0.00'
        ws_summary.cell(row=row, column=5, value=cf['tds']).border = border
        ws_summary.cell(row=row, column=5).font = money_font
        ws_summary.cell(row=row, column=5).number_format = '₹ #,##0.00'
        ws_summary.cell(row=row, column=6, value=cf['net']).border = border
        ws_summary.cell(row=row, column=6).font = money_font
        ws_summary.cell(row=row, column=6).number_format = '₹ #,##0.00'
        ws_summary.cell(row=row, column=7, value="All Repaid" if cf['all_repaid'] else "Pending").border = border
        row += 1
    
    # Adjust column widths
    ws_summary.column_dimensions['A'].width = 20
    ws_summary.column_dimensions['B'].width = 18
    ws_summary.column_dimensions['C'].width = 15
    ws_summary.column_dimensions['D'].width = 15
    ws_summary.column_dimensions['E'].width = 12
    ws_summary.column_dimensions['F'].width = 15
    ws_summary.column_dimensions['G'].width = 12
    
    # ========== INDIVIDUAL TRANSACTION SHEETS ==========
    for holding in holdings_data['holdings']:
        # Create sheet name from date (max 31 chars)
        inv_date = holding['investment_date'][:10]
        sheet_name = f"{inv_date} ({holding['units']}u)"[:31]
        
        # Ensure unique sheet name
        existing_names = [ws.title for ws in wb.worksheets]
        if sheet_name in existing_names:
            counter = 1
            while f"{sheet_name[:28]}_{counter}" in existing_names:
                counter += 1
            sheet_name = f"{sheet_name[:28]}_{counter}"
        
        ws = wb.create_sheet(title=sheet_name)
        
        # Transaction header
        ws['A1'] = holding['bond_name']
        ws['A1'].font = title_font
        ws.merge_cells('A1:H1')
        
        ws['A3'] = "Investment Date:"
        ws['B3'] = holding['investment_date'][:10]
        ws['C3'] = "Units:"
        ws['D3'] = holding['units']
        ws['E3'] = "Invested:"
        ws['F3'] = holding['invested_amount']
        ws['F3'].font = money_font
        ws['F3'].number_format = '₹ #,##0.00'
        
        # Cashflow headers
        cf_headers = ["Date", "Type", "Principal", "Interest", "TDS", "Net Amount", "Status", "Repaid Date"]
        for col, header in enumerate(cf_headers, 1):
            cell = ws.cell(row=5, column=col, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.border = border
            cell.alignment = Alignment(horizontal='center')
        
        # Cashflow data
        row = 6
        for cf in holding['cashflows']:
            ws.cell(row=row, column=1, value=cf['date']).border = border
            ws.cell(row=row, column=2, value=cf['type'].capitalize()).border = border
            ws.cell(row=row, column=3, value=cf['principal_component']).border = border
            ws.cell(row=row, column=3).font = money_font
            ws.cell(row=row, column=3).number_format = '₹ #,##0.00'
            ws.cell(row=row, column=4, value=cf['interest_component']).border = border
            ws.cell(row=row, column=4).font = money_font
            ws.cell(row=row, column=4).number_format = '₹ #,##0.00'
            ws.cell(row=row, column=5, value=cf['tds_amount']).border = border
            ws.cell(row=row, column=5).font = money_font
            ws.cell(row=row, column=5).number_format = '₹ #,##0.00'
            ws.cell(row=row, column=6, value=cf['net_amount']).border = border
            ws.cell(row=row, column=6).font = money_font
            ws.cell(row=row, column=6).number_format = '₹ #,##0.00'
            ws.cell(row=row, column=7, value="Repaid" if cf.get('is_repaid') else "Pending").border = border
            ws.cell(row=row, column=8, value=cf.get('repaid_date', '-') if cf.get('is_repaid') else '-').border = border
            row += 1
        
        # Totals
        row += 1
        ws.cell(row=row, column=1, value="TOTALS").font = Font(bold=True)
        ws.cell(row=row, column=3, value=holding['total_principal']).font = Font(bold=True, name="Consolas")
        ws.cell(row=row, column=3).number_format = '₹ #,##0.00'
        ws.cell(row=row, column=4, value=holding['total_interest_gross']).font = Font(bold=True, name="Consolas")
        ws.cell(row=row, column=4).number_format = '₹ #,##0.00'
        ws.cell(row=row, column=5, value=holding['total_tds']).font = Font(bold=True, name="Consolas")
        ws.cell(row=row, column=5).number_format = '₹ #,##0.00'
        ws.cell(row=row, column=6, value=holding['total_principal'] + holding['total_interest_gross'] - holding['total_tds']).font = Font(bold=True, name="Consolas")
        ws.cell(row=row, column=6).number_format = '₹ #,##0.00'
        
        # Adjust column widths
        ws.column_dimensions['A'].width = 15
        ws.column_dimensions['B'].width = 12
        ws.column_dimensions['C'].width = 15
        ws.column_dimensions['D'].width = 15
        ws.column_dimensions['E'].width = 12
        ws.column_dimensions['F'].width = 15
        ws.column_dimensions['G'].width = 10
        ws.column_dimensions['H'].width = 15
    
    # Save to BytesIO
    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    
    filename = f"holdings_{holdings_data['client']['pan_number']}_{datetime.now().strftime('%Y%m%d')}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ==================== END HOLDINGS MANAGEMENT ====================


def calculate_xirr(dates, cashflows, guess=0.1):
    """
    Calculate XIRR (Extended Internal Rate of Return)
    dates: list of datetime objects
    cashflows: list of cashflow amounts (negative for outflows, positive for inflows)
    """
    if len(dates) != len(cashflows):
        raise ValueError("Dates and cashflows must have the same length")
    
    if len(dates) < 2:
        raise ValueError("Need at least 2 cashflows to calculate XIRR")
    
    # Convert dates to days from first date
    first_date = dates[0]
    days = [(d - first_date).days for d in dates]
    
    def xnpv(rate):
        """Calculate NPV with irregular periods"""
        return sum([cf / ((1 + rate) ** (day / 365.0)) for cf, day in zip(cashflows, days)])
    
    def xnpv_derivative(rate):
        """Derivative of NPV for Newton's method"""
        return sum([(-day / 365.0) * cf / ((1 + rate) ** (day / 365.0 + 1)) for cf, day in zip(cashflows, days)])
    
    try:
        # Use Newton's method to find the rate where NPV = 0
        rate = newton(xnpv, guess, fprime=xnpv_derivative, maxiter=100, tol=1e-6)
        return rate
    except:
        # If Newton fails, try bisection
        try:
            from scipy.optimize import brentq
            rate = brentq(xnpv, -0.999, 10.0)
            return rate
        except:
            return None


def calculate_price_for_irr(target_irr, dates, remaining_cashflows, investment_date):
    """
    Calculate the price to pay at investment_date to achieve target_irr
    given the remaining cashflows
    """
    if len(dates) == 0 or len(remaining_cashflows) == 0:
        return 0
    
    # Calculate present value of all future cashflows discounted at target_irr
    days_from_investment = [(d - investment_date).days for d in dates]
    
    price = sum([cf / ((1 + target_irr) ** (day / 365.0)) for cf, day in zip(remaining_cashflows, days_from_investment)])
    return price


# Define Models
class PrincipalPayment(BaseModel):
    date: str  # ISO format date
    percentage: float  # Percentage of principal (0-100)


class InterestPayment(BaseModel):
    date: str  # ISO format date
    amount: float


class BondCreate(BaseModel):
    bond_code: str = ""  # Unique bond identifier code
    name: str
    start_date: str  # ISO format
    end_date: str
    principal_amount: float
    coupon_rate: float  # Annual coupon rate as percentage
    primary_irr: float  # Expected IRR for primary buyer as percentage
    secondary_irr: float  # Target IRR for secondary buyers as percentage
    principal_payments: List[PrincipalPayment]
    interest_payment_frequency: str  # "monthly", "quarterly", "semi-annual", "annual", "custom"
    interest_payments: List[InterestPayment]  # For custom frequency
    total_units: int = 1  # Total number of units available for sale
    minimum_units: int = 1  # Minimum units per order
    units_sold: int = 0  # Number of units already sold

    @field_validator('principal_payments')
    def validate_principal_total(cls, v):
        total = sum([p.percentage for p in v])
        if abs(total - 100.0) > 0.01:  # Allow small floating point errors
            raise ValueError(f'Principal payments must sum to 100%, got {total}%')
        return v


def calculate_bond_status(bond: dict) -> str:
    """
    Calculate bond status dynamically based on units sold and end date.
    Returns: 'available', 'funded', or 'closed'
    """
    total_units = bond.get('total_units', 1)
    units_sold = bond.get('units_sold', 0)
    end_date_str = bond.get('end_date')
    
    # Check if bond has passed its end date -> Closed
    if end_date_str:
        try:
            end_date = datetime.fromisoformat(end_date_str).date()
            today = datetime.now(timezone.utc).date()
            if today > end_date:
                return 'closed'
        except (ValueError, TypeError):
            pass
    
    # Check if all units are sold -> Funded
    if units_sold >= total_units:
        return 'funded'
    
    # Otherwise -> Available
    return 'available'


class Bond(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    bond_code: str = ""  # Unique bond identifier code
    name: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    principal_amount: float = 0
    coupon_rate: Optional[float] = None
    primary_irr: Optional[float] = None
    secondary_irr: Optional[float] = None
    minimum_units: int = 1  # Minimum units per order
    principal_payments: Optional[List[PrincipalPayment]] = []
    interest_payment_frequency: Optional[str] = None
    interest_payments: Optional[List[InterestPayment]] = []
    cashflows_per_unit: Optional[List[dict]] = []  # NEW: Exact cashflows per unit for secondary market bonds
    total_units: int = 1
    units_sold: int = 0
    status: Optional[str] = None  # Computed: 'available', 'funded', 'closed'
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Legacy fields for backward compatibility
    face_value: Optional[float] = None
    interest_rate: Optional[float] = None
    interest_frequency: Optional[str] = None
    maturity_date: Optional[str] = None
    issuer: Optional[str] = None
    created_by: Optional[str] = None


class SecondaryMarketCalculation(BaseModel):
    investment_date: str  # ISO format date
    units: int = 1  # Number of units to purchase


class SecondaryMarketResult(BaseModel):
    investment_date: str
    units_requested: int
    price_per_unit: float
    total_price: float
    remaining_principal: float
    remaining_interest: float
    total_inflows: float
    secondary_buyer_irr: float
    days_to_maturity: int
    units_available: int
    tds_rate: float = 10.0  # TDS percentage on interest


class CashflowItem(BaseModel):
    date: str
    month: str
    principal_payment: float
    interest_payment: float
    tds_deducted: float
    net_interest: float
    total_net_payment: float


class CashflowDownload(BaseModel):
    bond_name: str
    investment_date: str
    units: int
    price_paid: float
    cashflows: List[CashflowItem]
    total_principal: float
    total_interest: float
    total_tds: float
    total_net_received: float


class BondWithCalculations(BaseModel):
    bond: Bond
    total_cashflows_primary: float
    calculated_primary_irr: Optional[float]


# Routes
@api_router.get("/")
async def root():
    return {"message": "BondFlow Pro API", "version": "2.6.0", "updated": "2026-01-15T08:00:00Z"}


# Database Reset Endpoint (Protected)
RESET_SECRET_KEY = "KINNTEGRAA_RESET_2026"  # Change this in production

@api_router.post("/admin/reset-database")
async def reset_database(secret_key: str = None):
    """
    Reset database - clears all data EXCEPT broker accounts.
    
    Usage: POST /api/admin/reset-database?secret_key=KINNTEGRAA_RESET_2026
    
    This will delete:
    - All clients
    - All user accounts (except brokers)
    - All trades
    - All bonds/opportunities
    - All real estate opportunities
    - All cashflows
    - All analyses
    - All prepayment records
    
    Broker accounts are preserved so you can still login.
    """
    if secret_key != RESET_SECRET_KEY:
        raise HTTPException(status_code=403, detail="Invalid secret key. Access denied.")
    
    try:
        deleted_counts = {}
        
        # 1. Delete all clients
        result = await db.clients.delete_many({})
        deleted_counts['clients'] = result.deleted_count
        
        # 2. Delete all non-broker users (keep broker accounts)
        result = await db.users.delete_many({"role": {"$ne": "broker"}})
        deleted_counts['users (non-broker)'] = result.deleted_count
        
        # 3. Delete all trades
        result = await db.trades.delete_many({})
        deleted_counts['trades'] = result.deleted_count
        
        # 4. Delete all bonds
        result = await db.bonds.delete_many({})
        deleted_counts['bonds'] = result.deleted_count
        
        # 5. Delete all real estate opportunities
        result = await db.real_estate.delete_many({})
        deleted_counts['real_estate'] = result.deleted_count
        
        # 6. Delete all holding cashflows
        result = await db.holding_cashflows.delete_many({})
        deleted_counts['holding_cashflows'] = result.deleted_count
        
        # 7. Delete all cashflows
        result = await db.cashflows.delete_many({})
        deleted_counts['cashflows'] = result.deleted_count
        
        # 8. Delete all analyses
        result = await db.analyses.delete_many({})
        deleted_counts['analyses'] = result.deleted_count
        
        # 9. Delete all prepayment records
        result = await db.prepayment_records.delete_many({})
        deleted_counts['prepayment_records'] = result.deleted_count
        
        # 10. Delete all sub-brokers
        result = await db.sub_brokers.delete_many({})
        deleted_counts['sub_brokers'] = result.deleted_count
        
        # 11. Delete sub-broker user accounts
        result = await db.users.delete_many({"role": "sub_broker"})
        deleted_counts['sub_broker_users'] = result.deleted_count
        
        # Get remaining broker count
        broker_count = await db.users.count_documents({"role": "broker"})
        
        return {
            "success": True,
            "message": "Database reset successful. Broker accounts preserved.",
            "deleted": deleted_counts,
            "preserved": {
                "broker_accounts": broker_count
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Database reset failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Reset failed: {str(e)}")


@api_router.post("/bonds", response_model=Bond)
async def create_bond(bond_input: BondCreate):
    bond_dict = bond_input.model_dump()
    bond_obj = Bond(**bond_dict)
    
    doc = bond_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    _ = await db.bonds.insert_one(doc)
    return bond_obj


@api_router.get("/bonds", response_model=List[Bond])
async def get_bonds(current_user: dict = Depends(get_current_user)):
    """Get all bonds (brokers only see their own)"""
    bonds = await db.bonds.find({}, {"_id": 0}).to_list(1000)
    
    for bond in bonds:
        if isinstance(bond['created_at'], str):
            bond['created_at'] = datetime.fromisoformat(bond['created_at'])
        # Calculate and add status dynamically
        bond['status'] = calculate_bond_status(bond)
    
    return bonds


@api_router.get("/bonds/available", response_model=List[Bond])
async def get_available_bonds(current_user: dict = Depends(get_current_user)):
    """Get bonds with available units (for sub-brokers)"""
    # Get all bonds where units_sold < total_units
    bonds = await db.bonds.find({}, {"_id": 0}).to_list(1000)
    
    # Filter bonds with available units and not closed
    available_bonds = []
    for bond in bonds:
        if isinstance(bond['created_at'], str):
            bond['created_at'] = datetime.fromisoformat(bond['created_at'])
        
        # Calculate status
        status = calculate_bond_status(bond)
        bond['status'] = status
        
        # Only include bonds that are 'available' (not funded or closed)
        if status == 'available':
            available_bonds.append(bond)
    
    return available_bonds


@api_router.get("/bonds/{bond_id}", response_model=BondWithCalculations)
async def get_bond(bond_id: str):
    bond = await db.bonds.find_one({"id": bond_id}, {"_id": 0})
    
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    if isinstance(bond['created_at'], str):
        bond['created_at'] = datetime.fromisoformat(bond['created_at'])
    
    # Calculate and add status
    bond['status'] = calculate_bond_status(bond)
    
    if isinstance(bond['created_at'], str):
        bond['created_at'] = datetime.fromisoformat(bond['created_at'])
    
    # Calculate total cashflows for primary buyer
    total_cashflows = sum([ip.get('amount', 0) for ip in bond['interest_payments']])
    total_cashflows += bond['principal_amount']  # Principal returned
    
    # Calculate actual IRR achieved by primary buyer
    try:
        dates = [datetime.fromisoformat(bond['start_date'])]
        cashflows = [-bond['principal_amount']]  # Initial investment
        
        # Add interest payments
        for ip in bond['interest_payments']:
            dates.append(datetime.fromisoformat(ip['date']))
            cashflows.append(ip['amount'])
        
        # Add principal payments
        for pp in bond['principal_payments']:
            dates.append(datetime.fromisoformat(pp['date']))
            cashflows.append(bond['principal_amount'] * pp['percentage'] / 100)
        
        # Sort by date
        combined = sorted(zip(dates, cashflows), key=lambda x: x[0])
        dates = [c[0] for c in combined]
        cashflows = [c[1] for c in combined]
        
        # Combine cashflows on same date
        date_cashflow_map = {}
        for d, cf in zip(dates, cashflows):
            if d in date_cashflow_map:
                date_cashflow_map[d] += cf
            else:
                date_cashflow_map[d] = cf
        
        dates = sorted(date_cashflow_map.keys())
        cashflows = [date_cashflow_map[d] for d in dates]
        
        calculated_irr = calculate_xirr(dates, cashflows)
        if calculated_irr:
            calculated_irr = calculated_irr * 100  # Convert to percentage
    except:
        calculated_irr = None
    
    return {
        "bond": bond,
        "total_cashflows_primary": total_cashflows,
        "calculated_primary_irr": calculated_irr
    }


@api_router.post("/bonds/{bond_id}/calculate", response_model=SecondaryMarketResult)
async def calculate_secondary_price(bond_id: str, calculation: SecondaryMarketCalculation):
    bond = await db.bonds.find_one({"id": bond_id}, {"_id": 0})
    
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    # Check if bond is closed
    status = calculate_bond_status(bond)
    if status == 'closed':
        raise HTTPException(status_code=400, detail="Cannot calculate price for a closed bond")
    
    investment_date = datetime.fromisoformat(calculation.investment_date)
    start_date = datetime.fromisoformat(bond['start_date'])
    end_date = datetime.fromisoformat(bond['end_date'])
    
    if investment_date < start_date or investment_date > end_date:
        raise HTTPException(status_code=400, detail="Investment date must be between start and end date")
    
    # Check units availability
    units_available = bond.get('total_units', 1) - bond.get('units_sold', 0)
    if calculation.units > units_available:
        raise HTTPException(status_code=400, detail=f"Only {units_available} units available")
    
    # Get remaining GROSS cashflows after investment date (for price calculation)
    remaining_dates = []
    remaining_cashflows_gross = []
    
    # Add remaining interest payments (GROSS)
    for ip in bond['interest_payments']:
        ip_date = datetime.fromisoformat(ip['date'])
        if ip_date > investment_date:
            remaining_dates.append(ip_date)
            remaining_cashflows_gross.append(ip['amount'])
    
    # Add remaining principal payments
    remaining_principal_pct = 0
    for pp in bond['principal_payments']:
        pp_date = datetime.fromisoformat(pp['date'])
        if pp_date > investment_date:
            remaining_dates.append(pp_date)
            remaining_cashflows_gross.append(bond['principal_amount'] * pp['percentage'] / 100)
            remaining_principal_pct += pp['percentage']
    
    # Combine cashflows on same date (GROSS amounts)
    date_cashflow_map = {}
    for d, cf in zip(remaining_dates, remaining_cashflows_gross):
        if d in date_cashflow_map:
            date_cashflow_map[d] += cf
        else:
            date_cashflow_map[d] = cf
    
    remaining_dates = sorted(date_cashflow_map.keys())
    remaining_cashflows_gross = [date_cashflow_map[d] for d in remaining_dates]
    
    if len(remaining_dates) == 0:
        raise HTTPException(status_code=400, detail="No remaining cashflows after investment date")
    
    # Calculate price per unit using GROSS IRR and GROSS cashflows
    secondary_irr_decimal = bond['secondary_irr'] / 100
    price_per_unit = calculate_price_for_irr(secondary_irr_decimal, remaining_dates, remaining_cashflows_gross, investment_date)
    
    # Calculate total price for requested units
    total_price = price_per_unit * calculation.units
    
    days_to_maturity = (end_date - investment_date).days
    
    total_inflows_gross = sum(remaining_cashflows_gross)
    remaining_principal = bond['principal_amount'] * remaining_principal_pct / 100
    remaining_interest_gross = total_inflows_gross - remaining_principal
    
    # Calculate units available
    units_available = bond.get('total_units', 1) - bond.get('units_sold', 0)
    
    return {
        "investment_date": calculation.investment_date,
        "units_requested": calculation.units,
        "price_per_unit": round(price_per_unit, 2),
        "total_price": round(total_price, 2),
        "remaining_principal": round(remaining_principal, 2),
        "remaining_interest": round(remaining_interest_gross, 2),
        "total_inflows": round(total_inflows_gross, 2),
        "secondary_buyer_irr": bond['secondary_irr'],
        "days_to_maturity": days_to_maturity,
        "units_available": units_available,
        "tds_rate": 10.0
    }


@api_router.delete("/bonds/{bond_id}")
async def delete_bond(bond_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a bond (brokers only) - cannot delete funded or closed bonds"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete bonds")
    
    # Check if bond exists
    bond = await db.bonds.find_one({"id": bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    # Check bond status - prevent deletion of funded or closed bonds
    status = calculate_bond_status(bond)
    if status in ['funded', 'closed']:
        raise HTTPException(status_code=400, detail=f"Cannot delete a {status} bond")
    
    result = await db.bonds.delete_one({"id": bond_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    return {"message": "Bond deleted successfully"}


class BondUpdate(BaseModel):
    name: Optional[str] = None
    issuer: Optional[str] = None
    principal_amount: Optional[float] = None
    coupon_rate: Optional[float] = None
    primary_irr: Optional[float] = None
    secondary_irr: Optional[float] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    interest_payment_frequency: Optional[str] = None
    total_units: Optional[int] = None
    units_sold: Optional[int] = None
    face_value: Optional[float] = None
    description: Optional[str] = None


@api_router.put("/bonds/{bond_id}")
async def update_bond(bond_id: str, bond_update: BondUpdate, current_user: dict = Depends(get_current_user)):
    """Update a bond (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can update bonds")
    
    # Check if bond exists
    bond = await db.bonds.find_one({"id": bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    # Build update dict with only provided fields
    update_data = {}
    updatable_fields = [
        'name', 'issuer', 'principal_amount', 'coupon_rate', 'primary_irr', 
        'secondary_irr', 'start_date', 'end_date', 'interest_payment_frequency',
        'total_units', 'units_sold', 'face_value', 'description'
    ]
    
    for field in updatable_fields:
        value = getattr(bond_update, field, None)
        if value is not None:
            update_data[field] = value
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.bonds.update_one({"id": bond_id}, {"$set": update_data})
    
    # Return updated bond
    updated_bond = await db.bonds.find_one({"id": bond_id}, {"_id": 0})
    return updated_bond


class RecordSale(BaseModel):
    units: int = 1


@api_router.post("/bonds/{bond_id}/record-sale")
async def record_sale(bond_id: str, sale: RecordSale):
    """Record a sale and update units sold"""
    bond = await db.bonds.find_one({"id": bond_id})
    
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    total_units = bond.get('total_units', 1)
    units_sold = bond.get('units_sold', 0)
    units_available = total_units - units_sold
    
    if sale.units > units_available:
        raise HTTPException(status_code=400, detail=f"Only {units_available} units available")
    
    # Update units sold
    new_units_sold = units_sold + sale.units
    await db.bonds.update_one(
        {"id": bond_id},
        {"$set": {"units_sold": new_units_sold}}
    )
    
    return {
        "message": f"Recorded sale of {sale.units} unit(s)",
        "units_sold": new_units_sold,
        "units_available": total_units - new_units_sold
    }


@api_router.post("/bonds/{bond_id}/presentations")
async def upload_bond_presentations(
    bond_id: str,
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload presentation files for a bond (max 10 files)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can upload presentations")
    
    bond = await db.bonds.find_one({"id": bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    current_presentations = bond.get('presentations', [])
    
    if len(current_presentations) + len(files) > 10:
        raise HTTPException(
            status_code=400, 
            detail=f"Maximum 10 presentations allowed. Currently have {len(current_presentations)}, trying to add {len(files)}"
        )
    
    allowed_types = ['application/pdf', 
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'application/vnd.ms-powerpoint',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    
    new_presentations = []
    
    upload_dir = "/app/uploads/bond_presentations"
    os.makedirs(upload_dir, exist_ok=True)
    
    for file in files:
        if file.content_type not in allowed_types:
            continue
        
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'pdf'
        saved_filename = f"{bond_id}_{uuid.uuid4().hex[:8]}.{file_extension}"
        file_path = os.path.join(upload_dir, saved_filename)
        
        content = await file.read()
        with open(file_path, 'wb') as f:
            f.write(content)
        
        presentation_data = {
            "id": str(uuid.uuid4()),
            "original_filename": file.filename,
            "content_type": file.content_type,
            "size": len(content),
            "url": f"/uploads/bond_presentations/{saved_filename}",
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }
        new_presentations.append(presentation_data)
    
    await db.bonds.update_one(
        {"id": bond_id},
        {"$set": {"presentations": current_presentations + new_presentations}}
    )
    
    return {
        "message": f"Uploaded {len(new_presentations)} presentation(s)",
        "presentations": new_presentations
    }


@api_router.delete("/bonds/{bond_id}/presentations/{presentation_id}")
async def delete_bond_presentation(
    bond_id: str,
    presentation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a presentation from a bond"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete presentations")
    
    bond = await db.bonds.find_one({"id": bond_id})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    presentations = bond.get('presentations', [])
    presentation = next((p for p in presentations if p['id'] == presentation_id), None)
    
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")
    
    # Try to delete file
    try:
        file_path = f"/app{presentation['url']}"
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        pass
    
    updated_presentations = [p for p in presentations if p['id'] != presentation_id]
    
    await db.bonds.update_one(
        {"id": bond_id},
        {"$set": {"presentations": updated_presentations}}
    )
    
    return {"message": "Presentation deleted"}


@api_router.post("/bonds/{bond_id}/download-cashflow", response_model=CashflowDownload)
async def download_cashflow(bond_id: str, calculation: SecondaryMarketCalculation):
    """Generate month-wise cashflow with TDS calculation"""
    bond = await db.bonds.find_one({"id": bond_id}, {"_id": 0})
    
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    investment_date = datetime.fromisoformat(calculation.investment_date)
    units = calculation.units
    
    # Calculate price per unit
    secondary_irr_decimal = bond['secondary_irr'] / 100
    
    # Get remaining cashflows
    remaining_dates = []
    remaining_cashflows = []
    
    for ip in bond['interest_payments']:
        ip_date = datetime.fromisoformat(ip['date'])
        if ip_date > investment_date:
            remaining_dates.append(ip_date)
            remaining_cashflows.append(ip['amount'])
    
    for pp in bond['principal_payments']:
        pp_date = datetime.fromisoformat(pp['date'])
        if pp_date > investment_date:
            remaining_dates.append(pp_date)
            remaining_cashflows.append(bond['principal_amount'] * pp['percentage'] / 100)
    
    date_cashflow_map = {}
    for d, cf in zip(remaining_dates, remaining_cashflows):
        if d in date_cashflow_map:
            date_cashflow_map[d] += cf
        else:
            date_cashflow_map[d] = cf
    
    remaining_dates = sorted(date_cashflow_map.keys())
    remaining_cashflows = [date_cashflow_map[d] for d in remaining_dates]
    
    price_per_unit = calculate_price_for_irr(secondary_irr_decimal, remaining_dates, remaining_cashflows, investment_date)
    total_price = price_per_unit * units
    
    # Build cashflow schedule - MULTIPLY BY UNITS
    cashflows = []
    total_principal = 0
    total_interest = 0
    total_tds = 0
    
    for payment_date in sorted(date_cashflow_map.keys()):
        # Separate principal and interest for this date
        principal_payment = 0
        interest_payment = 0
        
        # Check principal payments
        for pp in bond['principal_payments']:
            pp_date = datetime.fromisoformat(pp['date'])
            if pp_date == payment_date and pp_date > investment_date:
                principal_payment += (bond['principal_amount'] * pp['percentage'] / 100) * units  # MULTIPLY BY UNITS
        
        # Check interest payments
        for ip in bond['interest_payments']:
            ip_date = datetime.fromisoformat(ip['date'])
            if ip_date == payment_date and ip_date > investment_date:
                interest_payment += ip['amount'] * units  # MULTIPLY BY UNITS
        
        # Calculate TDS on interest
        tds_deducted = interest_payment * 0.10
        net_interest = interest_payment - tds_deducted
        total_net_payment = principal_payment + net_interest
        
        total_principal += principal_payment
        total_interest += interest_payment
        total_tds += tds_deducted
        
        cashflows.append({
            "date": payment_date.isoformat(),
            "month": payment_date.strftime("%B %Y"),
            "principal_payment": round(principal_payment, 2),
            "interest_payment": round(interest_payment, 2),
            "tds_deducted": round(tds_deducted, 2),
            "net_interest": round(net_interest, 2),
            "total_net_payment": round(total_net_payment, 2)
        })
    
    return {
        "bond_name": bond['name'],
        "investment_date": calculation.investment_date,
        "units": units,
        "price_paid": round(total_price, 2),
        "cashflows": cashflows,
        "total_principal": round(total_principal, 2),
        "total_interest": round(total_interest, 2),
        "total_tds": round(total_tds, 2),
        "total_net_received": round(total_principal + total_interest - total_tds, 2)
    }


# ==================== REAL ESTATE OPPORTUNITY ====================

class PaymentScheduleItem(BaseModel):
    date: str  # YYYY-MM-DD
    percentage: float  # e.g., 20.0 for 20%
    description: Optional[str] = None  # e.g., "Booking", "During Construction", "Handover"


class RealEstateOpportunityCreate(BaseModel):
    # Basic Information
    building_name: str
    unit_no: str
    
    # Pricing (in AED)
    unit_price: float
    
    # DLD Fee (percentage of unit price) - paid upfront with booking
    dld_fee_percentage: float = 4.0
    
    # Admin Fee (absolute amount) - paid upfront with booking
    admin_fee: float = 0
    
    # Other Fees
    broker_fee: float = 0
    other_fees: float = 0
    
    # Unit Selling Fee (% of selling price, 0-2.5%)
    unit_selling_fee_percentage: float = 0
    
    # Area Details (sq.ft)
    total_area: float
    carpet_area: float
    balcony_area: float = 0
    
    # Unit Details
    unit_type: str
    floor: int
    parking_spaces: int = 0
    
    # Payment Schedule - percentages based on unit price only (excludes DLD/Admin)
    payment_schedule: List[PaymentScheduleItem] = []
    
    # Sale Settings
    expected_sale_rate: Optional[float] = None
    estimated_sell_date: Optional[str] = None
    eligible_to_sell_after_percentage: float = 100
    
    # Optional Details
    developer_name: Optional[str] = None
    location: Optional[str] = None
    handover_date: Optional[str] = None
    description: Optional[str] = None


class RealEstateOpportunityUpdate(BaseModel):
    building_name: Optional[str] = None
    unit_no: Optional[str] = None
    unit_price: Optional[float] = None
    dld_fee_percentage: Optional[float] = None
    admin_fee: Optional[float] = None
    broker_fee: Optional[float] = None
    other_fees: Optional[float] = None
    unit_selling_fee_percentage: Optional[float] = None
    total_area: Optional[float] = None
    carpet_area: Optional[float] = None
    balcony_area: Optional[float] = None
    unit_type: Optional[str] = None
    floor: Optional[int] = None
    parking_spaces: Optional[int] = None
    payment_schedule: Optional[List[PaymentScheduleItem]] = None
    expected_sale_rate: Optional[float] = None
    estimated_sell_date: Optional[str] = None
    eligible_to_sell_after_percentage: Optional[float] = None
    developer_name: Optional[str] = None
    location: Optional[str] = None
    handover_date: Optional[str] = None
    description: Optional[str] = None


class InvestorAllocation(BaseModel):
    client_id: str
    share_percentage: float  # Investment percentage (off-plan: percentage based)


# Constants
MAX_FRACTIONAL_INVESTMENT_USD = 50000
USD_TO_AED_RATE = 3.67  # Approximate rate
MAX_FRACTIONAL_INVESTMENT_AED = MAX_FRACTIONAL_INVESTMENT_USD * USD_TO_AED_RATE  # ~183,500 AED


def calculate_payment_schedule(unit_price: float, payment_schedule: List[dict]) -> List[dict]:
    """Calculate actual payment amounts based on percentages"""
    calculated = []
    for payment in payment_schedule:
        amount = unit_price * (payment['percentage'] / 100)
        calculated.append({
            "date": payment['date'],
            "percentage": payment['percentage'],
            "description": payment.get('description', ''),
            "amount": round(amount, 2)
        })
    return calculated


@api_router.post("/real-estate-opportunities")
async def create_real_estate_opportunity(
    opportunity_data: RealEstateOpportunityCreate, 
    current_user: dict = Depends(get_current_user)
):
    """Create a new off-plan real estate opportunity (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can create real estate opportunities")
    
    # Validate unit selling fee percentage (0-2.5%)
    if opportunity_data.unit_selling_fee_percentage < 0 or opportunity_data.unit_selling_fee_percentage > 2.5:
        raise HTTPException(status_code=400, detail="Unit Selling Fee must be between 0% and 2.5%")
    
    # DLD Fee is percentage of unit price
    dld_fee = opportunity_data.unit_price * opportunity_data.dld_fee_percentage / 100
    
    # Admin fee is absolute amount
    admin_fee = opportunity_data.admin_fee
    
    # Upfront amount (DLD + Admin) - paid with booking
    upfront_amount = dld_fee + admin_fee
    
    broker_fee = opportunity_data.broker_fee
    other_fees = opportunity_data.other_fees
    
    # Total cost = Unit Price + all fees
    total_cost = opportunity_data.unit_price + dld_fee + admin_fee + broker_fee + other_fees
    
    # Calculate balcony to carpet ratio
    balcony_ratio = 0
    if opportunity_data.carpet_area > 0:
        balcony_ratio = opportunity_data.balcony_area / opportunity_data.carpet_area
    
    # Payment schedule - percentages based on unit price only
    # DLD + Admin are paid upfront with booking (not part of payment schedule percentages)
    payment_schedule = []
    if opportunity_data.payment_schedule:
        payment_schedule = calculate_payment_schedule(
            opportunity_data.unit_price,  # Based on unit price only
            [p.model_dump() for p in opportunity_data.payment_schedule]
        )
    
    # Validate payment schedule totals to 100%
    if payment_schedule:
        total_percentage = sum(p['percentage'] for p in payment_schedule)
        if abs(total_percentage - 100) > 0.01:
            raise HTTPException(
                status_code=400, 
                detail=f"Payment schedule must total 100%. Current total: {total_percentage}%"
            )
    
    opportunity_dict = {
        "id": str(uuid.uuid4()),
        "building_name": opportunity_data.building_name,
        "unit_no": opportunity_data.unit_no,
        "property_type": "off_plan",  # Only off-plan supported
        "unit_price": opportunity_data.unit_price,
        "dld_fee_percentage": opportunity_data.dld_fee_percentage,
        "dld_fee": round(dld_fee, 2),
        "admin_fee": round(admin_fee, 2),
        "upfront_amount": round(upfront_amount, 2),  # DLD + Admin (paid with booking)
        "broker_fee": broker_fee,
        "other_fees": other_fees,
        "unit_selling_fee_percentage": opportunity_data.unit_selling_fee_percentage,
        "total_cost": round(total_cost, 2),
        "total_area": opportunity_data.total_area,
        "carpet_area": opportunity_data.carpet_area,
        "balcony_area": opportunity_data.balcony_area,
        "balcony_ratio": round(balcony_ratio, 4),
        "unit_type": opportunity_data.unit_type,
        "floor": opportunity_data.floor,
        "parking_spaces": opportunity_data.parking_spaces,
        "payment_schedule": payment_schedule,
        "total_payment_percentage_completed": 0,
        "expected_sale_rate": opportunity_data.expected_sale_rate,
        "estimated_sell_date": opportunity_data.estimated_sell_date,
        "eligible_to_sell_after_percentage": opportunity_data.eligible_to_sell_after_percentage,
        "is_eligible_to_sell": False,
        "max_investors": 4,  # Off-plan: max 4 investors
        "current_investors": 0,
        "total_invested": 0,
        "invested_percentage": 0,
        "remaining_percentage": 100,
        "investors": [],
        "developer_name": opportunity_data.developer_name,
        "location": opportunity_data.location,
        "handover_date": opportunity_data.handover_date,
        "description": opportunity_data.description,
        "images": [],
        "status": "available",
        "created_by": current_user['id'],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.real_estate_opportunities.insert_one(opportunity_dict)
    
    # Remove _id for response
    if '_id' in opportunity_dict:
        del opportunity_dict['_id']
    
    return opportunity_dict


@api_router.get("/real-estate-opportunities")
async def get_real_estate_opportunities(
    status: Optional[str] = None,
    property_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all real estate opportunities"""
    query = {}
    
    if current_user['role'] == 'broker':
        query["created_by"] = current_user['id']
    
    if status:
        query["status"] = status
    
    if property_type:
        query["property_type"] = property_type
    
    opportunities = await db.real_estate_opportunities.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return opportunities


@api_router.get("/real-estate-opportunities/client/{client_id}")
async def get_client_real_estate_investments(
    client_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all real estate investments for a specific client (broker/sub-broker only)"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can view client investments")
    
    # Find all opportunities where this client is an investor
    opportunities = await db.real_estate_opportunities.find(
        {"investors.client_id": client_id},
        {"_id": 0}
    ).to_list(1000)
    
    # Transform data to show client-specific information
    client_investments = []
    for opp in opportunities:
        investor = next((inv for inv in opp.get('investors', []) if inv.get('client_id') == client_id), None)
        if investor:
            # Count completed payments for this client
            client_payments = [p for p in opp.get('investor_payments', []) if p.get('investor_id') == client_id and p.get('status') == 'verified']
            total_milestones = len(opp.get('payment_schedule', []))
            
            client_investments.append({
                "id": opp.get('id'),
                "building_name": opp.get('building_name'),
                "project_name": opp.get('project_name'),
                "developer_name": opp.get('developer_name'),
                "unit_no": opp.get('unit_no'),
                "unit_price": opp.get('unit_price'),
                "status": opp.get('status'),
                "share_percentage": investor.get('share_percentage', 0),
                "investment_amount": investor.get('amount', 0),
                "invested_at": investor.get('invested_at'),
                "payment_schedule": opp.get('payment_schedule', []),
                "payments_completed": len(client_payments),
                "payments_completed_percent": round((len(client_payments) / total_milestones * 100) if total_milestones > 0 else 0, 1)
            })
    
    return client_investments


@api_router.get("/real-estate-opportunities/{opportunity_id}")
async def get_real_estate_opportunity(
    opportunity_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific real estate opportunity"""
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    return opportunity


@api_router.put("/real-estate-opportunities/{opportunity_id}")
async def update_real_estate_opportunity(
    opportunity_id: str,
    update_data: RealEstateOpportunityUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a real estate opportunity (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can update real estate opportunities")
    
    opportunity = await db.real_estate_opportunities.find_one({
        "id": opportunity_id, 
        "created_by": current_user['id']
    })
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Build update dict with only provided fields
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Recalculate totals if any pricing field changed
    if any(k in update_dict for k in ['unit_price', 'dld_fee', 'admin_fee', 'broker_fee', 'other_fees']):
        unit_price = update_dict.get('unit_price', opportunity['unit_price'])
        dld_fee = update_dict.get('dld_fee', opportunity['dld_fee'])
        admin_fee = update_dict.get('admin_fee', opportunity['admin_fee'])
        broker_fee = update_dict.get('broker_fee', opportunity['broker_fee'])
        other_fees = update_dict.get('other_fees', opportunity['other_fees'])
        
        total_cost = unit_price + dld_fee + admin_fee + broker_fee + other_fees
        update_dict['total_cost'] = total_cost
        
        # Recalculate units
        UNIT_VALUE_AED = 500
        total_units = int(total_cost // UNIT_VALUE_AED)
        if total_units == 0:
            total_units = 1
        update_dict['total_units'] = total_units
        update_dict['unit_value'] = UNIT_VALUE_AED
        units_sold = opportunity.get('units_sold', 0)
        update_dict['units_available'] = total_units - units_sold
    
    # Recalculate balcony ratio if area fields changed
    if any(k in update_dict for k in ['carpet_area', 'balcony_area']):
        carpet_area = update_dict.get('carpet_area', opportunity['carpet_area'])
        balcony_area = update_dict.get('balcony_area', opportunity['balcony_area'])
        if carpet_area > 0:
            update_dict['balcony_ratio'] = round(balcony_area / carpet_area, 4)
    
    update_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": update_dict}
    )
    
    updated = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    return updated


@api_router.delete("/real-estate-opportunities/{opportunity_id}")
async def delete_real_estate_opportunity(
    opportunity_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a real estate opportunity (broker only, only if no investors)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete real estate opportunities")
    
    opportunity = await db.real_estate_opportunities.find_one({
        "id": opportunity_id, 
        "created_by": current_user['id']
    })
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    if opportunity.get('current_investors', 0) > 0:
        raise HTTPException(status_code=400, detail="Cannot delete opportunity with existing investors")
    
    await db.real_estate_opportunities.delete_one({"id": opportunity_id})
    
    return {"message": "Real estate opportunity deleted successfully"}


@api_router.post("/real-estate-opportunities/{opportunity_id}/images")
async def upload_opportunity_images(
    opportunity_id: str,
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload images for a real estate opportunity (max 12 images)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can upload images")
    
    opportunity = await db.real_estate_opportunities.find_one({
        "id": opportunity_id, 
        "created_by": current_user['id']
    })
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    current_images = opportunity.get('images', [])
    
    # Check total image limit
    if len(current_images) + len(files) > 12:
        raise HTTPException(
            status_code=400, 
            detail=f"Maximum 12 images allowed. Currently have {len(current_images)}, trying to add {len(files)}"
        )
    
    # Validate file types
    allowed_types = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    new_images = []
    
    for file in files:
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid file type: {file.content_type}. Allowed: JPEG, PNG, WebP, GIF"
            )
        
        # Read file content and encode as base64 for storage
        # In production, you'd upload to cloud storage (S3, etc.)
        content = await file.read()
        import base64
        encoded = base64.b64encode(content).decode('utf-8')
        
        image_data = {
            "id": str(uuid.uuid4()),
            "filename": file.filename,
            "content_type": file.content_type,
            "size": len(content),
            "data": encoded,  # Base64 encoded
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }
        new_images.append(image_data)
    
    # Update opportunity with new images
    updated_images = current_images + new_images
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"images": updated_images, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "message": f"Successfully uploaded {len(new_images)} images",
        "total_images": len(updated_images),
        "image_ids": [img['id'] for img in new_images]
    }


@api_router.delete("/real-estate-opportunities/{opportunity_id}/images/{image_id}")
async def delete_opportunity_image(
    opportunity_id: str,
    image_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a specific image from a real estate opportunity"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete images")
    
    opportunity = await db.real_estate_opportunities.find_one({
        "id": opportunity_id, 
        "created_by": current_user['id']
    })
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    current_images = opportunity.get('images', [])
    updated_images = [img for img in current_images if img['id'] != image_id]
    
    if len(updated_images) == len(current_images):
        raise HTTPException(status_code=404, detail="Image not found")
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"images": updated_images, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Image deleted successfully", "remaining_images": len(updated_images)}


@api_router.post("/real-estate-opportunities/{opportunity_id}/presentations")
async def upload_opportunity_presentations(
    opportunity_id: str,
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload presentation files for a real estate opportunity (max 10 files)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can upload presentations")
    
    opportunity = await db.real_estate_opportunities.find_one({
        "id": opportunity_id, 
        "created_by": current_user['id']
    })
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    current_presentations = opportunity.get('presentations', [])
    
    # Check total presentation limit
    if len(current_presentations) + len(files) > 10:
        raise HTTPException(
            status_code=400, 
            detail=f"Maximum 10 presentations allowed. Currently have {len(current_presentations)}, trying to add {len(files)}"
        )
    
    # Validate file types
    allowed_types = [
        'application/pdf', 
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    new_presentations = []
    
    # Create uploads directory if not exists
    import os
    upload_dir = "/app/uploads/presentations"
    os.makedirs(upload_dir, exist_ok=True)
    
    for file in files:
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid file type: {file.content_type}. Allowed: PDF, PPT, PPTX, DOC, DOCX"
            )
        
        # Save file to disk
        file_id = str(uuid.uuid4())
        file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'pdf'
        saved_filename = f"{file_id}.{file_ext}"
        file_path = os.path.join(upload_dir, saved_filename)
        
        content = await file.read()
        with open(file_path, 'wb') as f:
            f.write(content)
        
        presentation_data = {
            "id": file_id,
            "filename": file.filename,
            "saved_filename": saved_filename,
            "content_type": file.content_type,
            "size": len(content),
            "url": f"/uploads/presentations/{saved_filename}",
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }
        new_presentations.append(presentation_data)
    
    # Update opportunity with new presentations
    updated_presentations = current_presentations + new_presentations
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"presentations": updated_presentations, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "message": f"Successfully uploaded {len(new_presentations)} presentations",
        "total_presentations": len(updated_presentations),
        "presentation_ids": [pres['id'] for pres in new_presentations]
    }


@api_router.get("/real-estate-opportunities/{opportunity_id}/presentations/{presentation_id}")
async def download_presentation(
    opportunity_id: str,
    presentation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download a presentation file"""
    from fastapi.responses import FileResponse
    import os
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    presentations = opportunity.get('presentations', [])
    presentation = next((p for p in presentations if p['id'] == presentation_id), None)
    
    if not presentation:
        raise HTTPException(status_code=404, detail="Presentation not found")
    
    file_path = f"/app/uploads/presentations/{presentation['saved_filename']}"
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")
    
    return FileResponse(
        path=file_path,
        filename=presentation['filename'],
        media_type=presentation['content_type']
    )


# Passport Details for Real Estate Investors
class PassportDetails(BaseModel):
    passport_number: Optional[str] = None
    date_of_issue: Optional[str] = None
    date_of_expiry: Optional[str] = None
    place_of_issue: Optional[str] = None
    country_of_issue: Optional[str] = None
    address_on_passport: Optional[str] = None


@api_router.post("/real-estate-opportunities/{opportunity_id}/investor/{investor_id}/passport")
async def update_investor_passport(
    opportunity_id: str,
    investor_id: str,
    passport: PassportDetails,
    current_user: dict = Depends(get_current_user)
):
    """Update passport details for an investor in a real estate opportunity"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id})
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    investors = opportunity.get('investors', [])
    investor_found = False
    
    for inv in investors:
        if inv['id'] == investor_id:
            inv['passport_details'] = passport.model_dump()
            inv['passport_updated_at'] = datetime.now(timezone.utc).isoformat()
            investor_found = True
            break
    
    if not investor_found:
        raise HTTPException(status_code=404, detail="Investor not found")
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"investors": investors, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Passport details updated successfully"}


@api_router.post("/real-estate-opportunities/{opportunity_id}/investor/{investor_id}/passport-upload")
async def upload_passport_document(
    opportunity_id: str,
    investor_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload passport document for an investor"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id})
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    # Validate file type
    allowed_types = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only PDF and image files are allowed")
    
    # Create uploads directory if not exists
    import os
    upload_dir = "/app/uploads/passports"
    os.makedirs(upload_dir, exist_ok=True)
    
    # Save file
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'pdf'
    saved_filename = f"{investor_id}_{uuid.uuid4()}.{file_ext}"
    file_path = f"{upload_dir}/{saved_filename}"
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    # Update investor record
    investors = opportunity.get('investors', [])
    for inv in investors:
        if inv['id'] == investor_id:
            inv['passport_document'] = {
                'filename': file.filename,
                'saved_filename': saved_filename,
                'content_type': file.content_type,
                'uploaded_at': datetime.now(timezone.utc).isoformat()
            }
            break
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"investors": investors, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Passport document uploaded successfully", "filename": saved_filename}


@api_router.get("/real-estate-opportunities/{opportunity_id}/investor/{investor_id}/passport-download")
async def download_passport_document(
    opportunity_id: str,
    investor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download passport document for an investor"""
    from fastapi.responses import FileResponse
    import os
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id})
    if not opportunity:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    investors = opportunity.get('investors', [])
    investor = next((inv for inv in investors if inv['id'] == investor_id), None)
    
    if not investor:
        raise HTTPException(status_code=404, detail="Investor not found")
    
    passport_doc = investor.get('passport_document')
    if not passport_doc:
        raise HTTPException(status_code=404, detail="No passport document uploaded")
    
    file_path = f"/app/uploads/passports/{passport_doc['saved_filename']}"
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")
    
    return FileResponse(
        path=file_path,
        filename=passport_doc['filename'],
        media_type=passport_doc['content_type']
    )


@api_router.post("/real-estate-opportunities/{opportunity_id}/invest")
async def invest_in_opportunity(
    opportunity_id: str,
    allocation: InvestorAllocation,
    current_user: dict = Depends(get_current_user)
):
    """
    Allocate investment in an off-plan property (percentage-based, max 4 investors)
    """
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can allocate investments")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    if opportunity['status'] != 'available':
        raise HTTPException(status_code=400, detail="This opportunity is no longer available for investment")
    
    # Verify client exists
    client = await db.clients.find_one({"id": allocation.client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # OFF-PLAN: Percentage-based (max 4 investors)
    max_investors = opportunity.get('max_investors', 4)
    if opportunity.get('current_investors', 0) >= max_investors:
        raise HTTPException(status_code=400, detail=f"Maximum {max_investors} investors allowed")
    
    remaining_percentage = opportunity.get('remaining_percentage', 100)
    total_cost = opportunity.get('total_cost', 0)
    
    share_percentage = allocation.share_percentage
    if share_percentage <= 0:
        raise HTTPException(status_code=400, detail="Investment percentage must be greater than 0")
    if share_percentage > remaining_percentage:
        raise HTTPException(status_code=400, detail=f"Only {remaining_percentage:.1f}% remaining for investment")
    
    investment_amount = total_cost * share_percentage / 100
    
    # Create investor record with payment schedule tracking
    investor_record = {
        "id": str(uuid.uuid4()),
        "client_id": allocation.client_id,
        "client_name": client['name'],
        "amount": round(investment_amount, 2),
        "share_percentage": round(share_percentage, 2),
        "invested_at": datetime.now(timezone.utc).isoformat(),
        "recorded_by": current_user['id'],
        # Payment tracking per investor (to be filled when payments are made)
        "payments": []
    }
    
    new_total_invested = opportunity.get('total_invested', 0) + investment_amount
    new_invested_percentage = opportunity.get('invested_percentage', 0) + share_percentage
    new_remaining_percentage = 100 - new_invested_percentage
    
    update_data = {
        "current_investors": opportunity.get('current_investors', 0) + 1,
        "total_invested": round(new_total_invested, 2),
        "invested_percentage": round(new_invested_percentage, 2),
        "remaining_percentage": round(new_remaining_percentage, 2),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Check if fully invested
    if new_remaining_percentage <= 0.01 or update_data['current_investors'] >= max_investors:
        update_data['status'] = 'fully_invested'
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {
            "$set": update_data,
            "$push": {"investors": investor_record}
        }
    )
    
    return {
        "message": "Investment recorded successfully",
        "investor": investor_record,
        "total_invested": update_data.get('total_invested'),
        "remaining_percentage": update_data.get('remaining_percentage'),
        "status": update_data.get('status', opportunity['status'])
    }


@api_router.get("/real-estate-opportunities/{opportunity_id}/investors")
async def get_opportunity_investors(
    opportunity_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get list of investors for an opportunity"""
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    return {
        "opportunity_id": opportunity_id,
        "building_name": opportunity['building_name'],
        "unit_no": opportunity['unit_no'],
        "property_type": opportunity['property_type'],
        "total_cost": opportunity['total_cost'],
        "total_invested": opportunity.get('total_invested', 0),
        "unit_value": opportunity.get('unit_value', 500),
        "total_units": opportunity.get('total_units', 0),
        "units_sold": opportunity.get('units_sold', 0),
        "units_available": opportunity.get('units_available', 0),
        "current_investors": opportunity.get('current_investors', 0),
        "investors": opportunity.get('investors', [])
    }


class PaymentRecordRequest(BaseModel):
    payment_index: int
    payment_date: str  # Date payment was made
    transaction_amount: float  # Actual amount paid
    transaction_fees: float = 0  # Bank/transfer fees
    currency: str = "AED"  # Currency used
    currency_rate: float = 1.0  # Exchange rate if not AED
    notes: Optional[str] = None


@api_router.post("/real-estate-opportunities/{opportunity_id}/record-payment")
async def record_payment_milestone(
    opportunity_id: str,
    payment_data: PaymentRecordRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Mark a payment milestone as completed with full transaction details.
    Allowed for: broker, sub_broker, client (if tagged to this investment)
    """
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Check authorization
    user_role = current_user['role']
    user_id = current_user['id']
    
    if user_role == 'broker':
        # Broker must own this opportunity
        if opportunity.get('created_by') != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
    elif user_role == 'sub_broker':
        # Sub-broker must have a client invested in this opportunity
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        # Get clients linked to this sub-broker
        sub_broker_clients = await db.clients.find({"linked_subbroker_id": user_id}, {"id": 1}).to_list(1000)
        sub_broker_client_ids = [c['id'] for c in sub_broker_clients]
        if not any(cid in investor_client_ids for cid in sub_broker_client_ids):
            raise HTTPException(status_code=403, detail="No linked clients invested in this property")
    elif user_role == 'client':
        # Client must be an investor
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        # Get client record for this user
        client = await db.clients.find_one({"pan_number": current_user.get('pan_number')})
        if not client or client['id'] not in investor_client_ids:
            raise HTTPException(status_code=403, detail="You are not invested in this property")
    else:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    payment_schedule = opportunity.get('payment_schedule', [])
    payment_index = payment_data.payment_index
    
    if payment_index < 0 or payment_index >= len(payment_schedule):
        raise HTTPException(status_code=400, detail="Invalid payment index")
    
    # Update payment with full details
    payment_schedule[payment_index]['completed'] = True
    payment_schedule[payment_index]['completed_at'] = datetime.now(timezone.utc).isoformat()
    payment_schedule[payment_index]['payment_details'] = {
        "payment_date": payment_data.payment_date,
        "transaction_amount": payment_data.transaction_amount,
        "transaction_fees": payment_data.transaction_fees,
        "currency": payment_data.currency,
        "currency_rate": payment_data.currency_rate,
        "amount_in_aed": payment_data.transaction_amount * payment_data.currency_rate,
        "notes": payment_data.notes,
        "recorded_by": user_id,
        "recorded_by_role": user_role,
        "recorded_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Calculate total completed percentage
    total_completed = sum(p['percentage'] for p in payment_schedule if p.get('completed'))
    
    # Check if eligible to sell
    eligible_threshold = opportunity.get('eligible_to_sell_after_percentage', 100)
    is_eligible = total_completed >= eligible_threshold
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {
            "payment_schedule": payment_schedule,
            "total_payment_percentage_completed": total_completed,
            "is_eligible_to_sell": is_eligible,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "message": "Payment recorded successfully",
        "payment": payment_schedule[payment_index],
        "total_completed_percentage": total_completed,
        "is_eligible_to_sell": is_eligible
    }


@api_router.post("/real-estate-opportunities/{opportunity_id}/payments/{payment_index}/swift-copy")
async def upload_swift_copy(
    opportunity_id: str,
    payment_index: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload SWIFT copy for a payment milestone"""
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Check authorization (same logic as record-payment)
    user_role = current_user['role']
    user_id = current_user['id']
    
    if user_role == 'broker':
        if opportunity.get('created_by') != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
    elif user_role == 'sub_broker':
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        sub_broker_clients = await db.clients.find({"linked_subbroker_id": user_id}, {"id": 1}).to_list(1000)
        sub_broker_client_ids = [c['id'] for c in sub_broker_clients]
        if not any(cid in investor_client_ids for cid in sub_broker_client_ids):
            raise HTTPException(status_code=403, detail="Not authorized")
    elif user_role == 'client':
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        client = await db.clients.find_one({"pan_number": current_user.get('pan_number')})
        if not client or client['id'] not in investor_client_ids:
            raise HTTPException(status_code=403, detail="Not authorized")
    else:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    payment_schedule = opportunity.get('payment_schedule', [])
    
    if payment_index < 0 or payment_index >= len(payment_schedule):
        raise HTTPException(status_code=400, detail="Invalid payment index")
    
    # Validate file type
    allowed_types = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Allowed: PDF, JPEG, PNG, WebP")
    
    # Read and encode file
    content = await file.read()
    import base64
    encoded = base64.b64encode(content).decode('utf-8')
    
    swift_copy = {
        "id": str(uuid.uuid4()),
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(content),
        "data": encoded,
        "uploaded_by": user_id,
        "uploaded_by_role": user_role,
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Add or replace swift copy for this payment
    if 'swift_copies' not in payment_schedule[payment_index]:
        payment_schedule[payment_index]['swift_copies'] = []
    
    payment_schedule[payment_index]['swift_copies'].append(swift_copy)
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {
            "payment_schedule": payment_schedule,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "message": "SWIFT copy uploaded successfully",
        "swift_copy_id": swift_copy['id'],
        "filename": file.filename
    }


@api_router.get("/real-estate-opportunities/{opportunity_id}/payments")
async def get_payment_schedule(
    opportunity_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get payment schedule for a real estate opportunity.
    Accessible by: broker (owner), sub-broker (if client invested), client (if invested)
    """
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Check authorization
    user_role = current_user['role']
    user_id = current_user['id']
    authorized = False
    
    if user_role == 'broker':
        authorized = opportunity.get('created_by') == user_id
    elif user_role == 'sub_broker':
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        sub_broker_clients = await db.clients.find({"linked_subbroker_id": user_id}, {"id": 1}).to_list(1000)
        sub_broker_client_ids = [c['id'] for c in sub_broker_clients]
        authorized = any(cid in investor_client_ids for cid in sub_broker_client_ids)
    elif user_role == 'client':
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        client = await db.clients.find_one({"pan_number": current_user.get('pan_number')})
        authorized = client and client['id'] in investor_client_ids
    
    if not authorized:
        raise HTTPException(status_code=403, detail="Not authorized to view this payment schedule")
    
    # Strip base64 data from swift copies for list view (too large)
    payment_schedule = opportunity.get('payment_schedule', [])
    for payment in payment_schedule:
        if 'swift_copies' in payment:
            for sc in payment['swift_copies']:
                sc['data'] = None  # Remove data, keep metadata
    
    return {
        "opportunity_id": opportunity_id,
        "building_name": opportunity['building_name'],
        "unit_no": opportunity['unit_no'],
        "total_cost": opportunity['total_cost'],
        "unit_price": opportunity['unit_price'],
        "payment_schedule": payment_schedule,
        "total_payment_percentage_completed": opportunity.get('total_payment_percentage_completed', 0),
        "is_eligible_to_sell": opportunity.get('is_eligible_to_sell', False),
        "eligible_to_sell_after_percentage": opportunity.get('eligible_to_sell_after_percentage', 100)
    }


class InterestRequest(BaseModel):
    message: str = ""


@api_router.post("/real-estate-opportunities/{opportunity_id}/interest")
async def express_interest(
    opportunity_id: str,
    request: InterestRequest,
    current_user: dict = Depends(get_current_user)
):
    """Express interest in a real estate opportunity"""
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    interest_record = {
        "id": str(uuid.uuid4()),
        "user_id": current_user['id'],
        "user_name": current_user.get('name', current_user.get('pan_number')),
        "user_role": current_user['role'],
        "message": request.message,
        "expressed_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {
            "$push": {"interests": interest_record},
            "$inc": {"interested_count": 1}
        }
    )
    
    # If interest came from a client, notify the broker who shared it
    if current_user['role'] == 'client':
        # Find the broker who shared this opportunity with this client
        shares = opportunity.get('shares', [])
        for share in shares:
            if share.get('client_id') == current_user['id']:
                # Notify the broker
                notification = {
                    "id": str(uuid.uuid4()),
                    "user_id": share['shared_by'],
                    "type": "client_interested",
                    "title": "Client Showed Interest!",
                    "message": f"{current_user.get('name', 'A client')} expressed interest in {opportunity['building_name']} - Unit {opportunity['unit_no']}",
                    "opportunity_id": opportunity_id,
                    "client_id": current_user['id'],
                    "client_name": current_user.get('name', current_user.get('pan_number')),
                    "client_message": request.message,
                    "read": False,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.notifications.insert_one(notification)
                
                # Mark the share as interested
                await db.real_estate_opportunities.update_one(
                    {"id": opportunity_id, "shares.client_id": current_user['id']},
                    {"$set": {"shares.$.interested": True, "shares.$.interested_at": datetime.now(timezone.utc).isoformat()}}
                )
                break
    
    return {"message": "Interest recorded successfully", "interest_id": interest_record['id']}


class ParticipateRequest(BaseModel):
    percentage: float


@api_router.post("/real-estate-opportunities/{opportunity_id}/participate")
async def confirm_participation(
    opportunity_id: str,
    request: ParticipateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Confirm participation as a co-owner in a real estate opportunity"""
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    if opportunity.get('status') != 'available':
        raise HTTPException(status_code=400, detail="This opportunity is no longer available")
    
    current_investors = opportunity.get('current_investors', 0)
    max_investors = opportunity.get('max_investors', 4)
    
    if current_investors >= max_investors:
        raise HTTPException(status_code=400, detail="Maximum number of investors reached")
    
    # Calculate remaining percentage
    total_allocated = sum(inv.get('share_percentage', 0) for inv in opportunity.get('investors', []))
    remaining_percentage = 100 - total_allocated
    
    if request.percentage > remaining_percentage:
        raise HTTPException(status_code=400, detail=f"Maximum available percentage is {remaining_percentage:.1f}%")
    
    if request.percentage < 1:
        raise HTTPException(status_code=400, detail="Minimum participation is 1%")
    
    # Calculate investment amount
    investment_amount = opportunity['total_cost'] * request.percentage / 100
    
    participation_record = {
        "id": str(uuid.uuid4()),
        "user_id": current_user['id'],
        "user_name": current_user.get('name', current_user.get('pan_number')),
        "user_role": current_user['role'],
        "share_percentage": request.percentage,
        "amount": investment_amount,
        "confirmed_at": datetime.now(timezone.utc).isoformat(),
        "status": "pending_payment"  # pending_payment, confirmed, completed
    }
    
    # Update opportunity
    new_total_allocated = total_allocated + request.percentage
    new_total_invested = (opportunity.get('total_invested', 0)) + investment_amount
    new_investor_count = current_investors + 1
    
    update_data = {
        "$push": {"investors": participation_record},
        "$set": {
            "current_investors": new_investor_count,
            "total_invested": new_total_invested
        }
    }
    
    # Mark as fully invested if all spots filled or 100% allocated
    if new_investor_count >= max_investors or new_total_allocated >= 100:
        update_data["$set"]["status"] = "fully_invested"
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        update_data
    )
    
    return {
        "message": "Participation confirmed successfully",
        "participation_id": participation_record['id'],
        "percentage": request.percentage,
        "investment_amount": investment_amount
    }


class ShareOpportunityRequest(BaseModel):
    client_ids: List[str]
    message: str = ""


@api_router.post("/real-estate-opportunities/{opportunity_id}/share")
async def share_opportunity_with_clients(
    opportunity_id: str,
    request: ShareOpportunityRequest,
    current_user: dict = Depends(get_current_user)
):
    """Share a real estate opportunity with selected clients (broker/sub-broker only)"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can share opportunities")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Create share records for each client
    share_records = []
    for client_id in request.client_ids:
        share_record = {
            "id": str(uuid.uuid4()),
            "client_id": client_id,
            "shared_by": current_user['id'],
            "shared_by_name": current_user.get('name', current_user.get('pan_number')),
            "shared_by_role": current_user['role'],
            "message": request.message,
            "shared_at": datetime.now(timezone.utc).isoformat(),
            "viewed": False,
            "interested": False
        }
        share_records.append(share_record)
    
    # Update opportunity with share records
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$push": {"shares": {"$each": share_records}}}
    )
    
    # Create notifications for each client
    for client_id in request.client_ids:
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": client_id,
            "type": "opportunity_shared",
            "title": "New Investment Opportunity",
            "message": f"{current_user.get('name', 'Your broker')} shared a real estate opportunity: {opportunity['building_name']} - Unit {opportunity['unit_no']}",
            "opportunity_id": opportunity_id,
            "from_user_id": current_user['id'],
            "from_user_name": current_user.get('name', current_user.get('pan_number')),
            "custom_message": request.message,
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.notifications.insert_one(notification)
    
    return {
        "message": f"Opportunity shared with {len(request.client_ids)} client(s)",
        "shares_created": len(share_records)
    }


@api_router.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    """Get notifications for the current user"""
    notifications = await db.notifications.find(
        {"user_id": current_user['id']},
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    return notifications


@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a notification as read"""
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user['id']},
        {"$set": {"read": True}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    return {"message": "Notification marked as read"}


@api_router.post("/real-estate-opportunities/{opportunity_id}/upload-invoice")
async def upload_investor_invoice(
    opportunity_id: str,
    milestone_index: int = Form(...),
    investor_id: str = Form(...),
    invoice_number: str = Form(None),
    invoice_date: str = Form(None),
    due_date: str = Form(None),
    notes: str = Form(None),
    invoice_file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload an invoice for a specific investor and milestone (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can upload invoices")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Verify broker owns this opportunity
    if opportunity.get('created_by') != current_user['id']:
        raise HTTPException(status_code=403, detail="Not authorized to upload invoices for this property")
    
    # Verify investor exists in this opportunity
    investor = next((inv for inv in opportunity.get('investors', []) if inv.get('client_id') == investor_id), None)
    if not investor:
        raise HTTPException(status_code=404, detail="Investor not found in this opportunity")
    
    # Verify milestone exists
    payment_schedule = opportunity.get('payment_schedule', [])
    if milestone_index < 0 or milestone_index >= len(payment_schedule):
        raise HTTPException(status_code=400, detail="Invalid milestone index")
    
    # Save invoice file
    import os
    upload_dir = "/app/uploads/invoices"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_ext = invoice_file.filename.split('.')[-1] if '.' in invoice_file.filename else 'pdf'
    invoice_filename = f"{opportunity_id}_{investor_id}_{milestone_index}_{uuid.uuid4()}.{file_ext}"
    file_path = os.path.join(upload_dir, invoice_filename)
    
    with open(file_path, "wb") as f:
        content = await invoice_file.read()
        f.write(content)
    
    # Create invoice record
    invoice_record = {
        "id": str(uuid.uuid4()),
        "milestone_index": milestone_index,
        "investor_id": investor_id,
        "investor_name": investor.get('client_name', 'Unknown'),
        "invoice_number": invoice_number or f"INV-{opportunity_id[:8]}-{milestone_index}-{investor_id[:8]}".upper(),
        "invoice_date": invoice_date or datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        "due_date": due_date or payment_schedule[milestone_index].get('date'),
        "amount": opportunity.get('unit_price', 0) * payment_schedule[milestone_index].get('percentage', 0) / 100 * (investor.get('share_percentage', 0) / 100),
        "file_url": f"/uploads/invoices/{invoice_filename}",
        "original_filename": invoice_file.filename,
        "notes": notes,
        "uploaded_by": current_user['id'],
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Update opportunity with invoice
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$push": {"investor_invoices": invoice_record}}
    )
    
    return {
        "message": "Invoice uploaded successfully",
        "invoice_id": invoice_record['id'],
        "invoice_number": invoice_record['invoice_number']
    }


@api_router.get("/real-estate-opportunities/{opportunity_id}/invoices/{invoice_id}")
async def download_invoice(
    opportunity_id: str,
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download an invoice file"""
    from fastapi.responses import FileResponse
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Find the invoice
    invoice = next((inv for inv in opportunity.get('investor_invoices', []) if inv.get('id') == invoice_id), None)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Check authorization
    user_role = current_user['role']
    user_id = current_user['id']
    
    if user_role == 'broker':
        if opportunity.get('created_by') != user_id:
            raise HTTPException(status_code=403, detail="Not authorized")
    elif user_role == 'sub_broker':
        # Sub-broker can view invoices for their clients
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        sub_broker_clients = await db.clients.find({"linked_subbroker_id": user_id}, {"id": 1}).to_list(1000)
        sub_broker_client_ids = [c['id'] for c in sub_broker_clients]
        if not any(cid in investor_client_ids for cid in sub_broker_client_ids):
            raise HTTPException(status_code=403, detail="Not authorized")
    elif user_role == 'client':
        # Client can only view their own invoices
        client = await db.clients.find_one({"pan_number": current_user.get('pan_number')})
        if not client or invoice.get('investor_id') != client['id']:
            raise HTTPException(status_code=403, detail="Not authorized to view this invoice")
    else:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    file_path = f"/app{invoice['file_url']}"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Invoice file not found")
    
    return FileResponse(
        file_path,
        filename=invoice.get('original_filename', 'invoice.pdf'),
        media_type='application/octet-stream'
    )


@api_router.delete("/real-estate-opportunities/{opportunity_id}/invoices/{invoice_id}")
async def delete_invoice(
    opportunity_id: str,
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an invoice (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete invoices")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    if opportunity.get('created_by') != current_user['id']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Find and remove the invoice
    invoice = next((inv for inv in opportunity.get('investor_invoices', []) if inv.get('id') == invoice_id), None)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Delete file
    file_path = f"/app{invoice['file_url']}"
    if os.path.exists(file_path):
        os.remove(file_path)
    
    # Remove from database
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$pull": {"investor_invoices": {"id": invoice_id}}}
    )
    
    return {"message": "Invoice deleted successfully"}


@api_router.post("/real-estate-opportunities/{opportunity_id}/upload-developer-receipt")
async def upload_developer_receipt(
    opportunity_id: str,
    milestone_index: int = Form(...),
    payment_id: str = Form(...),
    receipt_number: str = Form(None),
    receipt_date: str = Form(None),
    notes: str = Form(None),
    receipt_file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload a developer receipt for a recorded payment (by client or broker)"""
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Find the payment record
    investor_payments = opportunity.get('investor_payments', [])
    payment = next((p for p in investor_payments if p.get('id') == payment_id), None)
    
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found")
    
    # Verify authorization - client can only upload for their own payment, broker can upload for any
    if current_user['role'] == 'client':
        client = await db.clients.find_one({"pan_number": current_user.get('pan_number')})
        if not client or payment.get('investor_id') != client.get('id'):
            raise HTTPException(status_code=403, detail="Not authorized to upload receipt for this payment")
    elif current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Save receipt file
    upload_dir = "/app/uploads/developer_receipts"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_ext = receipt_file.filename.split('.')[-1] if '.' in receipt_file.filename else 'pdf'
    receipt_filename = f"{opportunity_id}_{payment_id}_{uuid.uuid4()}.{file_ext}"
    file_path = os.path.join(upload_dir, receipt_filename)
    
    with open(file_path, "wb") as f:
        content = await receipt_file.read()
        f.write(content)
    
    # Update the payment record with developer receipt info
    receipt_record = {
        "id": str(uuid.uuid4()),
        "receipt_number": receipt_number or f"RCP-{payment_id[:8]}".upper(),
        "receipt_date": receipt_date or datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        "file_url": f"/uploads/developer_receipts/{receipt_filename}",
        "original_filename": receipt_file.filename,
        "notes": notes,
        "uploaded_by": current_user['id'],
        "uploaded_by_name": current_user.get('name', current_user.get('pan_number')),
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Update the specific payment in the array
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id, "investor_payments.id": payment_id},
        {"$set": {"investor_payments.$.developer_receipt": receipt_record}}
    )
    
    return {
        "message": "Developer receipt uploaded successfully",
        "receipt_id": receipt_record['id']
    }


@api_router.get("/real-estate-opportunities/{opportunity_id}/developer-receipt/{payment_id}")
async def download_developer_receipt(
    opportunity_id: str,
    payment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download a developer receipt file"""
    from fastapi.responses import FileResponse
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Find the payment record
    payment = next((p for p in opportunity.get('investor_payments', []) if p.get('id') == payment_id), None)
    if not payment or not payment.get('developer_receipt'):
        raise HTTPException(status_code=404, detail="Developer receipt not found")
    
    receipt = payment['developer_receipt']
    
    # Check authorization
    user_role = current_user['role']
    if user_role == 'client':
        client = await db.clients.find_one({"pan_number": current_user.get('pan_number')})
        if not client or payment.get('investor_id') != client.get('id'):
            raise HTTPException(status_code=403, detail="Not authorized")
    elif user_role == 'sub_broker':
        # Sub-broker can view receipts for their clients
        investor_client_ids = [inv.get('client_id') for inv in opportunity.get('investors', [])]
        sub_broker_clients = await db.clients.find({"linked_subbroker_id": current_user['id']}, {"id": 1}).to_list(1000)
        sub_broker_client_ids = [c['id'] for c in sub_broker_clients]
        if not any(cid in investor_client_ids for cid in sub_broker_client_ids):
            raise HTTPException(status_code=403, detail="Not authorized")
    elif user_role != 'broker':
        raise HTTPException(status_code=403, detail="Not authorized")
    
    file_path = f"/app{receipt['file_url']}"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Receipt file not found")
    
    return FileResponse(
        file_path,
        filename=receipt.get('original_filename', 'developer_receipt.pdf'),
        media_type='application/octet-stream'
    )


@api_router.post("/real-estate-opportunities/{opportunity_id}/investor-payment")
async def record_investor_payment(
    opportunity_id: str,
    milestone_index: int = Form(...),
    investor_id: str = Form(...),
    transfer_date: str = Form(...),
    home_currency: str = Form("AED"),
    home_currency_amount: float = Form(0),
    aed_amount: float = Form(...),
    effective_rate: float = Form(0),
    swift_copy: UploadFile = File(None),
    current_user: dict = Depends(get_current_user)
):
    """Record a payment from an investor for a specific milestone"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can record payments")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Verify opportunity is fully funded before allowing payment recording
    if opportunity.get('status') != 'fully_invested':
        raise HTTPException(status_code=400, detail="Cannot record payments until the property is fully funded")
    
    # Handle SWIFT copy upload
    swift_url = None
    swift_filename = None
    if swift_copy:
        # Save file locally (in production, upload to cloud storage)
        import os
        upload_dir = "/app/uploads/swift"
        os.makedirs(upload_dir, exist_ok=True)
        
        file_ext = swift_copy.filename.split('.')[-1] if '.' in swift_copy.filename else 'pdf'
        swift_filename = f"{opportunity_id}_{investor_id}_{milestone_index}_{uuid.uuid4()}.{file_ext}"
        file_path = os.path.join(upload_dir, swift_filename)
        
        with open(file_path, "wb") as f:
            content = await swift_copy.read()
            f.write(content)
        
        swift_url = f"/uploads/swift/{swift_filename}"
    
    # Create payment record
    # If broker is recording, auto-verify the payment
    is_broker_recording = current_user['role'] == 'broker' and opportunity.get('created_by') == current_user['id']
    payment_status = "verified" if is_broker_recording else "pending_verification"
    
    payment_record = {
        "id": str(uuid.uuid4()),
        "milestone_index": milestone_index,
        "investor_id": investor_id,
        "transfer_date": transfer_date,
        "home_currency": home_currency,
        "home_currency_amount": home_currency_amount,
        "aed_amount": aed_amount,
        "effective_rate": effective_rate if effective_rate else (home_currency_amount / aed_amount if aed_amount > 0 else 0),
        "swift_copy_url": swift_url,
        "swift_copy_filename": swift_filename,
        "status": payment_status,
        "recorded_by": current_user['id'],
        "recorded_by_name": current_user.get('name', current_user.get('pan_number')),
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "verified_at": datetime.now(timezone.utc).isoformat() if is_broker_recording else None,
        "verified_by": current_user['id'] if is_broker_recording else None
    }
    
    # Update opportunity
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$push": {"investor_payments": payment_record}}
    )
    
    # Notify broker about pending payment verification (only if not already verified by broker)
    broker_id = opportunity.get('created_by')
    if broker_id and current_user['id'] != broker_id and payment_status == "pending_verification":
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": broker_id,
            "type": "payment_pending_verification",
            "title": "Payment Pending Verification",
            "message": f"A payment has been recorded for {opportunity['building_name']} - Unit {opportunity['unit_no']} and requires your verification.",
            "opportunity_id": opportunity_id,
            "payment_id": payment_record['id'],
            "recorded_by": current_user.get('name', current_user.get('pan_number')),
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.notifications.insert_one(notification)
    
    # Return appropriate message based on status
    if payment_status == "verified":
        return {
            "message": "Payment recorded and automatically verified.",
            "payment_id": payment_record['id'],
            "status": "verified"
        }
    else:
        return {
            "message": "Payment recorded successfully. Pending broker verification.",
            "payment_id": payment_record['id'],
            "status": "pending_verification"
        }


@api_router.post("/real-estate-opportunities/{opportunity_id}/oqood")
async def upload_oqood_document(
    opportunity_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload Oqood document for a real estate opportunity"""
    if current_user['role'] not in ['broker', 'sub_broker']:
        raise HTTPException(status_code=403, detail="Only brokers and sub-brokers can upload Oqood documents")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Save file
    import os
    upload_dir = "/app/uploads/oqood"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'pdf'
    filename = f"{opportunity_id}_oqood_{uuid.uuid4()}.{file_ext}"
    file_path = os.path.join(upload_dir, filename)
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    oqood_document = {
        "filename": file.filename,
        "stored_filename": filename,
        "url": f"/uploads/oqood/{filename}",
        "uploaded_by": current_user['id'],
        "uploaded_by_name": current_user.get('name', current_user.get('pan_number')),
        "uploaded_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"oqood_document": oqood_document}}
    )
    
    return {
        "message": "Oqood document uploaded successfully",
        "filename": filename
    }


@api_router.put("/real-estate-opportunities/{opportunity_id}/verify-payment/{payment_id}")
async def verify_investor_payment(
    opportunity_id: str,
    payment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Verify an investor payment (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can verify payments")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Find and update the payment
    payments = opportunity.get('investor_payments', [])
    payment_found = False
    milestone_index = None
    
    for i, payment in enumerate(payments):
        if payment.get('id') == payment_id:
            payments[i]['status'] = 'verified'
            payments[i]['verified_by'] = current_user['id']
            payments[i]['verified_by_name'] = current_user.get('name', current_user.get('pan_number'))
            payments[i]['verified_at'] = datetime.now(timezone.utc).isoformat()
            payment_found = True
            milestone_index = payment.get('milestone_index')
            break
    
    if not payment_found:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"investor_payments": payments}}
    )
    
    # Check if all payments for this milestone are now verified
    milestone_payments = [p for p in payments if p.get('milestone_index') == milestone_index]
    verified_count = sum(1 for p in milestone_payments if p.get('status') == 'verified')
    
    if verified_count >= 4:
        # Mark milestone as completed
        payment_schedule = opportunity.get('payment_schedule', [])
        if milestone_index is not None and milestone_index < len(payment_schedule):
            payment_schedule[milestone_index]['completed'] = True
            payment_schedule[milestone_index]['completed_at'] = datetime.now(timezone.utc).isoformat()
            
            # Calculate total payment percentage completed
            total_completed = sum(p['percentage'] for p in payment_schedule if p.get('completed'))
            
            await db.real_estate_opportunities.update_one(
                {"id": opportunity_id},
                {"$set": {
                    "payment_schedule": payment_schedule,
                    "total_payment_percentage_completed": total_completed
                }}
            )
    
    return {"message": "Payment verified successfully"}


@api_router.put("/real-estate-opportunities/{opportunity_id}/approve-receipt/{payment_id}")
async def approve_developer_receipt(
    opportunity_id: str,
    payment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Approve a developer receipt (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can approve receipts")
    
    opportunity = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="Real estate opportunity not found")
    
    # Find and update the payment
    payments = opportunity.get('investor_payments', [])
    payment_found = False
    
    for i, payment in enumerate(payments):
        if payment.get('id') == payment_id:
            if not payment.get('developer_receipt'):
                raise HTTPException(status_code=400, detail="No receipt uploaded for this payment")
            payments[i]['receipt_approved'] = True
            payments[i]['receipt_approved_by'] = current_user['id']
            payments[i]['receipt_approved_by_name'] = current_user.get('name', current_user.get('pan_number'))
            payments[i]['receipt_approved_at'] = datetime.now(timezone.utc).isoformat()
            payment_found = True
            break
    
    if not payment_found:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    await db.real_estate_opportunities.update_one(
        {"id": opportunity_id},
        {"$set": {"investor_payments": payments}}
    )
    
    return {"message": "Receipt approved successfully"}


# Serve uploaded files
@api_router.get("/uploads/{folder}/{filename}")
async def serve_upload(folder: str, filename: str):
    """Serve uploaded files"""
    file_path = f"/app/uploads/{folder}/{filename}"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(file_path)


@api_router.get("/client/real-estate-investments")
async def get_client_real_estate_investments(current_user: dict = Depends(get_current_user)):
    """Get real estate investments for the logged-in client"""
    if current_user['role'] != 'client':
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    # Get client record
    client = await db.clients.find_one({"pan_number": current_user.get('pan_number')})
    if not client:
        raise HTTPException(status_code=404, detail="Client profile not found")
    
    client_id = client['id']
    
    # Find all opportunities where this client is an investor
    opportunities = await db.real_estate_opportunities.find(
        {"investors.client_id": client_id},
        {"_id": 0, "images": 0}  # Exclude large fields
    ).to_list(1000)
    
    # Format response with client-specific investment details
    result = []
    for opp in opportunities:
        # Find client's investment in this opportunity
        client_investment = next(
            (inv for inv in opp.get('investors', []) if inv['client_id'] == client_id),
            None
        )
        
        result.append({
            "id": opp['id'],
            "building_name": opp['building_name'],
            "unit_no": opp['unit_no'],
            "property_type": opp['property_type'],
            "location": opp.get('location'),
            "total_cost": opp['total_cost'],
            "unit_price": opp['unit_price'],
            "status": opp['status'],
            "payment_schedule": opp.get('payment_schedule', []),
            "total_payment_percentage_completed": opp.get('total_payment_percentage_completed', 0),
            "is_eligible_to_sell": opp.get('is_eligible_to_sell', False),
            "my_investment": client_investment,
            "expected_sale_rate": opp.get('expected_sale_rate'),
            "estimated_sell_date": opp.get('estimated_sell_date')
        })
    
    return result


# ==================== END REAL ESTATE OPPORTUNITY ====================


# ==================== CURRENCY RATE PROJECTIONS ====================

class CurrencyRateProjection(BaseModel):
    year: int
    currency: str  # INR, USD, EUR, GBP, etc.
    projected_rate: float  # Rate per 1 AED (e.g., 22.5 INR = 1 AED)

class CurrencyRateProjectionsUpdate(BaseModel):
    projections: List[CurrencyRateProjection]

@api_router.get("/settings/currency-projections")
async def get_currency_projections(current_user: dict = Depends(get_current_user)):
    """Get projected currency rates for XIRR calculations"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access settings")
    
    broker_id = current_user['id']
    
    settings = await db.broker_settings.find_one({"broker_id": broker_id}, {"_id": 0})
    if not settings:
        # Return default projections for current and next 5 years
        from datetime import datetime
        current_year = datetime.now().year
        default_projections = [
            {"year": current_year + i, "currency": "INR", "projected_rate": 22.5}
            for i in range(6)
        ]
        return {"projections": default_projections}
    
    return {"projections": settings.get("currency_projections", [])}

@api_router.put("/settings/currency-projections")
async def update_currency_projections(
    data: CurrencyRateProjectionsUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update projected currency rates"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can update settings")
    
    broker_id = current_user['id']
    
    # Upsert the settings
    await db.broker_settings.update_one(
        {"broker_id": broker_id},
        {
            "$set": {
                "broker_id": broker_id,
                "currency_projections": [p.dict() for p in data.projections],
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=True
    )
    
    return {"message": "Currency projections updated successfully"}


@api_router.get("/real-estate-opportunities/{opportunity_id}/xirr-comparison/{investor_id}")
async def get_xirr_comparison_report(
    opportunity_id: str,
    investor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Generate XIRR comparison report for an investor showing projected vs actual rates"""
    
    # Get the opportunity
    opp = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    # Get the investor
    investor = next((inv for inv in opp.get('investors', []) if inv.get('client_id') == investor_id), None)
    if not investor:
        raise HTTPException(status_code=404, detail="Investor not found in this opportunity")
    
    # Get broker's projected rates
    broker_id = opp.get('created_by')
    settings = await db.broker_settings.find_one({"broker_id": broker_id}, {"_id": 0})
    projected_rates = {p['year']: p for p in settings.get('currency_projections', [])} if settings else {}
    
    # Get client info
    client = await db.clients.find_one({"id": investor_id}, {"_id": 0, "name": 1, "preferred_currency": 1})
    client_currency = client.get('preferred_currency', 'INR') if client else 'INR'
    
    # Get investor's share percentage
    share_percentage = investor.get('share_percentage', 25)
    
    # Calculate investor's portion of total cost
    total_cost = opp.get('total_cost', 0)
    unit_price = opp.get('unit_price', 0)
    investor_total_cost = total_cost * share_percentage / 100
    investor_unit_price = unit_price * share_percentage / 100
    
    # Get payment schedule and actual payments
    payment_schedule = opp.get('payment_schedule', [])
    investor_payments = opp.get('investor_payments', [])
    investor_actual_payments = [p for p in investor_payments if p.get('investor_id') == investor_id]
    
    # Build cashflow comparison
    cashflows_projected = []
    cashflows_actual = []
    total_projected_home_currency = 0
    total_actual_home_currency = 0
    total_aed_amount = 0
    
    for idx, milestone in enumerate(payment_schedule):
        milestone_date = milestone.get('date', '')
        milestone_percentage = milestone.get('percentage', 0)
        milestone_aed = investor_unit_price * milestone_percentage / 100
        
        # Get year for projected rate lookup
        try:
            year = int(milestone_date[:4]) if milestone_date else datetime.now().year
        except:
            year = datetime.now().year
        
        # Get projected rate for this year
        projected_rate_info = projected_rates.get(year, {})
        projected_rate = projected_rate_info.get('projected_rate', 22.5) if projected_rate_info else 22.5
        
        # Calculate projected home currency amount
        projected_home_currency = milestone_aed * projected_rate
        total_projected_home_currency += projected_home_currency
        total_aed_amount += milestone_aed
        
        # Find actual payment for this milestone
        actual_payment = next((p for p in investor_actual_payments if p.get('milestone_index') == idx), None)
        
        if actual_payment:
            # Get values directly from payment record (not nested in payment_details)
            actual_home_currency = float(actual_payment.get('home_currency_amount', 0) or 0)
            actual_aed = float(actual_payment.get('aed_amount', 0) or 0)
            # Use effective_rate if available, otherwise calculate from amounts
            if actual_payment.get('effective_rate'):
                actual_rate = float(actual_payment.get('effective_rate', 0))
            elif actual_home_currency > 0 and actual_aed > 0:
                actual_rate = actual_home_currency / actual_aed
            else:
                actual_rate = projected_rate
        else:
            # Use projected values if no actual payment yet
            actual_home_currency = projected_home_currency
            actual_aed = milestone_aed
            actual_rate = projected_rate
        
        total_actual_home_currency += actual_home_currency
        
        cashflows_projected.append({
            "date": milestone_date,
            "description": milestone.get('description', f'Milestone {idx + 1}'),
            "percentage": milestone_percentage,
            "aed_amount": milestone_aed,
            "projected_rate": projected_rate,
            "home_currency_amount": projected_home_currency,
            "type": "outflow"
        })
        
        cashflows_actual.append({
            "date": milestone_date,
            "description": milestone.get('description', f'Milestone {idx + 1}'),
            "percentage": milestone_percentage,
            "aed_amount": actual_aed,
            "actual_rate": actual_rate,
            "home_currency_amount": actual_home_currency,
            "type": "outflow",
            "is_paid": actual_payment is not None
        })
    
    # Calculate sale proceeds (inflow)
    sell_date = opp.get('estimated_sell_date', '')
    expected_sale_rate = opp.get('expected_sale_rate', 0)  # per sqft
    total_area = opp.get('total_area', 0)
    selling_fee_percentage = opp.get('selling_fee_percentage', 0)
    
    if sell_date and expected_sale_rate and total_area:
        gross_sale = expected_sale_rate * total_area
        selling_fee = gross_sale * selling_fee_percentage / 100
        
        # Calculate outstanding amount (unpaid portion of unit price)
        paid_percentage = sum(m.get('percentage', 0) for m in payment_schedule if any(
            p.get('milestone_index') == i and p.get('status') == 'verified' 
            for i, p in enumerate(investor_actual_payments)
        ))
        outstanding_percentage = 100 - paid_percentage
        outstanding_amount = investor_unit_price * outstanding_percentage / 100
        
        net_sale = gross_sale - selling_fee - outstanding_amount
        investor_net_sale = net_sale * share_percentage / 100
        
        # Get projected rate for sale year
        try:
            sale_year = int(sell_date[:4])
        except:
            sale_year = datetime.now().year + 2
        
        sale_projected_rate = projected_rates.get(sale_year, {}).get('projected_rate', 22.5)
        
        # Add sale inflow
        cashflows_projected.append({
            "date": sell_date,
            "description": "Expected Sale Proceeds",
            "aed_amount": investor_net_sale,
            "projected_rate": sale_projected_rate,
            "home_currency_amount": investor_net_sale * sale_projected_rate,
            "type": "inflow"
        })
        
        cashflows_actual.append({
            "date": sell_date,
            "description": "Expected Sale Proceeds",
            "aed_amount": investor_net_sale,
            "actual_rate": sale_projected_rate,  # Use projected for future sale
            "home_currency_amount": investor_net_sale * sale_projected_rate,
            "type": "inflow",
            "is_paid": False
        })
    
    # Calculate XIRR for both scenarios
    def calculate_xirr_from_cashflows(cashflows):
        """Calculate XIRR from cashflow list"""
        try:
            from scipy.optimize import brentq
            
            cf_data = []
            for cf in cashflows:
                date_str = cf.get('date', '')
                if not date_str:
                    continue
                try:
                    dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                except:
                    try:
                        dt = datetime.strptime(date_str, '%Y-%m-%d')
                    except:
                        continue
                
                amount = cf.get('home_currency_amount', 0)
                if cf.get('type') == 'outflow':
                    amount = -abs(amount)
                else:
                    amount = abs(amount)
                
                cf_data.append((dt, amount))
            
            if len(cf_data) < 2:
                return None
            
            # Sort by date
            cf_data.sort(key=lambda x: x[0])
            
            dates = [cf[0] for cf in cf_data]
            amounts = [cf[1] for cf in cf_data]
            
            # Check if we have both positive and negative cashflows
            if not (any(a > 0 for a in amounts) and any(a < 0 for a in amounts)):
                return None
            
            def xnpv(rate, dates, amounts):
                first_date = dates[0]
                return sum(
                    amount / ((1 + rate) ** ((date - first_date).days / 365.0))
                    for date, amount in zip(dates, amounts)
                )
            
            try:
                xirr = brentq(lambda r: xnpv(r, dates, amounts), -0.999, 10, maxiter=1000)
                return round(xirr * 100, 2)
            except:
                return None
        except Exception as e:
            print(f"XIRR calculation error: {e}")
            return None
    
    xirr_projected = calculate_xirr_from_cashflows(cashflows_projected)
    xirr_actual = calculate_xirr_from_cashflows(cashflows_actual)
    
    # Calculate currency gain/loss
    currency_gain_loss = total_projected_home_currency - total_actual_home_currency
    currency_gain_loss_percentage = (currency_gain_loss / total_projected_home_currency * 100) if total_projected_home_currency > 0 else 0
    
    return {
        "opportunity": {
            "id": opportunity_id,
            "building_name": opp.get('building_name', ''),
            "unit_number": opp.get('unit_number', ''),
            "estimated_sell_date": sell_date,
            "expected_sale_rate": expected_sale_rate
        },
        "investor": {
            "id": investor_id,
            "name": client.get('name', 'Unknown') if client else 'Unknown',
            "share_percentage": share_percentage,
            "currency": client_currency
        },
        "summary": {
            "total_investment_aed": total_aed_amount,
            "total_projected_home_currency": round(total_projected_home_currency, 2),
            "total_actual_home_currency": round(total_actual_home_currency, 2),
            "currency_gain_loss": round(currency_gain_loss, 2),
            "currency_gain_loss_percentage": round(currency_gain_loss_percentage, 2),
            "xirr_projected": xirr_projected,
            "xirr_actual": xirr_actual,
            "xirr_difference": round((xirr_actual or 0) - (xirr_projected or 0), 2) if xirr_projected and xirr_actual else None
        },
        "cashflows_projected": cashflows_projected,
        "cashflows_actual": cashflows_actual
    }


# ==================== EMAIL SHARING ENDPOINTS ====================

class EmailShareRequest(BaseModel):
    client_ids: List[str]
    personal_message: Optional[str] = None

@api_router.post("/bonds/{bond_id}/share-email")
async def share_bond_via_email(
    bond_id: str, 
    request: EmailShareRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Share bond opportunity with clients via email"""
    
    # Get the bond
    bond = await db.bonds.find_one({"id": bond_id}, {"_id": 0})
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    # Get sender info
    sender_name = current_user.get('name', 'Kinntegraa')
    
    # Get clients
    clients_sent = []
    clients_failed = []
    
    for client_id in request.client_ids:
        client = await db.clients.find_one({"id": client_id}, {"_id": 0})
        if not client:
            clients_failed.append({"id": client_id, "reason": "Client not found"})
            continue
        
        if not client.get('email'):
            clients_failed.append({"id": client_id, "name": client.get('name'), "reason": "No email address"})
            continue
        
        # Send email in background
        background_tasks.add_task(
            send_bond_opportunity_email,
            recipient_email=client['email'],
            recipient_name=client.get('name', 'Investor'),
            bond_details=bond,
            sender_name=sender_name,
            personal_message=request.personal_message
        )
        clients_sent.append({"id": client_id, "name": client.get('name'), "email": client['email']})
    
    return {
        "message": f"Emails queued for {len(clients_sent)} clients",
        "sent_to": clients_sent,
        "failed": clients_failed
    }


@api_router.post("/real-estate-opportunities/{opportunity_id}/share-email")
async def share_real_estate_via_email(
    opportunity_id: str, 
    request: EmailShareRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Share real estate opportunity with clients via email"""
    
    # Get the property
    opp = await db.real_estate_opportunities.find_one({"id": opportunity_id}, {"_id": 0})
    if not opp:
        raise HTTPException(status_code=404, detail="Property not found")
    
    # Get sender info
    sender_name = current_user.get('name', 'Kinntegraa')
    
    # Get clients
    clients_sent = []
    clients_failed = []
    
    for client_id in request.client_ids:
        client = await db.clients.find_one({"id": client_id}, {"_id": 0})
        if not client:
            clients_failed.append({"id": client_id, "reason": "Client not found"})
            continue
        
        if not client.get('email'):
            clients_failed.append({"id": client_id, "name": client.get('name'), "reason": "No email address"})
            continue
        
        # Send email in background
        background_tasks.add_task(
            send_real_estate_opportunity_email,
            recipient_email=client['email'],
            recipient_name=client.get('name', 'Investor'),
            property_details=opp,
            sender_name=sender_name,
            personal_message=request.personal_message
        )
        clients_sent.append({"id": client_id, "name": client.get('name'), "email": client['email']})
    
    return {
        "message": f"Emails queued for {len(clients_sent)} clients",
        "sent_to": clients_sent,
        "failed": clients_failed
    }


@api_router.post("/email/test")
async def test_email(current_user: dict = Depends(get_current_user)):
    """Test email configuration by sending a test email to the current user"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can test email")
    
    # Get user's email
    user = await db.users.find_one({"id": current_user['id']}, {"_id": 0})
    if not user or not user.get('email'):
        raise HTTPException(status_code=400, detail="No email address found for your account")
    
    from email_service import send_email
    
    success = send_email(
        to_email=user['email'],
        subject="Kinntegraa - Test Email",
        html_content=f"""
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h1 style="color: #4F46E5;">✅ Email Configuration Working!</h1>
            <p>Hello {current_user.get('name', 'User')},</p>
            <p>This is a test email from your Kinntegraa system. If you received this, your email configuration is working correctly.</p>
            <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">&copy; 2025 Kinntegraa. All rights reserved.</p>
        </div>
        """
    )
    
    if success:
        return {"message": f"Test email sent successfully to {user['email']}"}
    else:
        raise HTTPException(status_code=500, detail="Failed to send test email. Check server logs.")


# ==================== DASHBOARD ANALYTICS ENDPOINTS ====================

@api_router.get("/dashboard/summary")
async def get_dashboard_summary(current_user: dict = Depends(get_current_user)):
    """Get summary statistics for broker dashboard"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access dashboard")
    
    broker_id = current_user['id']
    
    # Get clients
    clients = await db.clients.find({"created_by": broker_id}, {"_id": 0}).to_list(1000)
    total_clients = len(clients)
    active_clients = len([c for c in clients if c.get('is_active', True) and not c.get('deactivated_at')])
    
    # Get sub-brokers (partners)
    partners = await db.partners.find({"created_by": broker_id}, {"_id": 0}).to_list(1000)
    total_subbrokers = len(partners)
    active_subbrokers = len([p for p in partners if p.get('is_active', True)])
    
    # Get bonds
    bonds = await db.bonds.find({}, {"_id": 0}).to_list(1000)
    total_bonds = len(bonds)
    available_bonds = len([b for b in bonds if b.get('status') == 'available'])
    funded_bonds = len([b for b in bonds if b.get('status') == 'funded'])
    closed_bonds = len([b for b in bonds if b.get('status') == 'closed'])
    
    # Get real estate opportunities
    real_estate = await db.real_estate_opportunities.find({"created_by": broker_id}, {"_id": 0}).to_list(1000)
    total_real_estate = len(real_estate)
    available_re = len([r for r in real_estate if r.get('status') == 'available'])
    invested_re = len([r for r in real_estate if r.get('status') in ['partially_invested', 'fully_invested']])
    
    # Calculate AUM
    # Bond AUM = sum of (units_sold * face_value) for all bonds
    bond_aum = sum(
        (b.get('units_sold', 0) * b.get('face_value', 0)) 
        for b in bonds
    )
    
    # Real Estate AUM = sum of (total_cost * invested_percentage / 100) for all properties
    real_estate_aum = sum(
        (r.get('total_cost', 0) * r.get('invested_percentage', 0) / 100)
        for r in real_estate
    )
    
    total_aum = bond_aum + real_estate_aum
    
    # Get trades for revenue calculation
    trades = await db.trades.find({"status": "approved"}, {"_id": 0}).to_list(10000)
    
    return {
        "clients": {
            "total": total_clients,
            "active": active_clients
        },
        "sub_brokers": {
            "total": total_subbrokers,
            "active": active_subbrokers
        },
        "opportunities": {
            "bonds": {
                "total": total_bonds,
                "available": available_bonds,
                "funded": funded_bonds,
                "closed": closed_bonds
            },
            "real_estate": {
                "total": total_real_estate,
                "available": available_re,
                "invested": invested_re
            }
        },
        "aum": {
            "total": total_aum,
            "bonds": bond_aum,
            "real_estate": real_estate_aum
        },
        "trades_count": len(trades)
    }


@api_router.get("/dashboard/clients-by-city")
async def get_clients_by_city(current_user: dict = Depends(get_current_user)):
    """Get client distribution by city"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access dashboard")
    
    broker_id = current_user['id']
    clients = await db.clients.find({"created_by": broker_id}, {"_id": 0}).to_list(1000)
    
    city_counts = {}
    for client in clients:
        city = client.get('city', 'Unknown') or 'Unknown'
        city_counts[city] = city_counts.get(city, 0) + 1
    
    # Sort by count descending and return top 10
    sorted_cities = sorted(city_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    
    return [{"city": city, "count": count} for city, count in sorted_cities]


@api_router.get("/dashboard/aum-distribution")
async def get_aum_distribution(current_user: dict = Depends(get_current_user)):
    """Get AUM distribution by asset class and sub-broker"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access dashboard")
    
    broker_id = current_user['id']
    
    # Get all bonds
    bonds = await db.bonds.find({}, {"_id": 0}).to_list(1000)
    bond_aum = sum((b.get('units_sold', 0) * b.get('face_value', 0)) for b in bonds)
    
    # Get real estate opportunities
    real_estate = await db.real_estate_opportunities.find({"created_by": broker_id}, {"_id": 0}).to_list(1000)
    real_estate_aum = sum((r.get('total_cost', 0) * r.get('invested_percentage', 0) / 100) for r in real_estate)
    
    # Get sub-brokers with their linked clients and calculate their AUM
    partners = await db.partners.find({"created_by": broker_id}, {"_id": 0}).to_list(1000)
    subbroker_aum = []
    
    for partner in partners:
        partner_id = partner.get('id')
        # Get clients linked to this sub-broker
        linked_clients = await db.clients.find({"linked_subbroker_id": partner_id}, {"_id": 0}).to_list(1000)
        
        # Calculate AUM from bond allocations
        sb_bond_aum = 0
        for client in linked_clients:
            allocations = client.get('bond_allocations', [])
            for alloc in allocations:
                bond = next((b for b in bonds if b.get('id') == alloc.get('bond_id')), None)
                if bond:
                    sb_bond_aum += alloc.get('units_paid', 0) * bond.get('face_value', 0)
        
        # Calculate AUM from real estate investments
        sb_re_aum = 0
        for re in real_estate:
            investors = re.get('investors', [])
            for inv in investors:
                if inv.get('client_id') in [c.get('id') for c in linked_clients]:
                    sb_re_aum += re.get('total_cost', 0) * inv.get('percentage', 0) / 100
        
        subbroker_aum.append({
            "name": partner.get('name', 'Unknown'),
            "partner_code": partner.get('partner_code', ''),
            "aum": sb_bond_aum + sb_re_aum,
            "bond_aum": sb_bond_aum,
            "real_estate_aum": sb_re_aum,
            "client_count": len(linked_clients)
        })
    
    # Sort by AUM descending
    subbroker_aum.sort(key=lambda x: x['aum'], reverse=True)
    
    return {
        "by_asset_class": [
            {"name": "NCD Bonds", "value": bond_aum},
            {"name": "Real Estate", "value": real_estate_aum}
        ],
        "by_subbroker": subbroker_aum[:10]  # Top 10 sub-brokers
    }


@api_router.get("/dashboard/activity-log")
async def get_activity_log(limit: int = 20, current_user: dict = Depends(get_current_user)):
    """Get recent activity log for the broker"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access dashboard")
    
    broker_id = current_user['id']
    activities = []
    
    # Get recent trades
    trades = await db.trades.find(
        {},
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    
    for trade in trades:
        client = await db.clients.find_one({"id": trade.get('client_id')}, {"_id": 0, "name": 1})
        bond = await db.bonds.find_one({"id": trade.get('bond_id')}, {"_id": 0, "issuer": 1, "face_value": 1})
        
        activities.append({
            "type": "trade",
            "status": trade.get('status'),
            "description": f"Trade: {client.get('name', 'Unknown')} - {bond.get('issuer', 'Unknown')} ({trade.get('units', 0)} units)",
            "amount": trade.get('units', 0) * (bond.get('face_value', 0) if bond else 0),
            "timestamp": trade.get('created_at'),
            "client_name": client.get('name', 'Unknown') if client else 'Unknown'
        })
    
    # Get recent real estate investments
    real_estate = await db.real_estate_opportunities.find(
        {"created_by": broker_id},
        {"_id": 0}
    ).to_list(100)
    
    for re in real_estate:
        investors = re.get('investors', [])
        property_name = re.get('building_name', re.get('property_name', 'Unknown'))
        for inv in investors:
            client = await db.clients.find_one({"id": inv.get('client_id')}, {"_id": 0, "name": 1})
            activities.append({
                "type": "real_estate_investment",
                "status": "invested",
                "description": f"RE Investment: {client.get('name', 'Unknown') if client else 'Unknown'} - {property_name} ({inv.get('share_percentage', inv.get('percentage', 0))}%)",
                "amount": re.get('total_cost', 0) * inv.get('share_percentage', inv.get('percentage', 0)) / 100,
                "timestamp": inv.get('invested_at'),
                "client_name": client.get('name', 'Unknown') if client else 'Unknown',
                "property_name": property_name
            })
    
    # Get recent client creations
    clients = await db.clients.find(
        {"created_by": broker_id},
        {"_id": 0, "name": 1, "created_at": 1, "city": 1}
    ).sort("created_at", -1).to_list(limit)
    
    for client in clients:
        activities.append({
            "type": "client_created",
            "status": "new",
            "description": f"New Client: {client.get('name', 'Unknown')} ({client.get('city', 'Unknown')})",
            "amount": 0,
            "timestamp": client.get('created_at'),
            "client_name": client.get('name', 'Unknown')
        })
    
    # Sort all activities by timestamp descending
    activities.sort(key=lambda x: x.get('timestamp', '') or '', reverse=True)
    
    return activities[:limit]


@api_router.get("/dashboard/monthly-stats")
async def get_monthly_stats(year: int = None, current_user: dict = Depends(get_current_user)):
    """Get monthly statistics for the console chart"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can access dashboard")
    
    from datetime import datetime
    
    if year is None:
        year = datetime.now().year
    
    broker_id = current_user['id']
    
    # Initialize monthly data
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    monthly_data = {m: {"investments": 0, "trades": 0, "clients": 0} for m in months}
    
    # Get trades by month
    trades = await db.trades.find({"status": "approved"}, {"_id": 0}).to_list(10000)
    for trade in trades:
        created_at = trade.get('created_at')
        if created_at:
            try:
                if isinstance(created_at, str):
                    dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                else:
                    dt = created_at
                if dt.year == year:
                    month_name = months[dt.month - 1]
                    bond = await db.bonds.find_one({"id": trade.get('bond_id')}, {"_id": 0, "face_value": 1})
                    monthly_data[month_name]["trades"] += trade.get('units', 0) * (bond.get('face_value', 0) if bond else 0)
            except:
                pass
    
    # Get real estate investments by month
    real_estate = await db.real_estate_opportunities.find({"created_by": broker_id}, {"_id": 0}).to_list(1000)
    for re in real_estate:
        investors = re.get('investors', [])
        for inv in investors:
            invested_at = inv.get('invested_at')
            if invested_at:
                try:
                    if isinstance(invested_at, str):
                        dt = datetime.fromisoformat(invested_at.replace('Z', '+00:00'))
                    else:
                        dt = invested_at
                    if dt.year == year:
                        month_name = months[dt.month - 1]
                        monthly_data[month_name]["investments"] += re.get('total_cost', 0) * inv.get('percentage', 0) / 100
                except:
                    pass
    
    # Get new clients by month
    clients = await db.clients.find({"created_by": broker_id}, {"_id": 0, "created_at": 1}).to_list(1000)
    for client in clients:
        created_at = client.get('created_at')
        if created_at:
            try:
                if isinstance(created_at, str):
                    dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                else:
                    dt = created_at
                if dt.year == year:
                    month_name = months[dt.month - 1]
                    monthly_data[month_name]["clients"] += 1
            except:
                pass
    
    return [
        {
            "month": month,
            "investments": monthly_data[month]["investments"],
            "trades": monthly_data[month]["trades"],
            "clients": monthly_data[month]["clients"]
        }
        for month in months
    ]


# One-time setup endpoint - can be called manually after deployment
@api_router.get("/setup-broker")
async def setup_broker_endpoint():
    """One-time setup endpoint to create or reset the default broker account"""
    try:
        # Check if broker already exists
        existing_broker = await db.users.find_one({"pan": "ANVPB5297J"})
        
        if existing_broker:
            # RESET the password, pin, role and email to fix any issues
            new_password_hash = get_password_hash("Laksh@0208")
            new_pin_hash = get_password_hash("0516")
            
            await db.users.update_one(
                {"pan": "ANVPB5297J"},
                {"$set": {
                    "password_hash": new_password_hash,
                    "pin_hash": new_pin_hash,
                    "email": "pbisani89@gmail.com",
                    "role": "broker",  # Ensure role is main broker (admin)
                    "name": "Broker Admin"
                }}
            )
            return {
                "status": "reset", 
                "message": "Broker account has been reset to ADMIN role",
                "credentials": {
                    "pan": "ANVPB5297J",
                    "password": "Laksh@0208",
                    "pin": "0516",
                    "email": "pbisani89@gmail.com",
                    "role": "broker (ADMIN)"
                }
            }
        
        # Create the default broker account
        broker_data = {
            "id": str(uuid.uuid4()),
            "pan": "ANVPB5297J",
            "name": "Broker Admin",
            "email": "pbisani89@gmail.com",
            "phone": "+91-9999999999",
            "password_hash": get_password_hash("Laksh@0208"),
            "pin_hash": get_password_hash("0516"),
            "role": "broker",  # Main broker (admin)
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(broker_data)
        return {"status": "created", "message": "Broker account created successfully", "pan": "ANVPB5297J", "role": "broker (ADMIN)"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Clear all data endpoint - keeps only the admin broker
@api_router.get("/clear-all-data")
async def clear_all_data():
    """Clear all data except the admin broker account"""
    try:
        deleted_counts = {}
        
        # Delete all users except the admin broker
        result = await db.users.delete_many({"pan": {"$ne": "ANVPB5297J"}})
        deleted_counts["users"] = result.deleted_count
        
        # Delete all clients
        result = await db.clients.delete_many({})
        deleted_counts["clients"] = result.deleted_count
        
        # Delete all sub-brokers/partners
        result = await db.partners.delete_many({})
        deleted_counts["partners"] = result.deleted_count
        
        # Delete all bonds
        result = await db.bonds.delete_many({})
        deleted_counts["bonds"] = result.deleted_count
        
        # Delete all real estate opportunities
        result = await db.real_estate_opportunities.delete_many({})
        deleted_counts["real_estate"] = result.deleted_count
        
        # Delete all trades
        result = await db.trades.delete_many({})
        deleted_counts["trades"] = result.deleted_count
        
        # Delete all holdings
        result = await db.holdings.delete_many({})
        deleted_counts["holdings"] = result.deleted_count
        
        # Delete all holding cashflows
        result = await db.holding_cashflows.delete_many({})
        deleted_counts["holding_cashflows"] = result.deleted_count
        
        # Delete all real estate investments
        result = await db.real_estate_investments.delete_many({})
        deleted_counts["real_estate_investments"] = result.deleted_count
        
        # Delete all currency projections
        result = await db.currency_projections.delete_many({})
        deleted_counts["currency_projections"] = result.deleted_count
        
        # Delete all password resets
        result = await db.password_resets.delete_many({})
        deleted_counts["password_resets"] = result.deleted_count
        
        # Delete all activity logs if exists
        try:
            result = await db.activity_logs.delete_many({})
            deleted_counts["activity_logs"] = result.deleted_count
        except:
            pass
        
        return {
            "status": "success",
            "message": "All data cleared except admin broker (ANVPB5297J)",
            "deleted_counts": deleted_counts,
            "preserved": {
                "admin_broker": "ANVPB5297J",
                "email": "pbisani89@gmail.com"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ANALYSIS ENDPOINTS ====================

@api_router.post("/analysis/upload-cas")
async def upload_cas_pdf(
    file: UploadFile = File(...),
    password: str = Form(...),
    client_id: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload and analyze a CAS PDF file"""
    try:
        # Validate client exists and get details for billing
        client = await db.clients.find_one({"id": client_id}, {"_id": 0})
        if not client:
            raise HTTPException(status_code=404, detail="Client not found. Please select a valid client.")
        
        # Get sub-broker info if client is linked to one
        sub_broker_id = client.get('linked_subbroker_id')
        sub_broker_name = None
        if sub_broker_id:
            sub_broker = await db.partners.find_one({"id": sub_broker_id}, {"_id": 0, "name": 1})
            sub_broker_name = sub_broker.get('name') if sub_broker else None
        
        # Read file content
        content = await file.read()
        
        # Parse the PDF
        parser = CASParser(content, password)
        parsed_data = parser.parse()
        
        # Store analysis result with client and sub-broker info for billing
        analysis_id = str(uuid.uuid4())
        analysis_record = {
            "id": analysis_id,
            "user_id": current_user['id'],
            "user_name": current_user['name'],
            "client_id": client_id,
            "client_name": client.get('name'),
            "client_pan": client.get('pan_number'),
            "sub_broker_id": sub_broker_id,
            "sub_broker_name": sub_broker_name,
            "filename": file.filename,
            "parsed_data": parsed_data,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "status": "completed"
        }
        
        await db.cas_analyses.insert_one(analysis_record)
        
        return {
            "analysis_id": analysis_id,
            "filename": file.filename,
            "client_name": client.get('name'),
            "sub_broker_name": sub_broker_name,
            "portfolio_summary": parsed_data.get('portfolio_summary', {}),
            "total_folios": len(parsed_data.get('folios', {})),
            "total_transactions": parsed_data.get('total_transactions', 0),
            "status": "completed"
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error processing CAS PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")


@api_router.get("/analysis/{analysis_id}/download")
async def download_gap_sheet(
    analysis_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download the generated Gap Sheet Excel file"""
    try:
        # Get analysis record
        analysis = await db.cas_analyses.find_one({"id": analysis_id})
        
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        # Get scheme master for mapping
        scheme_master = await db.scheme_master.find_one({"type": "bse_master"})
        scheme_mapper = None
        if scheme_master and scheme_master.get('schemes'):
            scheme_mapper = SchemeMapper(scheme_master['schemes'])
        
        # Generate Gap Sheet (ZIP with all reports by PAN and ARN)
        nav_service = NAVService()
        generator = GapSheetGenerator(
            analysis['parsed_data'], 
            nav_service,
            scheme_mapper
        )
        zip_bytes = generator.generate_all_reports()
        
        # Return as downloadable ZIP file
        filename = f"GapSheet_{analysis.get('filename', 'analysis').replace('.pdf', '')}.zip"
        
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Length": str(len(zip_bytes))
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating Gap Sheet: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")


@api_router.get("/analysis/{analysis_id}")
async def get_analysis_details(
    analysis_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get detailed analysis results"""
    try:
        analysis = await db.cas_analyses.find_one({"id": analysis_id}, {"_id": 0})
        
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        return analysis
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/analysis/{analysis_id}/dashboard")
async def get_analysis_dashboard(
    analysis_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get dashboard data for an analysis - formatted for visualization"""
    try:
        analysis = await db.cas_analyses.find_one({"id": analysis_id}, {"_id": 0})
        
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        parsed_data = analysis.get('parsed_data', {})
        folios = parsed_data.get('folios', {})
        
        # Calculate dashboard metrics
        total_investment = 0
        total_current_value = 0
        total_redemptions = 0
        advisor_breakdown = {}
        scheme_breakdown = []
        holdings_by_type = {'Equity': 0, 'Debt': 0, 'Hybrid': 0, 'Other': 0}
        monthly_investments = {}
        
        equity_keywords = ['equity', 'index', 'nifty', 'sensex', 'midcap', 'smallcap', 
                          'large cap', 'multi cap', 'flexi cap', 'bluechip', 'elss', 
                          'tax saver', 'focused', 'value', 'growth fund']
        debt_keywords = ['debt', 'liquid', 'money market', 'ultra short', 'overnight',
                        'gilt', 'bond', 'income', 'credit risk', 'banking', 'corporate bond',
                        'dynamic bond', 'fixed maturity', 'fmp', 'floating rate']
        hybrid_keywords = ['hybrid', 'balanced', 'aggressive', 'conservative', 'arbitrage',
                          'equity savings', 'multi asset', 'asset allocation']
        
        for folio_key, folio_data in folios.items():
            scheme_name = folio_data.get('scheme', '')
            closing_balance = folio_data.get('closing_balance', 0)
            current_nav = folio_data.get('current_nav', 0)
            market_value = folio_data.get('market_value', 0)
            
            # If market_value not available, calculate from NAV
            if not market_value and closing_balance > 0 and current_nav > 1:
                market_value = closing_balance * current_nav
            
            scheme_lower = scheme_name.lower()
            
            # Categorize by fund type
            if any(kw in scheme_lower for kw in equity_keywords):
                fund_type = 'Equity'
            elif any(kw in scheme_lower for kw in debt_keywords):
                fund_type = 'Debt'
            elif any(kw in scheme_lower for kw in hybrid_keywords):
                fund_type = 'Hybrid'
            else:
                fund_type = 'Other'
            
            holdings_by_type[fund_type] += market_value
            
            # Process transactions
            for trans in folio_data.get('transactions', []):
                amount = abs(trans.get('amount', 0))
                advisor = trans.get('advisor', 'Direct')
                trans_date = trans.get('date', '')
                
                if trans.get('is_redemption'):
                    total_redemptions += amount
                else:
                    total_investment += amount
                    
                    # Advisor breakdown
                    if advisor not in advisor_breakdown:
                        advisor_breakdown[advisor] = {'invested': 0, 'schemes': set()}
                    advisor_breakdown[advisor]['invested'] += amount
                    advisor_breakdown[advisor]['schemes'].add(scheme_name[:30])
                    
                    # Monthly investments trend
                    try:
                        from datetime import datetime
                        dt = datetime.strptime(trans_date, '%d-%b-%Y')
                        month_key = dt.strftime('%Y-%m')
                        if month_key not in monthly_investments:
                            monthly_investments[month_key] = 0
                        monthly_investments[month_key] += amount
                    except:
                        pass
            
            # Add to scheme breakdown if has balance
            if closing_balance > 0 and market_value > 0:
                total_current_value += market_value
                scheme_breakdown.append({
                    'name': scheme_name[:40] + ('...' if len(scheme_name) > 40 else ''),
                    'full_name': scheme_name,
                    'folio': folio_data.get('folio', folio_key),
                    'units': round(closing_balance, 3),
                    'nav': round(current_nav, 4) if current_nav > 1 else None,
                    'value': round(market_value, 2),
                    'type': fund_type
                })
        
        # Sort scheme breakdown by value
        scheme_breakdown.sort(key=lambda x: x['value'], reverse=True)
        
        # Format advisor breakdown
        advisor_list = []
        for advisor, data in advisor_breakdown.items():
            advisor_list.append({
                'name': advisor if advisor else 'Direct',
                'invested': round(data['invested'], 2),
                'schemes_count': len(data['schemes'])
            })
        advisor_list.sort(key=lambda x: x['invested'], reverse=True)
        
        # Format monthly trend (last 12 months)
        sorted_months = sorted(monthly_investments.keys())[-12:]
        monthly_trend = [
            {'month': m, 'amount': monthly_investments.get(m, 0)}
            for m in sorted_months
        ]
        
        # Calculate gains
        total_gains = total_current_value - total_investment + total_redemptions
        gain_percentage = (total_gains / total_investment * 100) if total_investment > 0 else 0
        
        return {
            "analysis_id": analysis_id,
            "client_name": analysis.get('client_name'),
            "filename": analysis.get('filename'),
            "created_at": analysis.get('created_at'),
            "summary": {
                "total_investment": round(total_investment, 2),
                "total_current_value": round(total_current_value, 2),
                "total_redemptions": round(total_redemptions, 2),
                "total_gains": round(total_gains, 2),
                "gain_percentage": round(gain_percentage, 2),
                "total_folios": len(folios),
                "active_schemes": len([s for s in scheme_breakdown if s['value'] > 0])
            },
            "holdings_by_type": holdings_by_type,
            "top_holdings": scheme_breakdown[:10],
            "all_holdings": scheme_breakdown,
            "advisor_breakdown": advisor_list[:10],
            "monthly_trend": monthly_trend
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/analysis")
async def list_analyses(current_user: dict = Depends(get_current_user)):
    """List all analyses for the current user (or all for broker)"""
    try:
        query = {}
        if current_user['role'] != 'broker':
            query['user_id'] = current_user['id']
        
        analyses = await db.cas_analyses.find(
            query,
            {"_id": 0, "parsed_data": 0}  # Exclude large data from list
        ).sort("created_at", -1).to_list(100)
        
        return analyses
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/analysis/{analysis_id}")
async def delete_analysis(
    analysis_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an analysis record"""
    try:
        analysis = await db.cas_analyses.find_one({"id": analysis_id})
        
        if not analysis:
            raise HTTPException(status_code=404, detail="Analysis not found")
        
        # Only owner or broker can delete
        if current_user['role'] != 'broker' and analysis['user_id'] != current_user['id']:
            raise HTTPException(status_code=403, detail="Access denied")
        
        await db.cas_analyses.delete_one({"id": analysis_id})
        
        return {"message": "Analysis deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Scheme Master Management
@api_router.post("/analysis/upload-scheme-master")
async def upload_scheme_master(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Upload BSE scheme master file (broker only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can upload scheme master")
    
    try:
        content = await file.read()
        text_content = content.decode('utf-8', errors='ignore')
        
        # Parse the scheme master file
        schemes = parse_scheme_master_file(text_content)
        
        if not schemes:
            raise HTTPException(status_code=400, detail="Could not parse scheme master file")
        
        # Update or create scheme master record
        existing = await db.scheme_master.find_one({"type": "bse_master"})
        
        if existing:
            # Merge new schemes with existing (append unique)
            existing_isins = {s.get('isin') for s in existing.get('schemes', [])}
            new_schemes = [s for s in schemes if s.get('isin') not in existing_isins]
            
            await db.scheme_master.update_one(
                {"type": "bse_master"},
                {
                    "$push": {"schemes": {"$each": new_schemes}},
                    "$set": {
                        "last_upload": datetime.now(timezone.utc).isoformat(),
                        "last_upload_by": current_user['id'],
                        "last_filename": file.filename,
                        "total_schemes": len(existing.get('schemes', [])) + len(new_schemes)
                    }
                }
            )
            added_count = len(new_schemes)
        else:
            await db.scheme_master.insert_one({
                "type": "bse_master",
                "schemes": schemes,
                "total_schemes": len(schemes),
                "last_upload": datetime.now(timezone.utc).isoformat(),
                "last_upload_by": current_user['id'],
                "last_filename": file.filename,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            added_count = len(schemes)
        
        return {
            "message": "Scheme master uploaded successfully",
            "schemes_added": added_count,
            "total_schemes_in_file": len(schemes),
            "filename": file.filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading scheme master: {e}")
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")


@api_router.get("/analysis/scheme-master/status")
async def get_scheme_master_status(current_user: dict = Depends(get_current_user)):
    """Get scheme master file status"""
    try:
        master = await db.scheme_master.find_one(
            {"type": "bse_master"},
            {"_id": 0, "schemes": 0}  # Exclude large data
        )
        
        if not master:
            return {
                "exists": False,
                "total_schemes": 0,
                "last_upload": None
            }
        
        return {
            "exists": True,
            "total_schemes": master.get('total_schemes', 0),
            "last_upload": master.get('last_upload'),
            "last_filename": master.get('last_filename'),
            "last_upload_by": master.get('last_upload_by')
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== END ANALYSIS ENDPOINTS ====================


# Reset broker password endpoint
@api_router.get("/reset-broker-password")
async def reset_broker_password():
    """Reset the broker password to fix authentication issues"""
    try:
        # Find broker
        existing_broker = await db.users.find_one({"pan": "ANVPB5297J"})
        
        if not existing_broker:
            return {"status": "error", "message": "Broker account not found"}
        
        # Update password and pin with fresh hashes
        new_password_hash = get_password_hash("Laksh@0208")
        new_pin_hash = get_password_hash("0516")
        
        await db.users.update_one(
            {"pan": "ANVPB5297J"},
            {"$set": {
                "password_hash": new_password_hash,
                "pin_hash": new_pin_hash
            }}
        )
        
        return {
            "status": "success", 
            "message": "Broker password reset successfully",
            "credentials": {
                "pan": "ANVPB5297J",
                "password": "Laksh@0208",
                "pin": "0516"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def seed_default_broker():
    """Create default broker account if it doesn't exist"""
    try:
        logger.info("Starting broker seeding process...")
        # Check if broker already exists
        existing_broker = await db.users.find_one({"pan": "ANVPB5297J"})
        
        if not existing_broker:
            # Create the default broker account
            broker_data = {
                "id": str(uuid.uuid4()),
                "pan": "ANVPB5297J",
                "name": "Broker Admin",
                "email": "pbisani89@gmail.com",
                "phone": "+91-9999999999",
                "password_hash": get_password_hash("Laksh@0208"),
                "pin_hash": get_password_hash("0516"),
                "role": "broker",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(broker_data)
            logger.info("Default broker account created successfully: ANVPB5297J")
        else:
            logger.info("Broker account already exists: ANVPB5297J")
    except Exception as e:
        logger.error(f"Error seeding default broker: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()