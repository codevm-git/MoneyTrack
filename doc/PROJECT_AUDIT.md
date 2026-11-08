# MoneyTrack — Comprehensive Project Inspection & Codebase Audit

**Inspection Date:** November 7, 2026  
**Auditor:** MoneyTrack Systems Architecture & Security Team  
**Scope:** Complete repository inspection, source code audit, runtime behavior analysis, offline compliance check, and architecture verification.  
**Classification:** Internal Technical Audit  
**Target Output File:** `doc/PROJECT_AUDIT.md`  

---

## 1. Project Overview

### 1.1 Project Identification
- **Project Name:** MoneyTrack
- **Full Title:** Smart Financial Literacy and Budget Planner for Public
- **Core Mission:** Provide a 100% offline, privacy-first personal financial management and education platform tailored for beginners learning personal finance.
- **Repository Location:** `/home/prajwal/College Work/PROJECT/Smart Financial Literacy and Budget Planner for Public`
- **Current Git Branch:** `master`
- **Current Git Commit / Release:** `c37a834` (`v0.2.1-beta fixed general and settings related issues`)
- **Git History Milestones:**
  - `111dd97`: `v0.0.1-alpha Demo version` (2026-10-17)
  - `cc8cd9e`: `v0.1.8-beta username system and with version display for the application` (2026-10-19)
  - `e20c373`: `v0.1.9 cleared data for fresh useage` (2026-10-19)
  - `c37a834`: `v0.2.1-beta fixed general and settings related issues` (2026-10-31)
  - `not-define` : `v0.8.1-beta Resolving with version numbering issue using git tag` (2026-11-08)

### 1.2 Inspection Summary & Ground Truth
A rigorous physical inspection and verification of the workspace was conducted across all directories, source files, and database entities. The objective was to verify the presence, integrity, and operational status of all technologies, codebases, tests, and assets.

**Key Ground Truth Findings:**
1. **The Full-Stack Backend Is Fully Implemented & Operational:** Unlike initial conceptual notes, the repository contains a complete, robust, production-grade Python/Flask backend located in the `app/` directory, entry point `run.py`, persistent SQLite database in `data/moneytrack.db`, Jinja2 templates in `templates/`, and client assets in `static/`.
2. **Automated Verification:** The automated test suite (`tests/`) comprises 7 test modules. Executing `python3 -m unittest discover -s tests` confirms **50 tests ran and 50 passed (100% pass rate)**.
3. **100% Offline Air-Gap Compliance:**
   - Bundled Python wheels/modules reside in `vendor/` and are automatically prepended to `sys.path`.
   - Client runtime libraries (`tailwind.min.js` and `chart.umd.min.js`) are bundled locally under `static/vendor/`.
   - `templates/index.html` and `templates/report.html` load strictly from `/static/vendor/` with zero remote CDN dependencies.
4. **Authoritative Visual Reference:** Both `sample_ui/MoneyTrack Financial Planner(DEMO).html` and `doc/references/moneytrack-ui-reference.html` serve as the visual reference baseline for all UI components.

---

## 2. Technology Stack & Physical Reality

### 2.1 Implemented Reality on Disk

| Technology | Implementation Layer | Source File / Location | Status / Notes |
| :--- | :--- | :--- | :--- |
| **Python 3.10+** | Backend Runtime | `run.py`, `app/` | Active. Standard WSGI local server binding to `127.0.0.1:5000`. |
| **Flask 3.x** | Web Framework | `app/__init__.py`, `app/routes/` | Active. Factory pattern (`create_app`), modular Blueprints (`api_bp`, `views_bp`). |
| **SQLite 3** | Relational Database | `app/database/connection.py`, `data/moneytrack.db` | Active. WAL mode enabled, foreign key enforcement (`PRAGMA foreign_keys = ON;`), non-destructive auto-migrations. |
| **Jinja2** | Template Engine | `templates/index.html`, `templates/report.html` | Active. Server-rendered SPA foundation and printer-ready monthly statement report. |
| **Vanilla JavaScript (ES6+)** | Frontend State & DOM | `static/js/app.js` | Active. Reactive SPA controller handling accounts, ledger, budgets, goals, quizzes, calculators, and modals. |
| **Tailwind CSS (Local)** | Local Styling Engine | `static/vendor/tailwind.min.js`, `static/css/custom.css` | Active. 100% offline bundled runtime; zero remote CDN dependencies. |
| **Chart.js 4.x (Local)** | Visualizations | `static/vendor/chart.umd.min.js` | Active. 100% offline bundled charting runtime for category spending and financial analytics. |
| **Offline Python Vendor Cache**| Air-Gap Package Cache | `vendor/` | Active. Contains all necessary pre-packaged dependencies (Flask, Werkzeug, Jinja2, etc.). |

---

## 3. Directory Structure & File Inventory

```
/home/prajwal/College Work/PROJECT/Smart Financial Literacy and Budget Planner for Public/
├── app/                                 # Flask Application Core Package
│   ├── database/
│   │   ├── connection.py                # SQLite connection manager, WAL mode, migrations & seed manager
│   │   └── schema.sql                   # 11-table relational schema with integer paise currency fields
│   ├── routes/
│   │   ├── api.py                       # REST API (auth, accounts, ledger, budgets, goals, learning, tools)
│   │   └── views.py                     # View controllers serving SPA (/) and printable statement (/report/monthly)
│   ├── services/
│   │   ├── financial_service.py         # Multi-account balances, ledger aggregation, health score algorithm
│   │   ├── calculator_service.py        # Loan EMI, compound interest, inflation, purchase affordability engines
│   │   ├── learning_service.py          # Lesson curriculum, interactive quizzes, gamified achievements
│   │   ├── backup_service.py            # Atomic JSON backup export/import and CSV statement generation
│   │   └── validators.py                # Validation routines for dates, amounts, types, and input sanitization
│   └── __init__.py                      # Application factory (create_app), secret key, and error handlers
├── data/
│   ├── moneytrack.db                    # Embedded SQLite relational database
│   └── .secret_key                      # Secure random 32-byte session secret key (0600 permissions)
├── doc/                                 # Comprehensive Documentation Suite
│   ├── AGENTS.md                        # AI Model Independence Rules
│   ├── ARCHITECTURE.md                  # System architecture, data flow, and service boundaries
│   ├── CHANGELOG.md                     # Semantic version history and release logs
│   ├── DATABASE.md                      # Relational schema DDL, ER diagrams, indexing, and migration rules
│   ├── DESIGN.md                        # Design system, color tokens, layout specifications, component patterns
│   ├── MEMORY.md                        # Living project memory and AI context anchor
│   ├── PRD.md                           # Product Requirements Document
│   ├── PROJECT_AUDIT.md                 # Physical codebase audit and ground truth inspection
│   ├── references/
│   │   └── moneytrack-ui-reference.html # Authoritative standalone visual reference copy
│   ├── RULES.md                         # Mandatory coding standards, integer paise rules, and agent constraints
│   ├── SECURITY.md                      # Privacy-first offline security and threat modeling
│   ├── TASKS.md                         # Development roadmap, completed milestone tracking, and task inventory
│   └── TESTING.md                       # Verification strategy, test matrix, and financial arithmetic standards
├── issues/                              # Internal notes (excluded from AI processing)
├── sample_ui/
│   └── MoneyTrack Financial Planner(DEMO).html # Reference prototype visual baseline
├── static/
│   ├── css/
│   │   └── custom.css                   # Custom micro-interactions, scrollbars, and keyframes
│   ├── js/
│   │   └── app.js                       # Comprehensive frontend state controller & API client
│   └── vendor/
│       ├── chart.umd.min.js             # Bundled local Chart.js library
│       └── tailwind.min.js              # Bundled local Tailwind CSS runtime
├── templates/
│   ├── index.html                       # Authoritative single-page application template
│   └── report.html                      # Printer-ready & PDF exportable monthly statement
├── tests/                               # Comprehensive Automated Test Suite (50 Tests, 100% Pass)
│   ├── test_accounts.py                 # Multi-account CRUD, asset vs liability math, cascade rules
│   ├── test_api.py                      # REST API endpoints, JSON/CSV exports, calculator contracts
│   ├── test_calculators.py              # Financial precision math (EMI, CI, Inflation)
│   ├── test_e2e_workflows.py            # Complete end-to-end user workflows and consistency
│   ├── test_financial_service.py        # Ledger totals, category budgets, health score formulation
│   ├── test_security_and_integrity.py   # Air-gap, session security, sanitization, empty DB behavior
│   └── test_username_auth.py            # User registration, password hashing, session auth, data isolation
├── vendor/                              # Bundled offline Python package distribution
├── AGENTS.md                            # Primary instructions for AI coding agents
├── README.md                            # Comprehensive user and developer guide
├── requirements.txt                     # Pip requirements specification
└── run.py                               # Application entry point script (python run.py)
```

---

## 4. Subsystem Audits

### 4.1 Database Layer (`app/database/`)
- **Engine:** SQLite 3 in WAL (`Write-Ahead Logging`) journal mode.
- **Foreign Keys:** Strictly enforced (`PRAGMA foreign_keys = ON;`).
- **Currency Unit:** Strict **integer paise** ($1\text{ INR} = 100\text{ paise}$, e.g. `amount_paise INTEGER`, `initial_balance_paise INTEGER`, `monthly_limit_paise INTEGER`).
- **Schema Inventory (11 relational tables):**
  1. `user_profiles`: User accounts, display names, password hashes, currency symbols, active state.
  2. `accounts`: Multi-account type support (`savings`, `current`, `cash`, `credit_card`, `wallet`, `investment`) with initial balance and color/icon customization.
  3. `categories`: Income and expense categorization (`Food & Dining`, `Transport`, `Shopping`, `Bills & Utilities`, `Salary`, `Other`, `Transfer`).
  4. `transactions`: Core ledger records linking `profile_id`, `account_id`, `destination_account_id`, `category_id`, `type` (`income`, `expense`, `transfer`), `type_tag` (`necessary`, `optional`, `savings`, `debt`), and `amount_paise`.
  5. `budgets`: Category spending limits per month/year (`UNIQUE(profile_id, category_id, month_year)`).
  6. `savings_goals`: Target amounts, current deposits, deadlines, status (`active`, `completed`, `archived`).
  7. `calendar_events`: Scheduled cash flow obligations, recurring frequencies (`once`, `weekly`, `monthly`, `yearly`), and statuses (`scheduled`, `paid`, `cancelled`).
  8. `lessons`: Educational curriculum modules (`slug`, `title`, `difficulty`, `read_time`, `content`).
  9. `quizzes`: Multiple-choice questions linked to lessons with options JSON, correct index, and explanations.
  10. `user_quiz_results`: Stored quiz scores, totals, and completion timestamps.
  11. `achievements` & `user_achievements`: Milestone catalog and user unlock records.

### 4.2 Multi-Account Engine & Balance Formulation
The system supports 6 account types partitioned into Assets and Liabilities:
- **Asset Accounts** (`savings`, `current`, `cash`, `wallet`, `investment`):
  $$\text{Current Balance} = \text{Initial Balance} + \sum \text{Inflows (Income)} - \sum \text{Outflows (Expenses)} + \sum \text{Inbound Transfers} - \sum \text{Outbound Transfers}$$
- **Liability Accounts** (`credit_card`):
  $$\text{Current Balance} = \text{Initial Balance} + \sum \text{Outflows (Expenses/Charges)} - \sum \text{Inflows (Payments/Credits)}$$
- **Cascade Deletion:** `FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL` ensures transaction records are never orphaned or deleted when an account is retired.

### 4.3 Security & Authentication
- **User Authentication:** Multi-profile isolation with local password protection using Werkzeug's secure password hashing (`generate_password_hash`, `check_password_hash`).
- **Session Protection:** HTTP-only cookies (`SESSION_COOKIE_HTTPONLY=True`, `SESSION_COOKIE_SAMESITE='Lax'`).
- **Secret Key:** Ephemeral or persistent 32-byte cryptographically secure random token persisted at `data/.secret_key` with strict `0600` file permissions.
- **Upload Safety:** Strict 5MB request payload limit (`MAX_CONTENT_LENGTH`) guarding against memory exhaustion.
- **Zero Cloud Network Call:** Zero telemetry, analytics, or external CDN calls.

---

## 5. Verification & Test Suite Results

Executing the automated test suite confirms all components function with deterministic precision:

```bash
$ python3 -m unittest discover -s tests
..................................................
----------------------------------------------------------------------
Ran 50 tests in 45.016s

OK
```

### Test Coverage Breakdown:
1. `tests/test_accounts.py` (8 tests): Multi-account CRUD, asset vs credit card balance math, account deletion cascade SET NULL.
2. `tests/test_api.py` (8 tests): REST API endpoints, transactions, budgets, goals, calculators, JSON/CSV exports.
3. `tests/test_calculators.py` (3 tests): Precision loan EMI, compound interest, and inflation calculators.
4. `tests/test_e2e_workflows.py` (5 tests): Full user workflows, multi-step financial consistency, goal progression.
5. `tests/test_financial_service.py` (6 tests): Ledger totals, category budgets, financial health score algorithm.
6. `tests/test_security_and_integrity.py` (12 tests): Health score 0 on empty database, session security, date validation, negative amount rejection, air-gap integrity.
7. `tests/test_username_auth.py` (8 tests): User registration, duplicate username prevention, password hashing, login, logout, and multi-user data isolation.

---

## 6. Audit Conclusion
MoneyTrack possesses a complete, verified, and operational full-stack application architecture (Python/Flask backend + SQLite relational database + Jinja2 frontend + Chart.js visualizations + 50 passing unit/integration tests). The documentation in `doc/` must accurately reflect this existing implementation rather than obsolete prototype-only assumptions.
