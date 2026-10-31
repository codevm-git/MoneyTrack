import json
import csv
import io
from app.database.connection import get_db_connection, seed_initial_data
from app.services.financial_service import paise_to_rupees, rupees_to_paise
from app.services.validators import validate_backup_payload, sanitize_text

MAX_BACKUP_SIZE_BYTES = 5 * 1024 * 1024 # 5 MB

class BackupService:
    def __init__(self, db_path=None):
        self.db_path = db_path

    def _get_conn(self):
        return get_db_connection(self.db_path)

    def export_json_backup(self, profile_id=1):
        conn = self._get_conn()
        try:
            user = dict(conn.execute("SELECT id, name, currency, status, created_at FROM user_profiles WHERE id = ?;", (profile_id,)).fetchone() or {})
            accounts = [dict(r) for r in conn.execute(
                "SELECT id, name, account_type, initial_balance_paise, color, icon, is_default FROM accounts WHERE profile_id = ?;",
                (profile_id,)
            ).fetchall()]
            transactions = [dict(r) for r in conn.execute(
                "SELECT id, date, description, category_id, type, type_tag, amount_paise, account_id, created_at FROM transactions WHERE profile_id = ? ORDER BY date DESC;",
                (profile_id,)
            ).fetchall()]
            categories = [dict(r) for r in conn.execute("SELECT id, name, type, color, icon FROM categories;").fetchall()]
            budgets = [dict(r) for r in conn.execute("SELECT id, category_id, monthly_limit_paise, month_year FROM budgets WHERE profile_id = ?;", (profile_id,)).fetchall()]
            goals = [dict(r) for r in conn.execute("SELECT id, name, target_amount_paise, current_amount_paise, target_date, status FROM savings_goals WHERE profile_id = ?;", (profile_id,)).fetchall()]
            calendar_events = [dict(r) for r in conn.execute("SELECT id, title, amount_paise, type, due_date, frequency, status FROM calendar_events WHERE profile_id = ?;", (profile_id,)).fetchall()]
            user_achievements = [dict(r) for r in conn.execute("SELECT achievement_id, unlocked_at FROM user_achievements WHERE profile_id = ?;", (profile_id,)).fetchall()]

            payload = {
                'app': 'MoneyTrack Offline Financial Planner',
                'version': '1.0',
                'user': user,
                'accounts': accounts,
                'categories': categories,
                'transactions': transactions,
                'budgets': budgets,
                'goals': goals,
                'calendarEvents': calendar_events,
                'user_achievements': user_achievements
            }
            return payload
        finally:
            conn.close()

    def import_json_backup(self, data, profile_id=1):
        """
        Atomically validates and restores the application state from a JSON backup.
        If any record fails validation, the entire transaction rolls back.
        """
        # 1. Run strict schema validation
        validate_backup_payload(data)

        conn = self._get_conn()
        try:
            with conn:
                # 2. Update user profile if present
                if 'user' in data and data['user']:
                    u = data['user']
                    name = sanitize_text(u.get('name', 'Alex Taylor'), "Profile Name", 1, 50)
                    currency = sanitize_text(u.get('currency', '₹'), "Currency", 1, 5)
                    conn.execute("""
                        UPDATE user_profiles
                        SET name = ?, currency = ?
                        WHERE id = ?;
                    """, (name, currency, profile_id))

                # 3. Restore accounts if present
                account_id_map = {}
                if 'accounts' in data and isinstance(data['accounts'], list) and len(data['accounts']) > 0:
                    conn.execute("DELETE FROM accounts WHERE profile_id = ?;", (profile_id,))
                    for acc in data['accounts']:
                        old_id = acc.get('id')
                        name = sanitize_text(acc.get('name', 'Main Account'), "Account Name", 1, 60)
                        acc_type = acc.get('account_type', 'savings')
                        init_bal = acc.get('initial_balance_paise', 0)
                        color = acc.get('color', '#3B82F6')
                        icon = acc.get('icon', 'building-library')
                        is_def = 1 if acc.get('is_default') else 0
                        cur = conn.execute("""
                            INSERT INTO accounts (profile_id, name, account_type, initial_balance_paise, color, icon, is_default)
                            VALUES (?, ?, ?, ?, ?, ?, ?);
                        """, (profile_id, name, acc_type, int(init_bal), color, icon, is_def))
                        if old_id is not None:
                            account_id_map[old_id] = cur.lastrowid

                # 4. Restore transactions
                if 'transactions' in data and isinstance(data['transactions'], list):
                    conn.execute("DELETE FROM transactions WHERE profile_id = ?;", (profile_id,))
                    for t in data['transactions']:
                        amount_paise = t.get('amount_paise')
                        if amount_paise is None and 'amount' in t:
                            amount_paise = rupees_to_paise(t['amount'])
                        if not amount_paise or amount_paise <= 0:
                            continue
                        cat_id = t.get('category_id', 1)
                        # Verify category exists
                        cat = conn.execute("SELECT id FROM categories WHERE id = ?;", (cat_id,)).fetchone()
                        if not cat:
                            cat_id = 6 # 'Other'

                        raw_acc_id = t.get('account_id')
                        mapped_acc_id = account_id_map.get(raw_acc_id, raw_acc_id)
                        if mapped_acc_id is not None:
                            acc_check = conn.execute("SELECT id FROM accounts WHERE id = ? AND profile_id = ?;", (mapped_acc_id, profile_id)).fetchone()
                            if not acc_check:
                                mapped_acc_id = None

                        raw_dest_id = t.get('destination_account_id')
                        mapped_dest_id = account_id_map.get(raw_dest_id, raw_dest_id)
                        if mapped_dest_id is not None:
                            dest_check = conn.execute("SELECT id FROM accounts WHERE id = ? AND profile_id = ?;", (mapped_dest_id, profile_id)).fetchone()
                            if not dest_check:
                                mapped_dest_id = None

                        conn.execute("""
                            INSERT INTO transactions (profile_id, date, description, category_id, type, type_tag, amount_paise, account_id, destination_account_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                        """, (profile_id, t['date'], sanitize_text(t['description'], "Tx Description", 1, 250),
                              cat_id, t['type'], t.get('typeTag', t.get('type_tag', 'necessary')), int(amount_paise), mapped_acc_id, mapped_dest_id))

                # 5. Restore goals
                if 'goals' in data and isinstance(data['goals'], list):
                    conn.execute("DELETE FROM savings_goals WHERE profile_id = ?;", (profile_id,))
                    for g in data['goals']:
                        t_paise = g.get('target_amount_paise') or rupees_to_paise(g.get('targetAmount', 0))
                        c_paise = g.get('current_amount_paise') or rupees_to_paise(g.get('currentAmount', 0))
                        if not t_paise or t_paise <= 0:
                            continue
                        conn.execute("""
                            INSERT INTO savings_goals (profile_id, name, target_amount_paise, current_amount_paise, target_date, status)
                            VALUES (?, ?, ?, ?, ?, ?);
                        """, (profile_id, sanitize_text(g['name'], "Goal Name", 1, 100), int(t_paise), int(c_paise),
                              g.get('date', g.get('target_date', '2027-12-31')), g.get('status', 'active')))

                # 6. Restore calendar events
                if 'calendarEvents' in data and isinstance(data['calendarEvents'], list):
                    conn.execute("DELETE FROM calendar_events WHERE profile_id = ?;", (profile_id,))
                    for c in data['calendarEvents']:
                        amt_paise = c.get('amount_paise') or rupees_to_paise(c.get('amount', 0))
                        if not amt_paise or amt_paise <= 0:
                            continue
                        conn.execute("""
                            INSERT INTO calendar_events (profile_id, title, amount_paise, type, due_date, frequency, status)
                            VALUES (?, ?, ?, ?, ?, ?, ?);
                        """, (profile_id, sanitize_text(c['title'], "Event Title", 1, 150), int(amt_paise), c['type'],
                              c.get('date', c.get('due_date', '2026-10-01')), c.get('frequency', 'monthly'), c.get('status', 'scheduled')))

            return True
        finally:
            conn.close()

    def export_csv(self, profile_id=1):
        conn = self._get_conn()
        try:
            sql = """
                SELECT t.date, t.description, COALESCE(c.name, 'General') as category,
                       CASE 
                           WHEN t.type = 'transfer' AND dest.name IS NOT NULL THEN COALESCE(a.name, 'Account') || ' -> ' || dest.name
                           ELSE COALESCE(a.name, 'Unassigned')
                       END as account,
                       t.type, t.type_tag as necessity, t.amount_paise
                FROM transactions t
                LEFT JOIN categories c ON t.category_id = c.id
                LEFT JOIN accounts a ON t.account_id = a.id
                LEFT JOIN accounts dest ON t.destination_account_id = dest.id
                WHERE t.profile_id = ?
                ORDER BY t.date DESC;
            """
            rows = conn.execute(sql, (profile_id,)).fetchall()
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(['Date', 'Description', 'Category', 'Account', 'Type', 'Necessity Tag', 'Amount (INR)'])
            for r in rows:
                writer.writerow([r['date'], r['description'], r['category'], r['account'], r['type'], r['necessity'], paise_to_rupees(r['amount_paise'])])
            return output.getvalue()
        finally:
            conn.close()
