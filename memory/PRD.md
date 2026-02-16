# Kinntegraa - Financial Planning & Portfolio Analysis Platform

## Original Problem Statement
A comprehensive financial planning tool for brokers and advisors that includes:
1. **Data Gathering** - Client financial data collection (Assets, Liabilities, Expenses, Insurance, Goals)
2. **Portfolio Analysis** - Parse CAS PDFs and generate Gap Sheet reports
3. **Real Estate Opportunities** - Track property investments with DLD/Admin fees, payment schedules, XIRR calculations
4. **Bond Holdings** - Track bond investments with cashflows and reinvestments

## Core Requirements
- Multi-user support (Broker, Sub-broker, Client roles)
- CAS PDF parsing with transaction extraction
- Gap Sheet Excel report generation
- Client financial data management
- Real estate investment tracking with currency conversion
- Bond investment management

## What's Been Implemented

### 2026-02-16 Updates

#### DLD & Admin Fees in Payment Schedule (Completed)
**File:** `/app/frontend/src/pages/RealEstateDetails.jsx`
- Added separate rows for DLD Fee (with orange badge "D") and Admin Fee (with green badge "A")
- DLD Fee shows percentage (typically 4%) and calculated amount
- Admin Fee shows as "Fixed" amount
- Updated summary cards to show 6 cards: Unit Price, DLD Fee, Admin Fee, Total Cost, Milestones, Co-owners
- Added "Unit Price Subtotal" and "Grand Total (incl. Fees)" rows in table footer
- Per-user contribution columns calculate share of all fees

#### Holdings Value Display Fix (Completed)
**Files:** `/app/backend/server.py`, `/app/frontend/src/pages/Holdings.jsx`
- Backend API `/api/holdings/clients` now returns separate `bond_investment` (INR) and `real_estate_investment` (AED) fields
- Frontend displays correct values based on filter:
  - Bond Clients filter: Shows bond investment in INR
  - Real Estate Clients filter: Shows real estate investment in AED
  - All Clients filter: Shows combined value in INR with breakdown (B: ₹X | RE: AED Y)

#### Repaid Column in Holdings Report (Completed)
**File:** `/app/frontend/src/pages/Holdings.jsx`
- Added new "Repaid" column to the Bonds > Holding Report table
- Shows total repaid amount (Principal + Interest) in blue, bold text
- Below the total, shows bifurcation: "P: [principal] | I: [interest]"
- Column placed between "Investment" and "Gross Expected"

#### Historical Currency Rate API (Completed)
**File:** `/app/backend/server.py`
- New endpoint: `GET /api/currency/historical/{date}` - Fetches historical exchange rate for specific date
- New endpoint: `POST /api/currency/historical/batch` - Fetches historical rates for multiple dates
- New endpoint: `GET /api/currency/live` - Fetches live currency rates
- Uses Frankfurter.app API (free, no key required)
- AED rates calculated via USD (AED is pegged to USD at ~3.6725)
- Fallback to default rates if API unavailable

### Previous Session Updates
- Passport Viewer as Popup Modal
- Client Investment Filter (Bond/Real Estate)
- Live Currency Rate Integration for display
- Investor Card Alignment Fix
- Market Rates Card (Gold & Silver prices)
- Bond XIRR matching for prepayments
- Role-based UI controls

## Pending Tasks

### P0 - In Progress
1. **Currency Logic Overhaul**
   - Move Currency Settings button to Funded/Invested payment schedule tab
   - Available tab: Use live currency rates
   - Funded/Invested tab: Use historical rates from payment dates
   - Store historical rates when payments are made

### P1 - Upcoming
2. **XIRR Comparison Report - Deviation Display**
   - Add columns: Projected Rate | Actual Rate | Client Paid Rate | Today's Rate
   - Allow manual rate input for projections

3. **Expected Sale Date Bug Investigation**
   - Recurring issue where expected sale dates change unexpectedly
   - May be resetting to completion/handover date

### P2 - Backlog
4. **Logo Circle Size Adjustment** - Waiting for user feedback
5. **Code Refactoring**
   - `server.py` (27k+ lines) should be split into modules
   - `RealEstateDetails.jsx` (2k+ lines) should be componentized

## Key API Endpoints

### Currency APIs (New)
- `GET /api/currency/historical/{date}?base=AED&target=INR`
- `POST /api/currency/historical/batch` - body: {dates: [...], base, target}
- `GET /api/currency/live?base=AED`

### Holdings API (Modified)
- `GET /api/holdings/clients` - Returns: `{id, name, pan_number, total_investment, bond_investment, real_estate_investment, has_bonds, has_real_estate}`

## Tech Stack
- **Frontend:** React, Shadcn/UI, Tailwind CSS
- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **External APIs:** Frankfurter.app (currency rates), GoldPrice.org (commodity prices)

## Key Files
- `/app/backend/server.py` - Main API server
- `/app/frontend/src/pages/RealEstateDetails.jsx` - Real estate details with payment schedule
- `/app/frontend/src/pages/Holdings.jsx` - Client holdings with filters
- `/app/frontend/src/pages/Analysis.jsx` - Analysis UI
- `/app/frontend/src/pages/DataGathering/*.jsx` - Data gathering components

## Credentials for Testing
- **PAN:** ANVPB5297J
- **Password:** kinntegra123
- **PIN:** 1234
