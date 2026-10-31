# AI Model Independence Rules

These rules apply to every AI model, autonomous agent, and developer working on **MoneyTrack — Smart Financial Literacy and Budget Planner for Public**.

The **actual source code** on disk (`app/`, `templates/`, `static/`, `data/`, `tests/`) is the ultimate authority for the implementation.

---

## 1. Read Before Editing
- Read root [`AGENTS.md`](file:///home/prajwal/College%20Work/PROJECT/Smart%20Financial%20Literacy%20and%20Budget%20Planner%20for%20Public/AGENTS.md) first.
- Read [`doc/MEMORY.md`](file:///home/prajwal/College%20Work/PROJECT/Smart%20Financial%20Literacy%20and%20Budget%20Planner%20for%20Public/doc/MEMORY.md), [`doc/RULES.md`](file:///home/prajwal/College%20Work/PROJECT/Smart%20Financial%20Literacy%20and%20Budget%20Planner%20for%20Public/doc/RULES.md), and [`doc/PROJECT_AUDIT.md`](file:///home/prajwal/College%20Work/PROJECT/Smart%20Financial%20Literacy%20and%20Budget%20Planner%20for%20Public/doc/PROJECT_AUDIT.md) before modifying code.
- Inspect the physical source code on disk using file view tools before proposing changes.
- Never assume previous AI conversations or chat histories are available or accurate.

---

## 2. Preserve Existing Architecture
- Follow [`doc/ARCHITECTURE.md`](file:///home/prajwal/College%20Work/PROJECT/Smart%20Financial%20Literacy%20and%20Budget%20Planner%20for%20Public/doc/ARCHITECTURE.md).
- The application is a full-stack Flask application located in `app/`, with routes in `app/routes/`, services in `app/services/`, database manager in `app/database/`, templates in `templates/`, and assets in `static/`.
- Do not introduce a new architecture or folder restructuring without explicit owner permission.
- Reuse existing services (`FinancialService`, `CalculatorService`, `LearningService`, `BackupService`) and database functions.
- Avoid duplicate implementations across routes or services.

---

## 3. Preserve Existing UI & Reference
- Follow [`doc/DESIGN.md`](file:///home/prajwal/College%20Work/PROJECT/Smart%20Financial%20Literacy%20and%20Budget%20Planner%20for%20Public/doc/DESIGN.md).
- The owner-provided HTML sample (`sample_ui/MoneyTrack Financial Planner(DEMO).html` and `doc/references/moneytrack-ui-reference.html`) is the authoritative visual reference.
- Production templates reside in `templates/index.html` (SPA) and `templates/report.html` (printable monthly statement).
- Never redesign, modernize, simplify, replace, or reinterpret colors (`#16A34A`), cards (`rounded-2xl`), typography, or layouts without permission.

---

## 4. Protect Existing Functionality & 100% Offline Air-Gap
- Do not remove or break existing working features (Multi-accounts, Auth, Ledger, Budgets, Goals, Calendar, Calculators, Quizzes, Reports).
- Do not overwrite existing code unnecessarily.
- Do not introduce external CDN dependencies (e.g. remote Tailwind CDN) or remote APIs.
- Maintain 100% offline air-gap functionality using locally bundled assets in `static/vendor/` and offline Python wheels in `vendor/`.

---

## 5. Database Safety & Integer Paise Standard
- Read [`doc/DATABASE.md`](file:///home/prajwal/College%20Work/PROJECT/Smart%20Financial%20Literacy%20and%20Budget%20Planner%20for%20Public/doc/DATABASE.md) before database changes.
- Never delete existing user data.
- Use non-destructive migrations (`ALTER TABLE ADD COLUMN` if not exists).
- All monetary values must be stored and computed in **integer paise** ($1\text{ INR} = 100\text{ paise}$, `amount_paise INTEGER`). Never use floating-point types for currency.
- Parameterize 100% of SQL queries (`?` placeholders).

---

## 6. Development Workflow
Before making changes:
1. Understand the requested task and scope.
2. Inspect related physical files on disk.
3. Identify possible side effects and affected dependencies.
4. Explain the planned changes clearly.

After making changes:
1. Run automated test suite: `python3 -m unittest discover -s tests`.
2. Verify all 50 tests pass with zero errors.
3. Verify existing endpoints and UI functionality.
4. Update [`doc/TASKS.md`](file:///home/prajwal/College%20Work/PROJECT/Smart%20Financial%20Literacy%20and%20Budget%20Planner%20for%20Public/doc/TASKS.md), [`doc/MEMORY.md`](file:///home/prajwal/College%20Work/PROJECT/Smart%20Financial%20Literacy%20and%20Budget%20Planner%20for%20Public/doc/MEMORY.md), and [`doc/CHANGELOG.md`](file:///home/prajwal/College%20Work/PROJECT/Smart%20Financial%20Literacy%20and%20Budget%20Planner%20for%20Public/doc/CHANGELOG.md).

---

## 7. AI Independence
- Never depend on previous AI conversation history.
- Never assume another AI model's decisions or audit claims are correct without physically checking files.
- Treat project documentation and actual source code on disk as the shared authority.
- Record important architectural decisions in documentation.
- Keep documentation clean, clear, and understandable to any AI coding agent or human engineer.
