# Kinntegraa Bond & Real Estate Management Platform

## Original Problem Statement
Build a comprehensive bond and real estate investment management platform for brokers and clients. The system handles bond pricing calculations, client portfolio management, trade verification, and real estate investment tracking.

## Core Requirements
1. **Bond Management**: Create, edit, and manage bonds with accurate pricing calculations based on cashflow schedules
2. **Client Management**: Track client information, PAN validation, document expiry
3. **Real Estate Investment**: Track real estate investment opportunities
4. **Trade Verification**: Process and verify client trades
5. **Multi-role Access**: Support broker, sub-broker, and client roles with appropriate permissions

## User Personas
- **Broker**: Full admin access - manages bonds, clients, real estate, trades
- **Sub-Broker**: Limited access to opportunities and assigned clients
- **Client**: View opportunities, holdings, and make investments

## Key Technical Decisions
- **Bond Pricing Engine**: Complete rewrite based on user's Excel specification (`2026_01_20_Final Bond Calculation.xlsx`)
- **Cashflow Source**: `cashflows_per_unit` array from Excel upload is the single source of truth for bond payments
- **Two-Step Bond Creation**: Step 1 for basic details, Step 2 for Excel cashflow upload

## What's Been Implemented

### Jan 20, 2026 - Bond Module Updates
- ✅ Removed "Record Date Cutoff (days)" field from bond creation form
- ✅ Removed `principal_payments` from bond submission (relies on `cashflows_per_unit`)
- ✅ New bond pricing engine (`calculate_bond_price_from_request`)
- ✅ Two-step bond creation UI with Excel upload
- ✅ Excel parsing endpoints (`/bonds/parse-cashflows`, `/bonds/template/cashflows`)
- ✅ Database wiped - fresh start with admin user and dummy bond `CDUC001`

## Prioritized Backlog

### P0 - Critical
- [ ] User verification of new bond creation flow and pricing

### P1 - High Priority  
- [ ] Dashboard counts frontend (invalid PAN, expiring documents)
- [ ] Pincode lookup in client creation form

### P2 - Medium Priority
- [ ] Delete obsolete files (`CreateBond.jsx`, `CreateBondModal.jsx`)
- [ ] Fix recurring UI bug on BondDetails page (radio button state)
- [ ] Code cleanup

### P3 - Technical Debt
- [ ] Refactor backend monolith (`server.py`)
- [ ] Refactor frontend monolith (`RealEstateDetails.jsx`)
- [ ] Build out `AnalysisDashboard.jsx`
- [ ] Email notifications for passport expiry

## Key API Endpoints
- `POST /bonds/calculate-price-v2` - Clean price calculation endpoint
- `POST /bonds/parse-cashflow-excel` - Parse uploaded Excel for bond cashflows
- `GET /bonds/cashflow-template` - Download Excel template
- `POST /bonds` - Create bond with optional `cashflows_per_unit`
- `POST /bonds/{bond_id}/calculate` - Calculate price for existing bond

## Database Schema Notes
- **bonds collection**: Now includes `cashflows_per_unit: List[dict]` field
- Each cashflow dict contains: `date`, `principal`, `interest`, `total`
- When `cashflows_per_unit` exists, it overrides other payment fields

## Test Credentials
- **Broker Login**: PAN: `ANVPB5297J`, Password: `Laksh@0208`, PIN: `0516`

## Known Issues
- UI bug on BondDetails page - radio button state not clearing correctly (recurring, low priority)

## Tech Stack
- **Frontend**: React + Shadcn/UI + TailwindCSS
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **File Handling**: openpyxl for Excel parsing, react-dropzone for uploads
