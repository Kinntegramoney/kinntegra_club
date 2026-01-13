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
   - Changed `isFullyFunded` to check status/percentage instead of hardcoded 4 investors
   - `canViewPaymentManagement` now requires property to be fully funded (status='fully_invested' or invested_percentage >= 100%)
   - `canManageOqood` now checks all investors (dynamic count) have verified payments for FIRST milestone
   - Tested with: Euphoric Residences (2 investors, 100% funded) and Dubai Creek Tower (4 investors)

2. **Removed 4 Co-Owner Dependency (P0)** ✅
   - Property is "fully funded" based on invested_percentage (100%) or status, not fixed investor count
   - Payment Management section now shows "Fully Funded (X Investors)" dynamically
   - Works with 2, 3, or 4 investors as long as 100% is allocated

3. **Proportionate Payment Amounts per Investor (P0)** ✅
   - Each milestone now shows proportionate amounts based on investor's share percentage
   - Example: For 75%/25% split on AED 463,591 milestone → AED 347,693 / AED 115,898
   - Display shows: Investor name, share %, AED amount, payment status

4. **Property Images in Details Page (P1)** ✅
   - Added Property Images section at top of details page
   - Shows image gallery in 3-column grid
   - Clickable images open in new tab

5. **Share with Clients Hidden After Funding (P1)** ✅
   - "Share with Clients" section now hidden once property is fully funded
   - Only visible while property status is 'available'

6. **Brokers Can Record Payments (P1)** ✅
   - Removed restriction that prevented brokers from recording payments
   - All authorized users (broker, sub-broker, client) can now record payments

7. **All-Investors Payment Recording Modal (P0)** ✅
   - Redesigned Record Payment modal to show ALL investors at once
   - Summary bar shows: Total Due, Recorded, Remaining, Status
   - Each investor shows their proportionate expected amount
   - Form fields per investor: Date, Home Currency, Amount in HC, AED Amount, SWIFT upload
   - Effective rate auto-calculated
   - "Record All Payments" button submits all entries
   - Status shows "FUNDED" when total recorded matches total due

8. **Removed Manage Payments Button from Header (P1)** ✅
   - Payment Management section is already on the page, button was redundant

9. **Presentation Upload in Add Property (P1)** ✅
   - New "Presentations" section in Add Property modal
   - Upload PDF, PPT, PPTX, DOC, DOCX files (max 10)
   - Files stored on server with download endpoint

10. **Presentations Download on Details Page (P1)** ✅
    - New "Property Documents & Presentations" section
    - Shows all uploaded presentations with download links
    - Available to clients and sub-brokers

11. **Database Cleared (P0)** ✅
    - All data (users, bonds, real estate, notifications) cleared
    - Ready for fresh opportunity and user creation

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
- ✅ Payment milestone sorting bug (FIXED - Dec 2025)
- ✅ Move XIRR/Profit to View Details (DONE - Dec 2025)
- ✅ Visibility bug for Payment/Oqood sections (FIXED - Jan 2025)

### P1 (Important)
- End-to-End Test of Payment Verification Flow - Full lifecycle test (record payment -> broker verifies -> status updates -> UI progress reflects change)
- Dashboard Charts & Analytics for brokers
- General Export to Excel feature

### P2 (Nice to have)
- Email integration for notifications
- End-to-end testing of Client Reinvestment Approval feature

## Refactoring Needed
- `/app/frontend/src/pages/RealEstateDetails.jsx` is over 2,500 lines - needs to be broken into smaller components (e.g., XIRRCalculator, PaymentManagement, InvestorList)

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
