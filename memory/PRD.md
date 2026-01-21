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
  
- **Sub-Broker Dashboard** (NEW):
  - Total AUM under management
  - My Clients (Venn diagram)
  - Bond AUM (INR)
  - Real Estate AUM (AED with INR conversion)
  - Quick Actions

### Sub-Broker Module (Updated: Jan 21, 2026)
- **Dashboard**: `/sub-broker/dashboard` - Personal business overview
- **Opportunities**: View and share investment opportunities
- **Holdings**: View client holdings
- **Clients**: Create/view linked clients (with approval workflow)
- **Reinvestment Tag**: Tag cashflows with UCC dropdown for linked clients
- **Analysis**: Upload CAS files for linked clients
- **Profile**: Edit personal details (email, phone, password, PIN, address)

### Client Management
- Conditional bank details based on residency/passport type
- Bulk upload (Indian & Foreign passport holders)
- Pincode lookup API integration
- **NEW**: Sub-broker can create clients (pending broker approval)

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
- **NEW**: Pending approvals view for broker

## Tech Stack
- **Frontend**: React + Tailwind CSS + Shadcn/UI + Recharts
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Third-Party**: 
  - Currency Exchange API (fawazahmed0/exchange-api)
  - Pincode lookup API
  - **Kinntegra Investment API** (for reinvestment triggers)

## Recent Changes (Jan 21, 2026)

### Dashboard Updates
1. Removed: Client Status, AUM distribution, Client spread by city, Monthly console, Recent Activity
2. Enhanced: AUM by Sub-Broker shows both Bonds (INR) and Real Estate (AED)
3. Added: Real Estate INR conversion using live forex rate
4. Added: Forex rate display in header

### Sub-Broker Module Complete
1. **Sidebar Updated**: Added Dashboard, Clients, Reinv Tag, Analysis, Profile
2. **SubBrokerClients.jsx**: New page for client management
3. **SubBrokerReinvestment.jsx**: New page for reinvestment tagging with UCC dropdown
4. **SubBrokerAnalysis.jsx**: Dedicated analysis page
5. **SubBrokerProfile.jsx**: Enhanced with address editing

### Backend Endpoints Added
- `PUT /api/sub-broker/profile/address` - Update address
- `GET /api/sub-broker/clients` - Get linked clients
- `POST /api/sub-broker/clients` - Create client (pending approval)
- `GET /api/sub-broker/pending-approvals` - View pending items
- `GET /api/broker/pending-approvals` - View items to approve
- `POST /api/broker/approve-client/{id}` - Approve/reject client
- `GET /api/sub-broker/reinvestment/upcoming` - Get reinvestment data

## P0 - Still In Progress
1. **Email Issues**: Need to verify resend credentials/reset password emails are being sent
2. **Verification Flow**: Client approval via email link → API trigger to Kinntegra

## P1 - Upcoming Tasks
- Frontend for Pincode Lookup on client creation form
- Complete client approval email flow
- Kinntegra API integration for approved reinvestments

## P2 - Future Tasks
- **CRITICAL**: Refactor `server.py` (14,000+ lines)
- Refactor frontend monoliths
- Build Analysis Dashboard
- Email notifications for passport expiry

## API Integration - Kinntegra MF Buy Scheduler

### New Buy Investment Schedule
- **Endpoint**: `POST https://api.kinntegra.co.in/api/transaction/addbuyschedule`
- **Payload**: `{"InvestmentData": [{"UCC", "DealId", "BondInvestmentDate", "InvestmentAmount", "PortfolioName", "MFInvestmentDate"}]}`

### Revise Buy Investment Schedule  
- **Endpoint**: `POST https://api.kinntegra.co.in/api/transaction/revisebuyschedule`

## Test Credentials
- **Broker**: PAN: `ANVPB5297J`, Password: `Laksh@0208`, PIN: `0516`
- **Test Sub-Broker**: PAN: `TESTSB1234`, Password: `Test@123`, PIN: `1234`
