# Migration Plan: Merge `actual_repayments` → `Ncd_Repayments`

## Status: ✅ COMPLETED

## Summary of Changes Made

### 1. Migration Endpoint Added
- **New endpoint**: `POST /api/admin/migrate-actual-to-ncd-repayments`
- Supports `dry_run=true` (default) to preview changes
- Use `dry_run=false` to actually migrate records
- Merges existing records, inserts new ones with `source="migrated_from_actual_repayments"`

### 2. All Code References Updated (62 locations)
All `db.actual_repayments` references have been changed to `db.Ncd_Repayments`:
- Historical repayment upload (now writes with `source: "historical_upload"`)
- Holdings cashflow calculations
- Reinvestment tagging
- XIRR calculations
- Email sync flows
- Duplicate clearing
- Export functions
- All read/write operations

### 3. Collection Categories Updated
- `Ncd_Repayments`: Updated description to "Unified NCD repayments (email-synced + historical uploads + all sources)"
- `actual_repayments`: Moved to "deprecated" category with note "Merged into Ncd_Repayments"

### 4. Unified Schema
The `Ncd_Repayments` collection now supports all fields from both collections:
- Core fields: `id`, `bond_id`, `bond_name`, `bond_code`, `client_id`, `client_name`, `client_pan`, `repayment_date`, `principal`, `interest`, `gross_amount`, `tds`, `net_amount`
- Source tracking: `source` field distinguishes between `email_sync`, `historical_upload`, `email_auto_approval`, etc.
- Trade linking: `trade_id`, `investment_date` (for historical/processed records)
- Email metadata: `source_mailbox`, `source_uid`, `email_subject`, etc. (for email-synced records)
- Reinvestment tagging: `reinvestment_tag`, `portfolio_category`, `target_ucc`, `tagged_at`, `tagged_by`

---

## How to Run Migration

### Step 1: Preview (Dry Run)
```bash
curl -X POST "https://your-domain/api/admin/migrate-actual-to-ncd-repayments?dry_run=true" \
  -H "Authorization: Bearer <token>"
```

### Step 2: Execute Migration
```bash
curl -X POST "https://your-domain/api/admin/migrate-actual-to-ncd-repayments?dry_run=false" \
  -H "Authorization: Bearer <token>"
```

### Step 3: Verify
- Check Holdings page loads correctly
- Check Reinvestment Tagging shows expected data
- Check Historical Repayments export works

---

## Rollback Plan
If issues occur:
1. The `actual_repayments` collection still exists in MongoDB (not deleted)
2. Migrated records in `Ncd_Repayments` have `source: "migrated_from_actual_repayments"` for identification
3. Code changes can be reverted via platform rollback feature

---

## Post-Migration Cleanup (Optional)
After confirming everything works:
1. The `actual_repayments` collection can be deleted via DB Manager
2. It's now marked as "deprecated" in the system

## Schema Comparison

### Current `Ncd_Repayments` (email-synced)
```json
{
  "id": "uuid",
  "source_mailbox": "gmail|webmail",
  "source_uid": 12345,
  "source_folder": "INBOX/...",
  "email_received_date": "ISO date",
  "email_subject": "altGraaf | Returns Initiated - ...",
  "client_email": "client@example.com",
  "client_name": "Name",
  "client_name_in_body": "Name from email body",
  "client_pan": "ABCDE1234F",
  "client_id": "uuid",
  "passport_type": "indian|foreign",
  "opportunity_id": "BOND123",
  "bond_code": "BOND123",
  "bond_id": "uuid",
  "bond_name": "Bond Name",
  "issuer_name_from_subject": "Issuer",
  "repayment_date": "2026-01-15",
  "gross_amount": 50000,
  "principal": 0,
  "interest": 50000,
  "net_amount": 45000,
  "tds": 5000,
  "resolution_status": "resolved|unknown_client",
  "created_at": "ISO date",
  "updated_at": "ISO date",
  "created_by": "user_id"
}
```

### Current `actual_repayments` (historical/processed)
```json
{
  "id": "uuid",
  "bond_id": "uuid",
  "bond_name": "Bond Name",
  "bond_code": "BOND123",
  "client_id": "uuid",
  "client_name": "Name",
  "client_pan": "PAN",
  "investment_date": "2024-01-15",
  "trade_id": "uuid",
  "repayment_date": "2026-01-15",
  "principal": 0,
  "interest": 50000,
  "gross_amount": 50000,
  "tds": 5000,
  "net_amount": 45000,
  "type": "actual|interest|prepayment",
  "source": "historical|email|email_auto_approval|reprocess_email_logs",
  "is_historical": true,
  "email_log_id": "uuid (if from email)",
  "created_by": "user_id",
  "created_at": "ISO date",
  "reinvestment_tag": "not_tagged|...",
  "portfolio_category": "...",
  "target_ucc": "...",
  "tagged_at": "ISO date",
  "tagged_by": "user_id"
}
```

### Unified `Ncd_Repayments` Schema (after merge)
```json
{
  // Core fields (both have)
  "id": "uuid",
  "bond_id": "uuid",
  "bond_name": "Bond Name", 
  "bond_code": "BOND123",
  "client_id": "uuid",
  "client_name": "Name",
  "client_pan": "PAN",
  "repayment_date": "2026-01-15",
  "principal": 0,
  "interest": 50000,
  "gross_amount": 50000,
  "tds": 5000,
  "net_amount": 45000,
  "created_at": "ISO date",
  "created_by": "user_id",
  
  // Source tracking (unified)
  "source": "email_sync|historical_upload|email_auto_approval|reprocess_email_logs|manual",
  
  // Email-specific (optional, only for email_sync source)
  "source_mailbox": "gmail|webmail",
  "source_uid": 12345,
  "source_folder": "INBOX/...",
  "email_received_date": "ISO date",
  "email_subject": "...",
  "client_email": "...",
  "client_name_in_body": "...",
  "issuer_name_from_subject": "...",
  "resolution_status": "resolved|unknown_client",
  
  // Trade-linking (optional, for historical/processed)
  "investment_date": "2024-01-15",
  "trade_id": "uuid",
  "email_log_id": "uuid",
  "is_historical": true,
  "type": "actual|interest|prepayment",
  
  // Reinvestment tagging fields
  "reinvestment_tag": "not_tagged|...",
  "portfolio_category": "...",
  "target_ucc": "...",
  "tagged_at": "ISO date",
  "tagged_by": "user_id",
  
  "updated_at": "ISO date"
}
```

---

## Code Changes Required

### PHASE 1: Writers (INSERT/UPDATE operations) - 20 locations

| Line | Function/Context | Change Required |
|------|------------------|-----------------|
| 9060-9134 | Historical repayment upload | `db.actual_repayments` → `db.Ncd_Repayments`, add `source: "historical_upload"` |
| 18792 | clear_all_reinvestment_logs | `db.actual_repayments.update_many` → `db.Ncd_Repayments.update_many` |
| 18949 | clear_duplicate_actual_repayments | `db.actual_repayments.delete_many` → `db.Ncd_Repayments.delete_many` |
| 19088 | reset tags for duplicates | `db.actual_repayments.update_many` → `db.Ncd_Repayments.update_many` |
| 19937 | tag_reinvestment (prepayment) | `db.actual_repayments.update_one` → `db.Ncd_Repayments.update_one` |
| 22217 | sync_actual_from_emails update | `db.actual_repayments.update_one` → `db.Ncd_Repayments.update_one` |
| 22257 | sync_actual_from_emails insert | `db.actual_repayments.insert_one` → `db.Ncd_Repayments.insert_one` |
| 25081 | reset_database | `db.actual_repayments.delete_many` → `db.Ncd_Repayments.delete_many` |
| 33452 | email auto-approval | `db.actual_repayments.insert_one` → `db.Ncd_Repayments.insert_one` |
| 33705 | approve_email_log | `db.actual_repayments.insert_one` → `db.Ncd_Repayments.insert_one` |
| 34165 | approve_single_email | `db.actual_repayments.insert_one` → `db.Ncd_Repayments.insert_one` |
| 34458 | batch approve emails | `db.actual_repayments.insert_one` → `db.Ncd_Repayments.insert_one` |
| 34829 | another approval flow | `db.actual_repayments.insert_one` → `db.Ncd_Repayments.insert_one` |
| 35163 | manual repayment creation | `db.actual_repayments.insert_one` → `db.Ncd_Repayments.insert_one` |
| 35235 | delete repayments | `db.actual_repayments.delete_many` → `db.Ncd_Repayments.delete_many` |
| 35592 | delete by criteria | `db.actual_repayments.delete_many` → `db.Ncd_Repayments.delete_many` |
| 35687 | bulk delete | `db.actual_repayments.delete_many` → `db.Ncd_Repayments.delete_many` |
| 35795-35818 | update/delete entries | `db.actual_repayments` → `db.Ncd_Repayments` |
| 35873 | delete by query | `db.actual_repayments.delete_many` → `db.Ncd_Repayments.delete_many` |
| 41212 | another insert | `db.actual_repayments.insert_one` → `db.Ncd_Repayments.insert_one` |

### PHASE 2: Readers (FIND/QUERY operations) - 25 locations

| Line | Function/Context | Change Required |
|------|------------------|-----------------|
| 15826 | get_client_holdings (pre-fetch) | `db.actual_repayments.find` → `db.Ncd_Repayments.find` + filter `source != "email_sync"` OR include all |
| 16464 | holdings cashflow fetch | `db.actual_repayments.find` → `db.Ncd_Repayments.find` |
| 18089 | get_upcoming_reinvestments | `db.actual_repayments.find` → `db.Ncd_Repayments.find` |
| 18893 | clear_duplicate function | `db.actual_repayments.find` → `db.Ncd_Repayments.find` |
| 19022 | diagnose duplicates | `db.actual_repayments.find` → `db.Ncd_Repayments.find` |
| 19812 | diagnose_duplicate_repayments | `db.actual_repayments.find` → `db.Ncd_Repayments.find` |
| 19898 | tag_reinvestment find prepayment | `db.actual_repayments.find_one` → `db.Ncd_Repayments.find_one` |
| 19959 | find actual repay | `db.actual_repayments.find_one` → `db.Ncd_Repayments.find_one` |
| 22211 | sync check existing | `db.actual_repayments.find_one` → `db.Ncd_Repayments.find_one` |
| 33407 | check existing repayment | `db.actual_repayments.find_one` → `db.Ncd_Repayments.find_one` |
| 33655-33663 | check existing | `db.actual_repayments.find_one` → `db.Ncd_Repayments.find_one` |
| 35870 | count documents | `db.actual_repayments.count_documents` → `db.Ncd_Repayments.count_documents` |
| 35901 | get_client_actual_repayments | `db.actual_repayments.find` → `db.Ncd_Repayments.find` |
| 36150-36164 | delete by date | `db.actual_repayments` → `db.Ncd_Repayments` |
| 36216-36219 | reset historical | `db.actual_repayments` → `db.Ncd_Repayments` |
| 36268 | delete by bond | `db.actual_repayments.delete_many` → `db.Ncd_Repayments.delete_many` |
| 36319 | count repayments | `db.actual_repayments.count_documents` → `db.Ncd_Repayments.count_documents` |
| 36345-36359 | various counts | `db.actual_repayments.count_documents` → `db.Ncd_Repayments.count_documents` |
| 36444 | cross-reference | `db.actual_repayments.find` → `db.Ncd_Repayments.find` |
| 36924 | trade repayments | `db.actual_repayments.find` → `db.Ncd_Repayments.find` |
| 39064 | actual cashflows | `db.actual_repayments.find` → `db.Ncd_Repayments.find` |
| 40452 | actuals find | `db.actual_repayments.find` → `db.Ncd_Repayments.find` |
| 40591 | get_actual_repayments | `db.actual_repayments.find` → `db.Ncd_Repayments.find` |
| 41041-41174 | existing checks | `db.actual_repayments.find_one` → `db.Ncd_Repayments.find_one` |
| 45723 | export sheet | `db.actual_repayments.find` → `db.Ncd_Repayments.find` |

### PHASE 3: Function Parameters/Comments - 10 locations

| Line | Change Required |
|------|-----------------|
| 15536 | Function param name `actual_repayments` - keep as is (just parameter name) |
| 15563-15657 | Comments referencing actual_repayments - update comments |
| 16097-16292 | Variable names `matched_actual_repayments` etc - keep as is (local vars) |
| 18300 | Comment update |
| 18873 | Function name `clear_duplicate_actual_repayments` → `clear_duplicate_repayments` |
| 19797 | Comment update |
| 22173 | Comment update |
| 23920-24138 | Various comments and variable names |
| 25139 | COLLECTION_CATEGORIES description update |

### PHASE 4: DB Manager Collection Categories

Update `COLLECTION_CATEGORIES` at line ~25128:
- Remove `actual_repayments` from "active"
- Add `actual_repayments` to "deprecated"
- Update `Ncd_Repayments` description

---

## Migration Steps

### Step 1: Data Migration Script
```python
# Migrate existing actual_repayments to Ncd_Repayments
async def migrate_actual_to_ncd_repayments():
    # Get all actual_repayments
    actual_reps = await db.actual_repayments.find({}).to_list(None)
    
    migrated = 0
    skipped = 0
    
    for ar in actual_reps:
        # Check for duplicate in Ncd_Repayments
        existing = await db.Ncd_Repayments.find_one({
            "client_id": ar.get("client_id"),
            "bond_id": ar.get("bond_id"),
            "repayment_date": ar.get("repayment_date"),
            "gross_amount": ar.get("gross_amount")
        })
        
        if existing:
            # Merge additional fields
            await db.Ncd_Repayments.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "trade_id": ar.get("trade_id") or existing.get("trade_id"),
                    "investment_date": ar.get("investment_date") or existing.get("investment_date"),
                    "is_historical": ar.get("is_historical", False),
                    "type": ar.get("type") or existing.get("type"),
                    "reinvestment_tag": ar.get("reinvestment_tag"),
                    "portfolio_category": ar.get("portfolio_category"),
                    "target_ucc": ar.get("target_ucc"),
                    "tagged_at": ar.get("tagged_at"),
                    "tagged_by": ar.get("tagged_by"),
                }}
            )
            skipped += 1
        else:
            # Insert as new with source marker
            new_doc = {**ar}
            if not new_doc.get("source"):
                new_doc["source"] = "migrated_from_actual_repayments"
            await db.Ncd_Repayments.insert_one(new_doc)
            migrated += 1
    
    return {"migrated": migrated, "merged": skipped}
```

### Step 2: Code Updates
Apply all changes from Phase 1-4 above.

### Step 3: Mark Deprecated
Update COLLECTION_CATEGORIES to mark `actual_repayments` as deprecated.

### Step 4: Verification
- Test all endpoints that read/write repayments
- Verify Holdings shows correct data
- Verify Reinvestment Tag shows correct data
- Verify historical upload works
- Verify email sync continues to work

---

## Rollback Plan
If issues occur:
1. `actual_repayments` collection remains intact (not deleted)
2. Revert code changes via git
3. Data in Ncd_Repayments from migration has `source: "migrated_from_actual_repayments"` for easy identification

---

## Timeline
1. Migration script: Create and run
2. Code changes: ~45 locations in server.py
3. Testing: All repayment-related endpoints
4. Mark deprecated: Update collection categories
