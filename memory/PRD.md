# Kinntegraa NCD Exchange Platform - PRD

## Original Problem Statement
B2B platform for brokers to manage secondary market Non-Convertible Debentures (NCD) and Real Estate transactions.

## Core Users
- **Brokers**: Primary users who manage clients, sub-brokers, and opportunities
- **Sub-Brokers**: Work under brokers to manage their clients
- **Clients**: End customers who invest in bonds and real estate

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
- [x] Customer self-signup (NEW - Jan 14, 2026)
- [x] Forgot Password/PIN reset flow (NEW - Jan 14, 2026)
- [x] Password reset via email with token

### Broker Dashboard
- [x] Analytics dashboard with key metrics
- [x] Client status visualization
- [x] AUM distribution charts
- [x] Client spread by city
- [x] Monthly activity console
- [x] AUM by sub-broker

### Bond Management
- [x] Create/edit bond opportunities
- [x] Bond details page with investment calculator
- [x] Client investment tracking
- [x] Trade verification workflow

### Real Estate Management
- [x] Off-plan real estate opportunities
- [x] Payment tracking (investor payments, developer receipts)
- [x] XIRR comparison report (projected vs actual)
- [x] Currency projection settings
- [x] Oqood fee tracking

### Client Management
- [x] Bulk upload via Excel templates
- [x] Client profile management
- [x] Holdings view for brokers
- [x] Client-facing portal

### Reinvestment Tagging
- [x] Tag cash flows to new opportunities
- [x] Custom amount entry for "Other" option
- [x] Projected amounts display

### Email Integration
- [x] SMTP configuration
- [x] Welcome emails for new clients/sub-brokers
- [x] Password reset emails
- [ ] Share opportunities via email (backend ready, frontend pending)

### Setup/Admin
- [x] Database seeding for broker account on startup
- [x] Setup endpoint for broker password reset

---

## Pending Tasks

### P0 - Critical
- [ ] **Deployment sync issue** - Code changes not reflecting after deployment (platform issue, contact support)

### P1 - High Priority
- [ ] Build Frontend UI for Email Sharing (Bond & Real Estate detail pages)
- [ ] Test bulk upload end-to-end (template → fill → upload → verify)
- [ ] Bond presentation upload UI

### P2 - Medium Priority
- [ ] BondDetails calculator fix (clear selectedBound on manual input)
- [ ] General "Export to Excel" functionality

### P3 - Technical Debt
- [ ] **CRITICAL**: Refactor RealEstateDetails.jsx (~3500 lines) into smaller components

---

## API Endpoints

### Auth
- `POST /api/auth/login-step1` - PAN + Password verification
- `POST /api/auth/login-step2` - PIN verification
- `POST /api/auth/customer-signup` - Customer self-registration
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset with token
- `GET /api/auth/verify-reset-token/{token}` - Validate token

### Dashboard
- `GET /api/dashboard/summary`
- `GET /api/dashboard/clients-by-city`
- `GET /api/dashboard/aum-distribution`
- `GET /api/dashboard/activity-log`
- `GET /api/dashboard/monthly-stats`

### Setup
- `GET /api/setup-broker` - Create/reset broker account

---

## Credentials

### Broker (Production)
- **PAN**: ANVPB5297J
- **Password**: Laksh@0208
- **PIN**: 0516

### Test Customer (Preview only)
- **PAN**: TESTPAN123
- **Password**: Test@123
- **PIN**: 1234

---

## URLs
- **Preview**: https://ncdexchange.preview.emergentagent.com
- **Deployed**: https://kinntegraa.club

---

## Known Issues
1. Deployment not syncing latest code (contact support@emergent.sh)
2. RealEstateDetails.jsx needs urgent refactoring

---

*Last Updated: January 14, 2026*
