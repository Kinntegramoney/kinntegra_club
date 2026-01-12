from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from scipy.optimize import newton
import numpy as np
from auth import verify_password, get_password_hash, create_access_token, verify_token


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
    
    # Verify PIN
    if not verify_password(login.pin, user['pin_hash']):
        raise HTTPException(status_code=401, detail="Invalid PIN")
    
    # Create full access token
    access_token = create_access_token(
        data={"user_id": user['id'], "role": user['role']}
    )
    
    return {
        "token": access_token,
        "user": {
            "id": user['id'],
            "pan": user['pan'],
            "name": user['name'],
            "email": user['email'],
            "phone": user['phone'],
            "role": user['role']
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
async def create_partner(partner_data: PartnerCreate, current_user: dict = Depends(get_current_user)):
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
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.partners.insert_one(partner)
    
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
    """Delete a sub-broker partner (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete partners")
    
    # Check if partner exists and belongs to this broker
    partner = await db.partners.find_one({"id": partner_id, "created_by": current_user['id']})
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    
    # Delete the partner record
    await db.partners.delete_one({"id": partner_id})
    
    # Delete the associated user account
    await db.users.delete_one({"id": partner_id})
    
    return {"message": "Sub-broker deleted successfully"}


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
async def create_client(client_data: ClientCreate, current_user: dict = Depends(get_current_user)):
    """Create a new client (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can create clients")
    
    # Check if client with same PAN already exists
    existing = await db.clients.find_one({"pan_number": client_data.pan_number.upper()})
    if existing:
        raise HTTPException(status_code=400, detail="Client with this PAN already exists")
    
    client_dict = client_data.model_dump()
    client_dict['id'] = str(uuid.uuid4())
    client_dict['pan_number'] = client_dict['pan_number'].upper()
    client_dict['created_by'] = current_user['id']
    client_dict['created_at'] = datetime.now(timezone.utc).isoformat()
    client_dict['bond_allocations'] = []  # Track bonds allocated to this client
    
    await db.clients.insert_one(client_dict)
    
    # Return without _id
    if '_id' in client_dict:
        del client_dict['_id']
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
    """Delete a client (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete clients")
    
    result = await db.clients.delete_one({"id": client_id, "created_by": current_user['id']})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    
    return {"message": "Client deleted successfully"}


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


# ==================== END CLIENT MANAGEMENT ====================


# ==================== TRADE MANAGEMENT ====================

class TradeCreate(BaseModel):
    bond_id: str
    client_id: str
    units: int
    investment_date: str
    calculated_price: float
    payment_reference: Optional[str] = None
    payment_notes: Optional[str] = None


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
async def get_trades(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Get trades - brokers see all, sub-brokers see only their own"""
    
    query = {}
    
    if current_user['role'] == 'broker':
        # Brokers see all trades
        pass
    else:
        # Sub-brokers see only trades they created
        query["created_by"] = current_user['id']
    
    if status:
        query["status"] = status
    
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
    units_sold: int = 0  # Number of units already sold

    @field_validator('principal_payments')
    def validate_principal_total(cls, v):
        total = sum([p.percentage for p in v])
        if abs(total - 100.0) > 0.01:  # Allow small floating point errors
            raise ValueError(f'Principal payments must sum to 100%, got {total}%')
        return v


class Bond(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    start_date: str
    end_date: str
    principal_amount: float
    coupon_rate: float
    primary_irr: float
    secondary_irr: float
    principal_payments: List[PrincipalPayment]
    interest_payment_frequency: str
    interest_payments: List[InterestPayment]
    total_units: int = 1
    units_sold: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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
    return {"message": "BondFlow Pro API"}


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
    
    return bonds


@api_router.get("/bonds/available", response_model=List[Bond])
async def get_available_bonds(current_user: dict = Depends(get_current_user)):
    """Get bonds with available units (for sub-brokers)"""
    # Get all bonds where units_sold < total_units
    bonds = await db.bonds.find({}, {"_id": 0}).to_list(1000)
    
    # Filter bonds with available units
    available_bonds = []
    for bond in bonds:
        if isinstance(bond['created_at'], str):
            bond['created_at'] = datetime.fromisoformat(bond['created_at'])
        
        total_units = bond.get('total_units', 1)
        units_sold = bond.get('units_sold', 0)
        
        if units_sold < total_units:
            available_bonds.append(bond)
    
    return available_bonds


@api_router.get("/bonds/{bond_id}", response_model=BondWithCalculations)
async def get_bond(bond_id: str):
    bond = await db.bonds.find_one({"id": bond_id}, {"_id": 0})
    
    if not bond:
        raise HTTPException(status_code=404, detail="Bond not found")
    
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
    """Delete a bond (brokers only)"""
    if current_user['role'] != 'broker':
        raise HTTPException(status_code=403, detail="Only brokers can delete bonds")
    
    result = await db.bonds.delete_one({"id": bond_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    return {"message": "Bond deleted successfully"}


class BondUpdate(BaseModel):
    name: Optional[str] = None
    secondary_irr: Optional[float] = None
    total_units: Optional[int] = None
    units_sold: Optional[int] = None


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
    if bond_update.name is not None:
        update_data["name"] = bond_update.name
    if bond_update.secondary_irr is not None:
        update_data["secondary_irr"] = bond_update.secondary_irr
    if bond_update.total_units is not None:
        update_data["total_units"] = bond_update.total_units
    if bond_update.units_sold is not None:
        update_data["units_sold"] = bond_update.units_sold
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()