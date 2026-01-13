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

### Dec 2025 - Current Session
1. **Fixed Payment Milestone Sorting Bug (P0)** ✅
   - Rewrote sorting logic in `CreateRealEstateModal.jsx` to use inline sorting during render
   - Milestones now correctly sort by date when added/edited
   - Removed buggy `getSortedPaymentSchedule` and `getOriginalIndex` functions
   - Each milestone tracks its `originalIdx` for correct state updates

2. **Moved Expected Profit & XIRR to View Details** ✅
   - Removed XIRR calculation display from "Add Property" modal
   - Added XIRR and Expected Profit display to `RealEstateDetails.jsx` in "Expected Returns" section
   - Calculation considers: payment schedule dates, upfront fees (DLD + Admin), selling fee, expected sale rate

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
