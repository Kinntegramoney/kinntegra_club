#!/usr/bin/env python3
"""
Seed script to populate database from Excel files.
Usage: python seed_data.py
"""

import os
import asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import uuid
import pandas as pd
import requests
from io import BytesIO

# MongoDB connection - read from .env file
from dotenv import load_dotenv
load_dotenv()

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
# Remove quotes if present
if MONGO_URL.startswith('"') and MONGO_URL.endswith('"'):
    MONGO_URL = MONGO_URL[1:-1]
DB_NAME = os.environ.get('DB_NAME', 'test_database')
if DB_NAME.startswith('"') and DB_NAME.endswith('"'):
    DB_NAME = DB_NAME[1:-1]

# Excel file URLs
FALI_URL = "https://customer-assets.emergentagent.com/job_repay-compare/artifacts/d5yjxohs_2026_01_25_CDNRE001_Fali.xlsx"
BOND_TEMPLATE_URL = "https://customer-assets.emergentagent.com/job_repay-compare/artifacts/77bjxteb_2026_01_25_CDNRE001_Bond%20Template.xlsx"


async def seed_database():
    """Seed the database with data from Excel files."""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print(f"Using database: {DB_NAME} at {MONGO_URL}")
    print("Downloading Excel files...")
    
    # Download and parse Excel files
    response1 = requests.get(FALI_URL)
    response2 = requests.get(BOND_TEMPLATE_URL)
    
    fali_xlsx = pd.ExcelFile(BytesIO(response1.content))
    bond_xlsx = pd.ExcelFile(BytesIO(response2.content))
    
    # Parse sheets
    investment_df = pd.read_excel(fali_xlsx, sheet_name='Investment Details')
    repayment_df = pd.read_excel(fali_xlsx, sheet_name='Repayment Details')
    
    bond_details_df = pd.read_excel(bond_xlsx, sheet_name='Bond Details')
    financial_df = pd.read_excel(bond_xlsx, sheet_name='Financial Details')
    units_df = pd.read_excel(bond_xlsx, sheet_name='Units & Limits')
    cashflows_df = pd.read_excel(bond_xlsx, sheet_name='Cashflows Per Unit')
    
    print("\n=== Parsed Data ===")
    print(f"Investments: {len(investment_df)} rows")
    print(f"Repayments: {len(repayment_df)} rows")
    print(f"Bonds: {len(bond_details_df)} rows")
    print(f"Cashflows: {len(cashflows_df)} rows")
    
    # 1. Get existing broker user (seeded by system)
    broker_user = await db.users.find_one({"pan": "ANVPB5297J"})
    if not broker_user:
        print("ERROR: Broker user not found. The system should have created it on startup.")
        return
    
    broker_id = broker_user['id']
    print(f"Using existing broker: {broker_id}")
    
    # 2. Create client (AAAPU0926D - Fali)
    pan_number = "AAAPU0926D"
    client_id = f"client-{pan_number}"
    existing_client = await db.Private_Investor.find_one({"pan_number": pan_number})
    
    if not existing_client:
        client_data = {
            "id": client_id,
            "name": "Fali Investor",
            "pan_number": pan_number,
            "email": "fali@example.com",
            "mobile": "9876543210",
            "status": "active",
            "created_by": broker_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.Private_Investor.insert_one(client_data)
        print(f"Created client: {pan_number}")
    else:
        client_id = existing_client['id']
        print(f"Client exists: {pan_number}")
    
    # 3. Create bond from template
    bond_code = "CDNRE001"
    bond_id = f"bond-{bond_code}"
    existing_bond = await db.Ncd_Master.find_one({"bond_code": bond_code})
    
    if not existing_bond:
        # Parse bond details
        bond_details = bond_details_df.iloc[0]
        financial_details = financial_df.iloc[0]
        units_details = units_df.iloc[0]
        
        # Parse cashflows per unit
        cashflows_per_unit = []
        for _, row in cashflows_df.iterrows():
            payment_date = row['Payment Date*']
            if isinstance(payment_date, datetime):
                payment_date_str = payment_date.strftime('%Y-%m-%d')
            else:
                payment_date_str = str(payment_date).split('T')[0].split(' ')[0]
            
            cashflows_per_unit.append({
                "date": payment_date_str,
                "interest_per_unit": float(row['Interest Per Unit*']) if pd.notna(row['Interest Per Unit*']) else 0,
                "principal_per_unit": float(row['Principal Per Unit*']) if pd.notna(row['Principal Per Unit*']) else 0
            })
        
        # Format dates
        start_date = bond_details['Start Date*']
        maturity_date = bond_details['Maturity Date*']
        if isinstance(start_date, datetime):
            start_date = start_date.strftime('%Y-%m-%d')
        if isinstance(maturity_date, datetime):
            maturity_date = maturity_date.strftime('%Y-%m-%d')
        
        bond_data = {
            "id": bond_id,
            "bond_code": bond_code,
            "bond_name": str(bond_details['Bond Name*']),
            "issuer_company_name": str(bond_details.get('Issuer/Company Name', '')),
            "description": str(bond_details.get('Description', '')),
            "start_date": str(start_date),
            "maturity_date": str(maturity_date),
            "principal_amount": float(financial_details['Principal Amount (INR)*']),
            "face_value": float(financial_details.get('Face Value per Unit', 100000)),
            "coupon_rate": float(financial_details['Coupon Rate (%)*']),
            "primary_irr": float(financial_details['Primary IRR (%)*']),
            "secondary_irr": float(financial_details['Secondary IRR (%)*']),
            "total_units": int(units_details['Total Units*']),
            "minimum_units": int(units_details.get('Minimum Units per Order', 1)),
            "cashflows_per_unit": cashflows_per_unit,
            "status": "funded",
            "created_by": broker_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.Ncd_Master.insert_one(bond_data)
        print(f"Created bond: {bond_code}")
        print(f"  - Start: {start_date}, Maturity: {maturity_date}")
        print(f"  - Face Value: {bond_data['face_value']}, Coupon: {bond_data['coupon_rate']}%")
        print(f"  - Cashflows per unit: {cashflows_per_unit}")
    else:
        bond_id = existing_bond['id']
        print(f"Bond exists: {bond_code}")
    
    # 4. Create trades from investment details
    print("\nCreating trades...")
    trades_created = 0
    for _, row in investment_df.iterrows():
        inv_date = row['Date of Investment*']
        if isinstance(inv_date, datetime):
            inv_date_str = inv_date.strftime('%Y-%m-%d')
        else:
            inv_date_str = str(inv_date).split('T')[0].split(' ')[0]
        
        trade_id = f"trade-{bond_code}-{inv_date_str}-{row['No of Units*']}"
        
        existing_trade = await db.Ncd_Investment_Details.find_one({"id": trade_id})
        if not existing_trade:
            trade_data = {
                "id": trade_id,
                "bond_id": bond_id,
                "bond_name": "Natureresidences Real Estate",
                "client_id": client_id,
                "units": int(row['No of Units*']),
                "total_amount": float(row['Amount*']),
                "investment_date": inv_date_str,
                "status": "approved",
                "created_by": broker_id,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.Ncd_Investment_Details.insert_one(trade_data)
            trades_created += 1
            print(f"  Trade: {inv_date_str} - {row['No of Units*']} units @ ₹{row['Amount*']:,.2f}")
    
    print(f"Created {trades_created} trades")
    
    # 5. Create actual repayments
    print("\nCreating actual repayments...")
    repayments_created = 0
    
    # Group repayments by investment order
    # Based on the data, first 5 repayments belong to first investment (34 units)
    # Next 5 to second (31 units), last 5 to third (135 units)
    investment_data = [
        {"date": "2025-04-30", "units": 34},
        {"date": "2025-05-02", "units": 31},
        {"date": "2025-05-07", "units": 135}
    ]
    
    # Each investment has 5 repayments
    repayments_per_investment = 5
    
    for idx, row in repayment_df.iterrows():
        repay_date = row['Repayment Date*']
        if isinstance(repay_date, datetime):
            repay_date_str = repay_date.strftime('%Y-%m-%d')
        else:
            repay_date_str = str(repay_date).split('T')[0].split(' ')[0]
        
        # Determine which investment this repayment belongs to
        inv_idx = idx // repayments_per_investment
        if inv_idx < len(investment_data):
            inv_info = investment_data[inv_idx]
            inv_date = inv_info['date']
            units = inv_info['units']
        else:
            inv_date = investment_data[-1]['date']
            units = investment_data[-1]['units']
        
        trade_id = f"trade-{bond_code}-{inv_date}-{units}"
        
        repayment_id = f"repay-{bond_code}-{client_id}-{repay_date_str}-{idx}"
        
        existing_repay = await db.actual_repayments.find_one({"id": repayment_id})
        if not existing_repay:
            repay_data = {
                "id": repayment_id,
                "bond_id": bond_id,
                "client_id": client_id,
                "trade_id": trade_id,
                "investment_date": inv_date,
                "repayment_date": repay_date_str,
                "principal": float(row['Principal']) if pd.notna(row['Principal']) else 0,
                "interest": float(row['Interest']) if pd.notna(row['Interest']) else 0,
                "gross_amount": float(row['Gross Amount*']) if pd.notna(row['Gross Amount*']) else 0,
                "tds": float(row['TDS']) if pd.notna(row['TDS']) else 0,
                "net_amount": float(row['Net Amount*']) if pd.notna(row['Net Amount*']) else 0,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.actual_repayments.insert_one(repay_data)
            repayments_created += 1
            print(f"  Repayment: {repay_date_str} - Principal: ₹{repay_data['principal']:,.0f}, Net: ₹{repay_data['net_amount']:,.0f}")
    
    print(f"Created {repayments_created} actual repayments")
    
    # 6. Generate holding_cashflows for each trade based on actual repayments
    print("\nGenerating holding_cashflows from actual repayments...")
    
    for inv_idx, inv_info in enumerate(investment_data):
        inv_date = inv_info['date']
        units = inv_info['units']
        trade_id = f"trade-{bond_code}-{inv_date}-{units}"
        
        # Get the actual repayments for this trade (by investment date)
        actual_repays = await db.actual_repayments.find({
            "bond_id": bond_id,
            "client_id": client_id,
            "investment_date": inv_date
        }, {"_id": 0}).to_list(100)
        
        for repay in actual_repays:
            cf_id = f"cf-{trade_id}-{repay['repayment_date']}"
            
            existing_cf = await db.holding_cashflows.find_one({"id": cf_id})
            if not existing_cf:
                cf_data = {
                    "id": cf_id,
                    "trade_id": trade_id,
                    "bond_id": bond_id,
                    "client_id": client_id,
                    "bond_name": "Natureresidences Real Estate",
                    "date": repay['repayment_date'],
                    "principal_component": repay['principal'],
                    "interest_component": repay['interest'],
                    "gross_amount": repay['gross_amount'],
                    "tds_amount": repay['tds'],
                    "net_amount": repay['net_amount'],
                    "is_repaid": True,
                    "repaid_date": repay['repayment_date'],
                    "is_prepaid": False,  # These are actual repayments
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.holding_cashflows.insert_one(cf_data)
        
        print(f"  Generated cashflows for trade: {trade_id}")
    
    print("\n=== Database Seeding Complete ===")
    
    # Summary
    bonds_count = await db.Ncd_Master.count_documents({})
    clients_count = await db.Private_Investor.count_documents({})
    trades_count = await db.Ncd_Investment_Details.count_documents({})
    repayments_count = await db.actual_repayments.count_documents({})
    cashflows_count = await db.holding_cashflows.count_documents({})
    
    print(f"\nFinal counts:")
    print(f"  Bonds: {bonds_count}")
    print(f"  Clients: {clients_count}")
    print(f"  Trades: {trades_count}")
    print(f"  Actual Repayments: {repayments_count}")
    print(f"  Holding Cashflows: {cashflows_count}")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_database())
