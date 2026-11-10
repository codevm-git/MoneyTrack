import os
import sys
import sqlite3
import json

# Ensure vendor directory is in sys.path
vendor_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'vendor')
if os.path.isdir(vendor_dir) and vendor_dir not in sys.path:
    sys.path.insert(0, vendor_dir)

from werkzeug.security import generate_password_hash

DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'data', 'moneytrack.db')
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'schema.sql')

def get_db_path(custom_path=None):
    if custom_path:
        return custom_path
    env_path = os.environ.get('MONEYTRACK_DB_PATH')
    if env_path:
        return env_path
    os.makedirs(os.path.dirname(DEFAULT_DB_PATH), exist_ok=True)
    return DEFAULT_DB_PATH

def get_db_connection(db_path=None):
    """Returns an isolated SQLite connection with foreign keys enabled and Row factory."""
    path = get_db_path(db_path)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    conn = sqlite3.connect(path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn

def init_db(db_path=None):
    """Executes schema.sql and populates default reference seed data if empty."""
    conn = get_db_connection(db_path)
    with conn:
        with open(SCHEMA_PATH, 'r', encoding='utf-8') as f:
            conn.executescript(f.read())
        
        # Check if transactions table needs account_id column migration
        tx_cols = [c[1] for c in conn.execute("PRAGMA table_info(transactions);").fetchall()]
        if 'account_id' not in tx_cols:
            conn.execute("ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;")
        if 'destination_account_id' not in tx_cols:
            conn.execute("ALTER TABLE transactions ADD COLUMN destination_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;")

        # Check if savings_goals needs columns migration
        goal_cols = [c[1] for c in conn.execute("PRAGMA table_info(savings_goals);").fetchall()]
        if 'wallet_account_id' not in goal_cols:
            conn.execute("ALTER TABLE savings_goals ADD COLUMN wallet_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;")
        if 'funding_account_id' not in goal_cols:
            conn.execute("ALTER TABLE savings_goals ADD COLUMN funding_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;")
        if 'description' not in goal_cols:
            conn.execute("ALTER TABLE savings_goals ADD COLUMN description TEXT;")

        # Check if accounts table needs savings_goal_id column migration
        acc_cols = [c[1] for c in conn.execute("PRAGMA table_info(accounts);").fetchall()]
        if 'savings_goal_id' not in acc_cols:
            conn.execute("ALTER TABLE accounts ADD COLUMN savings_goal_id INTEGER REFERENCES savings_goals(id) ON DELETE SET NULL;")

        # Check if user_profiles table needs password_hash column migration
        user_cols = [c[1] for c in conn.execute("PRAGMA table_info(user_profiles);").fetchall()]
        if 'password_hash' not in user_cols:
            conn.execute("ALTER TABLE user_profiles ADD COLUMN password_hash TEXT;")

        # Ensure any profile without password_hash has default hash
        conn.execute("UPDATE user_profiles SET password_hash = ? WHERE password_hash IS NULL;", (generate_password_hash('password123'),))

        cursor = conn.cursor()
        # Seed shared catalog data (categories, lessons, quizzes, achievements)
        seed_catalog_data(cursor)

        # Check whether this is a test database or default production database
        actual_path = os.path.abspath(get_db_path(db_path))
        default_path = os.path.abspath(DEFAULT_DB_PATH)
        is_test = (actual_path != default_path) or bool(os.environ.get('MONEYTRACK_TESTING'))

        if is_test:
            cursor.execute("SELECT COUNT(*) FROM user_profiles;")
            if cursor.fetchone()[0] == 0:
                seed_initial_data(conn)
            else:
                seed_default_accounts(cursor)
    conn.close()

def seed_catalog_data(cursor):
    """Seeds categories, lessons, quizzes, and achievements catalog."""
    # 1. Categories
    categories = [
        (1, 'Food & Dining', 'expense', '#3b82f6', 'utensils'),
        (2, 'Transport', 'expense', '#8b5cf6', 'car'),
        (3, 'Shopping', 'expense', '#f43f5e', 'shopping-bag'),
        (4, 'Bills & Utilities', 'expense', '#f59e0b', 'zap'),
        (5, 'Salary', 'income', '#22c55e', 'wallet'),
        (6, 'Other', 'both', '#64748b', 'circle'),
        (7, 'Transfer', 'both', '#6366f1', 'repeat')
    ]
    cursor.executemany("INSERT OR IGNORE INTO categories (id, name, type, color, icon) VALUES (?, ?, ?, ?, ?);", categories)

def seed_default_accounts(cursor):
    """Ensures profile 1 has the default multi-account set if missing."""
    accounts = [
        (1, 1, 'Main Savings Bank', 'savings', 2000000, '#3b82f6', 'bank', 1),
        (2, 1, 'Cash in Hand', 'cash', 500000, '#22c55e', 'cash', 0),
        (3, 1, 'Credit Card (Amazon Pay)', 'credit_card', 0, '#f43f5e', 'credit_card', 0)
    ]
    cursor.executemany("""
        INSERT OR IGNORE INTO accounts (id, profile_id, name, account_type, initial_balance_paise, color, icon, is_default)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    """, accounts)

def seed_initial_data(conn):
    """Seeds the initial dataset matching the reference design exactly (used for testing)."""
    cursor = conn.cursor()
    seed_catalog_data(cursor)
    
    # 1. User Profile
    cursor.execute("""
        INSERT OR REPLACE INTO user_profiles (id, name, password_hash, currency, status) 
        VALUES (1, 'Alex Taylor', ?, '₹', 'Pro Planner');
    """, (generate_password_hash('password123'),))

    # 1.5. Accounts
    seed_default_accounts(cursor)
    
    # 3. Seed Transactions (amounts stored in paise: 1 INR = 100 paise)
    transactions = [
        (1, 1, 2, '2026-09-28', 'Dinner Outing', 1, 'expense', 'optional', 45000),
        (2, 1, 2, '2026-09-27', 'Bus Transport Pass', 2, 'expense', 'necessary', 50000),
        (3, 1, 1, '2026-09-25', 'Monthly Salary Credit', 5, 'income', 'necessary', 2500000),
        (4, 1, 1, '2026-09-20', 'Grocery Market Supplies', 1, 'expense', 'necessary', 350000),
        (5, 1, 3, '2026-09-18', 'New Running Shoes', 3, 'expense', 'optional', 460000),
        (6, 1, 1, '2026-09-15', 'Electricity Utility Bill', 4, 'expense', 'necessary', 180000)
    ]
    cursor.executemany("""
        INSERT OR REPLACE INTO transactions (id, profile_id, account_id, date, description, category_id, type, type_tag, amount_paise)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, transactions)
    
    # 4. Monthly Budgets (Current Month: 2026-09 & 2026-10)
    for m in ['2026-09', '2026-10']:
        budgets = [
            (1, 1, 800000, m), # Food: 8,000 INR
            (1, 2, 400000, m), # Transport: 4,000 INR
            (1, 3, 400000, m)  # Shopping: 4,000 INR
        ]
        cursor.executemany("""
            INSERT OR IGNORE INTO budgets (profile_id, category_id, monthly_limit_paise, month_year)
            VALUES (?, ?, ?, ?);
        """, budgets)
        
    # 5. Savings Goals
    goals = [
        (101, 1, 'New Work Laptop', 6000000, 2500000, '2027-06-30', 'active'),
        (102, 1, 'Emergency Safety Reserve', 10000000, 6500000, '2027-12-31', 'active')
    ]
    cursor.executemany("""
        INSERT OR REPLACE INTO savings_goals (id, profile_id, name, target_amount_paise, current_amount_paise, target_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?);
    """, goals)
    
    # 6. Calendar Cashflow Events
    calendar_events = [
        (1, 1, 'Salary Deposit', 2500000, 'income', '2026-10-01', 'monthly', 'scheduled'),
        (2, 1, 'Apartment Rent', 800000, 'expense', '2026-10-05', 'monthly', 'scheduled'),
        (3, 1, 'Internet Subscription', 120000, 'expense', '2026-10-12', 'monthly', 'scheduled'),
        (4, 1, 'Loan EMI', 500000, 'expense', '2026-10-20', 'monthly', 'scheduled')
    ]
    cursor.executemany("""
        INSERT OR REPLACE INTO calendar_events (id, profile_id, title, amount_paise, type, due_date, frequency, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    """, calendar_events)
    
    # 7. Lessons
    lessons = [
        (1, 'budgeting-50-30-20', 'Budgeting & The 50/30/20 Rule', 'Beginner', '5 Min Read',
         'Learn how to divide your net income into needs, wants, and savings goals effortlessly.',
         '''### What is the 50/30/20 Rule?
The 50/30/20 rule is an intuitive budgeting framework popularized by Senator Elizabeth Warren:
- **50% for Needs:** Essential expenses you cannot avoid (rent, groceries, utilities, basic transportation, minimum loan payments).
- **30% for Wants:** Lifestyle choices, entertainment, dining out, subscriptions, shopping, and hobbies.
- **20% for Savings & Debt Payoff:** Emergency fund contributions, retirement savings, and extra principal payments toward high-interest debts.

By keeping fixed needs under 50% of your net income, you maintain financial resilience even during unexpected life shocks.''', 1),
        (2, 'compound-interest', 'The Power of Compound Interest', 'Intermediate', '7 Min Read',
         'Understand exponential growth, time value of money, and how starting early builds wealth.',
         '''### Understanding Compound Interest
Albert Einstein famously called compound interest the eighth wonder of the world.
Unlike simple interest which pays a return only on your original principal, compound interest pays returns on your **accumulated interest** as well.

$$\text{Formula: } A = P(1 + r/n)^{nt}$$

Starting early is far more impactful than starting with large sums later:
- Investing ₹5,000 monthly from age 22 at 12% annual return accumulates to over ₹1.7 Crore by age 52.
- Delaying by just 10 years (starting at 32) cuts the final accumulation by more than half, even if you invest the exact same monthly contribution!''', 2),
        (3, 'emergency-funds', 'Emergency Funds & Safety Nets', 'Essential', '4 Min Read',
         'Why 3-6 months of expenses in high-liquidity accounts is vital for financial security.',
         '''### Why an Emergency Fund is Non-Negotiable
An emergency fund is money set aside specifically for life's unexpected emergencies:
- Sudden medical emergencies or hospital bills
- Urgent home or vehicle repairs
- Unplanned job transition or temporary income loss

### Best Practices:
1. **Target:** 3 to 6 months of absolute essential living expenses.
2. **Liquidity:** Keep funds in high-safety liquid instruments (savings account, sweep-in FD, or liquid mutual funds) — never in volatile equities or locked illiquid assets.
3. **Replenish immediately:** Whenever you draw from the fund, make replenishing it your number one financial priority before resuming discretionary spending.''', 3)
    ]
    cursor.executemany("""
        INSERT OR IGNORE INTO lessons (id, slug, title, difficulty, read_time, summary, content, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    """, lessons)
    
    # 8. Quizzes for each lesson
    quizzes = [
        # Lesson 1
        (1, 1, 'In the 50/30/20 rule, what percentage of your income should be allocated to essential Needs?',
         json.dumps(['20%', '30%', '50%', '70%']), 2,
         'Needs encompass 50% of your take-home pay to ensure essential living costs remain stable.'),
        (2, 1, 'Which of the following is considered an Optional Want?',
         json.dumps(['Electricity Utility Bill', 'Monthly Grocery Staples', 'Weekend Dinner Outing', 'Bus Commute Pass']), 2,
         'Dining out is a lifestyle preference (Want), whereas electricity, staples, and transit passes are essential Needs.'),
        (3, 1, 'What should the remaining 20% of your income ideally be used for?',
         json.dumps(['Impulse Shopping', 'Savings, Emergency Reserve & Debt Repayment', 'Vacations', 'Upgrading Subscriptions']), 1,
         'The 20% bucket builds wealth and creates safety through liquid savings, emergency reserves, and investing.'),
        
        # Lesson 2
        (4, 2, 'What makes compound interest significantly more powerful than simple interest over time?',
         json.dumps(['Interest is earned only on the starting amount', 'Interest earns interest continuously', 'The government guarantees the rate', 'It avoids all inflation']), 1,
         'Compound interest reinvests accumulated earnings, allowing wealth to expand exponentially rather than linearly.'),
        (5, 2, 'If you invest at a 12% annual compounding rate, roughly how many years does it take to double your money (Rule of 72)?',
         json.dumps(['12 years', '6 years', '10 years', '24 years']), 1,
         'Using the Rule of 72: 72 divided by 12% interest = approximately 6 years to double your initial capital.'),
        (6, 2, 'What factor has the single greatest impact on compound growth?',
         json.dumps(['Time (duration invested)', 'Picking risky short-term stocks', 'Frequency of bank branch visits', 'Paying high management fees']), 0,
         'Time allows the exponential curve of compounding to flourish; starting early gives interest room to multiply.'),

        # Lesson 3
        (7, 3, 'How many months of essential living expenses should a typical emergency reserve hold?',
         json.dumps(['1 month', '3 to 6 months', '12 to 24 months', 'None if you have credit cards']), 1,
         'Standard financial planning advises keeping 3 to 6 months of mandatory living costs in easily accessible liquid accounts.'),
        (8, 3, 'Where should emergency fund money be kept?',
         json.dumps(['In high-risk volatile stocks', 'In high-liquidity, capital-safe accounts', 'In illiquid real estate land', 'In cryptocurrency']), 1,
         'Emergency funds must be available immediately without capital loss, making liquid bank accounts or short-term deposits ideal.'),
        (9, 3, 'When should an emergency fund be used?',
         json.dumps(['To buy a television on holiday discount', 'For genuine unexpected medical or critical survival emergencies', 'To loan money to acquaintances', 'For vacation ticket bookings']), 1,
         'Emergency funds are strictly reserved for urgent, non-negotiable life shocks like sudden health or job disruptions.')
    ]
    cursor.executemany("""
        INSERT OR IGNORE INTO quizzes (id, lesson_id, question, options_json, correct_index, explanation)
        VALUES (?, ?, ?, ?, ?, ?);
    """, quizzes)
    
    # 9. Achievements Catalog
    achievements = [
        (1, 'first_entry', 'First Entry Recorded', 'Tracked your first financial item', 'entry'),
        (2, 'goal_setter', 'Goal Setter', 'Created a personal savings target', 'target'),
        (3, 'quiz_scholar', 'Quiz Scholar', 'Score 100% on any literacy quiz', 'award'),
        (4, 'budget_master', 'Budget Master', 'Keep optional spending under 30%', 'shield')
    ]
    cursor.executemany("""
        INSERT OR IGNORE INTO achievements (id, code, title, description, icon)
        VALUES (?, ?, ?, ?, ?);
    """, achievements)
    
    # 10. Initial User Achievements
    user_achievements = [
        (1, 1), # first_entry
        (1, 2), # goal_setter
        (1, 4)  # budget_master
    ]
    cursor.executemany("""
        INSERT OR IGNORE INTO user_achievements (profile_id, achievement_id)
        VALUES (?, ?);
    """, user_achievements)
