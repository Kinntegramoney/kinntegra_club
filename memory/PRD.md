# BondFlow Pro - NCD Cashflow Calculator B2B Platform

## Original Problem Statement
Build a cashflow calculator for Non-Convertible Debentures (NCDs) that:
1. Handles bond details (name, dates, principal, interest schedules)
2. Calculates secondary market prices based on target IRR
3. Supports a B2B platform with broker/sub-broker roles
4. Provides two-factor authentication (PAN + Password → PIN)
5. Enables CSV cashflow download with TDS calculations

## Core Features Implemented

### 1. Authentication System
- **Two-factor authentication**: PAN + Password (step 1), then PIN (step 2)
- **JWT-based sessions**: Access tokens with configurable expiry
- **Role-based access control**: `broker` and `sub_broker` roles
- **Password/PIN hashing**: Using bcrypt via passlib

### 2. Bond Management
- **CRUD Operations**: Create, Read, Update, Delete bonds
- **Bond Properties**: Name, start/end dates, principal, coupon rate, IRR settings
- **Payment Schedules**: Principal payments (percentage-based), Interest payments (amount-based)
- **Unit Tracking**: Total units and units sold
- **Status Management**: Available → Funded → Closed lifecycle

### 3. Secondary Market Calculator
- **IRR-based pricing**: Calculate purchase price to achieve target gross IRR
- **XIRR calculation**: Using scipy.optimize for accurate IRR
- **Unit bounds**: Given approximate amount, show lower/upper bound units
- **TDS calculation**: 10% TDS on interest displayed separately
- **Net/Gross breakdown**: Clear display of gross IRR vs net receivables

### 4. Cashflow Reporting
- **CSV Download**: Month-wise cashflow with all components
- **TDS included**: Principal, gross interest, TDS deduction, net amounts
- **Unit-scaled amounts**: All values multiplied by selected units

### 5. Partner Management
- **Sub-broker creation**: Brokers can create sub-broker accounts
- **Partner details**: Name, PAN, code, email, mobile, address, color badge
- **Account linking**: Sub-broker user accounts linked to partner records

## Application Architecture

### Navigation Structure (Updated January 2026)
```
Broker View:
├── Dashboard (overview stats, quick actions)
├── Opportunities
│   ├── Available (bonds with units remaining)
│   ├── Funded (all units sold, not matured)
│   └── Closed (matured bonds)
├── Trade Verification
│   ├── Pending (trades awaiting approval)
│   ├── All Trades (complete trade history)
│   └── Reinvestment Tagging (upcoming repayments with tagging)
├── Holdings (client portfolios, cashflows, Excel export)
└── Admin
    ├── Add Bond (bond creation/management)
    ├── Create Sub Broker (partner management)
    └── Create Client (client management with bond allocations)

Sub-broker View:
├── Opportunities
│   ├── Available
│   ├── Funded
│   └── Closed
└── Holdings (linked client portfolios)
```

### Routes
- `/login` - Two-factor authentication
- `/broker/dashboard` - Broker overview
- `/broker/opportunities` - Bond listings with tabs
- `/broker/admin/bonds` - Bond management
- `/broker/admin/sub-brokers` - Partner management
- `/broker/admin/clients` - Client management
- `/sub-broker/opportunities` - Sub-broker view
- `/bonds/create` - Create new bond
- `/bonds/:id` - Bond details and calculator

### Tech Stack
- **Frontend**: React 18, React Router, Tailwind CSS, Shadcn/UI, Recharts
- **Backend**: FastAPI, Motor (async MongoDB), Pydantic, Scipy
- **Database**: MongoDB
- **Auth**: JWT tokens, bcrypt hashing

## API Endpoints

### Authentication
- `POST /api/auth/login-step1` - Verify PAN + Password, return temp token
- `POST /api/auth/login-step2` - Verify PIN, return access token
- `POST /api/auth/register` - Register new user

### Bonds
- `POST /api/bonds` - Create bond
- `GET /api/bonds` - List all bonds (authenticated)
- `GET /api/bonds/available` - List bonds with available units
- `GET /api/bonds/{id}` - Get bond details with calculated IRR
- `DELETE /api/bonds/{id}` - Delete bond (broker only)
- `POST /api/bonds/{id}/calculate` - Calculate secondary price
- `POST /api/bonds/{id}/download-cashflow` - Generate cashflow data
- `POST /api/bonds/{id}/record-sale` - Record unit sale

### Partners
- `POST /api/partners` - Create partner (broker only)
- `GET /api/partners` - List partners (broker only)
- `DELETE /api/partners/{id}` - Delete partner (broker only)
- `PUT /api/partners/{id}` - Update partner (broker only)

### Clients
- `POST /api/clients` - Create client (broker only)
- `GET /api/clients` - List clients (broker sees all, sub-broker sees linked only)
- `GET /api/clients/{id}` - Get client details
- `PUT /api/clients/{id}` - Update client (broker only)
- `DELETE /api/clients/{id}` - Delete client (broker only)
- `POST /api/clients/{id}/link-subbroker` - Link client to sub-broker
- `POST /api/clients/{id}/unlink-subbroker` - Unlink client from sub-broker

### Trades (Unit Booking)
- `POST /api/trades` - Create trade (broker: auto-approved, sub-broker: pending)
- `GET /api/trades` - List trades (broker sees all, sub-broker sees own)
- `GET /api/trades/pending` - List pending trades for broker verification
- `GET /api/trades/{id}` - Get trade details
- `PUT /api/trades/{id}/verify` - Approve/reject trade (broker only)
- `DELETE /api/trades/{id}` - Cancel pending trade

## Database Schema

### users
```json
{
  "id": "uuid",
  "pan": "string (uppercase)",
  "name": "string",
  "email": "string",
  "phone": "string",
  "password_hash": "bcrypt hash",
  "pin_hash": "bcrypt hash",
  "role": "broker | sub_broker",
  "created_at": "ISO datetime"
}
```

### bonds
```json
{
  "id": "uuid",
  "name": "string",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "principal_amount": "float",
  "coupon_rate": "float (percentage)",
  "primary_irr": "float (percentage)",
  "secondary_irr": "float (percentage)",
  "principal_payments": [{"date": "string", "percentage": "float"}],
  "interest_payments": [{"date": "string", "amount": "float"}],
  "interest_payment_frequency": "string",
  "total_units": "int",
  "units_sold": "int",
  "created_at": "ISO datetime"
}
```

### partners
```json
{
  "id": "uuid (same as user id)",
  "name": "string",
  "pan": "string",
  "partner_code": "string",
  "email": "string",
  "mobile": "string",
  "color": "hex color",
  "address_line1": "string",
  "address_line2": "string",
  "city": "string",
  "country": "string",
  "state": "string",
  "pincode": "string",
  "created_by": "broker user id",
  "last_log": "string | null",
  "created_at": "ISO datetime"
}
```

### clients
```json
{
  "id": "uuid",
  "name": "string",
  "pan_number": "string (uppercase)",
  "occupation": "string",
  "date_of_birth": "YYYY-MM-DD",
  "father_husband_name": "string",
  "demat_account_no": "string",
  "email": "string",
  "mobile": "string",
  "address_line1": "string",
  "address_line2": "string",
  "city": "string",
  "state": "string",
  "country": "string",
  "pincode": "string",
  "bank_name": "string",
  "account_number": "string",
  "branch": "string",
  "ifsc_code": "string",
  "nominee_name": "string",
  "nominee_dob": "YYYY-MM-DD",
  "nominee_mobile": "string",
  "nominee_relationship": "string",
  "linked_subbroker_id": "uuid | null",
  "bond_allocations": [{
    "bond_id": "uuid",
    "bond_name": "string",
    "units_blocked": "int",
    "units_paid": "int",
    "status": "blocked | partial_paid | fully_paid",
    "allocated_at": "ISO datetime"
  }],
  "created_by": "broker user id",
  "created_at": "ISO datetime"
}
```

## Test Credentials
- **Broker**: PAN: `ABCDE1234F`, Password: `broker123`, PIN: `1234`
- **Sub-broker**: PAN: `FGHIJ5678K`, Password: `subbroker123`, PIN: `5678`

## What's Been Completed (January 2026)

### Phase 1: Core Calculator
- [x] Bond data model with payment schedules
- [x] XIRR calculation using scipy
- [x] Secondary market price calculation
- [x] Interest on reducing balance
- [x] CSV cashflow download

### Phase 2: B2B Platform
- [x] Two-factor authentication
- [x] Role-based access control
- [x] Partner/sub-broker management
- [x] Login UI matching designs

### Phase 3: Application Restructure
- [x] New navigation with Sidebar
- [x] Dashboard with stats cards
- [x] Opportunities page with tabs
- [x] Admin Bonds page
- [x] Admin Sub Brokers page
- [x] Sub-broker dedicated view
- [x] Delete partner API endpoint
- [x] Bond edit functionality
- [x] Sub-broker edit functionality

### Phase 4: Client Management Module
- [x] Client CRUD (Create, Read, Update, Delete)
- [x] Client form with all sections (Personal, Address, Bank, Nominee)
- [x] Document Upload section (PAN, Aadhar, Bank Cheque, CNL)
- [x] Link/Unlink clients to sub-brokers
- [x] Search clients functionality
- [x] Admin > Create Client menu in sidebar

### Phase 5: Trade Workflow System
- [x] Removed bond allocation from Client module
- [x] "Book Units for Client" section in Bond Details page (below calculator)
- [x] Trade creation from Opportunities > Bond > Calculate > Book Units
- [x] Broker trades are auto-approved
- [x] Sub-broker trades require broker verification
- [x] Trade Verification page at /broker/trades
- [x] Pending/All Trades tabs
- [x] Approve/Reject functionality with broker notes
- [x] Units deducted from bond only after approval
- [x] Payment proof upload field in Book Units section
- [x] Payment proof filename stored in trade record

### Phase 6: Mobile Responsiveness
- [x] Responsive Sidebar with hamburger menu on mobile
- [x] Dashboard responsive grid (2x2 stats on mobile)
- [x] Trade Verification responsive cards
- [x] Book Units section responsive layout
- [x] All pages tested on 375px mobile viewport

### Phase 7: Bond Status & Business Rules (January 12, 2026)
- [x] Dynamic bond status calculation (`available`, `funded`, `closed`)
- [x] Status calculated based on units_sold and end_date
- [x] Delete prevention for funded and closed bonds
- [x] Calculator disabled for closed bonds
- [x] Frontend updated to use backend status
- [x] Obsolete files cleanup (BrokerDashboard.jsx, SubBrokerDashboard.jsx, Partners.jsx)

### Phase 8: Holdings Module (January 12, 2026)
- [x] New "Holdings" menu item in sidebar for both broker and sub-broker
- [x] Client list panel with search functionality
- [x] Holdings overview showing Investment, Repaid (Net), and Upcoming (Expected)
- [x] Investment by Asset Class donut chart (Corporate Debt)
- [x] Holding Report table with scheme details, invested amount, principal, interest, TDS, net repaid, status
- [x] Cashflow schedule generated from trade's investment date
- [x] Future repayments captured for each client based on bond payment schedules
- [x] Manual "Mark Repaid" / "Undo" functionality for both broker and sub-broker
- [x] Excel download with multiple sheets (Summary + individual transactions)
- [x] Status filters (All, Active, Fully repaid)
- [x] Profile tab showing client KYC information
- [x] Popup modal with Summary by Date tab and individual transaction tabs

### Phase 9: Reinvestment Tagging (January 12, 2026)
- [x] Reinvestment Tagging as a tab within Trade Verification page (refactored from standalone page)
- [x] "Untagged" and "Tagged" sub-sections for better organization
- [x] Entries grouped by client (expandable client cards)
- [x] Table columns: Opportunity, Expected Date, Principal Net, Interest Net, Net Amount, Reinvestment Tag
- [x] Reinvestment Tag dropdown with options: Not Tagged, Principal, Interest, Net Amount, **Not Invest**
- [x] Client summary: Total Principal, Total Interest, Total Net with "Save Tags" button
- [x] Backend API: `GET /api/reinvestment/upcoming`, `PUT /api/reinvestment/tag/{cashflow_id}`
- [x] Refresh button to reload data
- [x] Removed obsolete standalone reinvestment routes from App.js

### Phase 10: Client Portal (January 12, 2026)
- [x] **Client Role**: New "client" role in authentication system
- [x] **Auto User Creation**: When broker creates a client, a user account is automatically created with default credentials
- [x] **Profile Verification**: Clients must verify their profile before first login (verification endpoint)
- [x] **Client Login**: Same 2FA as brokers (PAN + Password → PIN)
- [x] **Client Sidebar**: Teal/green color scheme with Opportunities, Holdings, Trade Verification, Profile menus
- [x] **Client Opportunities**: View available bonds and book units for themselves
- [x] **Client Holdings**: View portfolio, cashflows, download Excel report
- [x] **Client Trade Verification**: View own trades + approve/reject reinvestment tags from broker
- [x] **Client Profile**: View personal details, broker & sub-broker information
- [x] **Client Trade Creation**: Client can book units, trade requires approval (notifies sub-broker)
- [x] **Notifications**: In-app notifications for sub-broker when client books units
- [x] **Reinvestment Approval**: Client can approve/reject tagged reinvestments, broker notified

### Phase 11: Bulk Upload Enhancements (January 13, 2026)
- [x] **Sub-broker Assignment in Bulk Upload**: Clients can now be auto-linked to sub-brokers during bulk upload
- [x] **Partner Code Column**: Excel template now includes "Partner Code" column
- [x] **Auto-Linking Logic**: If Partner Code matches an existing sub-broker, client is automatically linked
- [x] **UI Updates**: Bulk upload modal shows Partner Code in expected columns (highlighted in blue)
- [x] **Result Display**: Upload results now show which sub-broker each client was linked to
- [x] **Template Updated**: Download template includes Partner Code column with sample data

### Phase 12: Real Estate Opportunities Module (January 13, 2026)
- [x] **New Module**: Complete Real Estate Opportunities management system
- [x] **Form Fields** (based on Excel columns):
  - Building/Project Name, Unit Number
  - Unit Price, DLD Fee, Admin Fee, Broker Fee, Other Fees
  - Total Area, Carpet Area, Balcony Area (with ratio calculation)
  - Unit Type (Studio, 1BR, 2BR, etc.), Floor, Parking Spaces
  - Developer Name, Location, Amenities, Handover Date, Payment Plan
  - Investment Time Frame (in days)
- [x] **Off-Plan Properties**: Maximum 4 investors per property (25% share each)
- [x] **Fractional Properties**: Unit value divided into multiples of 500 AED
- [x] **Image Upload**: Support for up to 12 images per property
- [x] **Investment Allocation**: Track investors and their allocations
- [x] **Multi-step Form**: Basic Info → Pricing → Area & Details → Investment → Images
- [x] **Property Cards**: Visual grid display with badges for type/status
- [x] **Sidebar Integration**: New "Real Estate" menu item in broker sidebar

**API Endpoints Added:**
- `POST /api/real-estate-opportunities` - Create opportunity
- `GET /api/real-estate-opportunities` - List opportunities (with filters)
- `GET /api/real-estate-opportunities/{id}` - Get opportunity details
- `PUT /api/real-estate-opportunities/{id}` - Update opportunity
- `DELETE /api/real-estate-opportunities/{id}` - Delete opportunity
- `POST /api/real-estate-opportunities/{id}/images` - Upload images (max 12)
- `DELETE /api/real-estate-opportunities/{id}/images/{image_id}` - Delete image
- `POST /api/real-estate-opportunities/{id}/invest` - Allocate investment
- `GET /api/real-estate-opportunities/{id}/investors` - Get investors list

**API Endpoints Added:**
- `GET /api/client/verify/{token}` - Get verification details
- `POST /api/client/verify/{token}` - Verify client profile
- `GET /api/client/profile` - Get client's own profile with broker details
- `GET /api/client/opportunities` - Get available bonds
- `GET /api/client/holdings` - Get client's holdings
- `GET /api/client/trades` - Get client's trades
- `GET /api/client/reinvestment` - Get reinvestment tags (pending/approved/rejected)
- `POST /api/client/trades` - Client books units for themselves
- `PUT /api/reinvestment/approve/{cashflow_id}` - Client approves/rejects reinvestment tag
- `GET /api/notifications` - Get notifications
- `PUT /api/notifications/{id}/read` - Mark notification as read
- `GET /api/notifications/unread-count` - Get unread notification count

## Testing Status
- Backend: 84/84 tests passing (100%) - includes 22 new client portal tests
- Frontend: All UI flows verified
- Test files: `/app/tests/test_ncd_cashflow.py`, `/app/tests/test_client_management.py`, `/app/tests/test_trade_workflow.py`, `/app/tests/test_client_portal.py`

## Test Credentials
- **Broker**: PAN: `ABCDE1234F`, Password: `broker123`, PIN: `1234`
- **Sub-broker**: PAN: `FGHIJ5678K`, Password: `subbroker123`, PIN: `5678`
- **Client**: PAN: `TESTCP1234`, Password: `12341234`, PIN: `1234`

## Backlog / Future Enhancements

### P0 - Critical
- [ ] Email integration for auto-marking repayments (read emails with specific subject line)
- [ ] Email integration for client verification (send verification link)
- [ ] Email notifications when client books units

### P1 - High Priority
- [ ] Dashboard charts and analytics
- [ ] Export all bonds to Excel

### P2 - Medium Priority
- [ ] Email notifications for new bonds
- [ ] Sub-broker trade history view
- [ ] Audit log for transactions

### P3 - Low Priority
- [ ] Multi-language support
- [ ] Dark mode theme
- [ ] Performance optimization for large datasets
