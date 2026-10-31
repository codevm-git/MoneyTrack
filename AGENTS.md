# AGENTS.md — AI Coding Agent Instructions

This document is the mandatory entry point for all AI coding agents, autonomous models, and developers working on **MoneyTrack — Smart Financial Literacy and Budget Planner for Public**.

The **actual source code** on disk (`app/`, `templates/`, `static/`, `data/`, `tests/`) is the ultimate authority for the existing implementation.

---

## 1. Mandatory Instructions

Before working on the project, every agent must read the appropriate documents in `doc/`:

1. **Read [`doc/MEMORY.md`] MEMORY.md):** Living context anchor, verified full-stack architecture, completed features, and active version status.
2. **Read [`doc/RULES.md`] RULES.md):** Mandatory development constraints, Python/Flask standards, integer paise rules, and AI agent rules.
3. **Read [`doc/PROJECT_AUDIT.md`] PROJECT_AUDIT.md):** Physical codebase inspection, Ground Truth findings, and test execution results.
4. **Read relevant sections of [`doc/PRD.md`] PRD.md):** Intended product behavior, user workflows, acceptance criteria, and non-advisory disclaimer.
5. **Read [`doc/ARCHITECTURE.md`] ARCHITECTURE.md):** Multi-tier system structure (`app/`), request lifecycles, service layer, and algorithm design.
6. **Read [`doc/DATABASE.md`] DATABASE.md):** SQLite configuration (`data/moneytrack.db`), 11-table schema DDL (`app/database/schema.sql`), integer paise minor units, and multi-account asset vs liability math.
7. **Read [`doc/DESIGN.md`] DESIGN.md):** Color tokens, layout grids, card styles, and component patterns before modifying any user interface elements.
8. **Read [`doc/TESTING.md`] TESTING.md):** Verification requirements, 50-test test matrix (`tests/`), and the 16 financial verification test cases (FIN-01 to FIN-16).
9. **Read [`doc/SECURITY.md`] SECURITY.md):** Air-gap defense, password hashing via Werkzeug, 5MB upload limit, session cookies, and profile authorization.
10. **Read [`doc/TASKS.md`] TASKS.md):** Master development checklist, dependency chains, and active development priorities.

---

## 2. Before Modifying Code

Every AI agent must execute these preliminary validation steps:

- **Inspect Existing Implementation:** Physically inspect the relevant source files on disk (`app/`, `templates/`, `static/`, `data/`). Never assume file contents or directory structures.
- **Understand Dependencies:** Trace import paths, database schema dependencies, and shared utility usage.
- **Identify Affected Files:** Determine the exact blast radius of changes across routes (`app/routes/`), services (`app/services/`), database (`app/database/`), and templates (`templates/`).
- **Preserve Existing UI and Functionality (Mandatory UI Reference Rule):** `sample_ui/MoneyTrack Financial Planner(DEMO).html` (and `doc/references/moneytrack-ui-reference.html`) is the authoritative visual reference. Production templates reside in `templates/index.html` and `templates/report.html`. Before creating or modifying any frontend component, inspect `doc/DESIGN.md`. Never redesign, modernize, simplify, replace, or re-interpret navigation, colors, cards, border-radius, forms, buttons, or layouts without explicit owner permission. New features must extend the existing design system. Functional improvements must never cause unintended visual changes.
- **Avoid Unnecessary Restructuring:** Do not reorganize existing folders, rename established modules, or rewrite functional components without explicit instructions.
- **Follow All Mandatory Project Rules:** Enforce integer paise ($1\text{ INR} = 100\text{ paise}$, `amount_paise INTEGER`), parameterize all SQL queries, enforce request-scoped SQLite connections, and uphold the air-gap mandate.

---

## 3. After Modifying Code

Every AI agent must complete these verification and documentation steps:

- **Run Relevant Tests:** Execute the automated test suite (`python3 -m unittest discover -s tests`). All 50 tests must pass with zero errors.
- **Check for Regressions:** Verify that existing endpoints, multi-account calculations, and UI views continue to function without errors.
- **Update [`doc/TASKS.md`] TASKS.md):** Mark completed tasks as `[x]` and document any newly unblocked dependencies.
- **Update [`doc/MEMORY.md`] MEMORY.md):** Record any significant changes to project context, completed milestones, or newly identified bugs.
- **Update Relevant Technical Documentation:** Keep `doc/ARCHITECTURE.md`, `doc/DATABASE.md`, `doc/SECURITY.md`, etc., synchronized with code changes.
- **Update [`doc/CHANGELOG.md`] CHANGELOG.md):** Document meaningful user-facing or architectural changes under Keep a Changelog conventions.

---

## 4. Restrictions

Every AI agent is strictly bound by these project constraints:

- **No Mandatory Internet Dependencies:** The application must remain **100% offline and fully functional without an internet connection**. Never introduce external CDN links (e.g., remote Tailwind CDN), external fonts, remote APIs, or cloud microservices.
- **No Cloud Databases or Cloud Authentication:** No Firebase, Supabase, PostgreSQL, AWS DynamoDB, Auth0, OAuth2, or remote identity providers. The application is strictly local and private (SQLite on localhost `127.0.0.1`).
- **No Unauthorized UI Redesign:** Never change established brand colors (`#16A34A`), dark/light theme palettes, component shapes (`rounded-2xl`), typography, or screen navigation without explicit user authorization.
- **No Unnecessary New Dependencies:** Rely on the established minimal stack (Python 3.10+, Flask 3.x, SQLite 3, Jinja2, Vanilla JavaScript ES6+, locally bundled Tailwind CSS in `static/vendor/tailwind.min.js`, Chart.js 4.x in `static/vendor/chart.umd.min.js`). Pre-packaged Python wheels reside in `vendor/`. Avoid heavy frameworks, bloated npm packages, or machine learning libraries.
- **No Invented Implementation Details:** Never guess database table structures, route signatures, or financial math. Always refer to the verified technical documentation in `doc/` and the actual source code in `app/`.

---

## 5. AI Independence and Context Management

- Never depend on previous AI conversations or chat histories.
- Never assume another AI model's decisions or implementations are correct.
- Independently inspect and verify existing code before continuing previous work.
- Treat project documentation and actual source code as the shared knowledge source.
- Record important architectural and implementation decisions in documentation.
- Keep documentation understandable to any AI coding agent, regardless of model or IDE.
- Never introduce dependencies on a specific AI model, provider, or coding agent.
- Update `doc/MEMORY.md` with significant project progress, completed work, known bugs, and pending tasks.

---

## 6. Additional Development Requirements

- Before implementation, explain the planned changes, affected files, and potential side effects.
- Make targeted changes instead of unnecessarily rewriting existing files.
- Preserve all working features and existing user data.
- Never claim tests passed unless they were actually executed.
- Report completed changes, test results, and remaining issues.
- If documentation conflicts with actual implementation, investigate and report the discrepancy instead of blindly following either.
- Ask the owner before making changes that require authorization or could significantly affect existing functionality.




## 7. Ai Agent Prompt

I am working on "MoneyTrack — Smart Financial Literacy and Budget Planner for Public".
You must operate with zero prior conversation memory and adhere strictly to the project files:

1. READ FIRST:
   - Read AGENTS.md, doc/MEMORY.md, doc/RULES.md, and doc/ARCHITECTURE.md.
   - The authoritative visual reference is sample_ui/MoneyTrack Financial Planner(DEMO).html.
   - The database schema is defined in doc/DATABASE.md (11 SQLite tables).

2. NON-NEGOTIABLE CORE CONSTRAINTS:
   - 100% Offline Air-Gap: Zero external CDNs, zero cloud APIs, zero remote dependencies.
   - Integer Paise Standard: All monetary amounts must be stored and computed in integer paise (1 INR = 100 paise, amount_paise INTEGER). Never use float for money.
   - Multi-Account Balance Math:
     * Asset Accounts = Initial Balance + Inflows - Outflows + Transfers In - Transfers Out
     * Credit Cards (Liabilities) = Initial Balance + Charges (Expenses) - Payments (Inflows)
   - Preserve UI: Match the exact layout, colors (#16A34A), cards (rounded-2xl), and dark/light themes from the UI reference.
   - Security: Local user profiles with password hashing (Werkzeug scrypt/pbkdf2), session cookies, and 5MB upload limit.

3. VERIFICATION:
   - Execute: python3 -m unittest discover -s tests
   - All 50 tests must pass with 0 failures before considering any task complete.
