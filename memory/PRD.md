# B2B Investment Broker Platform - PRD

## Original Problem Statement
Build a B2B platform for brokers to manage client investments in NCDs (Non-Convertible Debentures) and Real Estate. Core features include:
- CAS PDF analysis with complex financial calculations (FIFO, per-transaction XIRR, TDS)
- Holdings management with prepayment tracking
- Bulk data upload capabilities
- Client and sub-broker management

## User Personas
- **Broker Admin**: Manages clients, sub-brokers, and investment opportunities
- **Sub-Broker**: Limited access to manage assigned clients
- **Client**: End investors (managed by brokers)

## Core Requirements

### Authentication
- Two-step login (PAN + Password, then PIN)
- Role-based access (broker, sub-broker)

### Dashboard
- Analytics overview (clients, AUM, opportunities)
- Charts for client distribution and trends

### Holdings Management ✅
- View client bond holdings with XIRR
- Record principal prepayments
- Automatic interest recalculation on prepayment
- Bulk repayment update via Excel

### Analysis (CAS PDF Processing)
- Upload password-protected CAS PDFs
- Parse and extract investment data
- Generate multi-sheet Excel reports
- Client selection mandatory for tracking

### Opportunities
- Add/manage bond and real estate opportunities
- Bulk upload capabilities

### Admin Features
- Client management
- Sub-broker management
- Bulk upload (clients, sub-brokers, bonds, real estate)

---

## What's Been Implemented

### 2026-01-16
- **Bug Fix**: Bond bulk upload now reads all 4 Excel sheets and merges by bond_code
- **Testing**: Holdings page features verified (100% pass rate)

### Previous Sessions
- Holdings page major feature set (prepayment, XIRR, bulk upload)
- Test data creation for Holdings verification
- UI/UX overhaul (Analysis, Reinv Tag, Logs pages)
- Client selection mandatory on Analysis page

---

## Prioritized Backlog

### P0 - Critical
- Production deployment pipeline (user handles manually via "Save to Github")
- Email service broken (SMTP unreachable)

### P1 - High Priority
- Email service integration (Resend/SendGrid)

### P2 - Medium Priority
- BondDetails radio button UI bug (recurring)

### Technical Debt
- `server.py` (~3500 lines) - needs router separation
- `analysis_service.py` (~2500 lines) - needs modularization
- `RealEstateDetails.jsx` (~3500 lines) - needs component breakdown

---

## Test Credentials
- **Broker Login**: PAN: ANVPB5297J, Password: Laksh@0208, PIN: 0516
- **PDF Password**: prima12

## Database
- Name: `test_database`
- Collections: users, clients, trades, cashflows, analyses, bonds
