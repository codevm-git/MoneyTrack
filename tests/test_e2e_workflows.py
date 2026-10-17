import unittest
import os
import sys
import json
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'vendor')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app
from app.database.connection import init_db
from app.services.financial_service import FinancialService
from app.services.backup_service import BackupService

class TestEndToEndWorkflows(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.temp_db.close()
        init_db(self.temp_db.name)
        self.app = create_app(self.temp_db.name)
        self.client = self.app.test_client()
        self.fin_service = FinancialService(self.temp_db.name)
        self.backup_service = BackupService(self.temp_db.name)

    def tearDown(self):
        if os.path.exists(self.temp_db.name):
            os.remove(self.temp_db.name)

    # --- 1. Account Workflow (Fresh User, Defaults, Isolation, Deletion) ---
    def test_account_lifecycle_and_defaults(self):
        # 1. Create fresh new user
        new_uid = self.fin_service.create_user_profile("Rohan Sharma", "₹")
        self.assertGreater(new_uid, 1)

        # 2. Verify begins with clean default values
        totals = self.fin_service.get_ledger_totals(new_uid)
        self.assertEqual(totals['income'], 0)
        self.assertEqual(totals['expenses'], 0)
        self.assertEqual(totals['balance'], 0)
        self.assertEqual(totals['savings'], 0)

        health = self.fin_service.calculate_health_score(new_uid)
        self.assertEqual(health['score'], 0)
        self.assertEqual(health['status'], 'Getting Started')

        # 3. Add private record
        self.fin_service.add_transaction(new_uid, '2026-10-17', 'Private Stipend', 'Salary', 'income', 'necessary', 15000)

        # Confirm isolation: Profile 1 cannot see this transaction
        p1_txs = self.fin_service.get_transactions(1)
        self.assertFalse(any(t['description'] == 'Private Stipend' for t in p1_txs))

        # 4. Delete user account and verify cascade policy
        self.fin_service.delete_user_profile(new_uid)
        profiles = self.fin_service.list_user_profiles()
        self.assertFalse(any(p['id'] == new_uid for p in profiles))

        # Verify transactions cleanly deleted
        conn = self.fin_service._get_conn()
        try:
            cnt = conn.execute("SELECT COUNT(*) FROM transactions WHERE profile_id = ?", (new_uid,)).fetchone()[0]
            self.assertEqual(cnt, 0)
        finally:
            conn.close()

    # --- 2. Income and Expense Workflow (Add, Edit, Delete, Reactive Totals) ---
    def test_income_and_expense_full_workflow(self):
        pid = 1
        initial_totals = self.fin_service.get_ledger_totals(pid)

        # 1. Add income
        inc_id = self.fin_service.add_transaction(pid, '2026-10-01', 'Consulting Fee', 'Salary', 'income', 'necessary', 20000)
        after_inc = self.fin_service.get_ledger_totals(pid)
        self.assertEqual(after_inc['income'], initial_totals['income'] + 20000)

        # 2. Add expense
        exp_id = self.fin_service.add_transaction(pid, '2026-10-02', 'Office Ergonomic Chair', 'Shopping', 'expense', 'necessary', 8000)
        after_exp = self.fin_service.get_ledger_totals(pid)
        self.assertEqual(after_exp['expenses'], initial_totals['expenses'] + 8000)

        # 3. Edit transaction (Change expense amount from 8000 to 6500)
        self.fin_service.update_transaction(pid, exp_id, description='Office Chair (Discounted)', amount_rupees=6500)
        after_edit = self.fin_service.get_ledger_totals(pid)
        self.assertEqual(after_edit['expenses'], initial_totals['expenses'] + 6500)

        # 4. Search & Filter
        search_res = self.fin_service.get_transactions(pid, search='Chair')
        self.assertEqual(len(search_res), 1)
        self.assertEqual(search_res[0]['description'], 'Office Chair (Discounted)')

        # 5. Delete transaction
        self.fin_service.delete_transaction(pid, exp_id)
        after_del = self.fin_service.get_ledger_totals(pid)
        self.assertEqual(after_del['expenses'], initial_totals['expenses'])

    # --- 3. Budget and Savings Workflow (Set Budget, Overspending, Goals CRUD) ---
    def test_budget_and_savings_workflow(self):
        pid = 1
        # Set budget limit for 'Transport' to 4,000 for 2026-10
        self.fin_service.set_budget(pid, 'Transport', 4000, month_year='2026-10')
        budgets = self.fin_service.get_budget_overview(pid, month_year='2026-10')
        t_budget = next(b for b in budgets if b['name'] == 'Transport')
        self.assertEqual(t_budget['limit'], 4000)

        # In seed, Transport expense is 500 (Metro pass) -> status Normal
        self.assertEqual(t_budget['status'], 'Normal')

        # Add heavy transport expense to trigger overspending alert
        tx_heavy = self.fin_service.add_transaction(pid, '2026-10-15', 'Flight Ticket', 'Transport', 'expense', 'necessary', 5000)
        budgets_after = self.fin_service.get_budget_overview(pid, month_year='2026-10')
        t_budget_after = next(b for b in budgets_after if b['name'] == 'Transport')
        # Total spent: 500 + 5000 = 5500 > 4000 -> status Exceeded
        self.assertEqual(t_budget_after['status'], 'Exceeded')

        # Adjust budget to 6,000 to clear warning
        self.fin_service.set_budget(pid, 'Transport', 6000, month_year='2026-10')
        budgets_cleared = self.fin_service.get_budget_overview(pid, month_year='2026-10')
        t_budget_cleared = next(b for b in budgets_cleared if b['name'] == 'Transport')
        self.assertEqual(t_budget_cleared['status'], 'Normal')

        # Clean up
        self.fin_service.delete_transaction(pid, tx_heavy)

        # Savings Goal Lifecycle
        gid = self.fin_service.add_goal(pid, 'Emergency Buffer', 100000, 20000, '2027-12-31')
        self.fin_service.deposit_goal(pid, gid, 10000)
        g = next(x for x in self.fin_service.get_goals(pid) if int(x['id']) == gid)
        self.assertEqual(g['currentAmount'], 30000)

        self.fin_service.withdraw_goal(pid, gid, 5000)
        g = next(x for x in self.fin_service.get_goals(pid) if int(x['id']) == gid)
        self.assertEqual(g['currentAmount'], 25000)

        self.fin_service.delete_goal(pid, gid)
        self.assertFalse(any(int(x['id']) == gid for x in self.fin_service.get_goals(pid)))

    # --- 4. Education Workflow (Offline Lesson, Quiz, Score, Persistence) ---
    def test_education_workflow(self):
        # 1. Fetch lessons
        res_less = self.client.get('/api/learning/lessons')
        self.assertEqual(res_less.status_code, 200)
        lessons = res_less.get_json()['lessons']
        self.assertGreaterEqual(len(lessons), 3)

        # 2. Fetch quiz
        res_quiz = self.client.get('/api/learning/quizzes/1')
        self.assertEqual(res_quiz.status_code, 200)
        quizzes = res_quiz.get_json()['quizzes']

        # 3. Complete quiz
        res_comp = self.client.post('/api/learning/quizzes/complete', json={
            'lesson_id': 1,
            'score': 3,
            'total': 3
        })
        self.assertEqual(res_comp.status_code, 200)

        # 4. Verify achievement badge unlocked
        res_ach = self.client.get('/api/learning/achievements')
        achs = res_ach.get_json()['achievements']
        scholar = next((a for a in achs if a['title'] == 'Financial Scholar'), None)
        if scholar:
            self.assertTrue(scholar['unlocked'])

    # --- 5. Reporting Workflow (Monthly HTML, CSV, Atomic Backup Rollback) ---
    def test_reporting_workflow(self):
        # 1. Monthly Report HTML view
        res_report = self.client.get('/report/monthly?month=2026-10')
        self.assertEqual(res_report.status_code, 200)
        self.assertIn(b'MoneyTrack', res_report.data)
        self.assertIn(b'Detailed Transaction Statement', res_report.data)

        # 2. CSV Export
        res_csv = self.client.get('/api/settings/export/csv')
        self.assertEqual(res_csv.status_code, 200)
        self.assertIn(b'Date,Description,Category,Account,Type,Necessity Tag,Amount (INR)', res_csv.data)

        # 3. JSON Backup
        res_json = self.client.get('/api/settings/export/json')
        self.assertEqual(res_json.status_code, 200)
        backup = json.loads(res_json.data)
        self.assertEqual(backup['app'], 'MoneyTrack Offline Financial Planner')

        # 4. Attempt Invalid Backup -> Existing data remains safe
        before_totals = self.fin_service.get_ledger_totals(1)
        res_bad = self.client.post('/api/settings/import/json', json={
            'app': 'WrongApp',
            'transactions': []
        })
        self.assertEqual(res_bad.status_code, 400)
        after_totals = self.fin_service.get_ledger_totals(1)
        self.assertEqual(before_totals['balance'], after_totals['balance'])

    # --- 6. Financial Consistency Known Test Dataset ---
    def test_known_financial_dataset_exact_consistency(self):
        """
        Verify precise accounting rules on known dataset:
        Opening balance: ₹0
        Income: ₹10,000
        Expenses: ₹3,000
        Remaining balance: ₹7,000
        """
        pid = self.fin_service.create_user_profile("Audit Verifier", "₹")
        
        # Add Income ₹10,000
        self.fin_service.add_transaction(pid, '2026-10-01', 'Monthly Salary', 'Salary', 'income', 'necessary', 10000)
        
        # Add Expenses: ₹2,000 Food, ₹1,000 Transport
        self.fin_service.add_transaction(pid, '2026-10-02', 'Weekly Groceries', 'Food & Dining', 'expense', 'necessary', 2000)
        self.fin_service.add_transaction(pid, '2026-10-03', 'Bus Pass', 'Transport', 'expense', 'necessary', 1000)

        # Verify ledger totals
        totals = self.fin_service.get_ledger_totals(pid)
        self.assertEqual(totals['income'], 10000.0)
        self.assertEqual(totals['expenses'], 3000.0)
        self.assertEqual(totals['balance'], 7000.0)
        self.assertEqual(totals['savings'], 7000.0)
        self.assertEqual(totals['savings_rate'], 70.0) # 7,000 / 10,000 = 70.0%

        # Verify category spending breakdown
        cat_spending = self.fin_service.get_category_spending(pid)
        self.assertEqual(len(cat_spending), 2)
        food_cat = next(c for c in cat_spending if c['name'] == 'Food & Dining')
        transport_cat = next(c for c in cat_spending if c['name'] == 'Transport')
        
        self.assertEqual(food_cat['spent'], 2000.0)
        self.assertEqual(food_cat['percentage'], 66.7) # 2000 / 3000 = 66.7%
        self.assertEqual(transport_cat['spent'], 1000.0)
        self.assertEqual(transport_cat['percentage'], 33.3) # 1000 / 3000 = 33.3%

        # Clean up
        self.fin_service.delete_user_profile(pid)

if __name__ == '__main__':
    unittest.main()
