import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
import uuid
import os

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "investtrack")

async def seed_test_data():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("Creating test data for Holdings features...")
    
    # Get broker ID - check both pan and pan_number fields
    broker = await db.users.find_one({"$or": [{"pan": "ANVPB5297J"}, {"pan_number": "ANVPB5297J"}]})
    if not broker:
        print("Broker not found. Creating broker account first...")
        # Import password hashing
        from auth import get_password_hash
        
        broker = {
            "id": str(uuid.uuid4()),
            "pan": "ANVPB5297J",
            "pan_number": "ANVPB5297J",
            "name": "Broker Admin",
            "email": "pbisani89@gmail.com",
            "phone": "+91-9999999999",
            "password_hash": get_password_hash("Laksh@0208"),
            "pin_hash": get_password_hash("0516"),
            "role": "broker",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(broker)
        print("Created broker account: ANVPB5297J")
    
    broker_id = broker['id']
    print(f"Found broker: {broker.get('name', 'Broker')} ({broker_id})")
    
    # Create test clients
    clients_data = [
        {
            "id": str(uuid.uuid4()),
            "name": "Rahul Sharma",
            "email": "rahul.sharma@test.com",
            "phone": "9876543210",
            "pan_number": "ABCDE1234F",
            "address": "Mumbai, Maharashtra",
            "created_by": broker_id,
            "linked_subbroker_id": None,
            "linked_subbroker_name": None,
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Priya Patel",
            "email": "priya.patel@test.com",
            "phone": "9876543211",
            "pan_number": "FGHIJ5678K",
            "address": "Delhi, NCR",
            "created_by": broker_id,
            "linked_subbroker_id": None,
            "linked_subbroker_name": None,
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    for client_data in clients_data:
        existing = await db.clients.find_one({"pan_number": client_data['pan_number']})
        if not existing:
            await db.clients.insert_one(client_data)
            print(f"Created client: {client_data['name']} ({client_data['pan_number']})")
        else:
            client_data['id'] = existing['id']
            print(f"Client already exists: {client_data['name']}")
    
    # Create test bonds
    bonds_data = [
        {
            "id": str(uuid.uuid4()),
            "name": "HDFC Housing Bond - 12%",
            "isin": "INE001A08BC1",
            "face_value": 100000,
            "principal_amount": 100000,
            "interest_rate": 12.0,
            "interest_frequency": "monthly",
            "maturity_date": "2026-12-31",
            "rating": "AAA",
            "issuer": "HDFC Ltd",
            "status": "active",
            "created_by": broker_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Tata Capital NCD - 10%",
            "isin": "INE002A08BC2",
            "face_value": 100000,
            "principal_amount": 100000,
            "interest_rate": 10.0,
            "interest_frequency": "quarterly",
            "maturity_date": "2027-06-30",
            "rating": "AA+",
            "issuer": "Tata Capital",
            "status": "active",
            "created_by": broker_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    for bond in bonds_data:
        existing = await db.bonds.find_one({"isin": bond['isin']})
        if not existing:
            await db.bonds.insert_one(bond)
            print(f"Created bond: {bond['name']}")
        else:
            bond['id'] = existing['id']
            print(f"Bond already exists: {bond['name']}")
    
    # Reload clients and bonds with correct IDs
    client1 = await db.clients.find_one({"pan_number": "ABCDE1234F"})
    client2 = await db.clients.find_one({"pan_number": "FGHIJ5678K"})
    bond1 = await db.bonds.find_one({"isin": "INE001A08BC1"})
    bond2 = await db.bonds.find_one({"isin": "INE002A08BC2"})
    
    # Create trades
    trades_data = [
        {
            "id": str(uuid.uuid4()),
            "client_id": client1['id'],
            "client_name": client1['name'],
            "client_pan": client1['pan_number'],
            "bond_id": bond1['id'],
            "bond_name": bond1['name'],
            "units": 5,
            "calculated_price": 100000,
            "total_amount": 500000,
            "investment_date": "2025-06-01",
            "status": "approved",
            "created_by": broker_id,
            "created_by_role": "broker",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "client_id": client1['id'],
            "client_name": client1['name'],
            "client_pan": client1['pan_number'],
            "bond_id": bond2['id'],
            "bond_name": bond2['name'],
            "units": 3,
            "calculated_price": 100000,
            "total_amount": 300000,
            "investment_date": "2025-07-15",
            "status": "approved",
            "created_by": broker_id,
            "created_by_role": "broker",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "client_id": client2['id'],
            "client_name": client2['name'],
            "client_pan": client2['pan_number'],
            "bond_id": bond1['id'],
            "bond_name": bond1['name'],
            "units": 10,
            "calculated_price": 100000,
            "total_amount": 1000000,
            "investment_date": "2025-04-01",
            "status": "approved",
            "created_by": broker_id,
            "created_by_role": "broker",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    for trade in trades_data:
        existing = await db.trades.find_one({
            "client_id": trade['client_id'],
            "bond_id": trade['bond_id'],
            "investment_date": trade['investment_date']
        })
        if existing:
            trade['id'] = existing['id']
            print(f"Trade already exists for {trade['client_name']} - {trade['bond_name']}")
        else:
            await db.trades.insert_one(trade)
            print(f"Created trade: {trade['client_name']} - {trade['bond_name']} ({trade['units']} units)")
    
    # Reload trades
    trades_data[0] = await db.trades.find_one({"client_id": client1['id'], "bond_id": bond1['id']})
    trades_data[1] = await db.trades.find_one({"client_id": client1['id'], "bond_id": bond2['id']})
    trades_data[2] = await db.trades.find_one({"client_id": client2['id'], "bond_id": bond1['id']})
    
    # Generate cashflows for each trade
    print("\nGenerating cashflows...")
    
    for trade in trades_data:
        if not trade:
            continue
            
        # Check if cashflows exist
        existing_cf = await db.holding_cashflows.find_one({"trade_id": trade['id']})
        if existing_cf:
            print(f"Cashflows already exist for trade {trade['bond_name']}")
            continue
        
        # Get bond details
        bond = await db.bonds.find_one({"id": trade['bond_id']})
        client = await db.clients.find_one({"id": trade['client_id']})
        
        investment_date = datetime.strptime(trade['investment_date'], "%Y-%m-%d")
        maturity_date = datetime.strptime(bond['maturity_date'], "%Y-%m-%d")
        
        principal = bond['principal_amount'] * trade['units']
        interest_rate = bond['interest_rate'] / 100
        
        cashflows = []
        
        # Generate monthly interest payments
        if bond['interest_frequency'] == 'monthly':
            current_date = investment_date + timedelta(days=30)
            while current_date < maturity_date:
                monthly_interest = round(principal * interest_rate / 12, 2)
                tds = round(monthly_interest * 0.10, 2)
                
                cashflows.append({
                    "id": str(uuid.uuid4()),
                    "trade_id": trade['id'],
                    "client_id": trade['client_id'],
                    "bond_id": trade['bond_id'],
                    "bond_name": trade['bond_name'],
                    "date": current_date.strftime("%Y-%m-%d"),
                    "type": "interest",
                    "principal_component": 0,
                    "interest_component": monthly_interest,
                    "gross_amount": monthly_interest,
                    "tds_amount": tds,
                    "net_amount": round(monthly_interest - tds, 2),
                    "is_repaid": False,
                    "is_prepaid": False,
                    "is_amended": False,
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
                current_date += timedelta(days=30)
        
        # Generate quarterly interest payments
        elif bond['interest_frequency'] == 'quarterly':
            current_date = investment_date + timedelta(days=90)
            while current_date < maturity_date:
                quarterly_interest = round(principal * interest_rate / 4, 2)
                tds = round(quarterly_interest * 0.10, 2)
                
                cashflows.append({
                    "id": str(uuid.uuid4()),
                    "trade_id": trade['id'],
                    "client_id": trade['client_id'],
                    "bond_id": trade['bond_id'],
                    "bond_name": trade['bond_name'],
                    "date": current_date.strftime("%Y-%m-%d"),
                    "type": "interest",
                    "principal_component": 0,
                    "interest_component": quarterly_interest,
                    "gross_amount": quarterly_interest,
                    "tds_amount": tds,
                    "net_amount": round(quarterly_interest - tds, 2),
                    "is_repaid": False,
                    "is_prepaid": False,
                    "is_amended": False,
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
                current_date += timedelta(days=90)
        
        # Add principal repayment at maturity
        final_interest = round(principal * interest_rate / 12, 2) if bond['interest_frequency'] == 'monthly' else round(principal * interest_rate / 4, 2)
        final_tds = round(final_interest * 0.10, 2)
        
        cashflows.append({
            "id": str(uuid.uuid4()),
            "trade_id": trade['id'],
            "client_id": trade['client_id'],
            "bond_id": trade['bond_id'],
            "bond_name": trade['bond_name'],
            "date": maturity_date.strftime("%Y-%m-%d"),
            "type": "principal",
            "principal_component": principal,
            "interest_component": final_interest,
            "gross_amount": round(principal + final_interest, 2),
            "tds_amount": final_tds,
            "net_amount": round(principal + final_interest - final_tds, 2),
            "is_repaid": False,
            "is_prepaid": False,
            "is_amended": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        # Mark some past cashflows as repaid for testing
        today = datetime.now()
        for cf in cashflows:
            cf_date = datetime.strptime(cf['date'], "%Y-%m-%d")
            if cf_date < today:
                cf['is_repaid'] = True
                cf['repaid_date'] = cf['date']
                cf['repaid_actual_amount'] = cf['net_amount']
        
        # Insert all cashflows
        if cashflows:
            await db.holding_cashflows.insert_many(cashflows)
            repaid_count = len([c for c in cashflows if c['is_repaid']])
            pending_count = len([c for c in cashflows if not c['is_repaid']])
            print(f"Created {len(cashflows)} cashflows for {trade['client_name']} - {trade['bond_name']} ({repaid_count} repaid, {pending_count} pending)")
    
    print("\n" + "="*60)
    print("✅ TEST DATA CREATION COMPLETE!")
    print("="*60)
    print("\n📊 Test Clients:")
    print("  1. Rahul Sharma (ABCDE1234F)")
    print("     - HDFC Housing Bond: 5 units, ₹5,00,000 (Monthly 12%)")
    print("     - Tata Capital NCD: 3 units, ₹3,00,000 (Quarterly 10%)")
    print("\n  2. Priya Patel (FGHIJ5678K)")
    print("     - HDFC Housing Bond: 10 units, ₹10,00,000 (Monthly 12%)")
    print("\n🔧 You can now test:")
    print("  - View Holdings page and select a client")
    print("  - View cashflow details with Tentative/Actual dates")
    print("  - Test 'Record Principal Prepayment' button")
    print("  - Test bulk repayment upload (download template first)")
    print("  - View XIRR calculations")

if __name__ == "__main__":
    asyncio.run(seed_test_data())
