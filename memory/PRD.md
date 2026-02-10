# Kinntegraa - Financial Planning & Portfolio Analysis Platform

## Original Problem Statement
A comprehensive financial planning tool for brokers and advisors that includes:
1. **Data Gathering** - Client financial data collection (Assets, Liabilities, Expenses, Insurance, Goals)
2. **Portfolio Analysis** - Parse CAS PDFs and generate Gap Sheet reports

## Core Requirements
- Multi-user support (Broker, Sub-broker, Client roles)
- CAS PDF parsing with transaction extraction
- Gap Sheet Excel report generation
- Client financial data management

## What's Been Implemented

### Data Gathering Section (Completed)
- **Assets Tab**: View-only summary table with member-based columns
- **Liabilities Tab**: View-only summary table showing outstanding loan amounts
- **Expenses Tab**: Unified data entry for Regular Expenses, Loan EMIs, Insurance Premiums
- **Insurance Cover Tab**: View-only summary table comparing "Suggested" vs "Actual" coverage
- **Goals Tab**: Multi-year selection for recurring goals, "Family" option for shared goals

### Analysis Section
- CAS PDF parsing with investor info, portfolio summary, folios, transactions
- Gap Sheet Excel generation with multiple sheets (Summary, Portfolio Performance, MF Transactions, Sold Units, etc.)
- Dashboard view with holdings breakdown

## Bug Fixes Applied

### 2025-02-10: PDF Parsing & Sold Units Fixes

#### Issue 1: Multi-Asset Fund Not Being Parsed
**Problem:** ICICI Prudential Multi-Asset Fund entries were not appearing in the output when the ISIN was on a separate line from "ISIN:".

**Root Cause:** The ISIN regex expected the ISIN code to be on the same line as "ISIN:", but some PDFs have the format:
```
...Fund Name (Non-Demat) - ISIN:
INF109K015K4(Advisor: DIRECT)
```

**Fix:** Added handling for cases where `ISIN:` is at the end of one line and the actual ISIN code is on the next line.

#### Issue 2: Scheme Name Truncation
**Problem:** Fund names with multiple dashes (like "Multi-Asset Fund - Direct Plan - Growth") were being truncated.

**Root Cause:** The regex used non-greedy matching `(.+?)` which stopped at the first ` - `.

**Fix:** Changed to greedy matching `(.+)` to capture the full scheme name up to the last ` - ISIN:`.

#### Issue 3: Transactions Not Associated with Folios
**Problem:** When Folio No appears before ISIN in the PDF, transactions were not being properly associated.

**Root Cause:** The folio entry was created with stale scheme/ISIN data from the previous fund.

**Fix:** 
1. Create folio entry when Folio No is detected
2. When ISIN is detected later, migrate transactions from the old key to the new folio+ISIN key
3. Delete the old folio-only entry to avoid duplicates

#### Issue 4: Sold Units Showing Purchases After Sale Date
**Problem:** The Sold Units sheet was incorrectly matching sales with purchases that happened AFTER the sale date, resulting in negative holding days.

**Root Cause:** The FIFO matching algorithm didn't check if the purchase date was before the sale date.

**Fix:** Added a check in the FIFO matching to skip purchases that happened on or after the sale date:
```python
if sale_date and purchase_date >= sale_date:
    continue  # Skip purchases that happened on or after the sale date
```

## Known Issues / Tech Debt
1. `ExpenseSection.jsx` is very large and should be refactored into smaller components
2. `analysis_service.py` is large (~3500 lines) and could be modularized
3. "Suggested Cover" values in Insurance Cover tab are hardcoded constants

## Key Files
- `/app/backend/analysis_service.py` - CAS PDF parsing and Gap Sheet generation
- `/app/backend/server.py` - Main API server
- `/app/frontend/src/pages/Analysis.jsx` - Analysis UI
- `/app/frontend/src/pages/DataGathering/*.jsx` - Data gathering components

## Tech Stack
- **Frontend:** React, Shadcn/UI, Tailwind CSS
- **Backend:** FastAPI, Python
- **Database:** MongoDB
- **PDF Parsing:** PyMuPDF (fitz)
- **Excel Generation:** openpyxl
