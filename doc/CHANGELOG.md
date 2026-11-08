# Changelog

All notable changes to the MoneyTrack project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.8.3-beta] - 2026-11-08

### Added
- **Dedicated Savings Wallets for Savings Goals:**
  - Automatic creation of dedicated savings wallets in `accounts` (`account_type = 'wallet'`, `savings_goal_id`, `color = '#10b981'`) upon Savings Goal creation.
  - Linked goal and wallet tracking ensuring target progress is dynamically computed from actual wallet balances without duplicate counting or cache drift.
  - Visible dedicated savings goal wallets in the Accounts & Wallets section featuring distinctive `🎯 Goal:` badges and quick deposit/withdraw action triggers.
- **Flexible User-Controlled Deposits & Withdrawals:**
  - Replaced static initial deposit logic with flexible deposit (`Add Money`) and withdrawal controls.
  - Real-time balance validations ensuring deposits do not exceed available source balance and withdrawals do not exceed accumulated savings.
  - Atomic database transactions maintaining strict consistency during all money movements.
- **Non-Destructive Goal Deletion & Safe Fund Return:**
  - Deleting a savings goal verifies remaining savings balance and returns funds safely to the original funding account or user-selected destination account.
  - Prevents accidental loss of money; deletes the dedicated savings wallet only after funds are preserved.
- **Full Ledger & Transaction Integration:**
  - All savings goal deposits and withdrawals are recorded as `transfer` transactions (`type = 'transfer'`, `type_tag = 'savings'`).
  - Distinguishable display in transaction history (`Source Account → Dedicated Savings Wallet` on deposit, and `Dedicated Savings Wallet → Destination Account` on withdrawal).
  - Complete isolation from regular income and expenses in financial summaries.
- **Custom Application GUI Modals (Zero Browser-Native Popups):**
  - Implemented custom application-styled modals: `#add-goal-money-modal`, `#withdraw-goal-money-modal`, `#edit-goal-modal`, and `#delete-goal-modal`.
  - Replaced all browser-native `prompt()`, `alert()`, and `confirm()` dialogs across the Savings Goals interface.
  - Integrated with the customized toast notification stack (`showToast`).
- **Dedicated Automated Test Suite:**
  - Created `tests/test_savings_goals_wallets.py` with 8 comprehensive unit tests covering all wallet creation, deposit, withdrawal, deletion fund return, isolation, and REST API flows (totaling 73/73 tests passing).

---

## [0.8.2-beta] - 2026-11-08

### Added
- **Account & Wallet Creation Guard:**
  - Added strict guard preventing creation of Income or Expense transactions when no account or wallet exists.
  - Implemented warning banner and modal (`#account-required-modal`) directing user to create an account first.
  - Added server-side validation in `app/routes/api.py` returning HTTP 400 with a clear message if an account is missing.
- **Account & Wallet-to-Wallet Money Transfers:**
  - Added transfer feature supporting all combinations: Account $\rightarrow$ Account, Account $\rightarrow$ Wallet, Wallet $\rightarrow$ Account, Wallet $\rightarrow$ Wallet.
  - Integrated transfer options in the Accounts & Wallets section header and individual account cards.
  - Atomic transfer execution debiting source and crediting destination within an isolated SQLite transaction.
  - Strict validation preventing transfers between identical accounts, zero/negative transfers, or transfers exceeding available balance.
- **Transfers in Transaction History & Dedicated Filter:**
  - Added "Transfers" filter tab (`#tab-btn-transfer`) in the transaction history table.
  - Contextual transfer display showing "Transfer In" vs "Transfer Out" when viewing an account, or "Source $\rightarrow$ Destination" in All Accounts view.
  - Ledger isolation ensuring transfers do not pollute income or expense aggregations.
- **Complete Custom GUI Transaction Editor Modal:**
  - Replaced browser `prompt()` with a dedicated `#edit-tx-modal` custom GUI matching the application design system.
  - Allows editing Amount, Description, Category, Account, Destination Account (for transfers), Date, and Necessity Classification (for expenses).
  - Atomic reversal of previous balance impacts and re-application of updated amounts across accounts.
- **Dedicated Test Suite:**
  - Created `tests/test_money_and_transactions.py` with 8 comprehensive unit tests covering all transfer, validation, opening balance, and edit flows (totaling 65 passing tests).

### Fixed
- Fixed runtime `TypeError` in `FinancialService.update_transaction()` by supporting both `tx_id` and `transaction_id` keyword arguments.
- Fixed Credit Card opening balance handling in `get_accounts()` and `get_ledger_totals()` to properly track initial liability balance.
- Completely removed necessity classification radio buttons from the Add Income interface and creation flow while retaining it for expenses.
- Fixed "+ New Account" button UI alignment, duplicate label, and added quick transfer actions.
- Reviewed and polished all form placeholders in Add Income and Add Expense modals with contextual, user-friendly hints.

---

## [0.8.1-beta] - 2026-11-08

## Release And Correction of Version History

- Resolved with developing version history numbering 
- Getting ready for 0.9.0-rc.1 phase 

## [0.2.2-beta] - 2026-11-08

### Added
- **Account-Wise & Wallet-Wise Dashboard Analytics:**
  - Individual financial data generation for every existing account and wallet (Total Income, Total Expenses, Current Balance, Inflows, Outflows, Net Savings).
  - Clear visual identification of Primary Account/Wallet (`PRIMARY` badge).
  - Interactive Account Switcher pills and All Accounts & Wallets Summary Grid.
  - Dedicated account-wise Financial Health Scores and category spending distributions.
- **Dedicated Category Budget Limits Manager Modal (`#budget-manager-modal`):**
  - Full creation, updating, and deletion of category budget limits.
  - Calculation and display of Budget Limit, Amount Spent, Remaining Budget, and Spending Percentage Progress based on actual transaction records.
  - Real-time updates when transactions or budget limits are modified.
- **Dynamic Spending Insights Engine:**
  - Natural English month-over-month comparisons (e.g. comparing current month vs previous month).
  - Dynamic detection of top spending categories, spending surges/drops, and unusual large purchases without static or dummy strings.
- **Real-Time Financial Alerts & Warning System:**
  - Real database evaluation for exceeded budgets (>100%), budgets at capacity (100%), budget threshold warnings (>=85%), overdrawn and low-balance accounts, credit card payments due, and scheduled calendar bills within 7 days.
  - Deduplication of alerts and user dismissal controls.
- **Live System Diagnostics Engine & Modal:**
  - 5-point data integrity check evaluating ledger math consistency, transaction/category foreign key references, budget calculation health, primary account configuration, and SQLite WAL/FK PRAGMA engine integrity.
- **Real-Time Notification Popups & Tab Background Behavior:**
  - Customized toast popup cards with status colors (Success, Warning, Danger/Error, Info/Diagnostics).
  - Browser Web Notification API support alerting users even when switching tabs or running in the background.
  - Automatic `document.title` indicator when alerts occur while the tab is hidden, resetting upon tab return.
- **Dedicated Automated Test Suite:**
  - Created `tests/test_dashboard_analytics_and_alerts.py` containing 7 comprehensive unit tests (all 57 tests passing in test suite).

### Fixed
- Fixed Category Budget Limits "Manage" button navigation, now opening the dedicated Category Budget Manager rather than navigating to Money & Transactions.
- Fixed overflowing and overlapping text labels in Category Spending Breakdown donut chart by moving category labels cleanly below the chart with word-wrapping.

### Added
- **Monthly Financial Statement Report (`/report/monthly`):** Printer-ready and PDF-exportable comprehensive statement showing net worth, total assets, total liabilities, category breakdowns, budgets, goals, and complete ledger records.
- **Enhanced Settings & Security Modal:** Password change capability with current password verification and persistent profile updates.
- **Dynamic Diagnostic Alerts:** Real-time dashboard warnings for exceeded budgets ($>100\%$), approaching budget thresholds ($\ge 85\%$), upcoming scheduled calendar obligations within 7 days, and negative account balances.

### Changed
- Refactored `FinancialService.calculate_health_score()` to enforce brand-new profile initialization strictly at Score 0 ("Getting Started").
- Optimized multi-account balance calculation engine distinguishing Asset vs Liability (Credit Card) accounts.
- Updated `templates/index.html` and `static/js/app.js` with active account selection badges and filter pills.

### Fixed
- Fixed profile password migration and empty password hash fallback.
- Fixed non-destructive schema migrations for `account_id` and `destination_account_id` in `transactions`.

---

## [0.1.9] - 2026-10-19

### Changed
- Cleared sample user transactional data to establish a clean, production-ready baseline for new users.
- Maintained core catalog seeds (categories, lessons, quizzes, achievements) while ensuring fresh profile sandboxes initialize cleanly.

---

## [0.1.8-beta] - 2026-10-19

### Added
- **Multi-User Profile & Username Authentication System:**
  - Local user profile management with password hashing via Werkzeug (`generate_password_hash`, `check_password_hash`).
  - Session-based authentication endpoints: `/api/auth/users`, `/api/auth/current`, `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`, and `/api/auth/users/<id>` (DELETE).
  - Strict profile data isolation: all transactions, budgets, goals, and accounts scoped by `profile_id`.
- **Application Version Display:** Visible version badge (`v0.1.8-beta` / `v0.2.1-beta`) displayed in the navigation sidebar and settings panel.
- **Dedicated Authentication Test Suite:** Created `tests/test_username_auth.py` verifying registration, duplicate username rejection, login, and data isolation.

---

## [0.0.1-alpha] - 2026-10-17

### Added
- **Full-Stack Application Architecture:**
  - Application factory in `app/__init__.py` with session cookie security (`SESSION_COOKIE_HTTPONLY=True`, `SESSION_COOKIE_SAMESITE='Lax'`) and 5MB upload limits.
  - Entry point `run.py` launching local server on `http://127.0.0.1:5000`.
  - Embedded SQLite database engine with Write-Ahead Logging (`WAL`), foreign key enforcement (`PRAGMA foreign_keys = ON;`), and non-destructive migrations.
- **Relational Database Schema (`app/database/schema.sql`):**
  - Integer paise currency storage standard ($₹1 = 100\text{ paise}$, `amount_paise INTEGER`).
  - 11 core relational tables: `user_profiles`, `accounts`, `categories`, `transactions`, `budgets`, `savings_goals`, `calendar_events`, `lessons`, `quizzes`, `user_quiz_results`, `achievements`, and `user_achievements`.
- **Multi-Account Engine:**
  - 6 account types (`savings`, `current`, `cash`, `credit_card`, `wallet`, `investment`).
  - Distinct asset balance vs credit card debt calculations.
  - Safe cascade deletion with `ON DELETE SET NULL`.
- **Financial Services & Calculators:**
  - Precision loan EMI amortization (`calculate_emi`).
  - Compound interest projections (`calculate_compound_interest`).
  - Inflation & purchasing power erosion engine (`calculate_inflation`).
  - Pre-purchase affordability evaluator ("Can I Afford This?").
  - 3-pillar financial health score engine (Savings Rate 40%, Budget Discipline 35%, Emergency Runway 25%).
- **Financial Literacy Curriculum & Quizzes:**
  - Offline lessons covering 50/30/20 Budgeting, Debt Management, and Compound Growth vs Inflation.
  - Interactive quizzes with instant grading, correct answer reveals, and detailed explanations.
  - Gamified achievement badges unlocking on milestones.
- **Offline Air-Gap Guarantee:**
  - Bundled offline Python package distribution in `vendor/` included in `sys.path`.
  - Locally bundled `static/vendor/tailwind.min.js` and `static/vendor/chart.umd.min.js`.
  - Zero external CDN links or cloud APIs.
- **Automated Verification:**
  - Comprehensive unit, integration, and E2E test suites in `tests/` verifying all math and services.

---

## [0.0.1-prototype] - 2026-10-31

### Added
- Initial standalone HTML prototype (`sample_ui/MoneyTrack Financial Planner(DEMO).html` and `doc/references/moneytrack-ui-reference.html`) establishing visual identity, 9 core views, color tokens, and layout patterns.
