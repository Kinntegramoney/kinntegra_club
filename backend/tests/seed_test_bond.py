"""Seed a temporary NCD bond with cashflows spanning past + future dates
so backend tests can validate repayment progress calculation.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

from motor.motor_asyncio import AsyncIOMotorClient

# Load backend .env
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")


async def seed():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    today = datetime.now(timezone.utc).date()

    # 12 monthly cashflow dates: 9 in the past, 3 in the future
    cfs = []
    for i in range(-8, 4):  # -8..-1 (past, 8 dates) plus 0 (today) plus 1..3 (future) => 9 past+today, 3 future
        d = today.replace(day=1) + timedelta(days=30 * i)
        cfs.append({"date": d.strftime("%Y-%m-%d"), "principal": 1000, "interest": 100})

    bond = {
        "id": "TEST_BOND_REPAY_PROGRESS",
        "bond_code": "TEST_NCD_001",
        "name": "TEST Repayment Progress Bond",
        "issuer": "TEST_ISSUER",
        "principal_amount": 12000,
        "coupon_rate": 12.0,
        "primary_irr": 12.0,
        "secondary_irr": 12.0,
        "start_date": (today - timedelta(days=240)).isoformat(),
        "end_date": (today + timedelta(days=90)).isoformat(),
        "total_units": 10,
        "units_sold": 5,
        "face_value": 1000,
        "interest_payment_frequency": "monthly",
        "listing_status": "active",
        "cashflows_per_unit": cfs,
        "cutoff_days": 5,
        "created_at": datetime.now(timezone.utc),
        "created_by": "test",
    }

    await db.Ncd_Master.delete_one({"id": bond["id"]})
    await db.Ncd_Master.insert_one(bond)
    print(f"Seeded bond {bond['id']} with {len(cfs)} cashflows")
    # count how many <= today
    today_str = today.strftime("%Y-%m-%d")
    past = sum(1 for c in cfs if c["date"] <= today_str)
    print(f"Expected repaid_cashflows_count = {past}, total_cashflows_count = {len(cfs)}")


async def cleanup():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    r = await db.Ncd_Master.delete_one({"id": "TEST_BOND_REPAY_PROGRESS"})
    print(f"Deleted {r.deleted_count} test bond(s)")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
        asyncio.run(cleanup())
    else:
        asyncio.run(seed())
