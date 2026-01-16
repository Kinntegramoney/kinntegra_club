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

### Bulk Upload Features ✅
- Bonds: Multi-sheet Excel (Bond Details, Financial Details, Units & Limits, Principal Payments)
- Clients: Multi-sheet Excel with proper PAN field handling
- Sub-brokers: Single sheet upload
- Real Estate: Multi-sheet upload

---

## What's Been Implemented

### 2026-01-16
- **Bug Fix**: Bond bulk upload now reads all 4 Excel sheets and merges by bond_code
- **Bug Fix**: Client bulk upload now correctly stores `pan_number` field
- **Feature**: Edit client modal with full form (Personal, Address, Bank, Sub-broker details)
- **Feature**: Three-dots menu for clients (Resend Credentials, Reset Password, Deactivate, Delete)
- **Backend**: Added `/api/clients/{id}/resend-credentials`, `/reset-password`, `/deactivate` endpoints

### Previous Sessions
- Holdings page major feature set (prepayment, XIRR, bulk upload)
- Test data creation for Holdings verification
- UI/UX overhaul (Analysis, Reinv Tag, Logs pages)
- Client selection mandatory on Analysis page

---

## Prioritized Backlog

### P0 - Critical
- Production deployment pipeline (user handles manually via "Save to Github")
- Email service broken (SMTP unreachable) - credentials shown in UI modal as workaround

### P1 - High Priority
- Email service integration (Resend/SendGrid)

### P2 - Medium Priority
- BondDetails radio button UI bug (recurring)

### Technical Debt
- `server.py` (~3600 lines) - needs router separation
- `analysis_service.py` (~2500 lines) - needs modularization
- `RealEstateDetails.jsx` (~3500 lines) - needs component breakdown

---

## Test Credentials
- **Broker Login**: PAN: ANVPB5297J, Password: Laksh@0208, PIN: 0516
- **PDF Password**: prima12

## Database
- Name: `test_database`
- Collections: users, clients, trades, cashflows, analyses, bonds

## Key API Endpoints
- `/api/clients` - CRUD for clients
- `/api/clients/{id}/resend-credentials` - Reset and resend credentials
- `/api/clients/{id}/reset-password` - Reset password only
- `/api/clients/{id}/deactivate` - Soft deactivate client
- `/api/bulk/bonds` - Bulk upload bonds (multi-sheet)
- `/api/bulk/clients` - Bulk upload clients
- `/api/holdings/*` - Holdings management APIs
