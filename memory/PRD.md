# Kinntegraa NCD Exchange Platform - PRD

## Original Problem Statement
B2B platform for brokers to manage secondary market Non-Convertible Debentures (NCD) and Real Estate transactions.

## Tech Stack
- **Frontend**: React with Shadcn/UI, Recharts
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Email**: External SMTP (mail.kinntegraa.club)

---

## What's Been Implemented

### Authentication System
- [x] Two-step login (PAN+Password → PIN)
- [x] JWT-based authentication with role-based access
- [x] Customer self-signup
- [x] Forgot Password/PIN reset flow via email

### Analysis Feature (January 15, 2026 - Updated)
- [x] **Step 1**: Upload CAS PDF with password protection
- [x] **Step 2**: Upload BSE Scheme Master from https://www.bsestarmf.in/RptSchemeMaster.aspx
- [x] **Step 3**: Download Gap Sheet (ZIP file with consolidated + per-PAN reports)
- [x] Progress bar shows parsing status
- [x] **8 Sheets generated** (aligned with user's template):
  1. Summary (Portfolio overview + Category-wise breakdown for ACTIVE funds only + FY-wise LT/ST summary)
  2. Portfolio Performance (Reordered: Valuation, Cash Withdrawal, Dividend, Amount Invested, Gains, Return %, CAGR %)
  3. MF Transactions (all transaction details + MF Ageing in absolute days)
  4. NFT (Non-Financial Transactions + Pledge transactions)
  5. Advisor View (XIRR performance, client longevity - active/past)
  6. XIRR (Broker/Adviser wise: Date, Particulars, Folio/Scheme, Amount, XIRR %)
  7. Tax View (LT/ST gains by FY, PAN column, Grandfathering for pre-Jan 31 2018 equity)
  8. Exit Loads (load structure from PDF)

### Latest Fixes (January 15, 2026)
- [x] **PAN Column in Tax View**: Added PAN as first column in Tax View sheet
- [x] **Active Funds Filter**: Summary sheet category breakdown now shows only funds with balance > 0
- [x] **Column Index Bug Fix**: Fixed Tax View column indices for sold ST units/gain
- [x] **Indian Number Formatting**: ₹ X,XX,XX,XXX format across all sheets
- [x] **Gain/Loss Calculation**: Updated to include withdrawals/dividends: `(Current + Withdrawn) - Invested`
- [x] **XIRR % per Category**: Added XIRR calculation for each category in the Summary sheet
- [x] **Withdrawn/Dividend Column**: New column showing withdrawals per category
- [x] **Portfolio Performance Reordered**: Columns now match user template (Valuation before Amount Invested)
- [x] **XIRR Sheet Broker-wise**: Segregated by adviser with Date, Particulars, Folio/Scheme, Amount columns
- [x] **MF Ageing Absolute Days**: Changed from "1Y 2M" format to absolute number of days
- [x] **Category Column Added**: Portfolio Performance now includes Category column
- [x] **Arbitrage/Hybrid as EQUITY**: Tax View shows Arbitrage and Hybrid as EQUITY for tax classification

### Parsing Improvements (January 15, 2026)
- [x] Fixed scheme name extraction (removes PDF headers like CAMSCASWS)
- [x] Fixed Stamp Duty inclusion as investment cost
- [x] Fixed STT Paid inclusion as investment cost
- [x] Fixed Rejection transaction handling (excluded from both invested/withdrawn)
- [x] Portfolio Performance tab now shows **100% accuracy** vs Gap Sheet

### Client Management
- [x] Add Client form with UCC field
- [x] Bulk upload via Excel templates
- [x] Client profile management
- [x] Holdings view

### Reinvestment Tagging
- [x] Tag cash flows to new opportunities
- [x] Client-wise view with summary
- [x] Approval status tracking
- [x] Email approval workflow

---

## API Endpoints

### Analysis Endpoints
- `POST /api/analysis/upload-cas` - Upload CAS PDF
- `GET /api/analysis` - List analyses
- `GET /api/analysis/{id}` - Get details
- `GET /api/analysis/{id}/download` - Download Gap Sheet (12 sheets)
- `DELETE /api/analysis/{id}` - Delete analysis
- `POST /api/analysis/upload-scheme-master` - Upload BSE scheme master
- `GET /api/analysis/scheme-master/status` - Scheme master status

---

## Pending Tasks

### P1 - High Priority
- [ ] Email sharing UI for Bond & Real Estate pages
- [ ] Test bulk upload end-to-end
- [ ] Verify other Gap Sheet tabs match (Tax View, Advisor View, etc.)

### P2 - Medium Priority
- [ ] Bond presentation upload UI

### P3 - Technical Debt
- [ ] Refactor RealEstateDetails.jsx (~3500 lines)
- [ ] Refactor TradeVerification.jsx
- [ ] **CRITICAL**: Refactor analysis_service.py (~2500+ lines) - Break into smaller modules

---

## Test Credentials

### Broker (Admin)
- **PAN**: ANVPB5297J
- **Password**: Laksh@0208
- **PIN**: 0516

### Test Files
- **CAS PDF**: `/app/uploads/analysis/cas_report.pdf` (Password: `prima12`)
- **Scheme Master**: https://www.bsestarmf.in/RptSchemeMaster.aspx

---

## URLs
- **Preview**: https://ncdtracker.preview.emergentagent.com

---

## UI Updates (January 15, 2026)
- [x] **Login Page**: Updated firm details - Kinntegrae L.L.C-FZ, License No: 24184465.01, Meydan Grandstand, 6th floor, Meydan Road, Nad Al Sheba, Dubai, U.A.E.
- [x] **Dashboard Page**: Converted from dark to light theme
- [x] **Analysis Page**: Converted from dark to light theme for consistency

---

## Known Issues
- **Production Deployment Not Syncing**: Platform-level issue. All testing must be done on preview environment.
- **BondDetails Radio Button**: Minor UI bug - selecting approximate amount doesn't clear bond radio selection

---

*Last Updated: January 15, 2026*