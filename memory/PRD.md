# Kinntegraa - Product Requirements Document

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

### Profile Data Parity Fix (Jan 22, 2026)
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
- **Test Sub-Broker**: PAN: `TESTSB1234`, Password: `Test@123`, PIN: `1234`
