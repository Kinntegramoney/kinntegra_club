#!/usr/bin/env python3
"""
Seed script to create test users for BondFlow Pro B2B Platform
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import os
import uuid
from datetime import datetime, timezone
import sys

# Add backend to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from auth import get_password_hash

# Load environment
load_dotenv(backend_dir / '.env')

async def seed_users():
    # Connect to MongoDB
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]
    
    print("🌱 Seeding users...")
    
    # Check if users already exist
    existing = await db.users.count_documents({})
    if existing > 0:
        print(f"⚠️  {existing} users already exist")
        response = input("Do you want to clear all users and reseed? (yes/no): ")
        if response.lower() == 'yes':
            await db.users.delete_many({})
            print("✓ Cleared existing users")
        else:
            print("Skipping seed")
            return
    
    # Create test users
    users = [
        {
            "id": str(uuid.uuid4()),
            "pan": "ABCDE1234F",
            "name": "Test Broker",
            "email": "broker@bondflow.com",
            "phone": "+91 9876543210",
            "password_hash": get_password_hash("broker123"),
            "pin_hash": get_password_hash("1234"),
            "role": "broker",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "pan": "FGHIJ5678K",
            "name": "Test Sub-Broker",
            "email": "subbroker@bondflow.com",
            "phone": "+91 9876543211",
            "password_hash": get_password_hash("subbroker123"),
            "pin_hash": get_password_hash("5678"),
            "role": "sub_broker",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    
    await db.users.insert_many(users)
    
    print("✓ Users created successfully!\n")
    print("=" * 60)
    print("TEST CREDENTIALS")
    print("=" * 60)
    print("\n📊 BROKER LOGIN:")
    print("   PAN: ABCDE1234F")
    print("   Password: broker123")
    print("   PIN: 1234")
    print("\n👤 SUB-BROKER LOGIN:")
    print("   PAN: FGHIJ5678K")
    print("   Password: subbroker123")
    print("   PIN: 5678")
    print("\n" + "=" * 60)
    
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_users())
