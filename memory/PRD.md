# Kinntegraa - Product Requirements Document

## Recent Changes (Jan 25, 2026)

### Holdings Page - Email, Sync & Upload Features (Jan 25, 2026)
**New Features Implemented**:

1. **Holdings Report Email Button** (`Holdings.jsx`, `server.py`, `email_service.py`):
   - EMAIL button now sends holdings report to client email
   - Sub-broker automatically CC'd on the email
   - API: `POST /api/holdings/client/{client_id}/send-report-email`
   - Shows loading state "SENDING..." during operation

2. **Sync Email Repayments** (`Holdings.jsx`):
   - New "Broker Tools" section visible only to brokers
   - "Sync Email Repayments" button triggers email inbox processing
   - Reads from `updates@kinntegraa.club` (configured in backend)
   - API: `POST /api/email-reader/process?days_back=30`
   - Automatically refreshes holdings after sync

3. **Upload Historical Data** (`Holdings.jsx`):
   - Upload button accepts Excel files (.xlsx, .xls)
   - Merges/updates existing actual repayment data
   - API: `POST /api/bulk/historical-trades`
   - Shows upload progress state

**Technical Notes**:
- Email service uses real SMTP (not mocked)
- Broker Tools toolbar only visible to `role='broker'`
- Historical upload template: `GET /api/bulk/template/historical-trades`

---

### Bug Fixes - PDF and Excel Download (Jan 25, 2026)
**Issues Fixed**:
1. **PDF Download Blank**: The "Expected Cashflow" PDF download was generating blank files
2. **Excel Download Error**: The main "DOWNLOAD" button was failing with `KeyError: 'type'`

**Root Causes & Fixes**:
1. **PDF Fix** (`Holdings.jsx`):
   - `html2pdf.js` uses `html2canvas` which cannot capture off-screen elements
   - Changed container positioning from `position: absolute; left: -9999px` to `position: fixed; opacity: 0; z-index: -1000`
   - Added proper dimensions for A4 landscape (297mm width)
   - Added 100ms delay to ensure DOM is ready

2. **Excel Fix** (`server.py` line 11418):
   - Changed `cf['type'].capitalize()` to `cf.get('type', 'scheduled').capitalize()`
   - The `holding_cashflows` collection doesn't have a `type` field, while `expected_cashflows` does

### Holdings Page UI Enhancements (Jan 25, 2026)
**Changes Made**:
1. **Excel Download Restructured** - Now has 3 sheets:
   - `Summary` - Client info & investment totals
   - `Expected Cashflows` - Investment (outflow) & Maturity (inflow) rows with Principal, Interest, Gross
   - `Actual Cashflows` - Repaid entries with Principal, Interest, TDS, Net, Repaid Date

2. **Removed Bottom Summary Bar** in cashflow modal (Investment, Total Principal, Total Interest, Total TDS, Upcoming, Net Profit)

3. **Removed O/S TDS** from:
   - Header statistics bar
   - Holdings table column (only shows O/S Principal, O/S Interest)

4. **Actual XIRR Calculation Implemented**:
   - Previously: Actual XIRR = Expected XIRR (no calculation)
   - Now: Actual XIRR = XIRR(Investment Outflow + All Actual Repayments)
   - Based on historical transactions uploaded via repayment schedule
   - Example: Expected 12.00% vs Actual 11.38% (due to prepayments)

5. **Combined PDF Download**:
   - Single PDF now contains BOTH Expected and Actual Cashflows side-by-side
   - Shows summary header with Investment, Expected Returns, Expected Profit, Expected XIRR, Actual XIRR
   - Works for both Summary tab and Individual Transaction tabs

6. **Individual Transaction Tabs Enhanced**:
   - Now show both Expected and Actual Cashflows with same structure
   - Investment entries shown in red (outflow)
   - Maturity entries shown in blue
   - Profits calculated and displayed in footer for both tables

---

### Expected Repayments - Investment Value Calculation (Secondary Calculator)
**Requirement**: The investment value in Expected Repayments should be calculated using the Secondary Market Calculator, not just taken from the file upload.

**Implementation**:
1. **Backend** (`server.py`): Updated `/api/holdings/client/{client_id}` to:
   - Calculate investment value using Secondary Market Calculator (PV of remaining cashflows)
   - Include investment as the first entry in `expected_cashflows` array with `type: 'investment'`
   - Add `calculated_investment` field to each holding
   - Formula: PV = Σ(CF / (1 + IRR)^years) × units

2. **Frontend** (`Holdings.jsx`): Updated modal to:
   - Display investment entries in red with "INV" badge (outflow)
   - Display maturity entries in green with "MAT" badge (inflow)
   - Footer shows "Investment (Calc)" separately from principal/interest

**Verification Data** (Bond CDNRE001, Client Fali):
| Trade Date | Units | Investment (Calc) | Maturity Gross | Profit | XIRR |
|------------|-------|-------------------|----------------|--------|------|
| 30 Apr 2025 | 34 | ₹39,16,923 | ₹43,57,090 | ₹4,40,167 | 12% |
| 02 May 2025 | 31 | ₹35,73,531 | ₹39,72,641 | ₹3,99,110 | 12% |
| 07 May 2025 | 135 | ₹1,55,86,328 | ₹1,73,00,210 | ₹17,13,881 | 12% |

### Expected Repayments Fix (Holdings Modal)
**Issue**: Expected Repayments section showed "No expected cashflows from bond definition" in the Holdings modal

**Root Cause**: 
1. Frontend `getConsolidatedHoldings` function wasn't passing `expected_cashflows` and `actual_cashflows` arrays to the modal
2. Dead code referencing undefined `maturity_cashflows` variable in server.py (line 9322)

**Fix Applied**:
1. Updated `Holdings.jsx` line 596-607 to include `expected_cashflows` and `actual_cashflows` in the trades array
2. Removed dead code in `server.py` at line 9322

**Verification**:
- Expected Repayments now shows data from bond template (08 Apr 2026: Principal + Interest)
- Actual Repayments shows 5 prepayments from Oct 2025 to Apr 2026
- Both Summary tab and individual trade tabs display expected_cashflows correctly
- Expected XIRR and Actual XIRR both show 12.00%

### Backend XIRR/Cashflow Logic Removed
**Reason**: Complex XIRR calculations were producing incorrect results (18.74% instead of expected 11.38%)

**What was removed**:
- XIRR calculation functions: `calculate_actual_xirr`, `calculate_holding_xirr`
- Admin cashflow endpoints (6 endpoints, ~990 lines):
  - `/api/admin/sync-prepayments/{client_id}`
  - `/api/admin/reprocess-prepayments/{trade_id}`
  - `/api/admin/detect-prepayments/{client_id}`
  - `/api/admin/rebuild-cashflows-from-history/{trade_id}`
  - `/api/admin/recalculate-cashflows-book2/{trade_id}`
  - `/api/admin/generate-prepayment-schedule/{trade_id}`
- Frontend admin buttons in Holdings page

**What was kept**:
- Bond calculator logic (secondary market price calculations)
- Holdings API now uses bond's `secondary_irr` for both Expected and Actual XIRR

---

## Recent Changes (Jan 24, 2026)

### Book2.xlsx XIRR Calculation Fix
**Issue**: Actual XIRR for Natureresidences trades was incorrect due to wrong principal/interest calculations

**Root Cause**: The recalculation endpoint was not correctly implementing Book2.xlsx logic

**Fix Applied**:
1. Updated `/api/admin/recalculate-cashflows-book2/{trade_id}` to:
   - Use correct day counting: +1 for prepayments, no +1 for maturity
   - Calculate principal: 7% of original for prepayments, remaining balance for maturity
   - Calculate interest: Balance × 18.78% × Days / 365
2. Verified XIRR calculation matches Book2.xlsx exactly (11.3784%)

**Book2.xlsx Key Parameters**:
- Coupon Rate: 18.78%
- Face Value: ₹100,000/unit
- Prepayment: 7% monthly (₹945,000 for 135 units)
- XIRR Model: Prepayments get principal only, maturity gets principal + ALL accumulated interest

### Sub-broker Reinvestments in Lead Management
**Feature**: Added "My Reinvestments" tab in LeadManagement.jsx for sub-brokers
- Shows all their reinvestment submissions
- Displays status (Pending, Approved, Rejected)
- Shows broker notes and rejection reasons

---

## Original Problem Statement
A wealth management platform for brokers to manage clients, bonds, real estate investments, and sub-brokers. The application allows:
- Brokers to create and manage investment opportunities (Bonds & Real Estate)
- Sub-brokers to assist in client management
- Clients to view their investments and holdings
- CAS (Consolidated Account Statement) PDF analysis

## User Personas
1. **Broker**: Full admin access - manages all entities
2. **Sub-Broker**: Limited access - works with linked clients, requires approval for new items
3. **Client**: Read access - views own investments

## Core Features Implemented

### Authentication & Authorization
- Two-step login (PAN + Password, then PIN)
- Role-based access control (Broker, Sub-Broker, Client)
- Password reset functionality
- Customer self-registration

### Dashboard (Updated: Jan 2026)
- **Broker Dashboard**: 
  - Total Clients (Venn diagram style with soft indigo/pink/purple colors)
  - Sub-Brokers count
  - Opportunities (Bonds & Real Estate)
  - Bond AUM (INR)
  - Real Estate AUM (AED)
  - Forex rate display (AED to INR from live API)
  - Quick Actions (card-style grid: Opportunities, Clients, Sub-Brokers, Reset DB)
  - REMOVED: AUM by Sub-Broker section (per user request Jan 21, 2026)
  
- **Sub-Broker Dashboard**:
  - Total AUM under management
  - My Clients (Venn diagram)
  - Bond AUM (INR)
  - Real Estate AUM (AED with INR conversion)
  - Quick Actions

### Real Estate Investment Management (Updated: Jan 22, 2026)
#### Payment Schedule
- **Combined DLD + Admin Fee Row**: DLD and Admin fees are merged into ONE row positioned between Booking Amount and 1st Installment
- Per-investor tracking with separate D (DLD) and A (Admin) badges for individual payment tracking
- Progress bars for Invoices, Payments, Receipts
- "$" icon for the combined fee row

#### Sell Unit Feature (Enhanced: Jan 22, 2026)
- Auto-populates selling fee % from opportunity data
- **XIRR Preview** shown BEFORE submission with:
  - Investment (Outflows): Unit Price Paid, DLD + Admin
  - Sale Proceeds (Inflow): Gross Sale, Less: Selling Fee
  - Net Profit calculation
  - Expected XIRR percentage (annualized return)
- **Sale Returns Section**: Displays after property is sold (closed status) with:
  - Sale Date, Sale Price, Selling Fee %, Net Proceeds
  - Total Invested, Net Profit, Profit %, XIRR

#### XIRR Comparison Report
- Fixed crash caused by missing `User` icon import
- Modal shows full cashflow comparison with DLD and Admin fee rows
- Export to PDF functionality

#### Bulk Real Estate Upload (Fixed: Jan 22, 2026)
- Fixed "Network Error" caused by:
  1. Missing `idx` variable in error handling
  2. Duplicate column names after normalization (`Developer Discount (AED)` and `Developer Discount (%)` both becoming `developer_discount`)
- Now properly handles multi-sheet Excel format with columns:
  - Basic Information: Building Name, Unit No, Developer Name, Location, Description, Handover Date
  - Pricing & Fees: Unit Price, DLD Fee %, Admin Fee, Broker Fee, Other Fees, Unit Selling Fee %, Developer Discount (AED), Developer Discount (%)
  - Unit Details: Unit Type, Floor, Total Area, Carpet Area, Balcony Area, Parking Spaces
  - Sale Settings: Expected Sale Rate, Estimated Sell Date, Eligible to Sell After %
  - Payment Schedule: Payment Description, Due Date, Percentage

### Approval Workflow System (NEW - Jan 21, 2026)
Complete 3-phase approval workflow for sub-broker actions:

#### Phase 1: Broker Approval
- **PendingApprovals page** (`/broker/pending-approvals`): Broker can view and approve/reject:
  - Clients created by sub-brokers
  - Reinvestment submissions by sub-brokers
- Tabs for Clients and Reinvestments with pending counts
- Approval modal with option to send client email

#### Phase 2: Client Email Approval
- After broker approves, client receives email with unique approval link
- Client clicks link to approve/reject (no login required)
- Link expires after 7 days

#### Phase 3: Kinntegra API Integration
- When client approves reinvestment, system prepares Kinntegra API payload
- API endpoint: `POST https://api.kinntegra.co.in/api/transaction/addbuyschedule`
- Currently in "pending_api_credentials" status (waiting for API authentication details)

#### Approval Logs
- **ApprovalLogs page** (`/broker/approval-logs` and `/sub-broker/approval-logs`)
- Timeline view of all approval workflow activities
- Filterable by entity type (clients, reinvestments)
- Shows actor, action, timestamp, and details
- Visible to: Broker, Sub-Broker, Client (based on role)

### Sub-Broker Module (Updated: Jan 21, 2026)
- **Dashboard**: `/sub-broker/dashboard` - Personal business overview
- **Opportunities**: View and share investment opportunities
- **Holdings**: View client holdings
- **Clients**: Create/view linked clients (pending broker approval)
- **Reinvestment Tag**: Tag cashflows with UCC dropdown for linked clients
- **Logs**: View approval workflow logs
- **Analysis**: Upload CAS files for linked clients
- **Profile**: Edit personal details (email, phone, password, PIN, address)

### Client Management
- Conditional bank details based on residency/passport type
- Bulk upload (Indian & Foreign passport holders)
- Pincode lookup API integration
- Sub-broker can create clients (pending broker approval)

### Investment Management
- Bond opportunities with payment schedules
- Real Estate opportunities with investor tracking
- Trade verification workflow

### Analysis
- CAS PDF parsing (handles dishonoured transactions)
- Gap sheet generation

### Admin Features
- Database reset functionality
- Sub-broker management (search, sort, CRUD)
- Pending approvals view for broker

## Tech Stack
- **Frontend**: React + Tailwind CSS + Shadcn/UI + Recharts
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Third-Party**: 
  - Currency Exchange API (fawazahmed0/exchange-api)
  - Pincode lookup API
  - Kinntegra Investment API (pending integration)

## Recent Changes (Jan 21, 2026)

### Approval Workflow Complete
1. **Backend Endpoints Added**:
   - `GET /api/approval-workflow/pending` - Get all pending approvals
   - `POST /api/approval-workflow/client/{id}` - Approve/reject client
   - `GET /api/approval-workflow/client-approve` - Public client approval link
   - `POST /api/approval-workflow/submit-reinvestment` - Sub-broker submit reinvestment
   - `POST /api/approval-workflow/reinvestment/{id}` - Approve/reject reinvestment
   - `GET /api/approval-workflow/reinvestment-approve` - Public reinvestment approval link
   - `GET /api/approval-logs` - Get approval logs
   - `GET /api/approval-workflow/my-submissions` - Sub-broker's submissions

2. **Frontend Pages Added**:
   - `PendingApprovals.jsx` - Broker approval dashboard
   - `ApprovalLogs.jsx` - Approval workflow timeline

3. **Email Templates Added**:
   - `send_client_approval_request_email` - Client account confirmation
   - `send_reinvestment_client_approval_email` - Reinvestment approval request

4. **Bug Fix**:
   - Fixed sub-broker partner lookup to use `created_by` field for broker_id

## Recent Changes (Jan 22, 2026)

### Bond Card Quick Calculator Enhancement (NEW)
**Feature Request**: Add amount input to Quick Calculator with range bounds

**Changes Implemented**:
1. **Deal ID + Expected IRR Combined**: Now displayed on one line in the bond card
2. **Amount Input in Quick Calculator**: 
   - Added "Amount (₹)" input field alongside Units
   - When amount entered, shows range bounds (Lower/Upper) with unit counts and amounts
   - Automatic Indian number formatting (e.g., 10,00,000)
3. **Range Bounds Display**:
   - Lower Bound: floor(amount/price) units with exact cost
   - Upper Bound: ceil(amount/price) units with exact cost

**Files Modified**:
- `/app/frontend/src/pages/Opportunities.jsx` - Bond card layout and Quick Calculator

### Block Units Form Editable (Jan 22, 2026)
**Feature Request**: Block Units for Client form should be editable, not pre-filled

**Changes Implemented**:
1. Form fields (Date of Investment, No. of Units Bought, Amount Transferred) are now empty/editable
2. Reference info from Calculator shown separately as a guide
3. Form submission uses user-entered values, not calculator values

**Files Modified**:
- `/app/frontend/src/pages/BondDetails.jsx` - bookUnits function and form fields

### Cashflow Report Landscape Mode (Jan 22, 2026)
**Feature Request**: Generate cashflow report in landscape mode for better spacing

**Changes Implemented**:
1. PDF export orientation changed to 'landscape'
2. Modal layout optimized for landscape (summary cards horizontal, table full-width)
3. Better spacing and readability for the cashflow schedule

**Files Modified**:
- `/app/frontend/src/pages/BondDetails.jsx` - exportCashflowToPDF and modal layout

### Share with Clients Modal Improvements (NEW)
**Feature Request**: Add search functionality and email integration to the Share with Clients modal

**Changes Implemented**:
1. **Search Functionality**:
   - Added search input with placeholder "Search by name, email, phone or PAN..."
   - Real-time filtering of client list as user types
   - Shows "Showing X of Y" count when search is active
   - Select All works with filtered results only

2. **Email Integration**:
   - Added "Send via Email" toggle (ON by default)
   - Added "Include Property Photos" checkbox (visible when email is enabled)
   - Submit button text changes: "Share & Email X Client(s)" vs "Share with X Client(s)"
   - Shows warning for clients without email addresses
   - Emails include property photos (up to 4) when enabled

3. **UI Enhancements**:
   - Mail icon shown next to clients with email addresses
   - Email options in a distinct gray background section
   - Proper data-testid attributes for all interactive elements

**Files Modified**:
- `/app/frontend/src/pages/RealEstateDetails.jsx` - ShareWithClientsModal component
- `/app/backend/server.py` - Added `include_photos` parameter to EmailShareRequest
- `/app/backend/email_service.py` - Updated `send_real_estate_opportunity_email` to include photos

### Fine-grained Permission Fix (RealEstateDetails page)
**Feature Request**: Restrict actions based on user role and client linkage

**Changes Implemented**:
1. **XIRR Summary Report Section**:
   - "Edit %" and "Remove" investor buttons visible ONLY to broker role
   - Sub-brokers and clients cannot see these buttons

2. **Payment Schedule & DLD+Admin Row**:
   - Upload buttons (Invoice/Swift/Receipt) restricted by `canManageInvestorPayment()` function
   - Broker: Can manage all investors
   - Sub-broker: Can only manage their linked clients
   - Client: Can only manage their own payments

3. **Client Co-Owner Detection Fix**:
   - Fixed `isCoOwner` check to properly match client users with investors
   - Now checks: `inv.client_id === user.id || inv.user_id === user.id || (user.client_id && inv.client_id === user.client_id)`

### Profile Data Parity Fix
- **Issue**: Profile information on Holdings page was not visible to clients and sub-brokers
- **Root Cause**: `GET /api/clients/{client_id}` only allowed broker and sub-broker access, not clients viewing their own profile
- **Fix Applied**:
  1. Modified `GET /api/clients/{client_id}` (server.py lines 6736-6759) to add client role check: allows clients to access their own profile via `user_id` match
  2. Modified `GET /api/holdings/clients` (server.py lines 7971-7986) to handle client role: clients now see only themselves in the list
  3. Updated `Holdings.jsx` to import `ClientSidebar` for proper navigation when client accesses the Holdings page
- **Verified**: All 11 backend tests pass, frontend UI verified for all three roles

### Profile Layout Alignment Fix (Jan 22, 2026)
- **Issue**: Client Profile page (`/client/profile`) had a completely different layout from the Broker Holdings Profile tab
- **Root Cause**: `ClientProfile.jsx` used a compact card-style design while `Holdings.jsx` Profile tab used a comprehensive grid layout
- **Fix Applied**:
  1. Completely rewrote `ClientProfile.jsx` to match the exact JSX structure of `Holdings.jsx` Profile tab
  2. Sections now match: Personal Details (3-col), Address Details (3-col), Bank Details (4-col), Nominee Details (4-col)
  3. Conditional sections added: International Bank (NRI), Passport Details, Emirates ID (UAE), UCC List
  4. Same icon colors: amber-600 for main sections, with specific colors for conditional sections
- **Verified**: All 29 frontend layout tests pass, visual comparison confirms identical layouts

### Opportunities & Logs Module Alignment (Jan 22, 2026)
- **Issue**: Opportunities and Logs pages had different layouts and features for different roles
- **Requirements**:
  - Same layout for all roles
  - All opportunities visible to all roles (available, funded, exited)
  - Detailed visibility for linked/invested clients, basic info for others
- **Fix Applied**:
  1. Unified `Opportunities.jsx` to work for all roles (broker, sub-broker, client)
  2. Same tabs across all roles: Available, Funded/Invested, Closed/Exited
  3. Same card layout: Property name, unit info, size, cost, location
  4. Role-specific buttons: Edit (Broker), Share (Sub-broker), None (Client)
  5. Conditional detailed access: Clients see investor counts/payment progress only for invested properties
  6. Added `Approval Logs` to ClientSidebar and created `/client/approval-logs` route
- **Verified**: All 23 frontend tests pass, visual comparison confirms identical layouts

### DLD+Admin Row Alignment with Installments (Jan 22, 2026)
- **Issue**: DLD+Admin Fee row only had simple "D" and "A" buttons, not the full Upload Invoice/Swift/Receipt sections like installment rows
- **Fix Applied**:
  1. Updated DLD+Admin row to use same 3-column layout (Invoice, Swift, Receipt)
  2. Sequential workflow: Invoice → SWIFT (verify by broker) → Receipt (approve by broker)
  3. Uses `dld_admin_documents` array with fields: invoice_url, swift_url, swift_verified, receipt_url, receipt_approved
  4. Updated progress bars to show document upload status per investor
- **Verified**: All 10 frontend tests pass, layout matches installment rows exactly

### Broker Approvals & Logs Combined (Jan 22, 2026)
- **Issue**: Broker had separate menu items for "Approvals" and "Logs"
- **Fix Applied**:
  1. Created `ApprovalCenter.jsx` with combined tabs for Pending Approvals and Activity Logs
  2. Updated broker sidebar to show single "Approvals & Logs" menu item
  3. Pending Approvals tab has sub-tabs for Clients and Reinvestments
  4. Activity Logs tab shows all workflow activities with filtering
- **Verified**: Screenshot confirms both tabs work correctly

### Holdings Tab Alignment (Jan 22, 2026)
- **Issue**: Client Holdings page had different tab structure than Broker Holdings page
- **User Requirements**:
  - Sidebar = "Holdings" (keep as is)
  - Inside page = tabs should be "Bonds", "Trades", "Real Estate" (not "Holdings")
  - Trades tab shows only that client's trades
- **Fix Applied**:
  1. Renamed "Holdings" tab to "Bonds" in broker Holdings page
  2. Updated Client Holdings page to use same underline-style tabs
  3. Added "Trades" tab to Client Holdings page with client-specific trades
  4. Both pages now have: Bonds, Trades, Real Estate tabs (broker also has Profile)
- **Verified**: Screenshots confirm aligned tab structure

### Payment & XIRR Visibility Restrictions (Jan 22, 2026)
- **Issue**: Non-investor clients and sub-brokers without linked clients could see Payment Schedule and XIRR Comparison Report
- **User Requirements**:
  - Client: Only see Payment/XIRR if they are an investor in that property
  - Sub-broker: Only see Payment/XIRR if at least one of their linked clients is an investor
- **Fix Applied**:
  1. Added `canViewPaymentManagement` check to Payment Schedule section
  2. Added `canViewPaymentManagement` check to XIRR Comparison Report section
  3. These checks use existing `isClientInvestor()` and `isSubBrokerLinkedInvestor()` helper functions
- **Verified**: Screenshots confirm non-investor clients only see basic property info

## P0 - Critical/In Progress
1. **Kinntegra API Integration**: Awaiting API authentication details from user

## P1 - Upcoming Tasks
- Frontend for Pincode Lookup on client creation form
- Complete Kinntegra API integration when credentials available
- Test end-to-end approval workflow with real email

## P2 - Future Tasks
- **CRITICAL**: Refactor `server.py` (16,000+ lines) into modular routers
- Refactor frontend monoliths
- Build Analysis Dashboard
- Email notifications for passport expiry
- Delete obsolete files (CreateBond.jsx, CreateBondModal.jsx)

## Database Collections

### approval_logs
```json
{
  "id": "uuid",
  "entity_type": "client | reinvestment",
  "entity_id": "uuid",
  "action": "submitted | broker_approved | broker_rejected | client_approved | client_rejected | kinntegra_prepared",
  "actor_id": "uuid",
  "actor_role": "broker | sub_broker | client | system",
  "actor_name": "string",
  "details": {},
  "notes": "string",
  "created_at": "ISO datetime"
}
```

### reinvestment_submissions
```json
{
  "id": "uuid",
  "sub_broker_id": "uuid",
  "broker_id": "uuid",
  "client_id": "uuid",
  "cashflow_ids": ["uuid"],
  "portfolio_category": "string",
  "target_ucc": "string",
  "total_amount": "number",
  "broker_approval_status": "pending | approved | rejected",
  "client_approval_status": "not_started | pending | approved | rejected",
  "kinntegra_status": "not_submitted | pending_api_credentials | submitted",
  "created_at": "ISO datetime"
}
```

### kinntegra_api_requests
```json
{
  "id": "uuid",
  "submission_id": "uuid",
  "client_id": "uuid",
  "api_endpoint": "string",
  "payload": {},
  "status": "pending_api_credentials | submitted | success | failed",
  "created_at": "ISO datetime"
}
```

## API Integration - Kinntegra MF Buy Scheduler

### New Buy Investment Schedule
- **Endpoint**: `POST https://api.kinntegra.co.in/api/transaction/addbuyschedule`
- **Payload**: 
```json
{
  "InvestmentData": [{
    "UCC": "string",
    "DealId": "string",
    "BondInvestmentDate": "string",
    "InvestmentAmount": "number",
    "PortfolioName": "string",
    "MFInvestmentDate": "string"
  }]
}
```
- **Status**: PENDING API CREDENTIALS

## Test Credentials
- **Broker**: PAN: `ANVPB5297J`, Password: `Laksh@0208`, PIN: `0516`
- **Sub-Broker**: PAN: `AKQPR6699J`, Password: `kinntegra123`, PIN: `1234`
- **Client**: PAN: `AJMPD3987G`, Password: `kinntegra123`, PIN: `1234`

## Recent Changes (Jan 23, 2026)

### Logs Page - Unified View & Portfolio Column (COMPLETED)
**User Request**: Remove "Reinvestment Approvals" tab from Logs, show all entries in Trade Logs. Show Portfolio instead of Payment Mode.

**Changes Implemented**:
1. **Removed Tabs**: Logs page now shows a single unified view (no "Trade Logs" / "Reinvestment Approvals" tabs)
2. **Merged Data Sources**: All data (trades, reinvestment logs, tagging logs) combined into one table
3. **Column Change**: "Payment Mode" column replaced with "Portfolio" column
4. **Trade Type Display**: Shows "Reinv-Principal", "Reinv-Interest", "Reinv-Both", "Reinv-None", "Reinv-Custom" for reinvestment entries
5. **Date Display**: Uses `expected_date` (historical/future date) instead of `created_at` for reinvestment entries

**Files Modified**:
- `/app/frontend/src/pages/TradeLogs.jsx` - Removed tabs, changed `payment_mode` to `portfolio`, updated type format

### Tag Options Corrected (COMPLETED)
**User Request**: Tag options should be Principal, Interest, Both, None, Custom (not Full Amount, Partial, No Reinvest)

**Changes Implemented**:
1. Updated `TAG_OPTIONS` array in `ReinvestmentTagging.jsx`
2. Updated tag display in Tagged section to show correct labels
3. Updated Logs page to show "Reinv-{tag}" format in Type column

**Files Modified**:
- `/app/frontend/src/pages/ReinvestmentTagging.jsx` - Updated TAG_OPTIONS and tag display

### Reinvestment Tagging Page - Backend Fix (COMPLETED)
**Issue**: Historical entries were not appearing for broker users due to critical indentation bug.

**Root Cause**: Lines 9714-9758 in `/api/reinvestment/upcoming` endpoint were incorrectly indented inside the `else` block (sub-broker only), meaning brokers saw empty data.

**Fix Applied**:
1. Fixed indentation to ensure brokers AND sub-brokers can see data
2. Updated backend to return ALL months (including past dates) not just next 6 months
3. Fixed frontend to properly map `cashflow_id` to `id` and `client_ucc_list` to `ucc_list`

**Files Modified**:
- `/app/backend/server.py` - Fixed indentation in `/api/reinvestment/upcoming` (line ~9705-9760)
- `/app/frontend/src/pages/ReinvestmentTagging.jsx` - Fixed data normalization

### Historical Trade Upload & Tagging Workflow (CLARIFIED)
**User Clarification** (from handwritten notes):
1. When bond is added in Opportunity → Cashflows are derived
2. Historical data upload has two sheets: Investment Dates + Repayment Schedule
3. System creates cashflows from Investment Dates (both historical and future)
4. Under "Reinv Tag", ALL untagged cashflows appear in "Untagged" section
5. After tagging with UCC, Portfolio, Tag:
   - **Historical entries** → Auto-approved → Appear in Trade Logs as "Approved"
   - **Upcoming entries** → Stay in "Tagged" section → Send to client for approval
6. After client approves → Status changes to "Complete" in Trade Logs

**Current Implementation Status**:
- ✅ Historical entries auto-approve when tagged (backend logic exists)
- ✅ Upcoming entries require client approval (email flow implemented)
- ✅ Reinv Tag page shows Historical/Upcoming sub-sections
- ✅ Logs page shows Portfolio column

## Recent Changes (Jan 24, 2026)

### Repayment Count on Funded Bond Cards - Fixed (COMPLETED)
**User Request**: Once a bond moves to the "Funded" section in Opportunities, replace "Price/Unit" with "Repayment Count". Count should be unique repayment dates, not total entries for different purchase dates.

**Changes Implemented**:
1. **Backend**: Modified `/api/bonds` endpoint in `server.py` to:
   - Use `distinct("date")` instead of `count_documents()` to get unique payment dates
   - `total_cashflows_count`: Number of unique payment dates for the bond
   - `repaid_cashflows_count`: Number of unique payment dates that have been repaid
2. **Frontend**: Updated `BondCard` component in `Opportunities.jsx` to conditionally render:
   - **Funded/Closed bonds**: Shows emerald-green "Repayment Progress" section with "X / Y Repaid" and a visual progress bar
   - **Available bonds**: Shows original amber "Price/Unit" display with today's calculated price

**Files Modified**:
- `/app/backend/server.py` - Changed from `count_documents()` to `distinct("date")` for unique counts
- `/app/frontend/src/pages/Opportunities.jsx` - BondCard conditional rendering

**Verified**: Screenshot confirms "8 / 17 Repaid" displayed correctly (8 unique repaid dates out of 17 total unique payment dates).

### Removed "Bulk Repayment Update" Section from Holdings (COMPLETED)
**User Request**: Remove the highlighted "Bulk Repayment Update" section from the Holdings page.

**Changes Implemented**:
- Removed the entire blue-highlighted section containing Template, Export Cashflows, and Upload Repayments buttons

**Files Modified**:
- `/app/frontend/src/pages/Holdings.jsx` - Removed lines 1211-1257

**Verified**: Screenshot confirms the section is removed.

### Outstanding Principal & Interest Breakdown in Holdings (COMPLETED)
**User Request**: Consider outstanding principal and interest payments for XIRR calculation, and show a tab showcasing both.

**Changes Implemented**:
1. Added new "Principal & Interest Breakdown" section in the Holdings cashflow modal showing:
   - **Outstanding Principal**: Total principal minus repaid principal
   - **Outstanding Interest**: Total interest minus repaid interest
   - **Pending TDS**: Total TDS minus deducted TDS
   - **Total Outstanding**: Upcoming expected amount
   - Each card also shows the repaid/received amount below

**Files Modified**:
- `/app/frontend/src/pages/Holdings.jsx` - Added breakdown section to modal Summary tab

**Verified**: Screenshot confirms breakdown displays correctly with outstanding and repaid amounts.

### XIRR Calculation Fix (COMPLETED)
**User Request**: XIRR should include outstanding principal and interest in the calculation, not just repaid amounts.

**Root Cause**: The previous XIRR function required `repaid_date` to be set for repaid cashflows. When `is_repaid=True` but `repaid_date=None`, those cashflows were being skipped, resulting in incorrect XIRR (-43.85% instead of ~9.57%).

**Fix Applied**:
1. Modified `calculate_holding_xirr()` function in `server.py`
2. For repaid cashflows: uses `repaid_date` if available, otherwise falls back to scheduled `date`
3. For pending cashflows: uses scheduled `date` with expected `net_amount`
4. All cashflows are now included in the XIRR calculation

**Files Modified**:
- `/app/backend/server.py` - Lines 8337-8400

**Result**: XIRR now correctly shows **9.57%** (positive return) instead of -43.85%

## Known Issues & Next Steps

### P0 - Critical
- ✅ **COMPLETED**: Repayment Count on Funded Bond Cards

### P1 - High Priority
1. **Apply RBAC permissions globally**: Currently partially implemented in SubBrokerClients and Opportunities
2. **Sub-broker/Client permission fix on RealEstateDetails page**: Implemented but untested
3. **Verify "Sell Unit" Feature**: End-to-end test needed
4. **Verify Real Estate Broker Visibility Fix**: Fix implemented, awaiting user deployment verification

### P2 - Medium Priority
1. **Sub-broker password reset email flow**: Not verified
2. **Build Projected vs Actuals frontend UI**: Backend endpoint exists
3. **Pincode Lookup frontend implementation**

### Future/Backlog
1. **CRITICAL REFACTORING**: 
   - `server.py` (18,000+ lines) needs to be split into routers
   - `ReinvestmentTagging.jsx`, `Opportunities.jsx` need to be broken down
2. **Delete obsolete components**: `SubBrokerOpportunities.jsx`, `ClientOpportunities.jsx`, `PendingApprovals.jsx`, `ApprovalCenter.jsx`, `ApprovalLogs.jsx`
3. **Build Analysis Dashboard**
4. **Kinntegra API Integration**: Blocked on credentials

## Recent Changes (Jan 24, 2026)

### Lead Management Consolidation
- Merged "Approvals & Logs" functionality into unified "Lead Management" page
- Two main tabs: "Reinvestment Approval" and "Client Interest"
- Reinvestment Approval has sub-tabs: "Clients" and "Reinvestments"
- Activity Logs kept as separate page (accessible via "Logs" sidebar link)
- Old routes (`/broker/approvals`, `/broker/pending-approvals`) redirect to `/broker/leads`

### XIRR Calculation Fix
- Both Expected XIRR and Actual XIRR now use GROSS amounts (principal + interest before TDS)
- Expected XIRR = based on scheduled gross cashflows
- Actual XIRR = based on actual repaid gross amounts (principal + net_interest + tds)
- Difference comes from timing variations, not TDS

### Trades Table Layout Fix
- Converted from broken flex/grid layout to standard HTML `<table>`
- Proper column alignment: CLIENT NAME, UCC, DATE, TYPE, AMOUNT, PORTFOLIO, ADVISOR, STATUS

### "In Demand" Badge Logic Fix
- Correctly calculates: `interested_amount > (face_value × available_units)`
- `available_units = max(0, total_units - units_sold)`

## Recent Changes (Jan 24, 2026)

### Bond Cashflow Prepayment Logic Rework (MAJOR)
Complete rework of bond cashflow logic to properly handle prepayments based on CDNRE001 Excel reference:

#### Correct Prepayment Calculation Logic
When prepayments occur:
1. **Balance Principal reduces immediately** after each prepayment
2. **Interest is calculated period-by-period** on the current balance:
   - `Interest = Balance × Coupon Rate × Days / 365`
3. **All interest accumulates** and is paid at maturity along with remaining principal
4. **XIRR calculated from Bond Start Date** (not investment date) to reflect premium impact

#### Verified Values (135-unit Trade)
| Metric | Excel | System |
|--------|-------|--------|
| Final Principal | ₹78,30,000 | ₹78,30,000 ✓ |
| Total Interest | ₹34,82,460.30 | ₹34,82,460.30 ✓ |
| Total Payout | ₹1,13,12,460.30 | ₹1,13,12,460.30 ✓ |
| XIRR | 6.33% | 6.33% ✓ |

#### Cashflow Structure
| Date | Type | Principal | Interest |
|------|------|-----------|----------|
| 2025-10-01 | Prepayment | ₹9,45,000 | 0 |
| 2025-11-05 | Prepayment | ₹9,45,000 | 0 |
| 2025-12-03 | Prepayment | ₹9,45,000 | 0 |
| 2026-01-07 | Prepayment | ₹9,45,000 | 0 |
| 2026-02-07 | Prepayment | ₹9,45,000 | 0 |
| 2026-03-07 | Prepayment | ₹9,45,000 | 0 |
| 2026-04-08 | Maturity | ₹78,30,000 | ₹34,82,460 |

#### XIRR Calculation Changes (Updated: Jan 24, 2026)
- **Actual XIRR now uses Investment Date** as reference (not Bond Start Date)
- This correctly reflects the client's actual return from when they invested
- For bonds WITHOUT prepayments (like CDUC001): Actual XIRR ≈ Expected XIRR (both ~11%)
- For bonds WITH prepayments (like Natureresidences): Actual XIRR < Expected XIRR (prepayments reduce future interest)

**Bug Fixed (Jan 24, 2026)**: CDUC001 Actual XIRR was showing 9.23% instead of 11%
- Root cause: Using `bond_start_date` created artificial time gap before cashflows started
- Fix: Changed to use `investment_date` as XIRR reference point
- Result: CDUC001 now shows Actual XIRR = 11.0% ✓ (matches Expected)

