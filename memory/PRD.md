# Kinntegraa - Product Requirements Document

## Original Problem Statement
A wealth management platform for brokers to manage clients, bonds, real estate investments, and sub-brokers. The application allows:
- Brokers to create and manage investment opportunities (Bonds & Real Estate)
- Sub-brokers to assist in client management
- Clients to view their investments and holdings
- CAS (Consolidated Account Statement) PDF analysis

## User Personas
1. **Broker**: Full admin access - manages all entities
2. **Sub-Broker**: Limited access - works with linked clients
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

### Client Management
- Conditional bank details based on residency/passport type
- Bulk upload (Indian & Foreign passport holders)
- Pincode lookup API integration

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

## Tech Stack
- **Frontend**: React + Tailwind CSS + Shadcn/UI + Recharts
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Third-Party**: 
  - Currency Exchange API (fawazahmed0/exchange-api)
  - Pincode lookup API

## Recent Changes (Jan 21, 2026)
1. **Dashboard Redesign**:
   - Removed: Client Status, AUM distribution, Client spread by city, Monthly console, Recent Activity
   - Enhanced: AUM by Sub-Broker now shows both Bonds (INR) and Real Estate (AED)
   - Added: Real Estate INR conversion using live forex rate
   - Added: Forex rate display in header

2. **Sub-Broker Dashboard**:
   - Created new `/sub-broker/dashboard` page
   - Shows only data for linked clients
   - Displays AUM with INR conversion

3. **API Additions**:
   - `GET /api/forex/aed-to-inr` - Live exchange rate
   - `GET /api/sub-broker/dashboard/summary` - Sub-broker specific dashboard data

## P0 - Critical Issues (In Progress)
1. Sub-broker "Resend credentials" & "Reset password" emails not working
2. Sub-broker verification flow not implemented

## P1 - Upcoming Tasks
- Complete Sub-Broker Profile page UI
- Frontend for Pincode Lookup on client creation form

## P2 - Future Tasks
- **CRITICAL**: Refactor `server.py` (14,000+ lines) into modular routers
- Refactor `RealEstateDetails.jsx` and `CreateClientModal.jsx`
- Build out `AnalysisDashboard.jsx`
- Email notifications for passport expiry
- Delete obsolete bond creation files

## API Endpoints Reference
- Auth: `/api/auth/*`
- Dashboard: `/api/dashboard/*`, `/api/sub-broker/dashboard/*`
- Forex: `/api/forex/aed-to-inr`
- Clients: `/api/clients/*`, `/api/bulk/*`
- Bonds: `/api/bonds/*`
- Real Estate: `/api/real-estate-opportunities/*`
- Partners: `/api/partners/*`
- Analysis: `/api/analysis/*`

## Test Credentials
- **Broker**: PAN: `ANVPB5297J`, Password: `Laksh@0208`, PIN: `0516`
