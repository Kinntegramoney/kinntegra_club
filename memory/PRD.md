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
- [x] **Step 3**: Download Gap Sheet Excel report
- [x] Progress bar shows parsing status
- [x] **12 Sheets generated**:
  1. Portfolio Performance (100% match with Gap Sheet)
  2. Tax View (LT/ST gains, financial year)
  3. Advisor View (grouped by advisor ARN)
  4. PAN View (grouped by PAN)
  5. MF Ageing (age of units, LONGTERM/SHORTTERM)
  6. Mutual Fund Holding (closing units, NAV, valuation)
  7. MF Transactions (all transaction details)
  8. Accounts (folio details)
  9. Exit Loads (load structure)
  10. Other Details (investor info)
  11. NFT (Non-Financial Transactions)
  12. XIRR Report (Return calculations)

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
- [ ] Refactor analysis_service.py (~1500+ lines)

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
- **Preview**: https://finreport-10.preview.emergentagent.com

---

*Last Updated: January 15, 2026*
