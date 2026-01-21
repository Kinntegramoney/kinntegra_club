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
  - Total Clients (Venn diagram style)
  - Sub-Brokers count
  - Opportunities (Bonds & Real Estate)
  - Bond AUM (INR)
  - Real Estate AUM (AED)
  - AUM by Sub-Broker (showing both Bonds INR and RE AED with INR conversion)
  - Forex rate display (AED to INR from live API)
  - Quick Actions
  
- **Sub-Broker Dashboard**:
  - Total AUM under management
  - My Clients (Venn diagram)
  - Bond AUM (INR)
  - Real Estate AUM (AED with INR conversion)
  - Quick Actions

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
