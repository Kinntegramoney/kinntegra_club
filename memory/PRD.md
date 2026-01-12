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

### Navigation Structure (NEW)
```
Broker View:
├── Dashboard (overview stats, quick actions)
├── Opportunities
│   ├── Available (bonds with units remaining)
│   ├── Funded (all units sold, not matured)
│   └── Closed (matured bonds)
└── Admin
    ├── Add Bond (bond creation/management)
    └── Create Sub Broker (partner management)

Sub-broker View:
└── Opportunities
    ├── Available
    ├── Funded
    └── Closed
```

### Routes
- `/login` - Two-factor authentication
- `/broker/dashboard` - Broker overview
- `/broker/opportunities` - Bond listings with tabs
- `/broker/admin/bonds` - Bond management
- `/broker/admin/sub-brokers` - Partner management
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

## Testing Status
- Backend: 25/25 tests passing (100%)
- Frontend: All UI flows verified
- Test file: `/app/tests/test_ncd_cashflow.py`

## Backlog / Future Enhancements

### P1 - High Priority
- [ ] Bond edit functionality in Admin Bonds
- [ ] Sub-broker edit functionality
- [ ] Bond status field in database (explicit status vs calculated)
- [ ] Partner/Sub-broker profile page

### P2 - Medium Priority
- [ ] Email notifications for new bonds
- [ ] Dashboard charts and analytics
- [ ] Export all bonds to Excel
- [ ] Audit log for transactions

### P3 - Low Priority
- [ ] Multi-language support
- [ ] Dark mode theme
- [ ] Mobile responsive improvements
- [ ] Performance optimization for large datasets
