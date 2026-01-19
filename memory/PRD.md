# B2B Investment Broker Platform - PRD

## Original Problem Statement
Build a B2B platform for brokers to manage client investments in NCDs (Non-Convertible Debentures) and Real Estate. Core features include:
- CAS PDF analysis with complex financial calculations (FIFO, per-transaction XIRR, TDS)
- Holdings management with prepayment tracking
- Bulk data upload capabilities
- Client and sub-broker management

## User Personas
- **Broker Admin**: Manages clients, sub-brokers, and investment opportunities
- **Sub-Broker**: Limited access to manage assigned clients
- **Client**: End investors (managed by brokers)

## Core Requirements

### Authentication
- Two-step login (PAN + Password, then PIN)
- Role-based access (broker, sub_broker, client)

### Dashboard
- Analytics overview (clients, AUM, opportunities)
- Charts for client distribution and trends

### Holdings Management ✅
- View client bond holdings with XIRR
- Record principal prepayments with percentage calculation
- Automatic interest recalculation on prepayment
- Bulk repayment update via Excel
- Email notifications to clients on prepayment

### Client Management ✅
- Create/Edit/Delete clients
- **Multiple UCCs per client** (up to 5, minimum 1 required)
- UCCs must be unique across all clients (one UCC cannot belong to multiple clients)
- Three-dots menu with: Resend Credentials, Reset Password, Deactivate, Delete
- Bulk client upload with UCC1-UCC5 columns
- Link clients to sub-brokers

### Analysis (CAS PDF Processing)
- Upload password-protected CAS PDFs
- Parse and extract investment data
- Generate multi-sheet Excel reports
- Client selection mandatory for tracking

### Reinvestment Tagging ✅
- Tag upcoming cashflows for reinvestment
- Support for: Principal, Interest, Net Amount, Custom, Not Invest
- **Target UCC selection** for reinvestment (dropdown shows client's UCCs)
- Send for client approval via email
- Shows prepayment-affected entries with "Revised" badge
- Displays original vs amended amounts with strikethrough
- Untag functionality to move items back to untagged

### Bulk Upload Features ✅
- Bonds: Multi-sheet Excel (Bond Details, Financial Details, Units & Limits, Principal Payments)
- Clients: Multi-sheet Excel with proper PAN field handling
- Sub-brokers: Single sheet upload
- Real Estate: Multi-sheet upload

---

## What's Been Implemented

### 2026-01-19 (Current Session - Secondary Market Bond Calculator)
- **Feature**: Enhanced Secondary Market Calculator on BondDetails page
  - **Backend**: New endpoint `/api/bonds/{bond_id}/calculate-enhanced`
  - **Clean Price**: Present Value of future cashflows discounted at Secondary IRR
  - **Accrued Interest**: Proportional calculation based on days since last payment
  - **Dirty Price**: Clean Price + Accrued Interest (total amount buyer pays)
  - **Premium/Discount**: Difference from face value with percentage display
  - **Interest Period Details**: Last/Next payment dates, days calculations
  - **Future Cashflows**: Remaining payments count and totals
  - **Proposed IRR (Client)**: Displays bond's secondary_irr prominently
- **Test Bond Added**: "All Home Bharat Platform" (CDHBP002)
  - Secondary IRR: 11.5%, Coupon Rate: 14%, Face Value: ₹100,000
  - 18 monthly interest payments, 2 principal payments (50% each)
- **Testing**: 12/12 backend tests passed, all frontend UI features verified
  - Test file: `/app/tests/test_enhanced_calculator.py`

### 2026-01-17 (Current Session - Bulk Upload Upsert)
- **Feature**: Bulk upload now supports UPDATE existing clients
  - Re-uploading a file with existing PAN will update missing fields instead of rejecting
  - Only empty/missing fields are updated (existing data is preserved)
  - Response now includes: success, failed, updated, created counts
  - UCC check now only rejects if UCC belongs to a DIFFERENT client
- **Testing**: Manual testing verified create -> update workflow works correctly

### 2026-01-17 (Current Session - Bulk Upload & Sub-Broker Permissions)
- **Feature**: Bulk upload now reads ALL 5 sheets from Excel template
  - Personal Details (with UCC1-UCC5)
  - Address Details
  - Bank Details  
  - Nominee Details
  - Sub-Broker Assignment
  - Data merged by PAN across all sheets
- **Feature**: Sub-brokers can now create and update clients
  - POST /api/clients allows sub_broker role
  - PUT /api/clients/{id} allows sub_broker for linked clients
  - Clients created by sub-broker auto-link to them
- **Testing**: 12/12 backend tests passed (1 skipped - no sub-broker account)

### 2026-01-17 (Current Session - Multiple UCCs Feature)
- **Feature**: Multiple UCCs per client (up to 5)
  - Backend: Changed `ucc: str` to `ucc_list: List[str]` in ClientCreate/ClientUpdate models
  - Added UCC uniqueness validation (UCCs cannot be shared across clients)
  - At least 1 UCC required, maximum 5 allowed
  - Frontend: Dynamic UCC input fields with Add/Remove buttons in Create/Edit Client modals
  - Bulk upload template updated with UCC1-UCC5 columns
- **Feature**: Target UCC selection in Reinvestment Tagging
  - Backend: Added `target_ucc` field to reinvestment tag update
  - Added `client_ucc_list` to reinvestment/upcoming response
  - Frontend: Target UCC dropdown appears when entry is tagged (shows client's available UCCs)
- **Bug Fix**: Removed duplicate `update_client` endpoint that was overriding proper UCC validation
- **Testing**: 14/14 backend tests passed, all frontend UI tests verified

### 2026-01-17 (Current Session - Reinvestment Tagging Fix)
- **Bug Fix**: Reinvestment Tagging page Deal ID display
  - Backend: Added `bond_code` field to `/api/reinvestment/upcoming` response
  - Fetches bond_code from trade document or bond document as fallback
  - "Deal ID" column now shows actual bond codes (e.g., "CDUCIC01") instead of "N/A"
- **Feature**: Untag button functionality
  - Added `handleUntag()` function in ReinvestmentTagging.jsx
  - Calls API to reset tag to 'not_tagged' and clear portfolio_category
  - Fixed incorrect button handler (was calling handleTagChange with wrong params)
  - Button shows loading state during untag operation
- **Testing**: All 14 pytest tests passed (100% success rate)
  - Test file: `/app/tests/test_reinvestment_tagging.py`

### 2026-01-17 (Current Session - Earlier)
- **UI Refactor**: Completely restructured sidebar navigation
  - Removed nested "User" and "Admin" menus
  - Made "Sub Broker" and "Client" separate top-level tabs
  - Moved "Bulk Upload" from Admin to top-level "Upload" 
  - Added "Opportunities" with hover dropdown for "Add Bond" / "Add Real Estate"
  - Simplified navigation with all items at top level
  - Added "Settings" as top-level menu item

- **Analysis Page Updates**:
  - Removed "Folios" column from Previous Analyses table
  - Added hover tooltip on Client name showing "Requested By" and "Sub-Broker" details
  - Reduced table columns: Client, File Name, Date, Actions
  - Dashboard section already available after analysis completion

### 2026-01-17 (Current Session - Earlier)
- **UI Cleanup**: Reorganized sidebar navigation
  - Moved "Add User" from Admin submenu to top-level "User" menu
  - "User" menu now contains Sub Broker and Client sub-items
  - Simplified Admin menu structure (Opportunities, Bulk Upload only)

- **UI Cleanup**: Removed credential hover display on Sub-Broker page
  - Removed HoverCard component that showed login credentials on hover
  - Sub-broker names now display as plain text without credential reveal
  - Credentials can still be resent via the 3-dots action menu

- **Feature**: Consolidated Scheme Master into Bulk Upload page
  - Added "Scheme Master" as 6th tab in BulkUpload.jsx
  - Shows current status (total schemes, last upload date)
  - Includes BSE StAR MF download instructions with external link
  - File upload functionality for SCHMSTRPHY.txt files
  - Removed separate Scheme Master page from Admin menu

### 2026-01-17 (Earlier in Session)
- **Feature**: Removed "Credit Rating" field from bond creation and bulk upload
  - Backend: Cleaned BondCreate, Bond, BondUpdate Pydantic models (no credit_rating)
  - Backend: Bulk template no longer includes Credit Rating column
  - Frontend: Removed credit_rating from EditBondModal.jsx (form state, payload, UI)
  - Verified: Bond creation and bulk upload work correctly without credit_rating

- **Feature**: Bulk Historical Trades Upload Module
  - New template download: `GET /api/bulk/template/historical-trades`
  - Template columns: Deal ID, Investment Date, Investor Name, Investor PAN, Units, Purchase Price, IFA Name, Notes
  - Bulk upload endpoint: `POST /api/bulk/historical-trades`
  - **Option A Implementation**: Trust user-provided Units and Investment Amount
    - Secondary market purchases at discount are fully supported
    - Price per unit calculated as: Investment Amount ÷ Units
    - No strict price validation (negotiated prices vary)
  - Validations:
    - Bond code must exist in system
    - Client must exist (matched by name or PAN)
    - Units and Investment Amount must be positive
  - On success: Creates trade record, updates bond units_sold, generates cashflows
  - Frontend: Added "Historical Trades" tab in BulkUpload.jsx with amber theme

- **Feature**: Exact Cashflows Per Unit for Secondary Market Bonds
  - Updated Bond Bulk Upload template with new **"Cashflows Per Unit"** sheet (Sheet 5)
  - Columns: Bond Code, Payment Date, Interest Per Unit, Principal Per Unit
  - When provided, system uses EXACT values instead of calculated amounts
  - `generate_client_cashflows()` now prioritizes `cashflows_per_unit` field
  - Cashflows are filtered to only include payments AFTER client's investment date
  - Client amounts = per-unit amounts × units
  - **Verified**: System generates cashflows matching Excel exactly (e.g., June 24 Interest: ₹70,776.30 vs Excel ₹70,776.26)

### 2026-01-16 (Previous Session)
- **Feature**: Enhanced prepayment with percentage calculation and display
  - Shows prepayment percentage in success toast (e.g., "₹1,00,000 (10%) principal prepaid")
  - Shows remaining principal percentage (e.g., "Remaining: ₹9,00,000 (90%)")
  - Real-time percentage preview in prepayment modal as user enters amount
- **Feature**: Client email notification on prepayment
  - Added `send_prepayment_notification_email()` function to email_service.py
  - Professional HTML template with prepayment details, investment summary, revised schedule
  - Email includes amount prepaid, percentage, original/remaining principal
- **Feature**: Reinvestment tags marked for review on prepayment
  - Affected cashflows flagged with `prepayment_affected` and `reinvestment_tag_needs_update`
  - Backend API returns count of affected reinvestment tags
- **Feature**: Reinvestment Tagging page shows prepayment-affected entries
  - "Revised" badge on amended entries (amber color)
  - Original amounts shown with strikethrough below current amounts
  - Added fields: is_amended, prepayment_affected, original_net_amount, amendment_reason

### 2026-01-16 (Previous Fork)
- **Bug Fix**: Bond bulk upload now reads all 4 Excel sheets and merges by bond_code
- **Bug Fix**: Client bulk upload now correctly stores `pan_number` field
- **Feature**: Edit client modal with full form (Personal, Address, Bank, Sub-broker details)
- **Feature**: Three-dots menu for clients (Resend Credentials, Reset Password, Deactivate, Delete)
- **Backend**: Added `/api/clients/{id}/resend-credentials`, `/reset-password`, `/deactivate` endpoints
- **Email Service**: Fixed SMTP connection via `donotreply@kinntegraa.club`
- **Email Templates**: Redesigned all templates to match website UI/branding

### Previous Sessions
- Holdings page major feature set (prepayment, XIRR, bulk upload)
- Test data creation for Holdings verification
- UI/UX overhaul (Analysis, Reinv Tag, Logs pages)
- Client selection mandatory on Analysis page
- Interest calculation with reducing principal balance
- "On Maturity" interest frequency option

---

## Prioritized Backlog

### P0 - Critical
- Production deployment pipeline (user handles manually via "Save to Github")

### P1 - High Priority
- User verification of all recent features (prepayment, client management, bulk upload)
- Final verification of CAS analysis report generation

### P2 - Medium Priority
- BondDetails radio button UI bug (recurring)

### Technical Debt - CRITICAL
- `server.py` (~5000+ lines) - needs router separation
- `analysis_service.py` (~2500 lines) - needs modularization
- `RealEstateDetails.jsx` (~3500 lines) - needs component breakdown

---

## Test Credentials
- **Broker Login**: PAN: ANVPB5297J, Password: Laksh@0208, PIN: 0516
- **PDF Password**: prima12

## Database
- Name: `test_database`
- Collections: users, clients, trades, cashflows, analyses, bonds, holding_cashflows, prepayment_records

## Navigation Structure (Updated 2026-01-17)
- **Dashboard** - Analytics overview
- **Opportunities** - View all + hover to Add Bond/Real Estate
- **Logs** - Trade logs
- **Holdings** - Client holdings
- **Analysis** - CAS PDF analysis with dashboard
- **Reinv Tag** - Reinvestment tagging
- **Sub Broker** - Top-level sub-broker management
- **Client** - Top-level client management
- **Upload** - Bulk upload for all data types (including Scheme Master)
- **Settings** - Platform settings

## Key API Endpoints
- `/api/clients` - CRUD for clients
- `/api/bonds/{bond_id}/calculate-enhanced` - Enhanced Secondary Market Calculator (Clean Price, Accrued Interest, Dirty Price)
- `/api/bulk/template/historical-trades` - Download Excel template for historical trades
- `/api/bulk/historical-trades` - Bulk upload historical client bond investments
- `/api/clients/{id}/resend-credentials` - Reset and resend credentials
- `/api/clients/{id}/reset-password` - Reset password only
- `/api/clients/{id}/deactivate` - Soft deactivate client
- `/api/bulk/bonds` - Bulk upload bonds (multi-sheet)
- `/api/bulk/clients` - Bulk upload clients
- `/api/holdings/*` - Holdings management APIs
- `/api/holdings/trade/{trade_id}/record-prepayment` - Record prepayment with email notification
- `/api/reinvestment/upcoming` - Get upcoming cashflows with prepayment flags
