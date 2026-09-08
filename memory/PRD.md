# Kinntegraa Cash Flow Projection Tool - PRD

## Original Problem Statement
Enhance a financial cash flow projection tool within the `Data Gathering` module. The tool helps financial advisors collect and manage comprehensive family financial data including members, income, expenses, goals, insurance, investments, and liabilities.

## User Personas
- **Brokers**: Financial advisors who manage multiple client families
- **Sub-brokers (MFDs)**: Work under brokers to manage specific clients
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

### MFD Access Bug Fix (Sep 2026)
- ✅ **Auto-tagging**: When MFD creates family, auto-set `sub_broker_id` to their ID
- ✅ **Access Control**: MFDs can now see families they created OR assigned to them
- ✅ Backend: Updated `get_data_gathering_families`, `get_family_details`, `update_family` endpoints
- ✅ Frontend: Updated `index.jsx` and `FamilyForm.jsx` to auto-tag

### Completed Features (Feb 2026)
- ✅ Retirement Year field added to Members table
- ✅ Backend model updated for retirement_year
- ✅ Mutual exclusion for Monthly/Annual expense fields
- ✅ Default new expense targets whole family
- ✅ Insurance premium loading from Expenses tab
- ✅ Tab count deduplication logic
- ✅ "Lasts till" message with life expectancy warning
- ✅ Data persistence bug fixes (deleted items reappearing)

### Excel Export Overhaul (Feb 2026)
- ✅ Sheet Reordering: Correct sequence matching UI tabs
- ✅ Expenses Sheet: Insurance Premiums and Loan EMIs with section headers
- ✅ Goals Sheet: Year-wise inflation-adjusted view
- ✅ Currency Formatting: ₹ symbol with Indian comma style
- ✅ Sheet Protection: All sheets non-editable
- ✅ Insurance premiums sourced from `family.insurance_premiums`

---

## Known Issues (Priority Order)

### P1 - High Priority
1. **Allocation Simulator**: Calculate button not working correctly with maturing income
2. **Insurance Premium Projection**: Verify premiums appear in Financial Plan expenses
3. **Excel Export Validation**: Need end-to-end verification of workbook content

### P2 - Medium Priority
1. **Bond Presentation**: Ephemeral file storage issue on live server
2. **"Multi" Display Bug**: Shows "Multi" for single portfolio allocation
3. **Duplicate Reinvestment Emails**: Clients receive multiple approval emails
4. **Expense Section Spacing**: Layout alignment issues
5. **"Expected Sale Date" Bug**: Date changes unexpectedly

---

## Technical Architecture

```
/app
├── backend/
│   ├── server.py          # Main FastAPI server (28k+ lines)
│   ├── auth.py            # Authentication
│   └── email_service.py   # Email functionality
└── frontend/
    └── src/
        └── pages/
            └── DataGathering/
                ├── index.jsx              # Main container
                ├── FamilyForm.jsx         # Family creation form
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
- `GET /api/data-gathering/families` - List families (role-based filtering)
- `GET /api/data-gathering/family/{family_id}` - Get family details
- `POST /api/data-gathering/family` - Create family
- `PUT /api/data-gathering/family/{family_id}` - Update family (Save and Next)
- `POST /api/data-gathering/family/{family_id}/income` - Add income
- `POST /api/data-gathering/family/{family_id}/insurance` - Add insurance premiums

## Database Schema
- Collection: `data_gathering_families`
- Key fields: `id`, `family_name`, `broker_id`, `sub_broker_id`, `created_by`, `created_by_role`, `members[]`, `income_details[]`, `expense_details[]`, `goal_details[]`, `insurance_premiums[]`, `liabilities[]`
