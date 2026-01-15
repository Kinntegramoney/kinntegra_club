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
- [x] Password reset via email with token

### Client Management
- [x] Add Client form with UCC field
- [x] Bulk upload via Excel templates (includes UCC)
- [x] Client profile management
- [x] Holdings view for brokers
- [x] Client-facing portal

### Reinvestment Tagging
- [x] Tag cash flows to new opportunities
- [x] Custom amount entry for "Other" option
- [x] Client-wise view - Group by client with summary
- [x] Approval status tracking - Not Sent/Pending/Approved/Rejected
- [x] Send approval email - Email client with approve/reject links
- [x] Email approval workflow - Client approves via link
- [x] Kinntegraa API placeholder - Ready for integration

### Email Integration
- [x] SMTP configuration
- [x] Welcome emails for new clients/sub-brokers
- [x] Password reset emails
- [x] Reinvestment approval emails
- [ ] Share opportunities via email (backend ready, frontend pending)

### Analysis Feature (NEW - January 15, 2026)
- [x] CAS PDF Upload with password protection
- [x] PDF parsing extracts portfolio summary, folios, transactions
- [x] Gap Sheet Excel report generation (4 sheets)
- [x] Analysis history listing
- [x] Analysis deletion
- [x] Scheme master upload and management
- [x] NAV data integration via MFapi.in
- [x] Accessible to all user roles (broker, sub_broker, client)

---

## New API Endpoints (v2.6.0)

### Analysis Endpoints
- `POST /api/analysis/upload-cas` - Upload CAS PDF for analysis
- `GET /api/analysis` - List all analyses
- `GET /api/analysis/{id}` - Get analysis details
- `GET /api/analysis/{id}/download` - Download Gap Sheet Excel
- `DELETE /api/analysis/{id}` - Delete analysis
- `POST /api/analysis/upload-scheme-master` - Upload BSE scheme master
- `GET /api/analysis/scheme-master/status` - Get scheme master status

### Reinvestment Approval
- `POST /api/reinvestment/send-approval-email` - Send approval request to client
- `GET /api/reinvestment/approve-via-link?token=&action=` - Client approves via email
- `POST /api/reinvestment/submit-to-kinntegraa` - Submit to investment firm

### Setup/Admin
- `GET /api/setup-broker` - Create/reset broker account
- `GET /api/clear-all-data` - Clear all data except admin broker

---

## Pending Tasks

### P0 - Critical
- [ ] Integrate actual Kinntegraa API when endpoint provided

### P1 - High Priority
- [ ] Build Frontend UI for Email Sharing (Bond & Real Estate)
- [ ] Test bulk upload end-to-end
- [ ] Bond presentation upload UI

### P2 - Medium Priority
- [ ] BondDetails calculator fix
- [ ] Export to Excel functionality

### P3 - Technical Debt
- [ ] Refactor RealEstateDetails.jsx (~3500 lines)
- [ ] Refactor TradeVerification.jsx (complex after refactor)

---

## Credentials

### Broker (Admin)
- **PAN**: ANVPB5297J
- **Password**: Laksh@0208
- **PIN**: 0516
- **Email**: pbisani89@gmail.com

### Test Files for Analysis
- **CAS PDF**: `/app/uploads/analysis/cas_report.pdf`
- **CAS Password**: `prima12`
- **Scheme Master**: `/app/uploads/analysis/scheme_master.txt`

---

## URLs
- **Preview**: https://portfolio-analysis.preview.emergentagent.com
- **Deployed**: https://kinntegraa.club

---

## Version History
- **v2.6.0** - Analysis tab: CAS PDF upload, Gap Sheet generation, Scheme master management
- **v2.5.0** - Reinvestment approval workflow, Client-wise view, UCC field
- **v2.4.0** - UCC field added to client forms
- **v2.3.0** - Clear data endpoint
- **v2.2.0** - Broker role fix
- **v2.1.0** - Version tracking

---

## Code Architecture
```
/app/
├── backend/
│   ├── .env
│   ├── auth.py
│   ├── email_service.py
│   ├── analysis_service.py    # NEW - CAS parser and Gap Sheet generator
│   └── server.py
└── frontend/
    └── src/
        ├── pages/
        │   ├── Analysis.jsx       # NEW - Analysis page
        │   ├── CustomerSignup.jsx
        │   ├── ForgotPassword.jsx
        │   ├── Login.jsx
        │   └── TradeVerification.jsx
        ├── components/
        │   ├── Sidebar.jsx        # Added Analysis link
        │   ├── SubBrokerSidebar.jsx   # Added Analysis link
        │   ├── ClientSidebar.jsx      # Added Analysis link
        │   └── CreateClientModal.jsx
        └── App.js
```

---

## Testing Status
- **Analysis Feature**: 100% (15/15 backend tests, all frontend UI verified)
- **Test File**: `/app/tests/test_analysis.py`

---

*Last Updated: January 15, 2026*
