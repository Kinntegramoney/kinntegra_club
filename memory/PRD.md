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
- [x] Add Client form with UCC field (NEW)
- [x] Bulk upload via Excel templates (includes UCC)
- [x] Client profile management
- [x] Holdings view for brokers
- [x] Client-facing portal

### Reinvestment Tagging (ENHANCED)
- [x] Tag cash flows to new opportunities
- [x] Custom amount entry for "Other" option
- [x] **Client-wise view** (NEW) - Group by client with summary
- [x] **Approval status tracking** (NEW) - Not Sent/Pending/Approved/Rejected
- [x] **Send approval email** (NEW) - Email client with approve/reject links
- [x] **Email approval workflow** (NEW) - Client approves via link
- [x] **Kinntegraa API placeholder** (NEW) - Ready for integration

### Email Integration
- [x] SMTP configuration
- [x] Welcome emails for new clients/sub-brokers
- [x] Password reset emails
- [x] **Reinvestment approval emails** (NEW)
- [ ] Share opportunities via email (backend ready, frontend pending)

---

## New API Endpoints (v2.5.0)

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

---

## Credentials

### Broker (Admin)
- **PAN**: ANVPB5297J
- **Password**: Laksh@0208
- **PIN**: 0516
- **Email**: pbisani89@gmail.com

---

## URLs
- **Preview**: https://portfolio-analysis.preview.emergentagent.com
- **Deployed**: https://kinntegraa.club

---

## Version History
- **v2.5.0** - Reinvestment approval workflow, Client-wise view, UCC field
- **v2.4.0** - UCC field added to client forms
- **v2.3.0** - Clear data endpoint
- **v2.2.0** - Broker role fix
- **v2.1.0** - Version tracking

---

*Last Updated: January 15, 2026*
