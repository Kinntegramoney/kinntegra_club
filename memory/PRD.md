# Kinntegraa Financial Cash Flow Projection Tool - PRD

## Original Problem Statement
Enhance a financial cash flow projection tool with Excel export overhaul, UI improvements, currency logic, and bug fixes for a wealth management platform.

## User Personas
- **Brokers**: Manage client portfolios, tag reinvestments, send approval emails
- **Sub-brokers**: Tag reinvestments under broker supervision
- **Clients**: Approve/reject reinvestment tags, view holdings

## Core Requirements

### Completed Features (Feb 2026)

#### Session: Feb 18, 2026
1. **Currency Settings on Dashboard** - Moved Currency Settings button to Dashboard's Market Rates section for global access
2. **Horizontal Payment Timeline Component** - Created `/app/frontend/src/components/HorizontalPaymentTimeline.jsx`:
   - Colorful horizontal bar with segments (amber→orange→red→pink→purple→teal)
   - Circular nodes positioned on the timeline
   - Alternating info above/below for full version
   - Compact version for opportunity cards
   - Supports currency conversion with conversionRate prop
3. **Opportunities Page Enhancements**:
   - Replaced "Payment Progress" bar with horizontal payment timeline
   - Shows 25% share values for each payment milestone
   - Added "Confirmed Participants" count with % taken
   - Added "Available Slots" with % remaining
   - **Currency Selector** dropdown (AED, INR, USD, EUR, GBP, SGD)
   - **Projected Rate Display** showing:
     - Current exchange rate (1 AED = X currency)
     - 5-year historical range (min-max)
     - Trend direction with % annual change
     - Future projected rates for next 4 years
4. **Holdings Page Timeline** - Updated real estate holdings to use new horizontal timeline
5. **Backend: Projected Currency Rates API** - `/api/currency/projected-rates`:
   - Fetches 5 years of historical data from Frankfurter API
   - Calculates trend using linear regression
   - Projects future rates with dampening factor
   - Returns confidence level based on data consistency

#### Session: Feb 16, 2026
1. **Client Approval Count Fix** - Fixed pending approvals count to match all statuses
2. **Email Spam Fix** - Disabled individual auto-emails, only "New MF Purchase Order" email sent
3. **"Multi" Display Fix** - Shows only when multiple UCCs/portfolios actually selected
4. **Reinvestment Tagging Flow** - Unified flow via checkbox + modal (no inline dropdowns)
5. **Investment Date Fix** - API sends broker-selected date, not approval date

#### Previous Sessions
- DLD/Admin Fee Display in payment schedule modal
- Holdings Value Display (bond vs real estate filtering)
- "Repaid" Column in bond holdings report
- Repayment Status Bar fix (using gross_repaid)
- Dashboard & Holdings data alignment
- Historical Currency API integration (`/api/currency/historical_rate`)

### In Progress
- **"Multi" display bug (P0)** - May still show "Multi" for single allocations (needs user verification)
- **Duplicate approval emails (P1)** - Previous fix needs user verification

### Pending Issues
- **Expected Sale Date Bug (P1)** - Dates change unexpectedly (recurring, not investigated)
- **Logo Circle Size (P2)** - Pending user feedback

### Future/Backlog
- XIRR deviation display (Projected/Actual/Client Paid/Today's Rate)
- Backend storage of historical currency rates when payments made
- Excel Export Overhaul
- Dashboard UI: Fix presentation downloads, move "Fix Data" button

## Technical Architecture

### Stack
- **Frontend**: React, Tailwind CSS, Shadcn UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **External APIs**: Frankfurter.app (currency), Kinntegra MF Buy Scheduler

### Key Files
- `/app/backend/server.py` - Main backend (27K+ lines, needs refactoring)
- `/app/frontend/src/pages/ReinvestmentTagging.jsx` - Tagging UI
- `/app/frontend/src/pages/Holdings.jsx` - Holdings display
- `/app/frontend/src/pages/RealEstateDetails.jsx` - Real estate details

### Key API Endpoints
- `GET /api/holdings/clients` - Client list with investment totals
- `GET /api/holdings/client/{id}` - Client holdings detail
- `GET /api/currency/historical_rate` - Historical currency rates
- `POST /api/reinvestment/send-approval-email` - Send combined approval email
- `POST /api/client/approve-reinvestment/{log_id}` - Client approval action

## Test Credentials
- **PAN**: ANVPB5297J
- **Password**: kinntegra123
- **PIN**: 1234

## Known Limitations
- Currency API (frankfurter.app) doesn't support AED directly - calculated via USD (1 USD = 3.6725 AED)
- Large files need refactoring: server.py, RealEstateDetails.jsx
