# Kinntegraa - Product Requirements Document

## Recent Changes (Feb 6, 2026)

### Assets Tab Redesign - View-Only Summary Table (Feb 6, 2026) ✅ NEW

**Feature:** Redesigned the Assets section in Data Gathering to be a view-only summary table with member-based columns.

**New Table Structure:**
- **Particulars Column** - Asset category names with icons
- **Member Columns** - Each family member gets a column with:
  - Investment Value sub-column
  - Market Value sub-column
- **Total Column** - Combined totals across all members
- **Grand Total Row** - Sum of all assets

**Key Changes:**
- Removed Actions column (view-only page)
- Member names displayed as column headers
- Investment Value and Market Value as sub-columns under each member
- Clean, read-only display of asset allocations per family member

**Asset Categories (14 total):**
1. PPF (→ Income)
2. EPF (→ Income)
3. Gratuity (→ Income)
4. Fixed Deposits (→ Income)
5. RD / PIS (→ Income)
6. Bonds (→ Income)
7. Insurance (→ Income)
8. Mutual Fund
9. Shares / PMS
10. Gold
11. Cash in Hand
12. Real Estate
13. Vehicles
14. Other Assets

**Files Modified:**
- `/app/frontend/src/pages/DataGathering/sections/AssetsSection.jsx` - Complete rewrite

**Testing:** ✅ Verified with single and multiple member families

---

### Expense Section Update (Feb 6, 2026) ✅

**Feature:** Updated the Expense Section based on the new `Expense_Category_NEW.docx` requirements.

**Categories Updated (17 total):**
1. Food & Grocery
2. House Rent / Maintenance / Repair
3. Conveyance, Fuel & Maintenance
4. Medicines / Doctor / Healthcare
5. Electricity / Water / Labour / AMC
6. Mobile
7. Gas Line / Telephone / Internet / Cable
8. Clothes and Accessories
9. Shopping, Gifts, White Goods, Gadgets
10. Dining / Movies / Sports
11. Personal Care / Others
12. Mediclaim / PA / CI
13. Children's Schooling / College Expenses
14. Contribution To Parents / Siblings
15. Motor Insurance
16. Life Insurance – Term Plan
17. EMI

**Field Changes:**
- **Monthly Amount** - New primary input field (user enters monthly expense)
- **Annual Amount** - Auto-calculated read-only field (Monthly × 12)
- **Upto Year** - Dropdown (2020-2080)
- **Inflation %** - Default 5%
- **Consider Post Retirement** - Checkbox (NEW)
- **Post-Retirement Applicable Member** - Dropdown, enabled only when checkbox is checked
- **% of Current Annual Expense** - Number input (0-100%), enabled only when checkbox is checked

---

## Architecture

### Tech Stack
- **Frontend:** React 18, Vite, Tailwind CSS, Shadcn/UI components
- **Backend:** Python FastAPI, Pydantic
- **Database:** MongoDB

### Key Directories
```
/app
├── backend/
│   └── server.py (main FastAPI application)
├── frontend/
│   └── src/
│       ├── pages/
│       │   └── DataGathering/
│       │       ├── index.jsx (main Data Gathering page)
│       │       └── sections/
│       │           ├── AssetsSection.jsx     ✅ Redesigned
│       │           ├── ExpenseSection.jsx
│       │           ├── GoalSection.jsx
│       │           ├── IncomeSection.jsx
│       │           ├── InsuranceSection.jsx
│       │           ├── LiabilitySection.jsx
│       │           ├── MembersSection.jsx
│       │           └── SurplusSection.jsx
│       └── components/ui/ (Shadcn components)
└── memory/
    └── PRD.md
```

### Data Gathering Tabs (8 total)
1. Introduction (Family Members)
2. Income
3. Expenses
4. **Assets** ← Redesigned as view-only summary table
5. Liabilities
6. Insurance Cover
7. Goals
8. Net Worth & Surplus

---

## Pending Tasks

### P1 - High Priority
- [ ] Verify "common header" feature in Goal, Insurance, Liability sections
- [ ] Component refactoring - Break down complex `IncomeSection.jsx`

### P2 - Medium Priority
- [ ] Extract reusable header/delete button logic into shared components

---

## API Endpoints (Data Gathering)

- `GET /api/data-gathering/families` - List families
- `POST /api/data-gathering/family` - Create family
- `GET /api/data-gathering/family/{id}` - Get family details
- `POST /api/data-gathering/family/{id}/member` - Add member
- `PUT /api/data-gathering/family/{id}/member/{member_id}` - Update member
- `POST /api/data-gathering/family/{id}/asset` - Add asset
- `PUT /api/data-gathering/family/{id}/asset/{asset_id}` - Update asset
- `DELETE /api/data-gathering/family/{id}/asset/{asset_id}` - Delete asset

---

## Test Credentials

**Broker (Admin) Account:**
- PAN: `ANVPB5297J`
- Password: `Laksh@0208`
- PIN: `0516`
