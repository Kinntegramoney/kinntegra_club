# Kinntegraa - Product Requirements Document

## Recent Changes (Jan 29, 2026)

### SubBrokerReinvestment Component Sync (Jan 29, 2026) ✅

**Issue:** `SubBrokerReinvestment.jsx` was severely outdated and missing all recent month-wise UI changes.

**Fix Applied:**
- `/app/frontend/src/pages/SubBrokerReinvestment.jsx`: Replaced entire file with re-export of `ReinvestmentTagging.jsx`
  - `ReinvestmentTagging.jsx` already handles both broker and sub_broker roles via `getSidebar()` function
  - Eliminates code duplication and ensures feature parity

### Unit Blocking File Upload Fix (Jan 29, 2026) ✅

**Issue:** Sub-brokers could not block units for clients - "Not Found" error when uploading UTR copy.

**Root Cause:** The `/api/upload` endpoint didn't exist in the backend.

**Fix Applied:**
- `/app/backend/server.py`: Added new `POST /api/upload` endpoint
  - Accepts multipart file uploads
  - Saves files to `/app/uploads/files/` directory
  - Returns file URL in format `/api/uploads/files/{filename}`
  - Requires authentication

### UI Restructure: Approvals Page & Lead Management (Jan 29, 2026) ✅

**Changes:**
1. **New "Approve" sidebar menu** - Added to broker navigation
2. **New `ApprovalsPage.jsx`** - Centralized approval page with 4 tabs:
   - Reinvestment - Bonds (for bond reinvestment approvals)
   - Client Creation (for sub-broker client creation approvals)
   - Allotment - Bonds (for unit allotment approvals)
   - Payment Tag - Real Estate (placeholder for future real estate payment approvals)

3. **Simplified `LeadManagement.jsx`** - Now shows only "Client Interest" functionality:
   - Search and filter client interest/leads
   - Update lead status (Open, Closed, Not Interested)
   - Removed all approval-related tabs (moved to new Approve page)

**Files Modified:**
- `/app/frontend/src/pages/ApprovalsPage.jsx` (Created)
- `/app/frontend/src/pages/LeadManagement.jsx` (Simplified)
- `/app/frontend/src/components/Sidebar.jsx` (Added "Approve" link)
- `/app/frontend/src/App.js` (Added route, removed old redirect)

### Multi-Tagging in Month-Wise View (Jan 29, 2026) ✅

**Feature:** Client-wise grouping with checkboxes and split allocation modal in month-wise reinvestment view.

**Changes Applied:**
- `/app/frontend/src/pages/ReinvestmentTagging.jsx`:
  - Rewrote `renderMonthView` to use client-wise grouping
  - Added `renderMonthClientGroup` component with expandable client cards
  - Each client card shows entries with checkboxes for multi-selection
  - "Split Amount" buttons (Principal, Interest, Both) appear when entries selected
  - UCC, Portfolio, and Tag dropdowns available for each entry
  - Supports split allocation modal for dividing amounts across multiple UCCs

### Notification Bell with Sound (Jan 29, 2026) ✅

**Feature:** Real-time notification bell with sound alerts for new approvals and leads.

**Implementation:**
- `/app/frontend/src/components/NotificationBell.jsx` (Created):
  - Polls backend every 30 seconds for pending approvals and open leads
  - Plays notification sound (Web Audio API) when new items arrive
  - Shows dropdown with clickable notifications linking to relevant pages
  - Amber pulsing bell icon when there are unread notifications
  - Badge showing total pending count

- `/app/frontend/src/components/Sidebar.jsx` (Updated):
  - Added NotificationBell component in sidebar header
  - Visible for broker users only

### Client Holdings Page Alignment (Jan 29, 2026) ✅

**Feature:** Aligned client holdings table with broker/sub-broker holdings report.

**Changes:**
- `/app/frontend/src/pages/ClientHoldings.jsx`:
  - Removed 12-column table layout
  - Updated to match broker's 7-column format:
    - SCHEME (bond name + units)
    - INVESTMENT
    - GROSS EXPECTED
    - PROFIT
    - EXPECTED XIRR
    - ACTUAL XIRR
    - ACTION
  - Removed Quick Tools section (not applicable to clients)
  - Removed Trades tab (moved to Logs page)
  - Auto-sync happens on page load (no manual sync needed)
  - Shows difference values in parentheses when actual differs from expected

### Client Approval & Logs Flow (Jan 29, 2026) ✅

**Feature:** Complete client approval workflow for reinvestments with Kinntegra API integration.

**Workflow:**
1. Broker tags a reinvestment → Entry created in `reinvestment_logs` with `approval_status: pending`
2. Client sees pending items in new "Approve" tab
3. Client approves/rejects → Triggers Kinntegra MF Buy Scheduler API on approval
4. Entry moves to "Logs" tab → Broker/Sub-broker notified

**Frontend Changes:**
- `/app/frontend/src/pages/ClientApprovals.jsx` (Created):
  - Shows pending reinvestment approvals
  - Approve/Reject actions with confirmation modal
  - Shows bond details, amounts, portfolio, UCC allocations

- `/app/frontend/src/pages/ClientLogs.jsx` (Created):
  - Shows all reinvestment logs (approved, rejected, pending, submitted)
  - Filterable by status
  - Shows tagged by, dates, and status

- `/app/frontend/src/components/ClientSidebar.jsx` (Updated):
  - Added "Approve" link with pending count badge
  - Added "Logs" link
  - Removed old "Reinvestments" link

- `/app/frontend/src/App.js` (Updated):
  - Added routes for `/client/approvals` and `/client/logs`

**Backend Changes:**
- `/app/backend/server.py` (Added endpoints):
  - `GET /api/client/pending-approvals/count` - Returns pending approval count
  - `GET /api/client/pending-approvals` - Returns pending reinvestment logs
  - `GET /api/client/reinvestment-logs` - Returns all logs for client
  - `POST /api/client/approve-reinvestment/{log_id}` - Client approves/rejects
    - On approval: Calls Kinntegra MF Buy Scheduler API
    - Creates notification for broker/sub-broker
    - Updates `approval_status` to "submitted" after API call

### Read-Only Future Months Feature (Jan 29, 2026) ✅

**Feature:** Future months >3 months away are view-only (can see entries but cannot tag).

**Implementation Verified:**
- Eye icon (👁) displays on month tabs for May, Jun, Jul 2026 (>3 months from current Jan 2026)
- Tagging controls (Select dropdowns, Save button) are disabled for view-only months
- Badge shown instead of Select dropdown for tag status
- "View Only" badge and explanation text shown when viewing a locked month

### Month-Wise Reinvestment Tagging (Jan 29, 2026) ✅

**Feature:** Redesigned reinvestment tagging with month-wise view and 3-month rolling window.

**Changes Applied:**
- `/app/frontend/src/pages/ReinvestmentTagging.jsx`:
  - Added month tabs showing past 6 months + current + next 6 months
  - Historical entries always accessible
  - Current month + next 3 months are active (Jan 2026 → Apr 2026)
  - Months 4-6 in future are VIEW-ONLY with Eye icons (can see but not tag)
  - Next quarter unlocks 5 days before it starts
  - Month view shows table with: Investor, Opportunity, Amount, Expected Date, Principal, Interest, Net Amount, Tag dropdown, Save button

**Logic:**
- If current month is January 2026:
  - Jan, Feb, Mar, Apr 2026 → Active (within rolling 3-month + 1 window)
  - May, Jun, Jul 2026 → View-only (Eye icon, disabled controls)

---

### Client Holdings Page Overhaul (Jan 29, 2026) ✅

**Feature:** Redesigned the client holdings page to match the broker/sub-broker view but showing only the client's own data.

**Changes Applied:**
- `/app/frontend/src/pages/ClientHoldings.jsx`: Complete rewrite with:
  - Summary stats bar (Total Investment, Expected, Profit, Outstanding Principal)
  - Repayment Status progress bar with received/outstanding breakdown
  - Status filter (All, Active, Completed)
  - Detailed holdings table with:
    - Units, Invested, Principal, Interest (Gross), TDS, Net Repaid, Upcoming
    - Expected XIRR and Actual XIRR columns
    - Expandable tranches for bonds with multiple investments
  - Cashflow modal with per-tranche details
  - Real Estate tab with payment progress

### Client Sidebar Cleanup (Jan 29, 2026) ✅

**Feature:** Removed unnecessary tabs from client sidebar.

**Changes Applied:**
- `/app/frontend/src/components/ClientSidebar.jsx`: Removed Trade Approvals, Trade Verification, Analysis, Approval Logs. Client now sees: Opportunities, Holdings, Reinvestments, Profile.

---

### Auto Round-off on Portfolio Selection & UCC Handling Improvements (Jan 29, 2026) ✅

**Issues Fixed:**
1. **Auto round-off when portfolio is chosen**: Amount now automatically rounds to nearest 100 when user selects a portfolio
2. **Amounts < ₹1000 skip UCC**: 
   - Automatically tagged to "None" portfolio
   - UCC field shows "N/A (amount < ₹1000)" instead of requiring selection
   - Validation no longer requires UCC for amounts < ₹1000 with "None" portfolio
3. **Multiple UCC display**: 
   - Client Reinvestment Approvals now shows UCC for each allocation in the Portfolio Allocations section
   - Approval email now includes UCC details for each allocation
   - Backend API returns UCC in allocation data

**Files Modified:**
- `/app/frontend/src/pages/ReinvestmentTagging.jsx`: Auto round-off on portfolio selection, UCC N/A for small amounts, updated validation
- `/app/frontend/src/pages/SubBrokerReinvestment.jsx`: Same changes as above
- `/app/frontend/src/pages/ClientReinvestmentApprovals.jsx`: Shows UCC per allocation
- `/app/backend/server.py`: 
  - Returns UCC in allocation data (`/api/client/reinvestment-approvals`)
  - Email includes UCC allocation details

---

### Client Reinvestment Approval UI Enhancement (Jan 29, 2026) ✅

**Feature:** Enhanced the Client Reinvestment Approvals page with richer data display and improved UX.

**Changes Applied:**
- **`/app/frontend/src/pages/ClientReinvestmentApprovals.jsx`**:
  - Renamed "Approved" tab to "My Trades" for clarity
  - Added detailed Portfolio Allocations section showing MF Investment Dates
  - Enhanced amount details display (Reinvestment Amount, Rounded Amount, Round-off, UCC)
  - Improved empty state messages with contextual guidance
  - Better visual hierarchy with icons and color-coded sections
  - Added support for multiple portfolio allocations per reinvestment

---

### Broker Profile Page (Jan 29, 2026) ✅

**Feature:** Created a dedicated profile page for brokers to manage their account information.

**Files Created/Modified:**
- **`/app/frontend/src/pages/BrokerProfile.jsx`**: New page allowing brokers to:
  - View and edit Full Name, Email, Phone
  - View PAN (read-only)
  - See stats: Role, Sub-Broker count, Client count
- **`/app/frontend/src/App.js`**: Added route `/broker/profile`
- **`/app/frontend/src/components/Sidebar.jsx`**: Added "Profile" link for brokers

**Backend endpoints used:**
- `GET /api/broker/profile` - Fetch broker profile
- `PUT /api/broker/profile` - Update broker profile (name, email, phone)

---

### Email Link Approval - Kinntegra API Integration (Jan 29, 2026) ✅

**Issue:** When clients approved reinvestments via email link (`/api/reinvestment/approve-via-link`), the Kinntegra MF Buy Scheduler API was not being called.

**Fix Applied:**
- **`/app/backend/server.py`**: Updated `approve_reinvestment_via_link()` endpoint
  - Now calls `call_kinntegra_mf_buy_scheduler()` for each approved cashflow
  - Returns `kinntegra_results` array with status for each API call
  - Removed old placeholder submission logic

---

## Recent Changes (Jan 28, 2026)

### Holdings Sorting by Investment Value (Jan 28, 2026) ✅

**Issue:** Client names in Holdings page were not sorted by investment value.

**User Requirement:** Names should be arranged by highest investment value first, then alphabetically for equal values.

**Fix Applied:**
- **`/app/backend/server.py`**: Updated `get_holdings_clients()` endpoint
  - Added sorting: `client_summaries.sort(key=lambda x: (-x['total_investment'], x['name'].lower()))`
  - Clients now sorted by investment (descending), then alphabetically

---

### Forgot Password Fix (Jan 28, 2026) ✅

**Issue:** Forgot password was not working for brokers, sub-brokers, or clients.

**Root Cause:** 
1. Server was calling wrong email function (`send_password_reset_email` expects password/PIN, but server passed reset token)
2. Server only checked `users` table (brokers), ignoring `sub_brokers` and `clients` tables

**Fix Applied:**
- **`/app/backend/server.py`**: Updated `forgot_password()` endpoint
  - Now checks all 3 tables: `users` (brokers), `sub_brokers`, `clients`
  - Uses correct email function `send_password_reset_link_email` for reset link
  - Stores `user_type` in JWT token for proper password update
- **`/app/backend/server.py`**: Updated `reset_password()` endpoint
  - Reads `user_type` from token to update correct collection

---

### User Activity Logs Access Control (Jan 28, 2026) ✅

**Issue:** User activity was not visible to broker; access control needed refinement.

**User Requirement:**
- Broker should see all clients' and sub-brokers' activities (not their own)
- Sub-broker should see only their linked clients' activities (not self or broker)
- Clients should NOT have access to user activity

**Fix Applied:**
- **`/app/backend/server.py`**: Updated `get_user_activity_logs()` endpoint
  - Broker: `query['broker_id'] = current_user['id']` AND `query['user_id'] = {'$ne': current_user['id']}`
  - Sub-broker: `query['linked_subbroker_id'] = current_user['id']` AND `query['user_role'] = 'client'`
  - Clients: Return 403 Forbidden

---

### Holdings PDF Redesign (Jan 28, 2026) ✅

**Issue:** The Holdings "View Details" PDF export was using a dashboard-style design with colored cards, which didn't match the clean table-based design of the Secondary Calculator PDF.

**Fix Applied:**
- **`/app/frontend/src/pages/Holdings.jsx`**: Completely rewrote `downloadCombinedCashflowPDF()` function
  - Changed to use inline CSS styles for maximum compatibility with html2pdf.js
  - Added solid 1px grey borders (`border: 1px solid #999`) on all table cells
  - Header table with 5 columns: Bond Name | Units | Total Investment | Expected XIRR | Actual XIRR
  - Two-column layout for Expected and Actual Cashflows side-by-side
  - Alternating row backgrounds for readability
  - Total Returns and Profit rows at the bottom of each column
  - Italicized note explaining cashflow terminology
  - Footer with generation timestamp

---

### Secondary Calculator PDF Redesign (Jan 28, 2026) ✅

**Issue:** The Secondary Calculator's PDF export was generating a dashboard-style design with colored cards, which did not match the user's reference design (`Bond_Cashflow_Final_Rupee.pdf`).

**User Requirement:** The PDF should match the reference exactly:
- Header table with 5 columns: Bond Name, Amount Invested, Gross Expected, Profit, Expected XIRR
- Section title: "Expected Cashflow"
- Simple table with 4 columns: Date, Description, Gross Amount (₹), Net Amount (₹)
- First row shows "Principal Invested" with negative value in red
- Total Returns row at the bottom
- Note section explaining Gross vs Net amounts

**Fix Applied:**
- **`/app/frontend/src/pages/BondDetails.jsx`**: Completely rewrote `exportCashflowToPDF()` function
  - Changed HTML template to match reference design exactly
  - Fixed `secondary_irr` access (was using `bondData?.secondary_irr` before `bondData` was defined)
  - Now correctly accesses `bond?.bond?.secondary_irr`
  - Clean table-based layout with proper borders and styling
  - Currency formatting using Indian locale

**Testing:**
- ✅ PDF generation working correctly
- ✅ Modal displays correctly matching reference design
- ✅ Toast notification confirms successful export

---

### PDF Fix - Monthly Cashflow Schedule (Jan 28, 2026) ✅

**Issue:** PDF generated but Monthly Cashflow Schedule table was blank.

**Root Cause:** The `max-h-[350px] overflow-y-auto` CSS was clipping the table content during PDF capture.

**Fix Applied:**
- **BondDetails.jsx**: Updated `exportCashflowToPDF()` to:
  - Temporarily remove scroll constraints before PDF generation
  - Added `windowWidth: 1200` and `height: reportElement.scrollHeight + 100` to html2canvas config
  - Restore scroll constraints after PDF is generated

---

### Real Estate Payment Schedule View Details (Jan 28, 2026) ✅

**New Feature:** Added "View Payment Schedule" button and modal for Real Estate opportunities.

**Features:**
1. **Currency Conversion** - Dropdown to convert AED to:
   - INR (₹) - Rate: 22.75
   - USD ($) - Rate: 0.27
   - EUR (€) - Rate: 0.25
   
2. **Payment Schedule Table** with per-user contribution columns

3. **Dummy Users** - When no real investors exist, shows 4 dummy investors:
   - Investor A: 40%
   - Investor B: 30%
   - Investor C: 20%
   - Investor D: 10%

4. **Summary Cards** showing Unit Price, Total Cost, Milestones count, and Co-owners count

**Files Modified:**
- `/app/frontend/src/pages/RealEstateDetails.jsx`
- `/app/frontend/src/pages/BondDetails.jsx`

---

### PDF/Excel Download Fix (Jan 28, 2026) ✅

**Issue:** PDFs were coming blank for all options (secondary calculator, expected vs actual XIRR)

**Root Cause:** The PDF generation was using `opacity: 0` on a div element, which html2canvas couldn't capture properly.

**Fixes Applied:**
1. **PDF Generation** (`Holdings.jsx`): Changed from hidden div approach to using an iframe for more reliable rendering
   - Uses iframe.contentDocument for HTML rendering
   - Better html2canvas configuration with `windowWidth: 1100` and `scale: 2`
   
2. **Excel Download** (`Holdings.jsx`): Added new `downloadCombinedCashflowExcel()` function
   - Generates CSV format (universally compatible)
   - Includes both Expected and Actual cashflows
   - Shows investment, returns, profit, and XIRR for both sections

3. **UI Update**: Added separate PDF and Excel buttons in the Cashflow Details modal
   - PDF button (gold)
   - Excel button (green)

---

### FIX: Double Entries in Actual Cashflows (Jan 28, 2026) 🔴

**Issue:** View Details section was showing duplicate entries in the Actual Cashflow section for clients with multiple investment dates on the same bond.

**Root Cause:** Backend was fetching ALL `actual_repayments` for the bond/client without filtering by investment date. This caused each date-grouped holding to include repayments from ALL investment tranches.

**Fix Applied:**
- **Backend (`/app/backend/server.py` lines 10085-10100)**: Added filtering to match `actual_repayments` only to the specific investment date group
- Repayments now correctly associated with their respective investment tranches
- Each View Details tab shows only the cashflows for that specific investment date

---

### Holdings View: Summary vs Detail (Jan 28, 2026) ✅

**Issue:** After fixing the merge logic, the Holdings Report was showing individual transactions instead of a consolidated summary view.

**User Requirement:**
- **Summary View (list)**: Show ONE row per bond with consolidated totals (units, invested, expected, etc.)
- **Detail View (View Details popup)**: Show breakdown by investment date with separate XIRR calculations for each tranche

**Fix Applied:**
1. **Backend** (`server.py`): Still groups by `bond_id|investment_date` to calculate correct XIRR per tranche
2. **Frontend** (`Holdings.jsx`): Updated `getConsolidatedHoldings()` to:
   - Group by `bond_id` only for summary view
   - Store individual holdings (with different dates) in `trades[]` array for detail view
   - Show consolidated totals in the main list
   - Show per-tranche details when user clicks "View Details"

---

### CRITICAL FIX: Holdings Merge Logic (Jan 28, 2026) 🔴

**Issue:** The system was incorrectly merging investments for the same bond regardless of investment date. This caused:
1. Fali Unwalla - Different date investments showing same amounts (incorrect merge)
2. Jairaj Nevrekar - Same-day investments being doubled (incorrect calculation)
3. Expected and Actual XIRR showing incorrect values

**Root Cause:** Backend and frontend were grouping trades by `bond_id` only, not by `bond_id + investment_date`.

**Fix Applied:**
1. **Backend (`/app/backend/server.py`)**: Changed grouping key from `bond_id` to `bond_id|investment_date`
   - Trades with SAME bond + SAME date → Merged (correct behavior)
   - Trades with SAME bond + DIFFERENT dates → Kept separate (correct behavior)
2. **Frontend (`/app/frontend/src/pages/Holdings.jsx`)**: Updated `getConsolidatedHoldings()` to use composite key `${bondId}|${investmentDate}`

**Behavior After Fix:**
- Each unique combination of bond + investment date gets its own holding entry
- XIRR calculations are now correct for each tranche
- Cashflows are properly associated with their respective investment tranches

---

### Business Rules & Backend Fixes (Jan 28, 2026) ✅

**1. Amount Rounding (Frontend)**
- Changed from `Math.round` to `Math.floor` for rounding to nearest 100
- Example: 456055 → 456000 (rounds DOWN, not to nearest)
- Files: `ReinvestmentTagging.jsx`, `SubBrokerReinvestment.jsx`

**2. Kinntegra API Trigger Fix (Backend)**
- Fixed `call_kinntegra_mf_buy_scheduler()` to handle 'both' tag (was returning "skipped")
- Added support for split allocations (`ucc_allocations` array)
- Now correctly calculates amount for 'both' tag using `net_amount`
- Files: `/app/backend/server.py` lines 3105-3330

**3. Allow Editing Approved Tags (Backend)**
- Removed block that prevented editing client-approved tags
- Now allows editing until `repayment_processed` or `kinntegra_api_submitted` is true
- When broker/sub-broker modifies approved tag → Sets `approval_status = 'pending_reapproval'`
- Files: `/app/backend/server.py` lines 11626-11660

**4. Email BCC (Backend)**
- All outgoing emails now BCC to `donotreply@kinntegraa.club`
- Files: `/app/backend/email_service.py` lines 102-108

---

### UCC Split Allocation Feature (Jan 28, 2026) ✅

**Request:** User wanted the ability to split a single reinvestment entry across multiple UCCs with different amounts, portfolios, and tags for each allocation.

**Implementation:**
1. Enhanced the "Edit Individually" modal to support UCC allocations
2. Each entry now shows:
   - Entry header with bond name, client, date, and total amount
   - Green/amber status bar showing allocation progress (Allocated: ₹X / ₹Y)
   - Multiple allocation rows, each with: UCC dropdown, Amount input, Portfolio dropdown, Tag dropdown
   - "Add UCC Allocation" button to add more splits (limited to client's registered UCCs)
   - "Remove" button (minus icon) to remove allocations
3. Validation ensures:
   - Total allocations must equal the entry amount
   - Each allocation requires UCC, Amount > 0, Portfolio, and Tag
4. Data structure stores `ucc_allocations` array for backend processing

**Files Modified:**
- `/app/frontend/src/pages/ReinvestmentTagging.jsx` - New functions: `addUccAllocation`, `removeUccAllocation`, `updateAllocation`, `getAllocationTotal`, `validateAllocations`
- `/app/frontend/src/pages/SubBrokerReinvestment.jsx` - Same changes applied

**Behavior:**
- "Add UCC Allocation" button only appears if client has multiple UCCs registered
- Single-UCC clients can only have one allocation per entry

---

### Multi-Select Retag Modal (Jan 28, 2026) ✅

**Request:** User wanted a multi-select retag option where selected entries are shown side by side with individual editable fields (UCC, Portfolio, Tag) for each entry.

**Implementation:**
1. Added "Edit Individually" button to the sticky mass tagging bar
2. Created a new multi-retag modal (`Dialog`) that displays selected entries in side-by-side columns (max 3 per row)
3. Each entry column contains:
   - Bond name and date header
   - UCC dropdown for that specific entry
   - Amount breakdown grid (Principal, Interest, Total)
   - Tag selection via RadioGroup (Principal, Interest, Both, Custom)
   - Portfolio button grid (Wealth, Tax, Short Term, Commodities, Bonds, Real Estate, None)
4. "Apply Changes" button saves individual settings per entry to `localChanges` state

**Files Modified:**
- `/app/frontend/src/pages/ReinvestmentTagging.jsx` - Added imports (Dialog, RadioGroup, Label), state (`showMultiRetagModal`, `multiRetagData`), helper functions (`openMultiRetagModal`, `updateMultiRetagEntry`, `applyMultiRetagChanges`), and modal JSX
- `/app/frontend/src/pages/SubBrokerReinvestment.jsx` - Same changes applied

---

### Mass Retagging Bar Position Fix (Jan 28, 2026) ✅

**Issue:** The mass tagging bar in reinvestment pages was positioned within the content flow, causing it to float incorrectly when scrolling down long client lists.

**Fix Applied:**
1. Removed the inline mass tagging bar from the content area
2. Added a sticky bar with `fixed bottom-0 left-0 right-0` CSS positioning
3. Added `pb-24` padding to content area to prevent content from being hidden behind the sticky bar
4. Bar now stays at the viewport bottom regardless of scroll position

**Files Modified:** 
- `/app/frontend/src/pages/ReinvestmentTagging.jsx` (lines 831-883 for sticky bar)
- `/app/frontend/src/pages/SubBrokerReinvestment.jsx` (lines 835-887 for sticky bar)

---

### Holdings Frontend - Individual Investment Date Tabs (Jan 28, 2026) ✅

**Issue:** The Holdings page was showing all transactions merged under a single date tab, even when the backend returned `individual_trades` data with different investment dates.

**Fix Applied:**
1. Updated `getConsolidatedHoldings()` function in Holdings.jsx
2. When `individual_trades` array is available with multiple trades, create separate tab entries for each
3. Each tab now shows the specific investment date and units for that trade

**Files Modified:** `/app/frontend/src/pages/Holdings.jsx` (lines 726-755)

**Verified Results:**
- Fali Adi Unwalla's "Uc Inclusive Credit" bond now shows tabs: "08 May 2025 (42 units)", "13 May 2025 (15 units)"
- "Natureresidences" bond shows tabs: "30 Apr 2025 (34 units)", "02 May 2025 (31 units)", "07 May 2025 (135 units)"

---

## Recent Changes (Jan 27, 2026)

### Holdings Merge - Same Bond Multiple Trades (Jan 27, 2026) ✅

**Issue:** When a client invests in the same bond multiple times (same day or different days), the system was showing separate holdings with separate cashflows, making it confusing to view the total position.

**Fix Applied:**
1. Group trades by `bond_id` before processing
2. Merge cashflows by date - combine amounts for same payment dates
3. Calculate combined investment amounts, units, and XIRR across all trades for the bond
4. Build separate investment entries for each trade date (for accurate XIRR calculation)
5. Return `merged_trades_count` and `individual_trades` info in the response

**Files Modified:** `/app/backend/server.py` - `get_client_holdings()` function

**Result:** Now shows ONE consolidated holding per bond with:
- Combined units from all trades
- Combined investment amount
- Merged cashflows (same dates combined)
- Proper XIRR calculation across all investment dates
- Info about individual trades that were merged

---

### Sub-Broker Reinvestment Tagging Alignment (Jan 27, 2026) ✅

**Issue:** Sub-broker reinvestment tagging page had different tag options and features compared to the broker page.

**Fix Applied:**
1. Updated `SubBrokerReinvestment.jsx` to use same tag options as broker: `principal`, `interest`, `both`, `none`, `custom`
2. Updated to use same API endpoint (`/reinvestment/upcoming`) which already filters by sub-broker's linked clients
3. Added Past/Upcoming sub-sections
4. Added mass tagging functionality
5. Added email sending capability for client approval
6. Added approval status badges

**Files Modified:** `/app/frontend/src/pages/SubBrokerReinvestment.jsx` (complete rewrite)

---

### Email Scheduler for Repayment Updates (Jan 27, 2026) ✅

**Request:** Add automatic email reading from `updates@kinntegraa.club` to update actual repayments.

**Implementation:**
- Added APScheduler with AsyncIO support
- Runs once daily at **12:00 PM IST** (6:30 AM UTC)
- New endpoints:
  - `GET /api/email-reader/scheduler-status` - Check scheduler status
  - `POST /api/email-reader/trigger-now?days_back=N` - Manual trigger
- Logs stored in `email_scheduler_logs` collection

---

### Actual XIRR Calculation Fix - Prepayment Maturity Duplication (Jan 27, 2026) ✅

**Issue:** For bonds with prepayments (like Natureresidences), the actual cashflow was incorrectly showing TWO maturity entries:
1. A calculated maturity entry with reduced principal (correct)
2. AND the original scheduled maturity entry (duplicate)

This resulted in an inflated maturity amount (e.g., ₹4,52,41,498.36 instead of ₹1,32,37,801.89 for 135 units).

**Root Cause:** The `build_actual_cashflows_with_investment()` function in server.py was:
1. Correctly calculating and adding a maturity entry with prepayment adjustments (section 3)
2. BUT then also adding scheduled cashflows including the maturity date (section 4)

**Fix Applied:**
1. Set `has_maturity_entry = True` after adding the calculated maturity entry
2. Skip the maturity date when adding scheduled cashflows if `has_maturity_entry` is True

**Files Modified:** `/app/backend/server.py` (lines 9728-9775)

**Verified Results:**
- 135 units: Maturity now correctly shows ₹13,237,801.89 (reduced principal + accumulated interest)
- Actual XIRR: 11.11% (correctly calculated from investment + prepayments + reduced maturity)

---

### User Activity Logs Feature (Jan 27, 2026) ✅

**Request:** Create a "Logs" tab to showcase which sub-broker and client visited the URL and what section.

**Implementation:**

1. **Backend Endpoints (server.py):**
   - `POST /api/activity-logs` - Log user activity when they visit specific sections
   - `GET /api/activity-logs` - Retrieve activity logs with filters (pagination, role, section, date)
   - New collection: `user_activity_logs` in MongoDB

2. **Frontend Updates (TradeLogs.jsx):**
   - Added "User Activity" tab alongside existing "Trade Logs" tab
   - Shows: User Name, Role (Sub-Broker/Client), Page Section, Details (Bond/Property/Client), Timestamp
   - Filters: Date range, Role, Page Section, Search
   - Download CSV functionality
   - Only visible to Broker and Sub-Broker roles

**Note:** Activity logging needs to be integrated into individual pages (Holdings, Opportunities, etc.) to start collecting data.

---

### Email Templates - Website URL Already Present ✅

**Status:** The previous agent had already added the website login URL (`https://kinntegraa.club/login`) to:
- `send_welcome_email_client()` - line 326
- `send_welcome_email_subbroker()` - line 414

Both templates prominently display the login URL with a clickable button.

---

## Recent Changes (Jan 25, 2026)

### Historical Repayments - Actual Cashflow & XIRR Calculation (Jan 25, 2026 - Session 7) ✅

**Request:** After historical repayments are uploaded, the actual cashflow chart should reflect prepayments and calculate maturity payout exactly like the provided Excel. The actual XIRR should also be calculated correctly.

**Excel Calculation Logic:**
1. Each prepayment reduces the balance principal
2. Interest = Balance Principal × Coupon Rate × Days / 365
3. Interest is calculated from **BOND START DATE** (not investment date)
4. Accumulated interest is paid at maturity with remaining principal
5. XIRR calculated from Investment (outflow) + All Prepayments + Maturity (remaining principal + accumulated interest)

**Implementation:**
- **Enhanced `build_actual_cashflows_with_investment()` function** in server.py
  - Now accepts `bond_start_date` for proper interest calculation
  - Tracks prepayments and calculates accumulated interest period-by-period
  - Automatically generates maturity entry with remaining principal + accumulated interest
  - Includes calculation details (original principal, total prepaid, remaining principal, coupon rate used)

- **Fixed XIRR Calculation** in `get_client_holdings()`
  - XIRR now calculated from complete `actual_cashflows` (including calculated maturity)
  - Previously was only using raw uploaded repayments (missing maturity with interest)
  - Added sanity check to ensure XIRR is within reasonable bounds (-100% to 1000%)

**Results:**
| Metric | Excel | System | Variance |
|--------|-------|--------|----------|
| Maturity Amount | ₹13,267,590 | ₹13,237,802 | 0.2% |
| Actual XIRR | 11.34% | 11.11% | 0.23% |

**Example (135 units, Face Value ₹100,000, Coupon 18.73%):**
- Original Principal: ₹13,500,000
- 4 Prepayments of ₹945,000 each
- Remaining Principal: ₹9,720,000
- Accumulated Interest: ₹3,517,801.89
- Maturity Payout: ₹13,237,801.89
- Actual XIRR: 11.11% (vs Expected 12%)

**Files Modified:** server.py (build_actual_cashflows_with_investment, get_client_holdings)

---

### Kinntegra MF Buy Scheduler API Integration (Jan 25, 2026 - Session 6)

**1. Linked Kinntegra API to Reinvestment Approval ✅**
- **Request:** Call Kinntegra MF Buy Scheduler API when client approves reinvestment tag
- **API Details:**
  - Endpoint: `https://api.kinntegra.co.in/api/transaction/addbuyschedule`
  - Method: POST
  - Authentication: `x-api-key` header
- **Implementation:**
  - Added `call_kinntegra_mf_buy_scheduler()` function in server.py
  - Called automatically when client approves reinvestment via `/reinvestment/approve/{cashflow_id}`
  - Logs all API requests in `kinntegra_api_logs` collection
  - Updates cashflow with `kinntegra_api_submitted`, `kinntegra_api_status`, `kinntegra_api_response`
- **Files Modified:** server.py (new function ~130 lines, updated approve endpoint)

**2. Updated Logo ✅**
- **Request:** Use new geometric K logo
- **Changes:**
  - Updated logo image URL to new ChatGPT-generated design
  - Logo shows stylized "K" with intersecting white lines on orange background
  - Applied `scale(1.4)` for proper fit in circle
- **Files Modified:** Login.jsx, CustomerSignup.jsx

---

### Upload Module Enhancement (Jan 25, 2026 - Session 5)

**Separated Historical Trades into Two Tabs ✅**
- **Request:** Separate sheets for uploading - first sheet for investment details only
- **Changes:**
  - Added new **"Investment Details"** tab (teal color) for uploading investment data only
  - Renamed "Historical Trades" to **"Historical Repayments"** for clarity
  - Created new backend endpoints:
    - `GET /api/bulk/template/investment-details` - Download template
    - `POST /api/bulk/investment-details` - Upload investment data
  - Historical Repayments tab now clearly states it's for repayment data only
  - Each tab has clear instructions directing users to the appropriate workflow
- **Files Modified:** BulkUpload.jsx, server.py (new endpoints ~200 lines)
- **Workflow:**
  1. Create bonds & clients first
  2. Upload investment data via "Investment Details" tab
  3. Upload repayment data via "Historical Repayments" tab

---

### UI Enhancements (Jan 25, 2026 - Session 4)

**1. Smaller Prelogin Cards with Kinntegraa Logo ✅**
- **Request:** Reduce size of login/signup boxes, use company logo
- **Changes:**
  - Card width reduced from `max-w-md` (448px) to `max-w-sm` (384px)
  - Padding reduced from `3rem 2.5rem` to `2rem 2rem`
  - Logo circle reduced from `w-20 h-20` to `w-16 h-16`
  - Added Kinntegraa logo image with fallback to "K" letter
- **Files Modified:** Login.jsx (lines 114-140), CustomerSignup.jsx (lines 85-112)

**2. Chart Colors Aligned to Etihad Palette ✅**
- **Request:** Use green and red colors that align with Etihad theme
- **Changes:**
  - Interest bars: Changed from `#2563EB` (blue) to `#059669` (green)
  - Principal bars: Changed from `#10B981` (teal) to `#DC2626` (red)
- **File Modified:** BondDetails.jsx (lines 1070-1071)

**3. Lead Management - Contact Info for General Interest ✅**
- **Request:** Show phone and email for "General Interest" leads from website signup
- **Changes:**
  - When lead has no PAN (general interest), shows email and phone under client name
  - Product column shows "General Interest" with "Website Signup" label
  - Added "Website Signup" option to type filter dropdown
- **File Modified:** LeadManagement.jsx (lines 698-740, 667)

**4. Dashboard Permission Control ✅**
- **Request:** Dashboard disabled in settings should not show
- **Changes:**
  - Added `dashboard` feature to permissions system
  - Sidebar checks `hasPermission('dashboard', 'view')` before showing Dashboard menu
  - Login redirects to `/opportunities` instead of `/dashboard`
- **Files Modified:** Sidebar.jsx, BrokerSettings.jsx, Login.jsx, App.js

---

### UI & Feature Fixes (Jan 25, 2026 - Session 3)

**1. Login Page Etihad Theme Fix ✅**
- **Issue:** Login page had purple background (#2B1B3D) instead of Etihad brand colors
- **Fix Applied:** Changed to maroon/gold gradient: `linear-gradient(135deg, #5B373C 0%, #3D252A 50%, #1F1F1F 100%)`
- **Files Modified:** Login.jsx (line 96), CustomerSignup.jsx

**2. Dashboard Disabled by Default ✅**
- **Issue:** Dashboard was showing on frontend despite being disabled in settings
- **Fix Applied:** 
  - Added `dashboard` feature to permissions system (BrokerSettings.jsx)
  - Sidebar.jsx checks `hasPermission('dashboard', 'view')` before showing Dashboard menu
  - Login redirects to `/opportunities` instead of `/dashboard`
  - ProtectedRoute redirects to `/opportunities` instead of `/dashboard`
- **Files Modified:** Sidebar.jsx, Login.jsx, App.js, BrokerSettings.jsx

**3. Simplified Sign Up Form (Lead Capture) ✅**
- **Issue:** Sign up form asked for too many fields (PAN, password, PIN, etc.)
- **User Request:** Only collect Full Name, Email, Phone Number and add to leads
- **Fix Applied:**
  - Simplified form to 3 fields only
  - Button changed from "SIGN UP" to "REGISTER INTEREST"
  - Success state shows "Thank You!" with green checkmark
  - New backend endpoint: `POST /api/leads/interest` (no auth required)
  - Leads created with `source: "signup_page"`
- **Files Modified:** CustomerSignup.jsx, server.py (line 18830-18890)

---

### Bug Fixes Completed (Jan 25, 2026 - Session 2)

**1. Bulk Upload Client Welcome Email Fix (P0) ✅**
- **Issue:** Clients created via bulk upload (`/api/bulk/clients`) were not receiving welcome emails with their login credentials
- **Root Cause:** The `bulk_upload_clients` function was not calling `send_welcome_email_client` after creating the client
- **Fix Applied:** Added email sending logic after client insertion (line 4316-4328 in server.py)
- **Verification:** Testing agent confirmed `send_welcome_email_client()` is called with correct parameters (client_name, client_email, pan, password, pin, broker_name)

**2. Holdings Page Negative Number Tooltip Fix (P0) ✅**
- **Issue:** The tooltip for negative difference values showed "Expected: X - Actual: Y = Z" format
- **User Request:** Change tooltip to show "Previous expected - Actual expected now"
- **Fix Applied:** Updated `diffTooltip` variable at line 1997 in Holdings.jsx
- **New Format:** `Previous expected: ₹{expectedGross} - Actual expected now: ₹{actualGross}`
- **Verification:** Testing agent confirmed tooltip displays correctly in UI

---

### Repayment Status Bar Fix (Jan 25, 2026)
**Bug:** The "Repayment Status" bar was showing 100% received even for future-dated repayments.

**Root Cause:** Logic was incorrectly summing all cashflows as received.

**Fix Applied** (`server.py` - get_client_holdings):
- **RECEIVED** = Sum from `actual_repayments` table where `repayment_date` ≤ today
- **OUTSTANDING** = Sum from `holding_cashflows` table where scheduled `date` > today
- **TOTAL** = RECEIVED + OUTSTANDING

Updated functions:
- `get_client_holdings()`: Fixed repaid_gross and upcoming_gross calculation
- `build_actual_cashflows_with_investment()`: Simplified to only include:
  1. Investment entry (outflow)
  2. Actual repayments where date ≤ today
  3. Scheduled cashflows where date > today

**Impact:**
- Bar now correctly shows actual payments received vs future scheduled payments
- Data comes from correct tables (`actual_repayments` for received, `holding_cashflows` for outstanding)

---

### Email Sync moved to Bulk Upload Module (Jan 25, 2026)
**Change:** The "Sync Email Repayments" feature is now available in:
1. **Holdings page** - Quick "Sync Emails" button for convenience
2. **Bulk Upload page** (`/broker/bulk-upload?tab=historical-trades`) - Full module with 7/30/90 day options

This allows syncing repayments from `updates@kinntegraa.club` for ALL customers at once.

---

### Holdings Page - Email, Sync & Upload Features (Jan 25, 2026)
**New Features Implemented**:

1. **Holdings Report Email Button** (`Holdings.jsx`, `server.py`, `email_service.py`):
   - EMAIL button now sends holdings report to client email
   - Sub-broker automatically CC'd on the email
   - API: `POST /api/holdings/client/{client_id}/send-report-email`
   - Shows loading state "SENDING..." during operation

2. **Sync Email Repayments** (`Holdings.jsx`):
   - New "Broker Tools" section visible only to brokers
   - "Sync Email Repayments" button triggers email inbox processing
   - Reads from `updates@kinntegraa.club` (configured in backend)
   - API: `POST /api/email-reader/process?days_back=30`
   - Automatically refreshes holdings after sync

3. **Upload Historical Data** (`Holdings.jsx`):
   - Upload button accepts Excel files (.xlsx, .xls)
   - Merges/updates existing actual repayment data
   - API: `POST /api/bulk/historical-trades`
   - Shows upload progress state

**Technical Notes**:
- Email service uses real SMTP (not mocked)
- Broker Tools toolbar only visible to `role='broker'`
- Historical upload template: `GET /api/bulk/template/historical-trades`

---

### Bug Fixes - PDF and Excel Download (Jan 25, 2026)
**Issues Fixed**:
1. **PDF Download Blank**: The "Expected Cashflow" PDF download was generating blank files
2. **Excel Download Error**: The main "DOWNLOAD" button was failing with `KeyError: 'type'`

**Root Causes & Fixes**:
1. **PDF Fix** (`Holdings.jsx`):
   - `html2pdf.js` uses `html2canvas` which cannot capture off-screen elements
   - Changed container positioning from `position: absolute; left: -9999px` to `position: fixed; opacity: 0; z-index: -1000`
   - Added proper dimensions for A4 landscape (297mm width)
   - Added 100ms delay to ensure DOM is ready

2. **Excel Fix** (`server.py` line 11418):
   - Changed `cf['type'].capitalize()` to `cf.get('type', 'scheduled').capitalize()`
   - The `holding_cashflows` collection doesn't have a `type` field, while `expected_cashflows` does

### Holdings Page UI Enhancements (Jan 25, 2026)
**Changes Made**:
1. **Excel Download Restructured** - Now has 3 sheets:
   - `Summary` - Client info & investment totals
   - `Expected Cashflows` - Investment (outflow) & Maturity (inflow) rows with Principal, Interest, Gross
   - `Actual Cashflows` - Repaid entries with Principal, Interest, TDS, Net, Repaid Date

2. **Removed Bottom Summary Bar** in cashflow modal (Investment, Total Principal, Total Interest, Total TDS, Upcoming, Net Profit)

3. **Removed O/S TDS** from:
   - Header statistics bar
   - Holdings table column (only shows O/S Principal, O/S Interest)

4. **Actual XIRR Calculation Implemented**:
   - Previously: Actual XIRR = Expected XIRR (no calculation)
   - Now: Actual XIRR = XIRR(Investment Outflow + All Actual Repayments)
   - Based on historical transactions uploaded via repayment schedule
   - Example: Expected 12.00% vs Actual 11.38% (due to prepayments)

5. **Combined PDF Download**:
   - Single PDF now contains BOTH Expected and Actual Cashflows side-by-side
   - Shows summary header with Investment, Expected Returns, Expected Profit, Expected XIRR, Actual XIRR
   - Works for both Summary tab and Individual Transaction tabs

6. **Individual Transaction Tabs Enhanced**:
   - Now show both Expected and Actual Cashflows with same structure
   - Investment entries shown in red (outflow)
   - Maturity entries shown in blue
   - Profits calculated and displayed in footer for both tables

---

### Expected Repayments - Investment Value Calculation (Secondary Calculator)
**Requirement**: The investment value in Expected Repayments should be calculated using the Secondary Market Calculator, not just taken from the file upload.

**Implementation**:
1. **Backend** (`server.py`): Updated `/api/holdings/client/{client_id}` to:
   - Calculate investment value using Secondary Market Calculator (PV of remaining cashflows)
   - Include investment as the first entry in `expected_cashflows` array with `type: 'investment'`
   - Add `calculated_investment` field to each holding
   - Formula: PV = Σ(CF / (1 + IRR)^years) × units

2. **Frontend** (`Holdings.jsx`): Updated modal to:
   - Display investment entries in red with "INV" badge (outflow)
   - Display maturity entries in green with "MAT" badge (inflow)
   - Footer shows "Investment (Calc)" separately from principal/interest

**Verification Data** (Bond CDNRE001, Client Fali):
| Trade Date | Units | Investment (Calc) | Maturity Gross | Profit | XIRR |
|------------|-------|-------------------|----------------|--------|------|
| 30 Apr 2025 | 34 | ₹39,16,923 | ₹43,57,090 | ₹4,40,167 | 12% |
| 02 May 2025 | 31 | ₹35,73,531 | ₹39,72,641 | ₹3,99,110 | 12% |
| 07 May 2025 | 135 | ₹1,55,86,328 | ₹1,73,00,210 | ₹17,13,881 | 12% |

### Expected Repayments Fix (Holdings Modal)
**Issue**: Expected Repayments section showed "No expected cashflows from bond definition" in the Holdings modal

**Root Cause**: 
1. Frontend `getConsolidatedHoldings` function wasn't passing `expected_cashflows` and `actual_cashflows` arrays to the modal
2. Dead code referencing undefined `maturity_cashflows` variable in server.py (line 9322)

**Fix Applied**:
1. Updated `Holdings.jsx` line 596-607 to include `expected_cashflows` and `actual_cashflows` in the trades array
2. Removed dead code in `server.py` at line 9322

**Verification**:
- Expected Repayments now shows data from bond template (08 Apr 2026: Principal + Interest)
- Actual Repayments shows 5 prepayments from Oct 2025 to Apr 2026
- Both Summary tab and individual trade tabs display expected_cashflows correctly
- Expected XIRR and Actual XIRR both show 12.00%

### Backend XIRR/Cashflow Logic Removed
**Reason**: Complex XIRR calculations were producing incorrect results (18.74% instead of expected 11.38%)

**What was removed**:
- XIRR calculation functions: `calculate_actual_xirr`, `calculate_holding_xirr`
- Admin cashflow endpoints (6 endpoints, ~990 lines):
  - `/api/admin/sync-prepayments/{client_id}`
  - `/api/admin/reprocess-prepayments/{trade_id}`
  - `/api/admin/detect-prepayments/{client_id}`
  - `/api/admin/rebuild-cashflows-from-history/{trade_id}`
  - `/api/admin/recalculate-cashflows-book2/{trade_id}`
  - `/api/admin/generate-prepayment-schedule/{trade_id}`
- Frontend admin buttons in Holdings page

**What was kept**:
- Bond calculator logic (secondary market price calculations)
- Holdings API now uses bond's `secondary_irr` for both Expected and Actual XIRR

---

## Recent Changes (Jan 24, 2026)

### Book2.xlsx XIRR Calculation Fix
**Issue**: Actual XIRR for Natureresidences trades was incorrect due to wrong principal/interest calculations

**Root Cause**: The recalculation endpoint was not correctly implementing Book2.xlsx logic

**Fix Applied**:
1. Updated `/api/admin/recalculate-cashflows-book2/{trade_id}` to:
   - Use correct day counting: +1 for prepayments, no +1 for maturity
   - Calculate principal: 7% of original for prepayments, remaining balance for maturity
   - Calculate interest: Balance × 18.78% × Days / 365
2. Verified XIRR calculation matches Book2.xlsx exactly (11.3784%)

**Book2.xlsx Key Parameters**:
- Coupon Rate: 18.78%
- Face Value: ₹100,000/unit
- Prepayment: 7% monthly (₹945,000 for 135 units)
- XIRR Model: Prepayments get principal only, maturity gets principal + ALL accumulated interest

### Sub-broker Reinvestments in Lead Management
**Feature**: Added "My Reinvestments" tab in LeadManagement.jsx for sub-brokers
- Shows all their reinvestment submissions
- Displays status (Pending, Approved, Rejected)
- Shows broker notes and rejection reasons

---

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

## Recent Changes (Jan 22, 2026)

### Bond Card Quick Calculator Enhancement (NEW)
**Feature Request**: Add amount input to Quick Calculator with range bounds

**Changes Implemented**:
1. **Deal ID + Expected IRR Combined**: Now displayed on one line in the bond card
2. **Amount Input in Quick Calculator**: 
   - Added "Amount (₹)" input field alongside Units
   - When amount entered, shows range bounds (Lower/Upper) with unit counts and amounts
   - Automatic Indian number formatting (e.g., 10,00,000)
3. **Range Bounds Display**:
   - Lower Bound: floor(amount/price) units with exact cost
   - Upper Bound: ceil(amount/price) units with exact cost

**Files Modified**:
- `/app/frontend/src/pages/Opportunities.jsx` - Bond card layout and Quick Calculator

### Block Units Form Editable (Jan 22, 2026)
**Feature Request**: Block Units for Client form should be editable, not pre-filled

**Changes Implemented**:
1. Form fields (Date of Investment, No. of Units Bought, Amount Transferred) are now empty/editable
2. Reference info from Calculator shown separately as a guide
3. Form submission uses user-entered values, not calculator values

**Files Modified**:
- `/app/frontend/src/pages/BondDetails.jsx` - bookUnits function and form fields

### Cashflow Report Landscape Mode (Jan 22, 2026)
**Feature Request**: Generate cashflow report in landscape mode for better spacing

**Changes Implemented**:
1. PDF export orientation changed to 'landscape'
2. Modal layout optimized for landscape (summary cards horizontal, table full-width)
3. Better spacing and readability for the cashflow schedule

**Files Modified**:
- `/app/frontend/src/pages/BondDetails.jsx` - exportCashflowToPDF and modal layout

### Share with Clients Modal Improvements (NEW)
**Feature Request**: Add search functionality and email integration to the Share with Clients modal

**Changes Implemented**:
1. **Search Functionality**:
   - Added search input with placeholder "Search by name, email, phone or PAN..."
   - Real-time filtering of client list as user types
   - Shows "Showing X of Y" count when search is active
   - Select All works with filtered results only

2. **Email Integration**:
   - Added "Send via Email" toggle (ON by default)
   - Added "Include Property Photos" checkbox (visible when email is enabled)
   - Submit button text changes: "Share & Email X Client(s)" vs "Share with X Client(s)"
   - Shows warning for clients without email addresses
   - Emails include property photos (up to 4) when enabled

3. **UI Enhancements**:
   - Mail icon shown next to clients with email addresses
   - Email options in a distinct gray background section
   - Proper data-testid attributes for all interactive elements

**Files Modified**:
- `/app/frontend/src/pages/RealEstateDetails.jsx` - ShareWithClientsModal component
- `/app/backend/server.py` - Added `include_photos` parameter to EmailShareRequest
- `/app/backend/email_service.py` - Updated `send_real_estate_opportunity_email` to include photos

### Fine-grained Permission Fix (RealEstateDetails page)
**Feature Request**: Restrict actions based on user role and client linkage

**Changes Implemented**:
1. **XIRR Summary Report Section**:
   - "Edit %" and "Remove" investor buttons visible ONLY to broker role
   - Sub-brokers and clients cannot see these buttons

2. **Payment Schedule & DLD+Admin Row**:
   - Upload buttons (Invoice/Swift/Receipt) restricted by `canManageInvestorPayment()` function
   - Broker: Can manage all investors
   - Sub-broker: Can only manage their linked clients
   - Client: Can only manage their own payments

3. **Client Co-Owner Detection Fix**:
   - Fixed `isCoOwner` check to properly match client users with investors
   - Now checks: `inv.client_id === user.id || inv.user_id === user.id || (user.client_id && inv.client_id === user.client_id)`

### Profile Data Parity Fix
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
- Frontend for `GET /api/clients/{client_id}/projected-vs-actuals` API
- Verify "Sell Unit" Feature end-to-end
- Test trade approval flow (unit reduction on opportunity)
- Verify multi-UCC email content format
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
- **Sub-Broker**: PAN: `AKQPR6699J`, Password: `kinntegra123`, PIN: `1234`
- **Client**: PAN: `AJMPD3987G`, Password: `kinntegra123`, PIN: `1234`

## Recent Changes (Jan 23, 2026)

### Logs Page - Unified View & Portfolio Column (COMPLETED)
**User Request**: Remove "Reinvestment Approvals" tab from Logs, show all entries in Trade Logs. Show Portfolio instead of Payment Mode.

**Changes Implemented**:
1. **Removed Tabs**: Logs page now shows a single unified view (no "Trade Logs" / "Reinvestment Approvals" tabs)
2. **Merged Data Sources**: All data (trades, reinvestment logs, tagging logs) combined into one table
3. **Column Change**: "Payment Mode" column replaced with "Portfolio" column
4. **Trade Type Display**: Shows "Reinv-Principal", "Reinv-Interest", "Reinv-Both", "Reinv-None", "Reinv-Custom" for reinvestment entries
5. **Date Display**: Uses `expected_date` (historical/future date) instead of `created_at` for reinvestment entries

**Files Modified**:
- `/app/frontend/src/pages/TradeLogs.jsx` - Removed tabs, changed `payment_mode` to `portfolio`, updated type format

### Tag Options Corrected (COMPLETED)
**User Request**: Tag options should be Principal, Interest, Both, None, Custom (not Full Amount, Partial, No Reinvest)

**Changes Implemented**:
1. Updated `TAG_OPTIONS` array in `ReinvestmentTagging.jsx`
2. Updated tag display in Tagged section to show correct labels
3. Updated Logs page to show "Reinv-{tag}" format in Type column

**Files Modified**:
- `/app/frontend/src/pages/ReinvestmentTagging.jsx` - Updated TAG_OPTIONS and tag display

### Reinvestment Tagging Page - Backend Fix (COMPLETED)
**Issue**: Historical entries were not appearing for broker users due to critical indentation bug.

**Root Cause**: Lines 9714-9758 in `/api/reinvestment/upcoming` endpoint were incorrectly indented inside the `else` block (sub-broker only), meaning brokers saw empty data.

**Fix Applied**:
1. Fixed indentation to ensure brokers AND sub-brokers can see data
2. Updated backend to return ALL months (including past dates) not just next 6 months
3. Fixed frontend to properly map `cashflow_id` to `id` and `client_ucc_list` to `ucc_list`

**Files Modified**:
- `/app/backend/server.py` - Fixed indentation in `/api/reinvestment/upcoming` (line ~9705-9760)
- `/app/frontend/src/pages/ReinvestmentTagging.jsx` - Fixed data normalization

### Historical Trade Upload & Tagging Workflow (CLARIFIED)
**User Clarification** (from handwritten notes):
1. When bond is added in Opportunity → Cashflows are derived
2. Historical data upload has two sheets: Investment Dates + Repayment Schedule
3. System creates cashflows from Investment Dates (both historical and future)
4. Under "Reinv Tag", ALL untagged cashflows appear in "Untagged" section
5. After tagging with UCC, Portfolio, Tag:
   - **Historical entries** → Auto-approved → Appear in Trade Logs as "Approved"
   - **Upcoming entries** → Stay in "Tagged" section → Send to client for approval
6. After client approves → Status changes to "Complete" in Trade Logs

**Current Implementation Status**:
- ✅ Historical entries auto-approve when tagged (backend logic exists)
- ✅ Upcoming entries require client approval (email flow implemented)
- ✅ Reinv Tag page shows Historical/Upcoming sub-sections
- ✅ Logs page shows Portfolio column

## Recent Changes (Jan 24, 2026)

### Repayment Count on Funded Bond Cards - Fixed (COMPLETED)
**User Request**: Once a bond moves to the "Funded" section in Opportunities, replace "Price/Unit" with "Repayment Count". Count should be unique repayment dates, not total entries for different purchase dates.

**Changes Implemented**:
1. **Backend**: Modified `/api/bonds` endpoint in `server.py` to:
   - Use `distinct("date")` instead of `count_documents()` to get unique payment dates
   - `total_cashflows_count`: Number of unique payment dates for the bond
   - `repaid_cashflows_count`: Number of unique payment dates that have been repaid
2. **Frontend**: Updated `BondCard` component in `Opportunities.jsx` to conditionally render:
   - **Funded/Closed bonds**: Shows emerald-green "Repayment Progress" section with "X / Y Repaid" and a visual progress bar
   - **Available bonds**: Shows original amber "Price/Unit" display with today's calculated price

**Files Modified**:
- `/app/backend/server.py` - Changed from `count_documents()` to `distinct("date")` for unique counts
- `/app/frontend/src/pages/Opportunities.jsx` - BondCard conditional rendering

**Verified**: Screenshot confirms "8 / 17 Repaid" displayed correctly (8 unique repaid dates out of 17 total unique payment dates).

### Removed "Bulk Repayment Update" Section from Holdings (COMPLETED)
**User Request**: Remove the highlighted "Bulk Repayment Update" section from the Holdings page.

**Changes Implemented**:
- Removed the entire blue-highlighted section containing Template, Export Cashflows, and Upload Repayments buttons

**Files Modified**:
- `/app/frontend/src/pages/Holdings.jsx` - Removed lines 1211-1257

**Verified**: Screenshot confirms the section is removed.

### Outstanding Principal & Interest Breakdown in Holdings (COMPLETED)
**User Request**: Consider outstanding principal and interest payments for XIRR calculation, and show a tab showcasing both.

**Changes Implemented**:
1. Added new "Principal & Interest Breakdown" section in the Holdings cashflow modal showing:
   - **Outstanding Principal**: Total principal minus repaid principal
   - **Outstanding Interest**: Total interest minus repaid interest
   - **Pending TDS**: Total TDS minus deducted TDS
   - **Total Outstanding**: Upcoming expected amount
   - Each card also shows the repaid/received amount below

**Files Modified**:
- `/app/frontend/src/pages/Holdings.jsx` - Added breakdown section to modal Summary tab

**Verified**: Screenshot confirms breakdown displays correctly with outstanding and repaid amounts.

### XIRR Calculation Fix (COMPLETED)
**User Request**: XIRR should include outstanding principal and interest in the calculation, not just repaid amounts.

**Root Cause**: The previous XIRR function required `repaid_date` to be set for repaid cashflows. When `is_repaid=True` but `repaid_date=None`, those cashflows were being skipped, resulting in incorrect XIRR (-43.85% instead of ~9.57%).

**Fix Applied**:
1. Modified `calculate_holding_xirr()` function in `server.py`
2. For repaid cashflows: uses `repaid_date` if available, otherwise falls back to scheduled `date`
3. For pending cashflows: uses scheduled `date` with expected `net_amount`
4. All cashflows are now included in the XIRR calculation

**Files Modified**:
- `/app/backend/server.py` - Lines 8337-8400

**Result**: XIRR now correctly shows **9.57%** (positive return) instead of -43.85%

## Known Issues & Next Steps

### P0 - Critical
- ✅ **COMPLETED**: Repayment Count on Funded Bond Cards

### P1 - High Priority
1. **Apply RBAC permissions globally**: Currently partially implemented in SubBrokerClients and Opportunities
2. **Sub-broker/Client permission fix on RealEstateDetails page**: Implemented but untested
3. **Verify "Sell Unit" Feature**: End-to-end test needed
4. **Verify Real Estate Broker Visibility Fix**: Fix implemented, awaiting user deployment verification

### P2 - Medium Priority
1. **Sub-broker password reset email flow**: Not verified
2. **Build Projected vs Actuals frontend UI**: Backend endpoint exists
3. **Pincode Lookup frontend implementation**

### Future/Backlog
1. **CRITICAL REFACTORING**: 
   - `server.py` (18,000+ lines) needs to be split into routers
   - `ReinvestmentTagging.jsx`, `Opportunities.jsx` need to be broken down
2. **Delete obsolete components**: `SubBrokerOpportunities.jsx`, `ClientOpportunities.jsx`, `PendingApprovals.jsx`, `ApprovalCenter.jsx`, `ApprovalLogs.jsx`
3. **Build Analysis Dashboard**
4. **Kinntegra API Integration**: Blocked on credentials

## Recent Changes (Jan 24, 2026)

### Lead Management Consolidation
- Merged "Approvals & Logs" functionality into unified "Lead Management" page
- Two main tabs: "Reinvestment Approval" and "Client Interest"
- Reinvestment Approval has sub-tabs: "Clients" and "Reinvestments"
- Activity Logs kept as separate page (accessible via "Logs" sidebar link)
- Old routes (`/broker/approvals`, `/broker/pending-approvals`) redirect to `/broker/leads`

### XIRR Calculation Fix
- Both Expected XIRR and Actual XIRR now use GROSS amounts (principal + interest before TDS)
- Expected XIRR = based on scheduled gross cashflows
- Actual XIRR = based on actual repaid gross amounts (principal + net_interest + tds)
- Difference comes from timing variations, not TDS

### Trades Table Layout Fix
- Converted from broken flex/grid layout to standard HTML `<table>`
- Proper column alignment: CLIENT NAME, UCC, DATE, TYPE, AMOUNT, PORTFOLIO, ADVISOR, STATUS

### "In Demand" Badge Logic Fix
- Correctly calculates: `interested_amount > (face_value × available_units)`
- `available_units = max(0, total_units - units_sold)`

## Recent Changes (Jan 24, 2026)

### Bond Cashflow Prepayment Logic Rework (MAJOR)
Complete rework of bond cashflow logic to properly handle prepayments based on CDNRE001 Excel reference:

#### Correct Prepayment Calculation Logic
When prepayments occur:
1. **Balance Principal reduces immediately** after each prepayment
2. **Interest is calculated period-by-period** on the current balance:
   - `Interest = Balance × Coupon Rate × Days / 365`
3. **All interest accumulates** and is paid at maturity along with remaining principal
4. **XIRR calculated from Bond Start Date** (not investment date) to reflect premium impact

#### Verified Values (135-unit Trade)
| Metric | Excel | System |
|--------|-------|--------|
| Final Principal | ₹78,30,000 | ₹78,30,000 ✓ |
| Total Interest | ₹34,82,460.30 | ₹34,82,460.30 ✓ |
| Total Payout | ₹1,13,12,460.30 | ₹1,13,12,460.30 ✓ |
| XIRR | 6.33% | 6.33% ✓ |

#### Cashflow Structure
| Date | Type | Principal | Interest |
|------|------|-----------|----------|
| 2025-10-01 | Prepayment | ₹9,45,000 | 0 |
| 2025-11-05 | Prepayment | ₹9,45,000 | 0 |
| 2025-12-03 | Prepayment | ₹9,45,000 | 0 |
| 2026-01-07 | Prepayment | ₹9,45,000 | 0 |
| 2026-02-07 | Prepayment | ₹9,45,000 | 0 |
| 2026-03-07 | Prepayment | ₹9,45,000 | 0 |
| 2026-04-08 | Maturity | ₹78,30,000 | ₹34,82,460 |

#### XIRR Calculation Changes (Updated: Jan 24, 2026)
- **Actual XIRR now uses Investment Date** as reference (not Bond Start Date)
- This correctly reflects the client's actual return from when they invested
- For bonds WITHOUT prepayments (like CDUC001): Actual XIRR ≈ Expected XIRR (both ~11%)
- For bonds WITH prepayments (like Natureresidences): Actual XIRR < Expected XIRR (prepayments reduce future interest)

**Bug Fixed (Jan 24, 2026)**: CDUC001 Actual XIRR was showing 9.23% instead of 11%
- Root cause: Using `bond_start_date` created artificial time gap before cashflows started
- Fix: Changed to use `investment_date` as XIRR reference point
- Result: CDUC001 now shows Actual XIRR = 11.0% ✓ (matches Expected)

