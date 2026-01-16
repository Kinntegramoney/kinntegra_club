#!/usr/bin/env python3
"""
Script to clear clients from the database.
Run this against your production MongoDB.

Usage:
    python clear_clients.py --mongo-url "mongodb://..." --db-name "your_db"
    
Options:
    --dry-run       Show what would be deleted without actually deleting
    --all           Delete ALL clients (dangerous!)
    --created-after Delete clients created after a specific date (YYYY-MM-DD)
    --created-by    Delete clients created by a specific broker ID
    --pan           Delete a specific client by PAN
"""

import argparse
import sys
from datetime import datetime
from pymongo import MongoClient


def get_db(mongo_url: str, db_name: str):
    """Connect to MongoDB and return database object"""
    client = MongoClient(mongo_url)
    return client[db_name]


def list_clients(db, filters=None):
    """List all clients matching filters"""
    query = filters or {}
    clients = list(db.clients.find(query, {"_id": 0, "id": 1, "name": 1, "pan_number": 1, "email": 1, "created_at": 1, "created_by": 1}))
    return clients


def delete_clients(db, client_ids: list, dry_run: bool = True):
    """Delete clients and their associated user accounts"""
    if dry_run:
        print("\n🔍 DRY RUN MODE - No data will be deleted\n")
    
    deleted_clients = 0
    deleted_users = 0
    
    for client_id in client_ids:
        # Get client details
        client = db.clients.find_one({"id": client_id})
        if not client:
            print(f"  ⚠️  Client {client_id} not found")
            continue
        
        pan = client.get('pan_number', '')
        name = client.get('name', 'Unknown')
        
        print(f"  📋 {name} (PAN: {pan})")
        
        if not dry_run:
            # Delete from clients collection
            result = db.clients.delete_one({"id": client_id})
            if result.deleted_count > 0:
                deleted_clients += 1
            
            # Delete associated user account (by PAN)
            if pan:
                user_result = db.users.delete_one({"pan": pan})
                if user_result.deleted_count > 0:
                    deleted_users += 1
            
            # Also delete any trades associated with this client
            trades_result = db.trades.delete_many({"client_id": client_id})
            if trades_result.deleted_count > 0:
                print(f"      └─ Deleted {trades_result.deleted_count} trades")
            
            # Delete holding cashflows
            cashflows_result = db.holding_cashflows.delete_many({"client_id": client_id})
            if cashflows_result.deleted_count > 0:
                print(f"      └─ Deleted {cashflows_result.deleted_count} cashflows")
    
    return deleted_clients, deleted_users


def main():
    parser = argparse.ArgumentParser(description="Clear clients from the database")
    parser.add_argument("--mongo-url", required=True, help="MongoDB connection URL")
    parser.add_argument("--db-name", required=True, help="Database name")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be deleted without deleting")
    parser.add_argument("--all", action="store_true", help="Delete ALL clients")
    parser.add_argument("--created-after", help="Delete clients created after date (YYYY-MM-DD)")
    parser.add_argument("--created-by", help="Delete clients created by broker ID")
    parser.add_argument("--pan", help="Delete specific client by PAN")
    
    args = parser.parse_args()
    
    # Connect to database
    print(f"\n🔌 Connecting to database: {args.db_name}")
    db = get_db(args.mongo_url, args.db_name)
    
    # Build filter
    filters = {}
    
    if args.pan:
        filters["pan_number"] = args.pan
        print(f"🔍 Filter: PAN = {args.pan}")
    
    if args.created_by:
        filters["created_by"] = args.created_by
        print(f"🔍 Filter: Created by broker = {args.created_by}")
    
    if args.created_after:
        try:
            date = datetime.strptime(args.created_after, "%Y-%m-%d")
            filters["created_at"] = {"$gte": date.isoformat()}
            print(f"🔍 Filter: Created after = {args.created_after}")
        except ValueError:
            print("❌ Invalid date format. Use YYYY-MM-DD")
            sys.exit(1)
    
    if not args.all and not filters:
        print("\n❌ Please specify --all or provide filters (--pan, --created-by, --created-after)")
        print("   Use --dry-run first to see what would be deleted")
        sys.exit(1)
    
    # List matching clients
    clients = list_clients(db, filters if filters else None)
    
    if not clients:
        print("\n✅ No clients found matching the criteria")
        sys.exit(0)
    
    print(f"\n📊 Found {len(clients)} client(s):\n")
    print("-" * 80)
    print(f"{'Name':<25} {'PAN':<15} {'Email':<30} {'Created':<20}")
    print("-" * 80)
    
    for c in clients:
        name = (c.get('name', 'N/A') or 'N/A')[:24]
        pan = c.get('pan_number', 'N/A') or 'N/A'
        email = (c.get('email', 'N/A') or 'N/A')[:29]
        created = str(c.get('created_at', 'N/A'))[:19]
        print(f"{name:<25} {pan:<15} {email:<30} {created:<20}")
    
    print("-" * 80)
    
    # Confirm deletion
    if not args.dry_run:
        print(f"\n⚠️  WARNING: This will PERMANENTLY delete {len(clients)} client(s) and their associated data!")
        confirm = input("\nType 'DELETE' to confirm: ")
        
        if confirm != "DELETE":
            print("\n❌ Deletion cancelled")
            sys.exit(0)
    
    # Delete clients
    client_ids = [c['id'] for c in clients]
    deleted_clients, deleted_users = delete_clients(db, client_ids, dry_run=args.dry_run)
    
    if args.dry_run:
        print(f"\n📋 DRY RUN: Would delete {len(clients)} client(s)")
    else:
        print(f"\n✅ Deleted {deleted_clients} client(s) and {deleted_users} user account(s)")


if __name__ == "__main__":
    main()
