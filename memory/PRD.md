# Kinntegraa Cash Flow Projection Tool - PRD

## Original Problem Statement
Enhance a financial cash flow projection tool within the `Data Gathering` module. The tool helps financial advisors collect and manage comprehensive family financial data including members, income, expenses, goals, insurance, investments, and liabilities.

## User Personas
- **Brokers**: Financial advisors who manage multiple client families
- **Sub-brokers**: Work under brokers to manage specific clients
- **Clients**: End users whose financial data is being gathered

## Core Requirements

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

### Key Features
- Cross-member data association
- Inflation-adjusted projections
- Post-retirement expense calculations
- Comprehensive Excel export

---

## What's Been Implemented

### Completed Features (Feb 2026)
- ✅ Retirement Year field added to Members table
- ✅ Backend model updated for retirement_year
- ✅ Mutual exclusion for Monthly/Annual expense fields
- ✅ Default new expense targets whole family
- ✅ Insurance premium loading from Expenses tab
- ✅ Tab count deduplication logic
- ✅ "Lasts till" message with life expectancy warning
- ✅ Data persistence bug fixes (deleted items reappearing)

### Bug Fixes (Feb 20, 2026)
- ✅ **Assets Tab**: Added `mutual_fund` and `nps` categories to display MF/NPS from Income tab
- ✅ **Surplus Tab**: Maturities (Insurance, FD, PPF, EPF, Bonds) now included in cash flow projection
- ✅ **Excel Export**: Added maturity breakdown section showing year-wise maturity amounts
- ✅ **Insurance Deduplication**: Reduced duplicate entries from 16 to 6 unique records

### Excel Export Overhaul (Feb 20, 2026)
- ✅ **Sheet Reordering**: 9 sheets in correct sequence matching UI tabs (Members → Income → Expenses → Goals → Investments → Insurance → Liabilities → Assets → Surplus)
- ✅ **Expenses Sheet Enhanced**: Now includes Insurance Premiums and Loan EMIs with section headers (per user template)
- ✅ **Goals Sheet Timeline**: Year-wise inflation-adjusted view with target years as columns
- ✅ **Currency Formatting**: All amounts use ₹ symbol with Indian comma style (₹ 50,00,000)
- ✅ **Sheet Protection**: All sheets are non-editable

### Data Migration (Feb 20, 2026)
- ✅ Migrated "Pradeep Dattatray Prabhu & Family" from old environment
- Family ID: `869d412b-0cb8-4839-9459-d2a02b2860f1`
- Includes: 3 members, 9 income items, 8 goals, 12 expenses, 6 insurance (deduplicated), 1 liability

---

## Known Issues (Priority Order)

### P0 - Critical
1. **Insurance Tab Duplication**: Coverage amounts are duplicated/summed incorrectly
   - File: `/app/frontend/src/pages/DataGathering/sections/InsuranceSection.jsx`
   - Function: `getActualCover` needs deduplication logic

2. **Bond Presentation Not Visible**: Ephemeral file storage issue on live server

### P1 - High Priority
1. **Excel Export Broken**: `generateExcelExport is not defined` error
   - File: `/app/frontend/src/pages/DataGathering/sections/SurplusSection.jsx`
   - Solution: Extract to `/app/frontend/src/utils/exportUtils.js`

2. **"Multi" Display Bug**: Shows "Multi" for single portfolio allocation

3. **Duplicate Reinvestment Emails**: Clients receive multiple approval emails

### P2 - Medium Priority
1. **Expense Section Spacing**: Layout alignment issues
2. **"Expected Sale Date" Bug**: Date changes unexpectedly
3. **Missing Data in Excel**: Specific client Excel missing data

---

## Prioritized Backlog

### P0 Features
- Fix Insurance tab deduplication
- Fix Excel export functionality

### P1 Features  
- Implement cloud storage for file uploads (AWS S3)
- Hide 5-year history for pegged currencies
- Add currency support to "View Details" page

### P2 Features
- Enhance Bond Presentation viewer with navigation
- Dashboard UI fixes

---

## Technical Architecture

```
/app
├── backend/
│   ├── server.py          # Main FastAPI server
│   ├── auth.py            # Authentication
│   └── email_service.py   # Email functionality
└── frontend/
    └── src/
        └── pages/
            └── DataGathering/
                ├── index.jsx              # Main container
                └── sections/
                    ├── MembersSection.jsx
                    ├── IncomeSection.jsx
                    ├── ExpenseSection.jsx
                    ├── GoalSection.jsx
                    ├── InsuranceSection.jsx
                    ├── InvestmentSection.jsx
                    ├── AssetsSection.jsx
                    ├── LiabilitySection.jsx
                    ├── NetworthSection.jsx
                    └── SurplusSection.jsx
```

## Key API Endpoints
- `GET/PUT /api/data-gathering/family/{family_id}` - Family CRUD
- `POST /api/data-gathering/family/{family_id}/insurance` - Insurance premiums

## Database Schema
- Collection: `data_gathering_families`
- Key fields: members[], income_details[], expense_details[], goal_details[], insurance_premiums[], liabilities[]

## Test Credentials
- Broker PAN: `ANVPB5297J`, Password: `Laksh@0208`, PIN: `0516`
- Test Family: `869d412b-0cb8-4839-9459-d2a02b2860f1`
