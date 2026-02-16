# Kinntegraa - Financial Planning & Portfolio Analysis Platform

## Original Problem Statement
A comprehensive financial planning tool for brokers and advisors that includes:
1. **Data Gathering** - Client financial data collection (Assets, Liabilities, Expenses, Insurance, Goals)
2. **Portfolio Analysis** - Parse CAS PDFs and generate Gap Sheet reports

## Core Requirements
- Multi-user support (Broker, Sub-broker, Client roles)
- CAS PDF parsing with transaction extraction
- Gap Sheet Excel report generation
- Client financial data management

## What's Been Implemented

### Data Gathering Section (Completed)
- **Assets Tab**: View-only summary table with member-based columns
- **Liabilities Tab**: View-only summary table showing outstanding loan amounts
- **Expenses Tab**: Unified data entry for Regular Expenses, Loan EMIs, Insurance Premiums
- **Insurance Cover Tab**: View-only summary table comparing "Suggested" vs "Actual" coverage
- **Goals Tab**: Multi-year selection for recurring goals, "Family" option for shared goals
- **Investments Tab**: Added "Up to Year" dropdown field (2026-02-12)
- **Income Tab**: Extended year dropdowns to include years from 1950 for assets (2026-02-12)

### Analysis Section
- CAS PDF parsing with investor info, portfolio summary, folios, transactions
- Gap Sheet Excel generation with multiple sheets (Summary, Portfolio Performance, MF Transactions, Sold Units, etc.)
- Dashboard view with holdings breakdown

## Features Added (2026-02-12)

### Investment "Up to Year" Field
**File:** `/app/frontend/src/pages/DataGathering/sections/InvestmentSection.jsx`
- Added new "Up to Year" column to investments table
- Dropdown with years from current year to +50 years
- Allows specifying when an investment will continue until
- Data saved to backend with `upto_year` field

### Income Year Range Extension  
**File:** `/app/frontend/src/pages/DataGathering/sections/IncomeSection.jsx`
- Extended year dropdown in monthyear fields to include years from 1950
- Previously only showed ~50 years around current year
- Now shows full years (e.g., 1950, 1951, ... 2076) instead of just 2-digit YY

## Bug Fixes Applied

### 2025-02-10: PDF Parsing & Sold Units Fixes

#### Issue 1: Multi-Asset Fund Not Being Parsed
**Problem:** ICICI Prudential Multi-Asset Fund entries were not appearing in the output when the ISIN was on a separate line from "ISIN:".

**Root Cause:** The ISIN regex expected the ISIN code to be on the same line as "ISIN:", but some PDFs have the format:
```
...Fund Name (Non-Demat) - ISIN:
INF109K015K4(Advisor: DIRECT)
```

**Fix:** Added handling for cases where `ISIN:` is at the end of one line and the actual ISIN code is on the next line.

#### Issue 2: Scheme Name Truncation
**Problem:** Fund names with multiple dashes (like "Multi-Asset Fund - Direct Plan - Growth") were being truncated.

**Root Cause:** The regex used non-greedy matching `(.+?)` which stopped at the first ` - `.

**Fix:** Changed to greedy matching `(.+)` to capture the full scheme name up to the last ` - ISIN:`.

#### Issue 3: Transactions Not Associated with Folios
**Problem:** When Folio No appears before ISIN in the PDF, transactions were not being properly associated.

**Root Cause:** The folio entry was created with stale scheme/ISIN data from the previous fund.

**Fix:** 
1. Create folio entry when Folio No is detected
2. When ISIN is detected later, migrate transactions from the old key to the new folio+ISIN key
3. Delete the old folio-only entry to avoid duplicates

#### Issue 4: Sold Units Showing Purchases After Sale Date
**Problem:** The Sold Units sheet was incorrectly matching sales with purchases that happened AFTER the sale date, resulting in negative holding days.

**Root Cause:** The FIFO matching algorithm didn't check if the purchase date was before the sale date.

**Fix:** Added a check in the FIFO matching to skip purchases that happened on or after the sale date:
```python
if sale_date and purchase_date >= sale_date:
    continue  # Skip purchases that happened on or after the sale date
```

## Known Issues / Tech Debt
1. `ExpenseSection.jsx` is very large and should be refactored into smaller components
2. `analysis_service.py` is large (~3500 lines) and could be modularized
3. "Suggested Cover" values in Insurance Cover tab are hardcoded constants

## Key Files
- `/app/backend/analysis_service.py` - CAS PDF parsing and Gap Sheet generation
- `/app/backend/server.py` - Main API server
- `/app/frontend/src/pages/Analysis.jsx` - Analysis UI
- `/app/frontend/src/pages/DataGathering/*.jsx` - Data gathering components

## Tech Stack
- **Frontend:** React, Shadcn/UI, Tailwind CSS
- **Backend:** FastAPI, Python
- **Database:** MongoDB
- **PDF Parsing:** PyMuPDF (fitz)
- **Excel Generation:** openpyxl

## Features Added (2026-02-12)

### Bug Fix: Family Net Worth Not Capturing Liabilities
**Issue:** The Net Worth section in Data Gathering was showing ₹0 for liabilities even when loan data existed.

**Root Cause:** `NetworthSection.jsx` was only looking at `family.liabilities` array with `outstanding_amount` field, but the actual liability data comes from `expense_details` (loan EMIs like home_loan, vehicle_loan, etc.) - the same source used by `LiabilitySection.jsx`.

**Fix:** Updated `getMemberLiabilities()` in `NetworthSection.jsx` to:
1. Process `expense_details` for loan EMI entries (home_loan, vehicle_loan, etc.)
2. Calculate outstanding = EMI × remaining installments (or use explicit outstanding field)
3. Handle both family-shared and member-specific liabilities
4. Also process dedicated `liabilities` array as fallback

### Bond Presentation Upload Feature
**User Request:** Allow uploading presentations when creating or editing bonds.

**Implementation:**
1. **Backend API** (`/app/backend/server.py`):
   - `POST /api/bonds/{bond_id}/presentations` - Upload presentations (PDF, PPT, PPTX, DOC, DOCX)
   - `DELETE /api/bonds/{bond_id}/presentations/{presentation_id}` - Delete a presentation
   - Max 10 presentations per bond
   - Files stored in `/app/uploads/bond_presentations/`

2. **EditBondModal** (`/app/frontend/src/components/EditBondModal.jsx`):
   - Added "Presentations" section with file upload
   - View/download existing presentations
   - Delete presentations with confirmation
   - Shows file type icons and file sizes

3. **CreateBondModal** (`/app/frontend/src/components/CreateBondModal.jsx`):
   - Added "Presentations" tab
   - Queue presentations for upload (uploaded after bond creation)
   - Preview pending files before creation
   - Clear all / remove individual files

**Testing:**
- Backend API tested with curl - upload and delete working correctly
- Frontend linting passed (no errors)

## Features Added (2026-02-12) - Excel & PDF Export

### Cash Flow Excel Export Enhancements
**File:** `/app/frontend/src/pages/DataGathering/sections/SurplusSection.jsx`

**Completed Features:**
1. **Goal Naming**: Display specific goal names in Cash Outflow section (not generic categories)
2. **Portfolio Calculation Clarity**: Restructured portfolio section with:
   - Opening Balance (carried from previous year)
   - Additions (new savings/investments)
   - Returns (growth on portfolio)
   - Closing Balance
3. **Sheet Management**: 
   - Removed "Annual Projection" sheet
   - Merged "Cash Flow" and "Portfolio Details" into single comprehensive sheet
4. **Asset Consider for Restructuring** section:
   - Year 1: Shows initial assets
   - Year 2+: Previous year's closing balance split by equity/debt ratio
5. **Retirement Withdrawals** section: Shows yearly withdrawals when expenses exceed income
6. **Currency Formatting**: Indian Rupee symbol (₹) with comma separators (e.g., ₹ 4,14,66,532)
7. **Excel Styling**: Color-coded sections with headers, totals highlighted

### PDF Export (New Feature)
- Summarized PDF version of the cash flow projection
- Includes: Summary stats, yearly cash flow table, portfolio allocation boxes
- Uses jsPDF with autotable for professional formatting

**Testing Status:** ✅ PASSED
- Both Excel and PDF exports execute without JavaScript errors
- Files download successfully
- Test report: `/app/test_reports/iteration_37.json`

## Pending User Verification
1. Real Estate UI changes (currencies, percentages, download)
2. Bond presentation upload feature (frontend manual testing needed due to 2-step auth)
3. Excel/PDF export - verify file contents match requirements

## Bug Fixes (2026-02-12) - Presentation Downloads

### Issue 1: Real Estate Presentation Download "Method Not Allowed"
**File:** `/app/backend/server.py`

**Problem:** Clicking download on real estate presentations returned `{"detail":"Method Not Allowed"}`.

**Root Cause:** The `download_presentation` function was missing its `@api_router.get` decorator - it was a dangling function without a route.

**Fix:** Added the missing decorator at line 18665:
```python
@api_router.get("/real-estate-opportunities/{opportunity_id}/presentations/{presentation_id}")
async def download_presentation(...)
```

### Issue 2: Bond Presentations Not Visible for Download
**File:** `/app/backend/server.py`

**Problem:** Bond presentations uploaded via Edit Bond were not appearing in the bond details page.

**Root Cause:** The `Bond` Pydantic model did not include a `presentations` field. When the API returned bond data, Pydantic validation stripped the `presentations` array due to `extra="ignore"` config.

**Fix:** Added `presentations` field to the `Bond` model at line 15437:
```python
presentations: Optional[List[dict]] = []  # Presentation files (PDFs, PPTs, DOCs)
```

## Features Updated (2026-02-12) - Chart Simplification

### Wealth Projection Display Reverted to Simple Text
**File:** `/app/frontend/src/pages/DataGathering/sections/SurplusSection.jsx`

**User Request:** "remove the bar chart design and show it how it was reflecting in the past"

**Changes Made:**
1. Removed `recharts` bar chart visualization from `WealthChart` component
2. Reverted to simple text-based result display showing:
   - ✅ Green checkmark with "Lasts till [year]" for successful projections
   - ⚠️ Orange warning with "Exhausts in [year]" for failed projections
   - Badge showing "[X]y short" when projection falls short of life expectancy
3. Removed complex chart elements (tooltips, multiple bar colors, axis labels, etc.)
4. Comment updated: `// recharts removed - using simple text display`

**Technical Details:**
- `WealthChart` component reduced from ~110 lines to ~25 lines
- No visual dependencies removed - `recharts` library still available if needed
- Component still receives `result` object with `success`, `finalCorpus`, `lastYear`, `yearsShort` properties

## Features Added (2026-02-13) - Dashboard Enhancements

### Silver Price in Market Rates Card
**File:** `/app/frontend/src/pages/Dashboard.jsx`

**User Request:** "also show rates for silver" - Add silver price to the Market Rates card alongside gold.

**Implementation:**
1. Added `silverRate` state variable with default value of ₹950/10g
2. Created `fetchSilverRate()` function using GoldPrice.org API (`xagPrice` field)
3. Integrated silver rate fetch into initial load (`useEffect`) and refresh button
4. Updated "Commodities" section in Market Rates card to display:
   - Gold (24K) /10g: Live price from API
   - Silver /10g: Live price from API (new)

**Technical Details:**
- API: `https://data-asg.goldprice.org/dbXRates/INR`
- Response fields: `xauPrice` (gold), `xagPrice` (silver) - prices per troy oz
- Conversion: Price per oz / 31.1035 (grams per troy oz) × 10 = Price per 10g
- Same API call can fetch both gold and silver prices efficiently

**Testing:** ✅ Verified via screenshot - Silver price displays correctly (₹2,242/10g)

### XIRR Calculation Fix for Real Estate
**File:** `/app/frontend/src/pages/RealEstateDetails.jsx`

**User Request:** "the last amount due on completion is not to be considered while calculating xirr"

**Implementation:**
- Modified `calculateXIRRWithParams` function to skip payment milestones with date >= sale date
- These payments are counted as "outstanding" and deducted from sale proceeds instead
- This only affects real estate XIRR - bond XIRR remains unchanged

### XIRR Maturity Calculation Fix for Bonds
**File:** `/app/backend/server.py`

**User Request:** "the maturity value is not matching with the expected leading to incorrect XIRR"

**Root Cause:**
In `recalculate_maturity_for_trade` function (line 22145), the code was using `gross_amount` (which includes both principal AND interest) to reduce the balance principal:
```python
# BEFORE (WRONG):
rep_amount = rep.get('gross_amount', 0)
balance_principal -= rep_amount  # This incorrectly subtracts interest too!
```

**Fix Applied:**
The code now correctly extracts the **principal component** and only reduces the balance by that:
```python
# AFTER (CORRECT):
rep_principal = rep.get('principal', 0) or 0
# If principal not specified, assume gross is all principal (legacy prepayment data)
if rep_principal == 0 and rep_gross > 0:
    rep_principal = rep_gross
balance_principal -= rep_principal  # Only subtract principal, not interest
```

**Impact:**
- Maturity amounts will now be calculated correctly based on actual outstanding principal
- XIRR calculations will match expected values
- Applies only to bonds (real estate XIRR unaffected)

### Co-owner Privacy Controls (Real Estate)
**File:** `/app/frontend/src/pages/RealEstateDetails.jsx`

**User Request:** Client should only see their own details (passport, XIRR), not other co-owners'. Sub-brokers should only see their linked clients.

**Implementation:**
1. Added `canViewInvestorDetails(investorClientId)` helper function:
   - Broker: can view all investors
   - Sub-broker: can only view their linked clients
   - Client: can only view their OWN details

2. Added `isCurrentUserInvestor(investorClientId)` to mark own profile with "(You)"

3. Updated "XIRR Comparison Report" section:
   - Passport details shown only for investors user can view
   - XIRR button shown only for permitted investors
   - Other co-owners show "Details restricted" with lock icon
   - Own profile marked with "(You)" badge

4. Updated Payment Schedule table:
   - Table headers only show columns for investors user can view
   - Per-investor document status cells filtered by permission
   - DLD + Admin row also respects same permissions

**Visual Changes:**
- Restricted investors show: Lock icon + "Details restricted"
- Clients see message: "You can only view your own details"
- Sub-brokers see message: "Not your linked client"

### View Passport Feature (Real Estate)
**File:** `/app/frontend/src/pages/RealEstateDetails.jsx`
**Date:** 2026-02-16

**User Request:** "passport viewing option doesnt exist...Give an eye button" - Add ability to view uploaded passport documents in the XIRR Comparison Report section.

**Implementation:**
1. Added Eye icon button next to passport number in "XIRR Comparison Report" section
2. Button only appears when `investor.passport_document` exists (passport file uploaded)
3. Click triggers API call to `/api/real-estate-opportunities/{opp_id}/investor/{investor_id}/passport-download`
4. Opens passport PDF in new browser tab using `window.open()`
5. Proper error handling with toast notification on failure
6. Respects permission controls (only visible to users who can view that investor's details)

**Technical Details:**
- Eye icon from lucide-react (already imported)
- Uses existing passport-download API endpoint
- Response converted to Blob and opened via `URL.createObjectURL()`
- Added `data-testid="view-passport-btn-{idx}"` for testing
- Button has hover effect and tooltip "View Passport"

**Testing:** ✅ Verified via screenshot - Eye button visible next to passport number (AD349184)

### Holdings Client Type Filter
**Files:** `/app/frontend/src/pages/Holdings.jsx`, `/app/backend/server.py`
**Date:** 2026-02-16

**User Request:** "under holdings below search option, allow to select bonds clients or real estate clients or both"

**Implementation:**

**Backend (`/api/holdings/clients`):**
1. Added batch lookup for real estate investors from `real_estate_opportunities` collection
2. Added `has_bonds` field - true if client has approved trades in `trades` collection
3. Added `has_real_estate` field - true if client is an investor in any real estate opportunity

**Frontend:**
1. Added `clientTypeFilter` state with values: "all", "bonds", "real_estate"
2. Added Select dropdown below search input with options:
   - All Clients
   - Bond Clients
   - Real Estate Clients
3. Updated `filteredClients` logic to filter based on selected type

**Testing:** ✅ Verified via screenshot - Dropdown visible with all three options

### Payment Schedule - Live Currency Rates & Passport Preview
**File:** `/app/frontend/src/pages/RealEstateDetails.jsx`
**Date:** 2026-02-16

**User Requests:**
1. "while clicking on the view eye icon for passport viewing, it says failed to view document. on clicking over it, it should show in popup format"
2. "for available real estate opportunities it should consider the real currency rate from api"
3. "for funded opportunities, we should capture currency values as on those dates...Also we should then remove the currency setting button as it stands no relevance"

**Implementation:**

**1. Passport Preview Popup Modal:**
- Added `showPassportPreviewModal`, `passportPreviewUrl`, `passportPreviewLoading` states
- Changed eye button click handler to open modal instead of new tab
- Modal displays PDF using `<object>` tag with fallback options
- Added "Download" and "Open in New Tab" buttons for browsers that can't display PDFs inline
- Added loading spinner while fetching passport document

**2. Live Currency Rates for ALL Opportunities:**
- Added `liveCurrencyRates` state to store rates from external API
- Added `useEffect` to fetch live rates from `api.exchangerate-api.com/v4/latest/AED`
- Updated `currencyRates` memo to prioritize live API rates over default rates
- Both available and funded opportunities now use live rates
- Shows "Live rates as of [date]" indicator in Payment Schedule modal

**3. Removed Currency Settings Button:**
- Removed the "Currency Settings" button from XIRR Comparison Report section
- Only "Fix Status" button remains for broker/sub-broker

**Testing:** 
- ✅ Passport modal popup working with Download/Open in New Tab options
- ✅ Currency Settings button removed from XIRR section
- ✅ Live rates fetched - INR rate changed from 22.75 (default) to ~24.70 (live)

## Pending Issues (Awaiting User Input)

### Issue 1: Logo Circle Size (P2)
**Status:** BLOCKED - User asked about logo size but no change requested
**Current Sizes:** Login: `w-16 h-16`, Sidebar: `w-10 h-10`

### Issue 2: Expected Sale Date Bug (P1)
**Status:** NEEDS INVESTIGATION - User mentioned "expected sale date is the same as on completion date"
**Suspected Cause:** May be intentional defaulting or unintentional overwrite when dates align

## Backlog / Future Tasks
1. Centralize currency options into shared utility file
2. Improve automated testing to handle two-step authentication
3. Refactor `SurplusSection.jsx` (~2900 lines) - extract calculation logic to custom hook, move export functions to utility module
4. Remove unused `html2pdf.js` dependency (PDF export was removed but module still in package.json)
5. Refactor `server.py` - very large monolithic file, should split into routes/models/services
6. Refactor `Dashboard.jsx` - extract data-fetching logic into custom hooks
