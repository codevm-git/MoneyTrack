# MoneyTrack — Comprehensive Testing Strategy & Verification Standards

**Document Version:** 1.0.0  
**Status:** Approved Quality Assurance Specification & Test Matrix  
**Classification:** Testing & Quality Assurance Standard  
**Project:** MoneyTrack — Smart Financial Literacy and Budget Planner for Public  
**Core Constraint:** 100% Offline and Privacy-First  
**Target Repository Path:** `doc/TESTING.md`  
**Current Release Version:** `v0.2.1-beta` (Git Commit: `c37a834`, Target: `v1.0.0 Stable`)  
**Verified Test Execution:** 50/50 Tests Passing (`python3 -m unittest discover -s tests`)  

---

## 1. Testing Objectives

MoneyTrack is an offline-first, privacy-guaranteed personal financial planning application. Because users rely on the software for personal budgeting, financial education, and savings projections, the quality assurance framework enforces zero tolerance for arithmetic drift, data corruption, or network leaks.

### Core Testing Mandates
1. **Deterministic Financial Accuracy:** All financial calculations (balances, budgets, EMIs, compound interest, health scores) must execute with mathematical precision in **integer paise** ($1\text{ Rupee} = 100\text{ paise}$), completely eliminating IEEE 754 floating-point drift.
2. **Absolute Offline Air-Gap Verification:** Every feature, stylesheet, script, and visualization must operate completely disconnected from the internet. Outbound HTTP/WebSocket requests are considered critical test failures.
3. **ACID Durability & Data Integrity:** Database operations mutating financial records must be atomic (`BEGIN IMMEDIATE`, `COMMIT`, `ROLLBACK`), resistant to crashes, and strictly compliant with relational constraints.
4. **Zero Untested Completions:** No feature, route, algorithm, or migration shall ever be marked complete in [`doc/TASKS.md`](file:///home/prajwal/College%20Work/PROJECT/Smart%20Financial%20Literacy%20and%20Budget%20Planner%20for%20Public/doc/TASKS.md) without passing automated and reproducible test suites.
5. **UI & UX Regression Defense:** Visual components, layouts, color tokens, and responsive behaviors must strictly preserve the authoritative reference ([`sample_ui/MoneyTrack Financial Planner(DEMO).html`](file:///home/prajwal/College%20Work/PROJECT/Smart%20Financial%20Literacy%20and%20Budget%20Planner%20for%20Public/sample_ui/MoneyTrack%20Financial%20Planner(DEMO).html)).

---

## 2. Test Architecture & Automated Test Suite Inventory

MoneyTrack contains a dedicated, automated Python test suite under the `tests/` directory comprising **50 unit, integration, security, and end-to-end tests**:

```
tests/
├── test_accounts.py                 # Multi-account CRUD, balance math (asset vs credit card), cascade rules (8 tests)
├── test_api.py                      # REST endpoints, transactions, budgets, goals, JSON/CSV exports (8 tests)
├── test_calculators.py              # Precision math for EMI, compound interest, and inflation (3 tests)
├── test_e2e_workflows.py            # Complete end-to-end user workflows and multi-step data consistency (5 tests)
├── test_financial_service.py        # Ledger totals, category budgets, financial health score algorithm (6 tests)
├── test_security_and_integrity.py   # Health score 0 on empty DB, session security, date validation, air-gap (12 tests)
└── test_username_auth.py            # User registration, password hashing, session login, data isolation (8 tests)
```

### Test Execution Command & Verification Results
```bash
$ python3 -m unittest discover -s tests
..................................................
----------------------------------------------------------------------
Ran 50 tests in 45.016s

OK
```

---

## 3. Test Suites & Verification Scope

### 3.1 Multi-Account & Balance Engine (`tests/test_accounts.py`)
- **Asset Account Balance Math:** Verifies $\text{Balance} = \text{Initial Balance} + \text{Income} - \text{Expenses} + \text{Transfers In} - \text{Transfers Out}$.
- **Credit Card Liability Balance Math:** Verifies outstanding liability accumulates with expenses and reduces with payments.
- **Cascade Deletion Safety:** Verifies deleting an account safely sets `transactions.account_id = NULL` via `ON DELETE SET NULL`, preserving historical ledger records.
- **Default Account Designations:** Verifies primary account designation and fallback behavior.

### 3.2 REST API Contracts (`tests/test_api.py`)
- **Transactions CRUD:** Adding, updating, retrieving, and deleting income, expense, and transfer records.
- **Category Monthly Budgets:** Setting and updating category spending ceilings.
- **Savings Goals & Quick Deposits:** Target progress calculation, +₹1,000 deposits, and safe withdrawals.
- **Calculators API:** Validating responses for `/api/calculators/emi`, `/api/calculators/compound-interest`, and `/api/calculators/inflation`.
- **JSON Snapshot Export/Import:** Verifies schema structure, entity serializations, and atomic state recovery.
- **CSV Statement Generation:** Verifies valid RFC 4180 CSV export with correct headers and column mappings.

### 3.3 Financial Mathematical Precision (`tests/test_calculators.py`)
- **Reducing-Balance Loan EMI:** Actuarial formula verification against standard banking benchmark datasets.
- **Compound Interest:** Annual and quarterly compounding across 1 to 50 years.
- **Inflation Impact:** Future cost calculations ($FV = PV(1+i)^t$) and loss-of-purchasing-power diagnostics.

### 3.4 End-to-End User Workflows (`tests/test_e2e_workflows.py`)
- **Complete User Journey:** Initial account setup, income logging, expense categorizations, budget threshold alerts, savings allocation, and dashboard KPI updates.
- **Exact Dataset Verification:** Multi-step transactions match deterministic balance totals without a single paise discrepancy.

### 3.5 Financial Services & Health Scoring (`tests/test_financial_service.py`)
- **Ledger Aggregations:** Income, expense, net savings, and cash balances computed from SQLite tables.
- **Category Spending Overview:** Correct aggregation per category across calendar months.
- **3-Pillar Financial Health Score:** Formulated across Savings Rate (40%), Budget Discipline (35%), and Emergency Runway (25%).

### 3.6 Security, Integrity & Input Validation (`tests/test_security_and_integrity.py`)
- **Clean Profile Baseline:** Ensures brand-new, empty profiles initialize strictly to **Score 0 ("Getting Started")** rather than arbitrary values.
- **Input Sanitization:** Tests boundary conditions for negative amounts, zero amounts, invalid dates, and SQL injection strings.
- **Session Protection:** Enforces HTTP-only session cookies and file upload quotas (5MB limit).
- **Air-Gap Verification:** Confirms zero external network connections during operations.

### 3.7 Username Authentication & Multi-Profile System (`tests/test_username_auth.py`)
- **User Registration:** Creates new username with password and default currency symbol.
- **Duplicate Prevention:** Case-insensitive rejection of duplicate usernames.
- **Password Verification:** Verifies Werkzeug password hash matching and rejection of invalid passwords.
- **Multi-Tenant Data Isolation:** Verifies that transactions and accounts created by Profile A are completely invisible to Profile B.

---

## 4. Financial Calculation Testing (The 16 Core Scenarios)

| Test Case ID | Test Scenario | Expected System Behaviour | Automated Test Coverage |
| :--- | :--- | :--- | :--- |
| **FIN-01** | **Income Creation** | Increases net balance and account cash by exact amount in paise. | `test_accounts.py`, `test_financial_service.py` |
| **FIN-02** | **Expense Creation** | Decreases net balance and updates category month-to-date spent. | `test_accounts.py`, `test_financial_service.py` |
| **FIN-03** | **Expense Deletion** | Reverses ledger deduction and restores exact pre-transaction balance. | `test_api.py` |
| **FIN-04** | **Refund Handling** | Reduces category spent and increments cash balance. | `test_financial_service.py` |
| **FIN-05** | **Account Transfers** | Transfers funds between source and destination accounts atomically. | `test_accounts.py` |
| **FIN-06** | **Opening Balances** | Seed account initializes starting liquid reserves accurately. | `test_accounts.py` |
| **FIN-07** | **Monthly Budget Math**| Detects threshold transitions (Normal $<85\%$, Warning $85\%-100\%$, Exceeded $>100\%$). | `test_financial_service.py`, `test_api.py` |
| **FIN-08** | **Savings Contributions**| Deposits increment saved funds; progress bar clamps cleanly at $100\%$. | `test_api.py`, `test_e2e_workflows.py` |
| **FIN-09** | **Savings Withdrawals**| Withdraws saved capital back into liquid cash with overdraft guard. | `test_api.py` |
| **FIN-10** | **Recurring Obligations**| Schedules upcoming cashflow events and advances dates by frequency. | `test_api.py` |
| **FIN-11** | **Credit Repayments** | Expenses on credit cards increase liability; payments reduce liability. | `test_accounts.py` |
| **FIN-12** | **Multiple Profiles** | Profile A data is 100% isolated from Profile B in queries. | `test_username_auth.py` |
| **FIN-13** | **Zero & Negative Amts**| Prohibits zero or negative transaction amounts via CHECK constraints. | `test_security_and_integrity.py` |
| **FIN-14** | **Very Large Amounts** | Stores large numbers (e.g. ₹100 Crores) in 64-bit integer without overflow. | `test_calculators.py` |
| **FIN-15** | **Month Boundaries** | Categorizes spending cleanly by `YYYY-MM` month bounds. | `test_financial_service.py` |
| **FIN-16** | **Leap Years** | Correctly validates calendar dates across leap and non-leap years. | `test_security_and_integrity.py` |

---

## 5. Release Gatekeeping Checklist

All acceptance criteria are verified for the current stable release:

- [x] **100% Automated Tests Passed:** All 50 tests pass (`python3 -m unittest discover -s tests`).
- [x] **100% Air-Gap Verified:** Zero external CDN requests; bundled Tailwind runtime and Chart.js local assets verified.
- [x] **Zero Floating-Point Drift:** All financial columns in SQLite schema enforce integer paise (`amount_paise INTEGER`).
- [x] **Multi-Account Engine Operational:** 6 account types tested across Asset vs Liability mathematical models.
- [x] **Authentication & Isolation Operational:** Password hashing and profile tenant separation verified.
- [x] **UI Fidelity Preserved:** Layout and visual design match `sample_ui/MoneyTrack Financial Planner(DEMO).html`.
- [x] **Security Hardened:** Parameterized SQL queries, strict session cookies, and 5MB payload upload quotas.