# Kinntegraa Cash Flow Projection Tool - PRD

## Original Problem Statement
Enhance a financial cash flow projection tool within the `Data Gathering` module. The tool helps financial advisors collect and manage comprehensive family financial data including members, income, expenses, goals, insurance, investments, and liabilities.

## User Personas
- **Brokers/Real Estate Brokers**: Financial advisors who manage multiple client families
- **Sub-brokers (MFD/RIA)**: Mutual Fund Distributors who work under brokers to manage specific clients
- **Clients/Private Investors**: End users whose financial data is being gathered

## Core Requirements

### Landing Page & Pre-Login Experience (FULLY Restored Sep 8, 2026)
**Main Landing Page (`/`):**
- Navigation: About Us, Real Estate Brokers, MFD/RIA, Private Investors
- Hero: "Investment & Financial Consultancy Platform"
- Who We Are: Kinntegraa L.L.C-FZ, Meydan Free Zone, License: 2418465.01
- Our Services: Investment Consultancy, Financial Consultancy, Commercial Brokerage
- Who We Serve: Private Investors, Real Estate Brokers, MFD/RIA
- Login dropdown with user type selection

**Audience-Specific Pages:**
1. **Private Investors (`/private-investors`):**
   - Indian Passport Holder / Foreign Passport Holder tabs
   - Services: Real Estate Investment, NCD Investments, CAS Analysis, Data Gathering
   - Key benefits and examples

2. **MFD/RIA (`/mf-distributors`):**
   - AMFI Registered MFD / SEBI Registered RIA tabs
   - Platform Services: CAS Analysis, NCD Distribution, Dubai Real Estate, Financial Planning
   - Key benefits and examples

3. **Real Estate Brokers (`/real-estate-brokers`):**
   - B2B2C Fractional Aggregation Platform
   - For Broker Firms / Your Agents / Your Clients tabs
   - Challenges and Solutions sections

**Additional Landing Pages:**
- `/real-estate` - Real Estate Landing
- `/bonds` - Bonds Landing
- `/wealth-planning` - Wealth Planning Landing
- `/portfolio-analyzer` - Portfolio Analyzer Landing

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

### Expense Excel Export Fixes (Sep 16, 2026)
✅ **4 issues fixed in Expense section:**
1. **Post Retirement % = 0%** when checkbox not selected (was incorrectly showing 100%)
2. **Category names match frontend** - Uses full labels like "House Rent / Maintenance / Repair" 
3. **Insurance shows member name** instead of "Family" - properly reads member_ids
4. **Duplicate prevention** - Term Life Insurance and other categories no longer appear twice

✅ **Same fixes applied to Cashflow sheet** for consistency

### COMPLETE Income Excel Field Parity (Sep 16, 2026) - ALL 17 CATEGORIES
✅ **Comprehensive field mapping audit completed** - Every income category now exports ALL portal fields exactly:

| Category | Fields Mapped |
|----------|--------------|
| Salary Income | net_income_monthly, net_income_yearly, increment_month, avg_growth_rate |
| Business Income | net_income_yearly, avg_growth_rate |
| Property Details | property_type, property_details, investment_amount, investment_date, market_value, market_value_date, xirr_return, is_on_rent, rent_per_month, annual_rent, maintenance, property_tax, absolute_return |
| PPF | market_value, annual_contribution, monthly_contribution, growth_rate, upto_year, as_on_date, maturity_date, year_to_mature, maturity_value |
| EPF | market_value, annual_contribution, monthly_contribution, growth_rate, upto_year, as_on_date, maturity_date, year_to_mature, maturity_value |
| Gratuity | market_value, growth_rate, as_on_date, maturity_date, year_to_mature, maturity_value |
| Fixed Deposit | description, investment_value, investment_date, interest_rate, payable_cycle, maturity_amount, maturity_date, gross_xirr |
| RD / PIS | investment_value_monthly, interest_rate, start_date, end_date, num_installments, investment_value, maturity_value, gross_xirr |
| Pension | payable_type, description, amount, amount_yearly, start_date, upto_life, end_date, payable_to_relation |
| NCD | description, investment_date, investment_value, payout_frequency, payout_amount, maturity_amount, maturity_date, gross_xirr |
| Insurance | description, premium_frequency, premium_amount, premium_start_date, premium_end_date, total_paid, total_pending, maturity_date, maturity_amount, gross_xirr |
| Mutual Fund | market_value, sip_amount, annual_sip_amount, upto_year |
| Cash In Hand | description, bank_balance |
| Vehicle | description, market_value |
| Commodities | commodity_type, weight_kg, price_per_kg, market_value |
| Shares / PMS | market_value, annual_contribution, monthly_contribution, upto_year |
| Other | description, market_value |

### Income Section Excel Parity & New Fields (Sep 16, 2026)
- ✅ **PPF/EPF/Gratuity Growth Rate**: Added Growth Rate % field with defaults (PPF: 7.1%, EPF: 8.25%, Gratuity: 6%)
- ✅ **Maturity Value Auto-Calculation**: Dynamically calculates based on current value, annual contribution, growth rate, and years to maturity
- ✅ **Years to Mature**: Auto-calculated on data load based on maturity date
- ✅ **Year-by-Year Maturity Breakdown**: Info icon (ℹ️) next to Maturity Value opens modal showing:
  - Summary cards (Starting Value, Total Contributions, Total Interest, Final Maturity Value)
  - Detailed year-by-year table with Opening Balance, Contribution, Interest Earned, Closing Balance
  - Shows when contributions stop based on "Contribution Up to Year" setting
  - Formula explanation at bottom
- ✅ **Excel Income Export Alignment**: 
  - New categorized sections: REGULAR INCOME, RETIREMENT CORPUS, FIXED INCOME/DEBT INSTRUMENTS, MARKET-LINKED INVESTMENTS, OTHER ASSETS, PROPERTY DETAILS
  - Uses exact portal terminology (e.g., "Property Details" not "Rental Income")
  - Maturity values computed dynamically in Excel export
- ✅ **INCOME_CATEGORY_CONFIG**: Comprehensive mapping of 17 income categories with aliases for data consistency
- ✅ **Fixed totalByMember ReferenceError**: Per-member Excel export now works correctly

### Original Pre-Login Pages Restored from GitHub (Sep 8, 2026)
- ✅ **Recovered original content** from GitHub repository `punitbisani1989/Kinntegraa-Club`
- ✅ **Main LandingPage.jsx** - Full About Us page with company info, services, audience sections
- ✅ **PrivateInvestorsPage.jsx** - Complete page for private investor audience
- ✅ **MFDistributorsPage.jsx** - Complete page for MFD/RIA audience  
- ✅ **RealEstateBrokersPage.jsx** - Complete page for real estate broker audience
- ✅ **Additional landing pages** - BondsLanding, RealEstateLanding, WealthPlanningLanding, PortfolioAnalyzerLanding
- ✅ **Supporting components** - UserTypeSelector, REBrokerSidebar, PartnersTabs, and more
- ✅ **App.js routes** - All original routes restored with proper imports

### Test Accounts Created (Previous session)
- ✅ **MFD Accounts Created** - Codes 1994101-1994108 with password `kinntegraa123`, PIN `1234`
- ✅ **SUPERUSER Account** - PAN `SUPERUSER`, password `kinntegraa123`, PIN `1234`

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
4. **Family-level Excel**: Uses legacy flat layout; per-member Excel uses new categorized layout

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
