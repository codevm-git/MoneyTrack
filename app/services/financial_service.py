from decimal import Decimal, ROUND_HALF_UP
import datetime
from app.database.connection import get_db_connection
from app.services.validators import validate_date, validate_amount, sanitize_text

def paise_to_rupees(paise):
    """Converts integer paise to integer or 2-decimal rupees."""
    if paise is None:
        return 0
    return int(paise // 100) if paise % 100 == 0 else round(float(paise) / 100.0, 2)

def rupees_to_paise(rupees):
    """Accurately converts monetary rupees to integer paise without floating point drift."""
    if rupees is None:
        return 0
    d = Decimal(str(rupees))
    return int((d * Decimal('100')).quantize(Decimal('1'), rounding=ROUND_HALF_UP))

class FinancialService:
    def __init__(self, db_path=None):
        self.db_path = db_path

    def _get_conn(self):
        return get_db_connection(self.db_path)

    # --- User Profile Management (Multi-Profile Support) ---
    def list_user_profiles(self):
        conn = self._get_conn()
        try:
            rows = conn.execute("SELECT id, name, currency, status, created_at FROM user_profiles ORDER BY id ASC;").fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def get_user_profile(self, profile_id=1):
        conn = self._get_conn()
        try:
            row = conn.execute("SELECT * FROM user_profiles WHERE id = ?;", (profile_id,)).fetchone()
            if row:
                return dict(row)
            return {'id': profile_id, 'name': 'User', 'currency': '₹', 'status': 'Pro Planner'}
        finally:
            conn.close()

    def create_user_profile(self, name, currency='₹'):
        name = sanitize_text(name, "Profile Name", min_len=1, max_len=50)
        currency = sanitize_text(currency, "Currency Symbol", min_len=1, max_len=5)
        conn = self._get_conn()
        try:
            with conn:
                cur = conn.execute("""
                    INSERT INTO user_profiles (name, currency, status)
                    VALUES (?, ?, 'Pro Planner');
                """, (name, currency))
                return cur.lastrowid
        finally:
            conn.close()

    def update_user_profile(self, profile_id=1, name=None, currency=None):
        conn = self._get_conn()
        try:
            with conn:
                if name:
                    name = sanitize_text(name, "User Full Name", min_len=1, max_len=60)
                if currency:
                    currency = sanitize_text(currency, "Currency Symbol", min_len=1, max_len=5)

                if name and currency:
                    conn.execute("UPDATE user_profiles SET name = ?, currency = ? WHERE id = ?;", (name, currency, profile_id))
                elif name:
                    conn.execute("UPDATE user_profiles SET name = ? WHERE id = ?;", (name, profile_id))
                elif currency:
                    conn.execute("UPDATE user_profiles SET currency = ? WHERE id = ?;", (currency, profile_id))
            return self.get_user_profile(profile_id)
        finally:
            conn.close()

    def delete_user_profile(self, profile_id):
        """
        Deletes user profile. Foreign keys cascade delete all associated
        accounts, transactions, budgets, goals, calendar events, quiz results, and achievements.
        """
        conn = self._get_conn()
        try:
            with conn:
                conn.execute("DELETE FROM user_profiles WHERE id = ?;", (profile_id,))
            return True
        finally:
            conn.close()

    ACCOUNT_TYPE_META = {
        'savings': {'label': 'Savings Bank', 'icon': 'bank', 'badge_class': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'},
        'current': {'label': 'Current / Checking', 'icon': 'building', 'badge_class': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300'},
        'cash': {'label': 'Cash / Wallet', 'icon': 'cash', 'badge_class': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'},
        'credit_card': {'label': 'Credit Card', 'icon': 'credit_card', 'badge_class': 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'},
        'wallet': {'label': 'Digital Wallet / UPI', 'icon': 'smartphone', 'badge_class': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'},
        'investment': {'label': 'Investment / Demat', 'icon': 'trending-up', 'badge_class': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}
    }

    # --- Financial Account Management (Multi-Account Support with Account Types) ---
    def get_accounts(self, profile_id=1):
        conn = self._get_conn()
        try:
            rows = conn.execute("""
                SELECT id, profile_id, name, account_type, initial_balance_paise, color, icon, is_default, created_at
                FROM accounts
                WHERE profile_id = ?
                ORDER BY is_default DESC, id ASC;
            """, (profile_id,)).fetchall()

            accounts = []
            for r in rows:
                acc_id = r['id']
                acc_type = r['account_type']
                initial_paise = r['initial_balance_paise'] or 0

                # Calculate transactions affecting this account
                inflow_row = conn.execute(
                    "SELECT SUM(amount_paise) as total FROM transactions WHERE profile_id = ? AND account_id = ? AND type = 'income';",
                    (profile_id, acc_id)
                ).fetchone()
                inflow_paise = inflow_row['total'] or 0 if inflow_row else 0

                outflow_row = conn.execute(
                    "SELECT SUM(amount_paise) as total FROM transactions WHERE profile_id = ? AND account_id = ? AND type = 'expense';",
                    (profile_id, acc_id)
                ).fetchone()
                outflow_paise = outflow_row['total'] or 0 if outflow_row else 0

                if acc_type == 'credit_card':
                    # For credit cards, balance is net liability (expenses charged minus payments/income)
                    current_paise = outflow_paise - inflow_paise
                else:
                    current_paise = initial_paise + inflow_paise - outflow_paise

                meta = self.ACCOUNT_TYPE_META.get(acc_type, {'label': acc_type.capitalize(), 'icon': 'bank', 'badge_class': 'bg-slate-100 text-slate-700'})

                accounts.append({
                    'id': str(acc_id),
                    'name': r['name'],
                    'account_type': acc_type,
                    'type_label': meta['label'],
                    'badge_class': meta['badge_class'],
                    'color': r['color'],
                    'icon': r['icon'],
                    'is_default': bool(r['is_default']),
                    'initial_balance': paise_to_rupees(initial_paise),
                    'current_balance': paise_to_rupees(current_paise),
                    'current_balance_paise': current_paise,
                    'total_inflow': paise_to_rupees(inflow_paise),
                    'total_outflow': paise_to_rupees(outflow_paise)
                })
            return accounts
        finally:
            conn.close()

    def add_account(self, profile_id, name, account_type, initial_balance=0, color=None, icon=None, is_default=False):
        from app.services.validators import validate_account_type
        name = sanitize_text(name, "Account Name", min_len=1, max_len=80)
        account_type = validate_account_type(account_type)
        initial_balance = validate_amount(initial_balance, "Initial Balance", min_val=0.0) if initial_balance else 0.0

        if not color:
            color_map = {
                'savings': '#3b82f6',
                'current': '#06b6d4',
                'cash': '#22c55e',
                'credit_card': '#f43f5e',
                'wallet': '#8b5cf6',
                'investment': '#f59e0b'
            }
            color = color_map.get(account_type, '#3b82f6')

        if not icon:
            icon = self.ACCOUNT_TYPE_META.get(account_type, {}).get('icon', 'bank')

        conn = self._get_conn()
        try:
            with conn:
                if is_default:
                    conn.execute("UPDATE accounts SET is_default = 0 WHERE profile_id = ?;", (profile_id,))
                
                initial_paise = rupees_to_paise(initial_balance)
                cur = conn.execute("""
                    INSERT INTO accounts (profile_id, name, account_type, initial_balance_paise, color, icon, is_default)
                    VALUES (?, ?, ?, ?, ?, ?, ?);
                """, (profile_id, name, account_type, initial_paise, color, icon, 1 if is_default else 0))
                return cur.lastrowid
        finally:
            conn.close()

    def update_account(self, profile_id, account_id, name=None, account_type=None, color=None, icon=None, initial_balance=None, is_default=None):
        from app.services.validators import validate_account_type
        conn = self._get_conn()
        try:
            with conn:
                existing = conn.execute("SELECT * FROM accounts WHERE id = ? AND profile_id = ?;", (account_id, profile_id)).fetchone()
                if not existing:
                    raise ValueError("Account not found.")

                new_name = sanitize_text(name, "Account Name", 1, 80) if name else existing['name']
                new_type = validate_account_type(account_type) if account_type else existing['account_type']
                new_color = color if color else existing['color']
                new_icon = icon if icon else existing['icon']
                new_initial_paise = rupees_to_paise(validate_amount(initial_balance, "Initial Balance", min_val=0.0)) if initial_balance is not None else existing['initial_balance_paise']
                new_default = existing['is_default']
                if is_default is not None:
                    new_default = 1 if is_default else 0
                    if new_default == 1:
                        conn.execute("UPDATE accounts SET is_default = 0 WHERE profile_id = ?;", (profile_id,))

                conn.execute("""
                    UPDATE accounts
                    SET name = ?, account_type = ?, color = ?, icon = ?, initial_balance_paise = ?, is_default = ?
                    WHERE id = ? AND profile_id = ?;
                """, (new_name, new_type, new_color, new_icon, new_initial_paise, new_default, account_id, profile_id))
            return True
        finally:
            conn.close()

    def delete_account(self, profile_id, account_id):
        conn = self._get_conn()
        try:
            with conn:
                conn.execute("DELETE FROM accounts WHERE id = ? AND profile_id = ?;", (account_id, profile_id))
            return True
        finally:
            conn.close()

    # --- Financial Ledger Totals & Balances ---
    def get_ledger_totals(self, profile_id=1, month_year=None):
        """
        Calculates Net Cash Balance, Total Income, Total Expenses, and Net Savings.
        """
        conn = self._get_conn()
        try:
            query = "SELECT type, SUM(amount_paise) as total FROM transactions WHERE profile_id = ?"
            params = [profile_id]
            if month_year:
                query += " AND strftime('%Y-%m', date) = ?"
                params.append(month_year)
            query += " GROUP BY type;"

            rows = conn.execute(query, params).fetchall()
            income_paise = 0
            expenses_paise = 0

            for r in rows:
                if r['type'] == 'income':
                    income_paise = r['total'] or 0
                elif r['type'] == 'expense':
                    expenses_paise = r['total'] or 0

            # Calculate goal allocations
            goals_row = conn.execute(
                "SELECT SUM(current_amount_paise) as total FROM savings_goals WHERE profile_id = ? AND status != 'archived';",
                (profile_id,)
            ).fetchone()
            total_goals_savings_paise = goals_row['total'] or 0 if goals_row else 0

            balance_paise = income_paise - expenses_paise
            savings_paise = max(0, income_paise - expenses_paise)

            savings_rate = 0.0
            if income_paise > 0:
                savings_rate = round((float(savings_paise) / float(income_paise)) * 100.0, 1)

            return {
                'income': paise_to_rupees(income_paise),
                'expenses': paise_to_rupees(expenses_paise),
                'balance': paise_to_rupees(balance_paise),
                'savings': paise_to_rupees(savings_paise),
                'savings_goals_total': paise_to_rupees(total_goals_savings_paise),
                'savings_rate': savings_rate,
                'income_paise': income_paise,
                'expenses_paise': expenses_paise,
                'balance_paise': balance_paise
            }
        finally:
            conn.close()

    # --- Transactions CRUD ---
    def get_transactions(self, profile_id=1, filter_type='all', category=None, search=None, account_id=None):
        conn = self._get_conn()
        try:
            sql = """
                SELECT t.id, t.date, t.description, t.type, t.type_tag, t.amount_paise, t.account_id,
                       c.id as category_id, c.name as category, c.color as category_color,
                       a.name as account_name, a.account_type, a.color as account_color
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
                LEFT JOIN accounts a ON t.account_id = a.id
                WHERE t.profile_id = ?
            """
            params = [profile_id]

            if filter_type == 'income':
                sql += " AND t.type = 'income'"
            elif filter_type == 'expense':
                sql += " AND t.type = 'expense'"
            elif filter_type == 'subscriptions':
                sql += " AND (c.name = 'Bills & Utilities' OR LOWER(t.description) LIKE '%sub%' OR LOWER(t.description) LIKE '%pass%')"

            if category and category != 'ALL':
                sql += " AND c.name = ?"
                params.append(category)

            if account_id and str(account_id) != 'ALL':
                sql += " AND t.account_id = ?"
                params.append(account_id)

            if search:
                sql += " AND (LOWER(t.description) LIKE ? OR LOWER(c.name) LIKE ?)"
                kw = f"%{search.lower()}%"
                params.extend([kw, kw])

            sql += " ORDER BY t.date DESC, t.id DESC;"
            rows = conn.execute(sql, params).fetchall()

            result = []
            for r in rows:
                result.append({
                    'id': str(r['id']),
                    'date': r['date'],
                    'description': r['description'],
                    'category_id': r['category_id'],
                    'category': r['category'],
                    'category_color': r['category_color'],
                    'account_id': str(r['account_id']) if r['account_id'] else None,
                    'account_name': r['account_name'] or 'Main Bank Account',
                    'account_type': r['account_type'] or 'savings',
                    'type': r['type'],
                    'typeTag': r['type_tag'],
                    'amount': paise_to_rupees(r['amount_paise']),
                    'amount_paise': r['amount_paise']
                })
            return result
        finally:
            conn.close()

    def add_transaction(self, profile_id, date, description, category_name_or_id=None, tx_type='expense', type_tag='necessary', amount_rupees=None, account_id=None, amount=None, category=None, category_name=None):
        if amount_rupees is None and amount is not None:
            amount_rupees = amount
        if category_name_or_id is None:
            category_name_or_id = category if category is not None else category_name

        date = validate_date(date)
        description = sanitize_text(description, "Transaction Description", 1, 250)
        amount_rupees = validate_amount(amount_rupees, "Transaction Amount")
        
        if tx_type not in ('income', 'expense', 'transfer'):
            raise ValueError(f"Invalid transaction type: {tx_type}")
        if type_tag not in ('necessary', 'optional', 'savings', 'debt'):
            type_tag = 'necessary'

        conn = self._get_conn()
        try:
            with conn:
                # Find or assign default account if not specified
                if not account_id:
                    def_acc = conn.execute("SELECT id FROM accounts WHERE profile_id = ? AND is_default = 1;", (profile_id,)).fetchone()
                    if not def_acc:
                        def_acc = conn.execute("SELECT id FROM accounts WHERE profile_id = ? ORDER BY id ASC LIMIT 1;", (profile_id,)).fetchone()
                    account_id = def_acc['id'] if def_acc else None

                # Find category ID
                if isinstance(category_name_or_id, int) or (isinstance(category_name_or_id, str) and str(category_name_or_id).isdigit()):
                    cat_id = int(category_name_or_id)
                else:
                    cat_name = sanitize_text(category_name_or_id or 'Other', "Category", 1, 50)
                    cat = conn.execute("SELECT id FROM categories WHERE name = ? COLLATE NOCASE;", (cat_name,)).fetchone()
                    if cat:
                        cat_id = cat['id']
                    else:
                        cat_res = conn.execute(
                            "INSERT INTO categories (name, type, color) VALUES (?, ?, '#3b82f6');",
                            (cat_name, tx_type)
                        )
                        cat_id = cat_res.lastrowid

                amount_paise = rupees_to_paise(amount_rupees)
                cursor = conn.execute("""
                    INSERT INTO transactions (profile_id, account_id, date, description, category_id, type, type_tag, amount_paise)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                """, (profile_id, account_id, date, description, cat_id, tx_type, type_tag, amount_paise))

                # Check if first entry achievement needs to be unlocked
                conn.execute("""
                    INSERT OR IGNORE INTO user_achievements (profile_id, achievement_id)
                    SELECT ?, id FROM achievements WHERE code = 'first_entry';
                """, (profile_id,))

                return cursor.lastrowid
        finally:
            conn.close()

    def delete_transaction(self, profile_id, transaction_id):
        conn = self._get_conn()
        try:
            with conn:
                conn.execute("DELETE FROM transactions WHERE id = ? AND profile_id = ?;", (transaction_id, profile_id))
            return True
        finally:
            conn.close()

    def update_transaction(self, profile_id, transaction_id, date=None, description=None, category_name_or_id=None, tx_type=None, type_tag=None, amount_rupees=None, account_id=None, amount=None, category=None, category_name=None):
        if amount_rupees is None and amount is not None:
            amount_rupees = amount
        if category_name_or_id is None:
            category_name_or_id = category if category is not None else category_name
        conn = self._get_conn()
        try:
            with conn:
                existing = conn.execute("SELECT * FROM transactions WHERE id = ? AND profile_id = ?;", (transaction_id, profile_id)).fetchone()
                if not existing:
                    raise ValueError("Transaction not found.")

                new_date = validate_date(date) if date else existing['date']
                new_desc = sanitize_text(description, "Description", 1, 250) if description else existing['description']
                new_type = tx_type if tx_type in ('income', 'expense', 'transfer') else existing['type']
                new_tag = type_tag if type_tag in ('necessary', 'optional', 'savings', 'debt') else existing['type_tag']
                new_acc_id = account_id if account_id is not None else existing['account_id']

                if amount_rupees is not None:
                    amount_rupees = validate_amount(amount_rupees, "Amount")
                    new_amount_paise = rupees_to_paise(amount_rupees)
                else:
                    new_amount_paise = existing['amount_paise']

                if category_name_or_id:
                    if isinstance(category_name_or_id, int) or (isinstance(category_name_or_id, str) and str(category_name_or_id).isdigit()):
                        cat_id = int(category_name_or_id)
                    else:
                        cat_name = sanitize_text(category_name_or_id, "Category", 1, 50)
                        cat = conn.execute("SELECT id FROM categories WHERE name = ? COLLATE NOCASE;", (cat_name,)).fetchone()
                        if cat:
                            cat_id = cat['id']
                        else:
                            cat_res = conn.execute("INSERT INTO categories (name, type, color) VALUES (?, ?, '#3b82f6');", (cat_name, new_type))
                            cat_id = cat_res.lastrowid
                else:
                    cat_id = existing['category_id']

                conn.execute("""
                    UPDATE transactions
                    SET date = ?, description = ?, category_id = ?, type = ?, type_tag = ?, amount_paise = ?, account_id = ?
                    WHERE id = ? AND profile_id = ?;
                """, (new_date, new_desc, cat_id, new_type, new_tag, new_amount_paise, new_acc_id, transaction_id, profile_id))
            return True
        finally:
            conn.close()

    # --- Category Spending & Budget Management ---
    def get_category_spending(self, profile_id=1, month_year=None):
        conn = self._get_conn()
        try:
            query = """
                SELECT c.name, c.color, SUM(t.amount_paise) as total_paise
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
                WHERE t.profile_id = ? AND t.type = 'expense'
            """
            params = [profile_id]
            if month_year:
                query += " AND strftime('%Y-%m', t.date) = ?"
                params.append(month_year)
            query += " GROUP BY c.id ORDER BY total_paise DESC;"

            rows = conn.execute(query, params).fetchall()
            total_expense_paise = sum(r['total_paise'] for r in rows) or 1

            result = []
            for r in rows:
                spent = paise_to_rupees(r['total_paise'])
                pct = round((r['total_paise'] / total_expense_paise) * 100, 1)
                result.append({
                    'name': r['name'],
                    'color': r['color'],
                    'spent': spent,
                    'spent_paise': r['total_paise'],
                    'percentage': pct
                })
            return result
        finally:
            conn.close()

    def get_budget_overview(self, profile_id=1, month_year=None):
        conn = self._get_conn()
        try:
            # Query budgets
            sql = """
                SELECT b.id as budget_id, b.monthly_limit_paise, b.month_year, c.id as category_id, c.name, c.color
                FROM budgets b
                JOIN categories c ON b.category_id = c.id
                WHERE b.profile_id = ?
            """
            params = [profile_id]
            if month_year:
                sql += " AND b.month_year = ?"
                params.append(month_year)
            else:
                # Use latest month available or current
                latest = conn.execute("SELECT MAX(month_year) FROM budgets WHERE profile_id = ?;", (profile_id,)).fetchone()[0]
                month_year = latest or datetime.date.today().strftime('%Y-%m')
                sql += " AND b.month_year = ?"
                params.append(month_year)

            budgets = conn.execute(sql, params).fetchall()

            result = []
            for b in budgets:
                spent_row = conn.execute("""
                    SELECT SUM(amount_paise) as total_paise
                    FROM transactions
                    WHERE profile_id = ? AND category_id = ? AND type = 'expense'
                      AND strftime('%Y-%m', date) = ?;
                """, (profile_id, b['category_id'], b['month_year'])).fetchone()

                spent_paise = spent_row['total_paise'] or 0
                limit_paise = b['monthly_limit_paise']
                spent = paise_to_rupees(spent_paise)
                limit = paise_to_rupees(limit_paise)
                pct = min(150, round((spent_paise / limit_paise) * 100)) if limit_paise > 0 else 0

                if pct > 100:
                    status = 'Exceeded'
                    badge_color = 'bg-accent-rose/20 text-accent-rose'
                    bar_color = 'bg-accent-rose'
                elif pct >= 85:
                    status = 'Warning'
                    badge_color = 'bg-accent-amber/20 text-accent-amber'
                    bar_color = 'bg-accent-amber'
                else:
                    status = 'Normal'
                    badge_color = 'bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300'
                    bar_color = 'bg-brand-500'

                result.append({
                    'category_id': b['category_id'],
                    'name': b['name'],
                    'spent': spent,
                    'limit': limit,
                    'pct': pct,
                    'status': status,
                    'badge_color': badge_color,
                    'bar_color': bar_color
                })
            return result
        finally:
            conn.close()

    def set_budget(self, profile_id, category_name_or_id, monthly_limit_rupees, month_year=None):
        limit_rupees = validate_amount(monthly_limit_rupees, "Monthly Limit", min_val=1.0)
        month_year = month_year or datetime.date.today().strftime('%Y-%m')
        conn = self._get_conn()
        try:
            with conn:
                if isinstance(category_name_or_id, int) or (isinstance(category_name_or_id, str) and str(category_name_or_id).isdigit()):
                    cat_id = int(category_name_or_id)
                else:
                    cat_name = sanitize_text(category_name_or_id, "Category", 1, 50)
                    cat = conn.execute("SELECT id FROM categories WHERE name = ? COLLATE NOCASE;", (cat_name,)).fetchone()
                    if cat:
                        cat_id = cat['id']
                    else:
                        cat_res = conn.execute("INSERT INTO categories (name, type, color) VALUES (?, 'expense', '#3b82f6');", (cat_name,))
                        cat_id = cat_res.lastrowid

                limit_paise = rupees_to_paise(limit_rupees)
                conn.execute("""
                    INSERT INTO budgets (profile_id, category_id, monthly_limit_paise, month_year)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(profile_id, category_id, month_year) DO UPDATE SET monthly_limit_paise = excluded.monthly_limit_paise;
                """, (profile_id, cat_id, limit_paise, month_year))
            return True
        finally:
            conn.close()

    def delete_budget(self, profile_id, category_id, month_year=None):
        month_year = month_year or datetime.date.today().strftime('%Y-%m')
        conn = self._get_conn()
        try:
            with conn:
                conn.execute("""
                    DELETE FROM budgets
                    WHERE profile_id = ? AND category_id = ? AND month_year = ?;
                """, (profile_id, category_id, month_year))
            return True
        finally:
            conn.close()

    # --- Savings Goals Operations (Add, Deposit, Withdraw, Edit, Delete) ---
    def get_goals(self, profile_id=1):
        conn = self._get_conn()
        try:
            rows = conn.execute("""
                SELECT id, name, target_amount_paise, current_amount_paise, target_date, status
                FROM savings_goals
                WHERE profile_id = ? AND status != 'archived'
                ORDER BY id ASC;
            """, (profile_id,)).fetchall()

            goals = []
            for r in rows:
                target = paise_to_rupees(r['target_amount_paise'])
                current = paise_to_rupees(r['current_amount_paise'])
                pct = min(100, round((r['current_amount_paise'] / r['target_amount_paise']) * 100)) if r['target_amount_paise'] > 0 else 0
                remaining = max(0, target - current)

                goals.append({
                    'id': str(r['id']),
                    'name': r['name'],
                    'targetAmount': target,
                    'currentAmount': current,
                    'target_amount_paise': r['target_amount_paise'],
                    'current_amount_paise': r['current_amount_paise'],
                    'pct': pct,
                    'remaining': remaining,
                    'date': r['target_date'],
                    'status': r['status']
                })
            return goals
        finally:
            conn.close()

    def add_goal(self, profile_id, name, target_rupees, current_rupees, target_date):
        name = sanitize_text(name, "Goal Name", 1, 100)
        target_rupees = validate_amount(target_rupees, "Target Amount", min_val=1.0)
        current_rupees = validate_amount(current_rupees, "Initial Deposit", min_val=0.0)
        target_date = validate_date(target_date)

        conn = self._get_conn()
        try:
            with conn:
                target_paise = rupees_to_paise(target_rupees)
                current_paise = rupees_to_paise(current_rupees)
                cur = conn.execute("""
                    INSERT INTO savings_goals (profile_id, name, target_amount_paise, current_amount_paise, target_date, status)
                    VALUES (?, ?, ?, ?, ?, 'active');
                """, (profile_id, name, target_paise, current_paise, target_date))

                # Unlock goal setter badge
                conn.execute("""
                    INSERT OR IGNORE INTO user_achievements (profile_id, achievement_id)
                    SELECT ?, id FROM achievements WHERE code = 'goal_setter';
                """, (profile_id,))
                return cur.lastrowid
        finally:
            conn.close()

    def deposit_goal(self, profile_id, goal_id, deposit_rupees=1000):
        deposit_rupees = validate_amount(deposit_rupees, "Deposit Amount", min_val=1.0)
        conn = self._get_conn()
        try:
            with conn:
                deposit_paise = rupees_to_paise(deposit_rupees)
                conn.execute("""
                    UPDATE savings_goals
                    SET current_amount_paise = current_amount_paise + ?
                    WHERE id = ? AND profile_id = ?;
                """, (deposit_paise, goal_id, profile_id))
            return True
        finally:
            conn.close()

    def withdraw_goal(self, profile_id, goal_id, withdraw_rupees):
        """Allows withdrawing or adjusting down savings goal contributions safely."""
        withdraw_rupees = validate_amount(withdraw_rupees, "Withdrawal Amount", min_val=1.0)
        conn = self._get_conn()
        try:
            with conn:
                withdraw_paise = rupees_to_paise(withdraw_rupees)
                # Fetch current amount to prevent negative balances
                current = conn.execute(
                    "SELECT current_amount_paise FROM savings_goals WHERE id = ? AND profile_id = ?;",
                    (goal_id, profile_id)
                ).fetchone()
                if not current:
                    raise ValueError("Goal not found.")
                if withdraw_paise > current['current_amount_paise']:
                    raise ValueError(f"Cannot withdraw {withdraw_rupees}: exceeds available balance of {paise_to_rupees(current['current_amount_paise'])}.")
                new_paise = current['current_amount_paise'] - withdraw_paise
                conn.execute("""
                    UPDATE savings_goals
                    SET current_amount_paise = ?
                    WHERE id = ? AND profile_id = ?;
                """, (new_paise, goal_id, profile_id))
            return True
        finally:
            conn.close()

    def edit_goal(self, profile_id, goal_id, name, target_rupees=None, target_date=None, target_amount_rupees=None):
        if target_rupees is None and target_amount_rupees is not None:
            target_rupees = target_amount_rupees
        name = sanitize_text(name, "Goal Name", 1, 100)
        target_rupees = validate_amount(target_rupees, "Target Amount", min_val=1.0)
        target_date = validate_date(target_date)

        conn = self._get_conn()
        try:
            with conn:
                target_paise = rupees_to_paise(target_rupees)
                conn.execute("""
                    UPDATE savings_goals
                    SET name = ?, target_amount_paise = ?, target_date = ?
                    WHERE id = ? AND profile_id = ?;
                """, (name, target_paise, target_date, goal_id, profile_id))
            return True
        finally:
            conn.close()

    def delete_goal(self, profile_id, goal_id):
        conn = self._get_conn()
        try:
            with conn:
                conn.execute("DELETE FROM savings_goals WHERE id = ? AND profile_id = ?;", (goal_id, profile_id))
            return True
        finally:
            conn.close()

    # --- Calendar Cashflows ---
    def get_calendar_events(self, profile_id=1):
        conn = self._get_conn()
        try:
            rows = conn.execute("""
                SELECT id, title, amount_paise, type, due_date, frequency, status
                FROM calendar_events
                WHERE profile_id = ?
                ORDER BY due_date ASC;
            """, (profile_id,)).fetchall()

            events = []
            for r in rows:
                events.append({
                    'id': str(r['id']),
                    'title': r['title'],
                    'amount': paise_to_rupees(r['amount_paise']),
                    'type': r['type'],
                    'date': r['due_date'],
                    'frequency': r['frequency'],
                    'status': r['status']
                })
            return events
        finally:
            conn.close()

    def add_calendar_event(self, profile_id, title, amount_rupees, ev_type, due_date, frequency='monthly'):
        title = sanitize_text(title, "Event Title", 1, 150)
        amount_rupees = validate_amount(amount_rupees, "Scheduled Amount", min_val=1.0)
        due_date = validate_date(due_date)
        if ev_type not in ('income', 'expense'):
            ev_type = 'expense'

        conn = self._get_conn()
        try:
            with conn:
                amount_paise = rupees_to_paise(amount_rupees)
                cur = conn.execute("""
                    INSERT INTO calendar_events (profile_id, title, amount_paise, type, due_date, frequency, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'scheduled');
                """, (profile_id, title, amount_paise, ev_type, due_date, frequency))
                return cur.lastrowid
        finally:
            conn.close()

    def delete_calendar_event(self, profile_id, event_id):
        conn = self._get_conn()
        try:
            with conn:
                conn.execute("DELETE FROM calendar_events WHERE id = ? AND profile_id = ?;", (event_id, profile_id))
            return True
        finally:
            conn.close()

    # --- Financial Health Score (Accurate & Documented Algorithm) ---
    def calculate_health_score(self, profile_id=1):
        """
        Calculates Financial Health Score (0-100) using 3 distinct pillars:
        1. Savings Rate (35 points): Max 35 points if savings rate >= 20%.
        2. Budget Control (35 points): Penalized for exceeded & warning budgets.
        3. Emergency Reserve (30 points): Months of essential expense coverage (3+ months = 30 points).

        Empty Account Rule:
        If an account has 0 recorded transactions, it returns score 0 and
        status 'Getting Started' rather than an arbitrary default number.
        """
        conn = self._get_conn()
        try:
            tx_count = conn.execute("SELECT COUNT(*) FROM transactions WHERE profile_id = ?;", (profile_id,)).fetchone()[0]
            if tx_count == 0:
                return {
                    'score': 0,
                    'status': 'Getting Started',
                    'badge_class': 'bg-gray-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
                    'bar_color': 'bg-slate-400',
                    'savings_rate': '0%',
                    'savings_bar_pct': 0,
                    'budget_control': '0%',
                    'budget_bar_pct': 0,
                    'emergency_reserve': '0.0 Months',
                    'emergency_bar_pct': 0,
                    'is_new_user': True
                }

            totals = self.get_ledger_totals(profile_id)
            savings_rate = totals['savings_rate']
            
            # 1. Savings Score (35 pts max)
            s_score = min(35.0, (savings_rate / 20.0) * 35.0) if savings_rate > 0 else 0.0

            # 2. Budget Score (35 pts max)
            budgets = self.get_budget_overview(profile_id)
            if budgets:
                exceeded_count = sum(1 for b in budgets if b['pct'] > 100)
                warning_count = sum(1 for b in budgets if 85 <= b['pct'] <= 100)
                b_score = max(0.0, 35.0 - (exceeded_count * 12.0) - (warning_count * 4.0))
            else:
                # If no budgets set, score by spending discipline (expenses <= 80% of income)
                if totals['income'] > 0 and totals['expenses'] <= totals['income']:
                    b_score = 30.0
                else:
                    b_score = 15.0

            # 3. Emergency Reserve Score (30 pts max)
            monthly_expense = totals['expenses']
            balance = max(0, totals['balance'])
            if monthly_expense > 0:
                coverage_months = round(float(balance) / float(monthly_expense), 1)
            else:
                coverage_months = 6.0 if balance > 0 else 0.0
            r_score = min(30.0, (coverage_months / 3.0) * 30.0)

            total_score = int(round(s_score + b_score + r_score))
            total_score = max(0, min(100, total_score))

            if total_score >= 75:
                status = 'Healthy'
                badge_class = 'bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300'
                bar_color = 'bg-brand-500'
            elif total_score >= 50:
                status = 'Moderate'
                badge_class = 'bg-accent-blue/20 text-accent-blue'
                bar_color = 'bg-accent-blue'
            elif total_score >= 35:
                status = 'Needs Attention'
                badge_class = 'bg-accent-amber/20 text-accent-amber'
                bar_color = 'bg-accent-amber'
            else:
                status = 'Critical'
                badge_class = 'bg-accent-rose/20 text-accent-rose'
                bar_color = 'bg-accent-rose'

            return {
                'score': total_score,
                'status': status,
                'badge_class': badge_class,
                'bar_color': bar_color,
                'savings_rate': f"{int(round(savings_rate))}%",
                'savings_bar_pct': int(min(100, (savings_rate / 30.0) * 100)),
                'budget_control': f"{int(round((b_score / 35.0) * 100))}%",
                'budget_bar_pct': int(round((b_score / 35.0) * 100)),
                'emergency_reserve': f"{coverage_months} Months",
                'emergency_bar_pct': int(min(100, (coverage_months / 5.0) * 100)),
                'is_new_user': False
            }
        finally:
            conn.close()

    # --- Simulations ---
    def evaluate_affordability(self, profile_id=1, item_name="Purchase", price_rupees=45000):
        item_name = sanitize_text(item_name, "Item Name", 1, 100)
        price_rupees = validate_amount(price_rupees, "Purchase Price", min_val=1.0)
        
        totals = self.get_ledger_totals(profile_id)
        current_reserve = max(0, totals['balance'])
        monthly_expense = totals['expenses']
        
        post_reserve = current_reserve - price_rupees
        coverage_months = round(max(0.0, post_reserve) / monthly_expense, 1) if monthly_expense > 0 else 0.0

        pct_reduction = round((price_rupees / current_reserve) * 100, 1) if current_reserve > 0 else 100.0
        avg_monthly_savings = max(1000, totals['savings'])
        recovery_months = round(price_rupees / avg_monthly_savings, 1)

        summary_text = (
            f"Making this purchase immediately reduces your liquid cash reserves by {pct_reduction}%. "
            f"It will take approximately {recovery_months} months of average savings to replenish this amount."
        )

        return {
            'item_name': item_name,
            'price': price_rupees,
            'current_reserve': current_reserve,
            'post_reserve': post_reserve,
            'coverage_months': coverage_months,
            'summary_text': summary_text
        }

    def run_what_if_simulation(self, profile_id=1, scenario_type="salary", change_amount_rupees=5000):
        change_amount_rupees = validate_amount(change_amount_rupees, "Simulation Amount", min_val=0.0)
        totals = self.get_ledger_totals(profile_id)
        current_savings = totals['savings']
        base_income = totals['income']

        if scenario_type in ['salary', 'extra_savings']:
            simulated_savings = current_savings + change_amount_rupees
        else: # rent or major recurring cost
            simulated_savings = max(0, current_savings - change_amount_rupees)

        curr_rate = round((current_savings / base_income) * 100, 1) if base_income > 0 else 0.0
        new_income = base_income + (change_amount_rupees if scenario_type == 'salary' else 0)
        sim_rate = round((simulated_savings / new_income) * 100, 1) if new_income > 0 else 0.0

        curr_annual = current_savings * 12
        sim_annual = simulated_savings * 12

        accel_months = round(float(change_amount_rupees * 12) / float(simulated_savings), 1) if simulated_savings > 0 else 0.0

        return {
            'scenario_type': scenario_type,
            'change_amount': change_amount_rupees,
            'base_income': base_income,
            'curr_savings': current_savings,
            'sim_savings': simulated_savings,
            'curr_annual': curr_annual,
            'sim_annual': sim_annual,
            'curr_rate': f"{curr_rate}%",
            'sim_rate': f"{sim_rate}%",
            'goal_accel': f"Accelerated by {accel_months} Months" if simulated_savings > current_savings else f"Delayed by {abs(accel_months)} Months"
        }
