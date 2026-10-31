# Changelog

All notable changes to the MoneyTrack project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.1-beta] - 2026-10-31

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
