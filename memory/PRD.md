# Kinntegraa B2B Platform - PRD

## Original Problem Statement
Build a B2B platform for brokers and sub-brokers to manage secondary market Non-Convertible Debenture (NCD) transactions and Off-Plan Real Estate investments.

## Core Requirements
- User authentication with 2-step login (PAN + Password, then PIN)
- Bond management (NCD bonds)
- Real Estate management (Off-Plan properties only - Fractional removed)
- Client management
- Payment schedule tracking

## What's Been Implemented

### Jan 2025 - Current Session
1. **Fixed Visibility Bug for Payment/Oqood Sections (P0)** ✅
   - Fixed critical bug where "Manage Payment" button and "Oqood" section appeared prematurely
   - Added `isFullyFunded` check - verifies `current_investors >= 4`
   - `canViewPaymentManagement` now requires property to be fully funded
   - Added NEW `canManageOqood` variable - Oqood section only shows when ALL 4 investors have verified payments for FIRST milestone
   - Tested with: Euphoric Residences (0/4 investors) and Dubai Creek Tower (4/4 investors)

### Dec 2025 - Previous Session
1. **Fixed Payment Milestone Sorting Bug (P0)** ✅
   - Rewrote sorting logic in `CreateRealEstateModal.jsx` to use inline sorting during render
   - Milestones now correctly sort by date when added/edited
   - Removed buggy `getSortedPaymentSchedule` and `getOriginalIndex` functions

2. **Moved Expected Profit & XIRR to View Details** ✅
   - Removed XIRR calculation display from "Add Property" modal
   - Added XIRR and Expected Profit display to `RealEstateDetails.jsx` in "Expected Returns" section

3. **Redesigned Property Card** ✅
   - Property Name with building icon
   - Unit Details (floor and unit number)
   - Size (apartment type and area in sqft)
   - Total Cost with asterisk (*) - hover shows full cost breakdown tooltip
   - Interested count and Investors (X/4)
   - Payment Progress bar
   - View Details button
   - Removed DLD% from card display

4. **Comprehensive View Details Page** ✅
   - Property Information: Building, Unit Details, Size, Location, Balcony, Parking, Max Co-owners, Status
   - Financial Summary: Unit Price, Total Cost, Fee Breakdown (DLD, Admin, Brokerage, Other, Selling Fee)
   - Payment Schedule table with dates, descriptions, percentages, amounts, status
   - **XIRR Calculator**: Slider for sale stage (10-100%), date picker, per-sqft price input, real-time XIRR calculation
   - Interest & Participation section with two buttons:
     - "Interested to Know More" - records interest
     - "Confirm to Participate" - allows selecting ownership percentage (5-100%)
   - Current Investors section with allocation progress

5. **Backend Endpoints for Interest/Participation** ✅
   - POST /api/real-estate-opportunities/{id}/interest - Express interest
   - POST /api/real-estate-opportunities/{id}/participate - Confirm participation with percentage

6. **XIRR Calculation Fix** ✅
   - Corrected calculation: DLD + Admin fees included as upfront investment cost
   - Outstanding amount (unpaid unit price portion) now deducted from sale proceeds
   - Formula: Net Proceeds = Gross Sale - Selling Fee - Outstanding Amount to Developer
   - Slider minimum now set to "Eligible %" (e.g., 40%) - cannot select below eligible percentage
   - Clean Excel export with proper AED formatting and column structure
   - Removed Selling Fee from Financial Summary section (it's only shown in XIRR calculation)
   - Removed "Manage" button from Payment Schedule section

7. **Per-Investor Payment Management** ✅
   - UI/modals for recording individual investor payments
   - SWIFT copy and Oqood document upload
   - Backend endpoints for payment recording

8. **Payment Verification Flow** ✅
   - Backend endpoints for broker to verify payments
   - UI elements for verification workflow

### Previous Session
- Removed "Fractional" real estate type (simplified to Off-Plan only)
- Implemented complex fee structure: DLD (% of unit price) + Admin (absolute) paid upfront
- Payment schedule based on Unit Price only
- Multi-tab creation modal with fixed header/footer

## Prioritized Backlog

### P0 (Critical)
- ✅ Payment milestone sorting bug (FIXED)
- ✅ Move XIRR/Profit to View Details (DONE)

### P1 (Important)
- Per-Investor Payment Tracking Table (next major feature)
  - Track payments per investor for each milestone
  - Fields: Home Currency Amount, Currency Factor, Repatriation Value, SWIFT copy upload
- Dashboard Charts & Analytics

### P2 (Nice to have)
- Export to Excel functionality
- Email integration for notifications
- End-to-end testing of Client Reinvestment Approval feature

## Tech Stack
- Backend: FastAPI + MongoDB (motor)
- Frontend: React + Tailwind CSS + Shadcn UI
- Auth: JWT-based 2-step authentication

## Key Files
- `/app/frontend/src/components/CreateRealEstateModal.jsx` - Property creation modal
- `/app/frontend/src/pages/RealEstateDetails.jsx` - Property details with XIRR display
- `/app/backend/server.py` - API endpoints

## Test Credentials
- Broker: PAN: `ABCDE1234F`, Password: `broker123`, PIN: `1234`
- Sub-broker: PAN: `FGHIJ5678K`, Password: `subbroker123`, PIN: `5678`
