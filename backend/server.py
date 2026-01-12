from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from scipy.optimize import newton
import numpy as np


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


# Helper function for XIRR calculation
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
async def get_bonds():
    bonds = await db.bonds.find({}, {"_id": 0}).to_list(1000)
    
    for bond in bonds:
        if isinstance(bond['created_at'], str):
            bond['created_at'] = datetime.fromisoformat(bond['created_at'])
    
    return bonds


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
    
    # Get remaining cashflows after investment date
    remaining_dates = []
    remaining_cashflows = []
    
    # Add remaining interest payments
    for ip in bond['interest_payments']:
        ip_date = datetime.fromisoformat(ip['date'])
        if ip_date > investment_date:
            remaining_dates.append(ip_date)
            remaining_cashflows.append(ip['amount'])
    
    # Add remaining principal payments
    remaining_principal_pct = 0
    for pp in bond['principal_payments']:
        pp_date = datetime.fromisoformat(pp['date'])
        if pp_date > investment_date:
            remaining_dates.append(pp_date)
            remaining_cashflows.append(bond['principal_amount'] * pp['percentage'] / 100)
            remaining_principal_pct += pp['percentage']
    
    # Combine cashflows on same date
    date_cashflow_map = {}
    for d, cf in zip(remaining_dates, remaining_cashflows):
        if d in date_cashflow_map:
            date_cashflow_map[d] += cf
        else:
            date_cashflow_map[d] = cf
    
    remaining_dates = sorted(date_cashflow_map.keys())
    remaining_cashflows = [date_cashflow_map[d] for d in remaining_dates]
    
    if len(remaining_dates) == 0:
        raise HTTPException(status_code=400, detail="No remaining cashflows after investment date")
    
    # Calculate price for secondary buyer to achieve target IRR
    secondary_irr_decimal = bond['secondary_irr'] / 100
    price_to_pay = calculate_price_for_irr(secondary_irr_decimal, remaining_dates, remaining_cashflows, investment_date)
    
    # Calculate what primary buyer would receive
    # Primary buyer sells at a price that gives them their target IRR from start to investment date
    primary_irr_decimal = bond['primary_irr'] / 100
    
    # Primary buyer's cashflows: initial investment + interest received + sale price
    primary_dates = [start_date]
    primary_cashflows = [-bond['principal_amount']]
    
    # Add interest payments received before sale
    for ip in bond['interest_payments']:
        ip_date = datetime.fromisoformat(ip['date'])
        if ip_date <= investment_date:
            primary_dates.append(ip_date)
            primary_cashflows.append(ip['amount'])
    
    # Add principal payments received before sale
    for pp in bond['principal_payments']:
        pp_date = datetime.fromisoformat(pp['date'])
        if pp_date <= investment_date:
            primary_dates.append(pp_date)
            primary_cashflows.append(bond['principal_amount'] * pp['percentage'] / 100)
    
    # Add sale proceeds at investment date
    primary_dates.append(investment_date)
    # Primary buyer expects to achieve their target IRR, so calculate their required sale price
    
    # Combine cashflows before calculating primary sale price
    date_cashflow_map = {}
    for d, cf in zip(primary_dates, primary_cashflows):
        if d in date_cashflow_map:
            date_cashflow_map[d] += cf
        else:
            date_cashflow_map[d] = cf
    
    # Calculate remaining value needed to achieve primary IRR
    # NPV of all cashflows + sale price should equal 0 at primary IRR
    days_from_start = [(d - start_date).days for d in date_cashflow_map.keys()]
    cashflows_before_sale = list(date_cashflow_map.values())
    
    # Calculate PV of cashflows before sale
    pv_before_sale = sum([cf / ((1 + primary_irr_decimal) ** (day / 365.0)) for cf, day in zip(cashflows_before_sale, days_from_start)])
    
    # Calculate required sale price to achieve target IRR
    days_to_investment = (investment_date - start_date).days
    discount_factor = (1 + primary_irr_decimal) ** (days_to_investment / 365.0)
    
    # Solve: pv_before_sale + (sale_price / discount_factor) = 0
    primary_sale_price = -pv_before_sale * discount_factor
    
    # Broker margin is the difference
    broker_margin = primary_sale_price - price_to_pay
    
    days_to_maturity = (end_date - investment_date).days
    
    total_inflows = sum(remaining_cashflows)
    remaining_principal = bond['principal_amount'] * remaining_principal_pct / 100
    remaining_interest = total_inflows - remaining_principal
    
    # Calculate units available
    units_available = bond.get('total_units', 1) - bond.get('units_sold', 0)
    
    return {
        "investment_date": calculation.investment_date,
        "price_to_pay": round(price_to_pay, 2),
        "remaining_principal": round(remaining_principal, 2),
        "remaining_interest": round(remaining_interest, 2),
        "total_inflows": round(total_inflows, 2),
        "secondary_buyer_irr": bond['secondary_irr'],
        "days_to_maturity": days_to_maturity,
        "units_available": units_available
    }


@api_router.delete("/bonds/{bond_id}")
async def delete_bond(bond_id: str):
    result = await db.bonds.delete_one({"id": bond_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bond not found")
    
    return {"message": "Bond deleted successfully"}


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