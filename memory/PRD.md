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
- Role-based access (broker, sub_broker, client)

### Dashboard
- Analytics overview (clients, AUM, opportunities)
- Charts for client distribution and trends

### Holdings Management ✅
- View client bond holdings with XIRR
- Record principal prepayments with percentage calculation
- Automatic interest recalculation on prepayment
- Bulk repayment update via Excel
- Email notifications to clients on prepayment

### Client Management ✅
- Create/Edit/Delete clients
- Three-dots menu with: Resend Credentials, Reset Password, Deactivate, Delete
- Bulk client upload with PAN correctly stored
- Link clients to sub-brokers

### Analysis (CAS PDF Processing)
- Upload password-protected CAS PDFs
- Parse and extract investment data
- Generate multi-sheet Excel reports
- Client selection mandatory for tracking

### Reinvestment Tagging ✅
- Tag upcoming cashflows for reinvestment
- Support for: Principal, Interest, Net Amount, Custom, Not Invest
- Send for client approval via email
- Shows prepayment-affected entries with "Revised" badge
- Displays original vs amended amounts with strikethrough

### Bulk Upload Features ✅
- Bonds: Multi-sheet Excel (Bond Details, Financial Details, Units & Limits, Principal Payments)
- Clients: Multi-sheet Excel with proper PAN field handling
- Sub-brokers: Single sheet upload
- Real Estate: Multi-sheet upload

---

## What's Been Implemented

### 2026-01-17 (Current Session)
- **Feature**: Removed "Credit Rating" field from bond creation and bulk upload
  - Backend: Cleaned BondCreate, Bond, BondUpdate Pydantic models (no credit_rating)
  - Backend: Bulk template no longer includes Credit Rating column
  - Frontend: Removed credit_rating from EditBondModal.jsx (form state, payload, UI)
  - Verified: Bond creation and bulk upload work correctly without credit_rating

### 2026-01-16 (Previous Session)
- **Feature**: Enhanced prepayment with percentage calculation and display
  - Shows prepayment percentage in success toast (e.g., "₹1,00,000 (10%) principal prepaid")
  - Shows remaining principal percentage (e.g., "Remaining: ₹9,00,000 (90%)")
  - Real-time percentage preview in prepayment modal as user enters amount
- **Feature**: Client email notification on prepayment
  - Added `send_prepayment_notification_email()` function to email_service.py
  - Professional HTML template with prepayment details, investment summary, revised schedule
  - Email includes amount prepaid, percentage, original/remaining principal
- **Feature**: Reinvestment tags marked for review on prepayment
  - Affected cashflows flagged with `prepayment_affected` and `reinvestment_tag_needs_update`
  - Backend API returns count of affected reinvestment tags
- **Feature**: Reinvestment Tagging page shows prepayment-affected entries
  - "Revised" badge on amended entries (amber color)
  - Original amounts shown with strikethrough below current amounts
  - Added fields: is_amended, prepayment_affected, original_net_amount, amendment_reason

### 2026-01-16 (Previous Fork)
- **Bug Fix**: Bond bulk upload now reads all 4 Excel sheets and merges by bond_code
- **Bug Fix**: Client bulk upload now correctly stores `pan_number` field
- **Feature**: Edit client modal with full form (Personal, Address, Bank, Sub-broker details)
- **Feature**: Three-dots menu for clients (Resend Credentials, Reset Password, Deactivate, Delete)
- **Backend**: Added `/api/clients/{id}/resend-credentials`, `/reset-password`, `/deactivate` endpoints
- **Email Service**: Fixed SMTP connection via `donotreply@kinntegraa.club`
- **Email Templates**: Redesigned all templates to match website UI/branding

### Previous Sessions
- Holdings page major feature set (prepayment, XIRR, bulk upload)
- Test data creation for Holdings verification
- UI/UX overhaul (Analysis, Reinv Tag, Logs pages)
- Client selection mandatory on Analysis page
- Interest calculation with reducing principal balance
- "On Maturity" interest frequency option

---

## Prioritized Backlog

### P0 - Critical
- Production deployment pipeline (user handles manually via "Save to Github")

### P1 - High Priority
- User verification of all recent features (prepayment, client management, bulk upload)
- Final verification of CAS analysis report generation

### P2 - Medium Priority
- BondDetails radio button UI bug (recurring)

### Technical Debt - CRITICAL
- `server.py` (~5000+ lines) - needs router separation
- `analysis_service.py` (~2500 lines) - needs modularization
- `RealEstateDetails.jsx` (~3500 lines) - needs component breakdown

---

## Test Credentials
- **Broker Login**: PAN: ANVPB5297J, Password: Laksh@0208, PIN: 0516
- **PDF Password**: prima12

## Database
- Name: `test_database`
- Collections: users, clients, trades, cashflows, analyses, bonds, holding_cashflows, prepayment_records

## Key API Endpoints
- `/api/clients` - CRUD for clients
- `/api/clients/{id}/resend-credentials` - Reset and resend credentials
- `/api/clients/{id}/reset-password` - Reset password only
- `/api/clients/{id}/deactivate` - Soft deactivate client
- `/api/bulk/bonds` - Bulk upload bonds (multi-sheet)
- `/api/bulk/clients` - Bulk upload clients
- `/api/holdings/*` - Holdings management APIs
- `/api/holdings/trade/{trade_id}/record-prepayment` - Record prepayment with email notification
- `/api/reinvestment/upcoming` - Get upcoming cashflows with prepayment flags
