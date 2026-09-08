# Kinntegraa Cash Flow Projection Tool - PRD

## Original Problem Statement
Enhance a financial cash flow projection tool within the `Data Gathering` module. The tool helps financial advisors collect and manage comprehensive family financial data including members, income, expenses, goals, insurance, investments, and liabilities.

## User Personas
- **Brokers/Real Estate Brokers**: Financial advisors who manage multiple client families
- **Sub-brokers (MFD/RIA)**: Mutual Fund Distributors who work under brokers to manage specific clients
- **Clients/Private Investors**: End users whose financial data is being gathered

## Core Requirements

### Landing Page (Restored Sep 2026)
- User type selection: Private Investor, MFD/RIA, Real Estate Broker
- Routes to login page after selection
- Company branding and trust badges

### Data Gathering Module
1. **Members Section**: Family member management with retirement year, life expectancy, tax details
2. **Income Section**: Multiple income types (salary, rental, insurance income, mutual funds, etc.)
3. **Expenses Section**: Categorized expenses with inflation and post-retirement considerations
4. **Goals Section**: Financial goals with target years and inflation
5. **Insurance Section**: Insurance premiums and coverage tracking
6. **Investments Section**: Investment tracking
7. **Assets Section**: Asset management
8. **Liabilities Section**: Loan and liability tracking
9. **Surplus Section**: Cash flow projection and Excel export

---

## What's Been Implemented

### Landing Page & Login Restoration (Sep 8, 2026)
- ✅ **Landing Page Created** - 3 user types: Private Investor, MFD/RIA, Real Estate Broker
- ✅ **MFD Accounts Created** - Codes 1994101-1994108 with password `kinntegraa123`, PIN `1234`
- ✅ **SUPERUSER Account** - PAN `SUPERUSER`, password `kinntegraa123`, PIN `1234`
- ✅ **App Routes Updated** - Landing page at `/`, login at `/login`

### MFD Access Bug Fix (Sep 8, 2026)
- ✅ **Auto-tagging**: When MFD creates family, auto-set `sub_broker_id` to their ID
- ✅ **Access Control**: MFDs can now see families they created OR assigned to them
- ✅ Backend: Updated `get_data_gathering_families`, `get_family_details`, `update_family` endpoints
- ✅ Frontend: Updated `index.jsx` and `FamilyForm.jsx` to auto-tag

### Excel Export (Feb 2026)
- ✅ Sheet Reordering: Correct sequence matching UI tabs
- ✅ Expenses Sheet: Insurance Premiums and Loan EMIs with section headers
- ✅ Currency Formatting: ₹ symbol with Indian comma style
- ✅ Sheet Protection: All sheets non-editable

---

## Known Issues

### P1 - High Priority
1. **Allocation Simulator**: Calculate button not working correctly with maturing income
2. **Insurance Premium Projection**: Verify premiums appear in Financial Plan expenses

### P2 - Medium Priority (Pre-existing)
1. **Ephemeral Storage**: File uploads stored on pod (bond presentations, invoices, etc.)
2. **Route Shadowing**: Some API routes shadow parameterized routes
3. **Bare Except Clauses**: 73 occurrences need specific exception handling

---

## Test Credentials

### SUPERUSER
- PAN: `SUPERUSER`, Password: `kinntegraa123`, PIN: `1234`

### MFD/RIA (all use same password/PIN)
- Codes: `1994101` through `1994108`
- Password: `kinntegraa123`, PIN: `1234`

### Broker
- PAN: `ANVPB5297J`, Password: `Laksh@0208`, PIN: `0516`

---

## Technical Architecture
- Frontend: React with Tailwind CSS
- Backend: FastAPI (Python)
- Database: MongoDB
- Preview URL: https://financial-cash-flow.preview.emergentagent.com
