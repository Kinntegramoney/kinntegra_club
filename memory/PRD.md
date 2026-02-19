# Kinntegraa Financial Cash Flow Projection Tool - PRD

## Original Problem Statement
Enhance a financial cash flow projection tool with Excel export overhaul, UI improvements, currency logic, and bug fixes for a wealth management platform.

## User Personas
- **Brokers**: Manage client portfolios, tag reinvestments, send approval emails
- **Sub-brokers**: Tag reinvestments under broker supervision
- **Clients**: Approve/reject reinvestment tags, view holdings

## Core Requirements

### Completed Features (Feb 2026)

#### Session: Feb 19, 2026 (Latest Update)
**Real Estate Holdings - Currency Projection Enhancement:**
1. **Dual Currency Display in Holdings Table** - Investment Amount, Expected Sale Amount, and Total Profit columns now show:
   - **Base Currency (AED)**: Original amounts in AED
   - **Projected Currency (INR)**: Converted amounts using date-based projected exchange rates
   - Clear separation between base and projected currencies with dividers
2. **Payment-Date-Based Rate Calculation** - Implemented `getProjectedRateForDate()` helper:
   - Paid amounts use actual/historical rates
   - Payable amounts use projected rates based on payment milestone dates
   - 3% annual depreciation rate assumption for INR against AED
3. **Enhanced Profit Breakdown**:
   - Property gain shown in AED (base)
   - Sale profit and currency benefit shown separately in INR
   - Projected exchange rate shown with expected sale date

#### Session: Feb 18, 2026 (Previous Update)
**Bug Fixes:**
1. **Email Shows Sub-broker Name** - Reinvestment approval emails now show sub-broker's name instead of broker's name when client is linked to a sub-broker
2. **"Maturity Amount" → "Repayment Amount"** - Updated text in ClientApprovals.jsx:
   - Info box: "upcoming repayment amounts" (was "maturity amounts")
   - Date label: "Repayment:" (was "Maturity:")
3. **Back Button Navigation Fixed** - In RealEstateDetails.jsx, client back button now goes to `/client/opportunities` instead of `/client/real-estate`

**Previous Session Updates (Feb 18, 2026):**
**P0 Bug Fixes:**
1. **Currency Projection Calculation Fixed** - Changed from regression slope to simple 5-year average:
   - Now uses `(current_rate - oldest_rate) / 5` for annual change
   - Projections: 2027=25.21, 2028=26.00, 2029=26.80, etc. (for INR)
   - More intuitive and matches user expectations
2. **Custom Share % State Fixed** - Each RealEstateCard now has independent local state:
   - `cardSharePercent`, `cardCustomInput`, `showCardCustomInput` per card
   - Changing share % on one card no longer affects other cards

**UI Improvements:**
3. **Timeline Dates Visible** - Payment schedule dates now shown directly above timeline (not as hover)
4. **Confirmed Participants Display** - Shows "X participants" with "Y% committed"
5. **Removed "Available Slots"** - Simplified UI by removing available slots from opportunity cards

#### Previous Session: Feb 18, 2026
1. **Currency Settings on Dashboard** - Moved Currency Settings button to Dashboard's Market Rates section for global access
2. **Horizontal Payment Timeline Component** - Created `/app/frontend/src/components/HorizontalPaymentTimeline.jsx`:
   - Colorful horizontal bar with segments (amber→orange→red→pink→purple→teal)
   - Circular nodes positioned on the timeline
   - Alternating info above/below for full version
   - Compact version for opportunity cards
   - Supports currency conversion with conversionRate prop
3. **Opportunities Page Enhancements**:
   - Replaced "Payment Progress" bar with horizontal payment timeline
   - Shows share values for each payment milestone
   - **Currency Selector** dropdown (AED, INR, USD, EUR, GBP, SGD)
   - **Projected Rate Display** showing current rate and future projections
4. **Holdings Page Timeline** - Updated real estate holdings to use new horizontal timeline
5. **Backend: Projected Currency Rates API** - `/api/currency/projected-rates`:
   - Fetches 5 years of historical data from Frankfurter API
   - Uses 5-year average for projection calculations
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
- **"Multi" display bug (P1)** - May still show "Multi" for single allocations (needs user verification)
- **Duplicate approval emails (P1)** - Previous fix needs user verification

### Completed: Feb 19, 2026
#### **P0 Bug Fix: Bond Presentation PDF Viewer**
- **Root Cause**: Static file mount (`app.mount("/api/uploads", ...)`) was conflicting with API router routes, causing inconsistent routing
- **Solution**: 
  1. Removed the static file mount - all file serving now goes through the API route `/api/uploads/{folder}/{filename}`
  2. Improved `serve_upload` endpoint with proper content-type detection and detailed logging
  3. Added debug endpoint `/api/uploads/debug/{folder}` (broker-only) to diagnose file issues
- **Testing**: PDF viewer confirmed working in preview environment - shows filename, download button, and embedded PDF

### Pending Issues (User to Verify on Live Environment)
- **Bond Presentation on Live Environment** - If still failing, use the debug endpoint:
  - `GET /api/uploads/debug/bond_presentations` to verify files exist on server
  - Check backend logs for file path issues
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
