import unittest
import os
import sys
import tempfile
import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'vendor')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app
from app.services.financial_service import FinancialService

class TestDashboardAnalyticsAndAlerts(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.temp_db.close()
        self.app = create_app(self.temp_db.name)
        self.client = self.app.test_client()
        self.fin_service = FinancialService(self.temp_db.name)

    def tearDown(self):
        if os.path.exists(self.temp_db.name):
            os.remove(self.temp_db.name)

    def test_account_wise_financial_data_isolation(self):
        """Verify that every account generates individual, unmixed financial summaries."""
        # Seed has 3 accounts: Savings (id=1, is_default=1), Cash (id=2), Credit Card (id=3)
        accounts = self.fin_service.get_accounts(profile_id=1)
        self.assertGreaterEqual(len(accounts), 3)

        # Primary account is clearly identified
        primary_accounts = [a for a in accounts if a['is_primary']]
        self.assertEqual(len(primary_accounts), 1)
        self.assertEqual(primary_accounts[0]['name'], 'Main Savings Bank')

        # Get initial totals for Account 1 and Account 2
        init_acc1 = self.fin_service.get_ledger_totals(profile_id=1, account_id=1)
        init_acc2 = self.fin_service.get_ledger_totals(profile_id=1, account_id=2)

        # Add income to Account 1 (Savings)
        self.fin_service.add_transaction(
            profile_id=1,
            date='2026-11-01',
            description='Savings Deposit',
            category_name_or_id='Salary',
            tx_type='income',
            amount_rupees=10000,
            account_id=1
        )

        # Add expense to Account 2 (Cash)
        self.fin_service.add_transaction(
            profile_id=1,
            date='2026-11-02',
            description='Cash Grocery',
            category_name_or_id='Food & Dining',
            tx_type='expense',
            amount_rupees=1500,
            account_id=2
        )

        # Totals for Account 1 must have increased income by 10,000, but expenses unchanged
        acc1_totals = self.fin_service.get_ledger_totals(profile_id=1, account_id=1)
        self.assertEqual(acc1_totals['income'], init_acc1['income'] + 10000)
        self.assertEqual(acc1_totals['expenses'], init_acc1['expenses'])

        # Totals for Account 2 must have increased expenses by 1,500, but income unchanged
        acc2_totals = self.fin_service.get_ledger_totals(profile_id=1, account_id=2)
        self.assertEqual(acc2_totals['expenses'], init_acc2['expenses'] + 1500)
        self.assertEqual(acc2_totals['income'], init_acc2['income'])

    def test_account_wise_health_score_and_category_spending(self):
        """Verify Financial Health Score and category charts are account-specific."""
        # Account 1 health score
        acc1_health = self.fin_service.calculate_health_score(profile_id=1, account_id=1)
        self.assertIn('score', acc1_health)
        self.assertTrue(0 <= acc1_health['score'] <= 100)

        # Create a new empty account
        new_acc_id = self.fin_service.add_account(
            profile_id=1,
            name='Fresh Investment Account',
            account_type='investment',
            initial_balance=5000
        )
        # Empty account has 0 transactions, score must be 0 and status 'Getting Started'
        empty_health = self.fin_service.calculate_health_score(profile_id=1, account_id=new_acc_id)
        self.assertEqual(empty_health['score'], 0)
        self.assertEqual(empty_health['status'], 'Getting Started')

        # Category spending scoped to account
        self.fin_service.add_transaction(
            profile_id=1,
            date='2026-11-03',
            description='Fuel from Cash',
            category_name_or_id='Transport',
            tx_type='expense',
            amount_rupees=800,
            account_id=2
        )
        cat_spending_acc2 = self.fin_service.get_category_spending(profile_id=1, account_id=2)
        cat_names = [c['name'] for c in cat_spending_acc2]
        self.assertIn('Transport', cat_names)

    def test_category_budget_limits_crud_and_calculations(self):
        """Test category budget creation, updating, deletion, and remaining calculation."""
        current_month = datetime.date.today().strftime('%Y-%m')

        # 1. Create budget limit
        self.fin_service.set_budget(
            profile_id=1,
            category_name_or_id='Entertainment',
            monthly_limit_rupees=3000,
            month_year=current_month
        )

        # 2. Verify budget overview returns limit, spent, remaining, and pct
        budgets = self.fin_service.get_budget_overview(profile_id=1, month_year=current_month)
        ent_budget = next((b for b in budgets if b['name'] == 'Entertainment'), None)
        self.assertIsNotNone(ent_budget)
        self.assertEqual(ent_budget['limit'], 3000)
        self.assertEqual(ent_budget['spent'], 0)
        self.assertEqual(ent_budget['remaining'], 3000)
        self.assertEqual(ent_budget['pct'], 0)

        # 3. Add expense to Entertainment category
        self.fin_service.add_transaction(
            profile_id=1,
            date=datetime.date.today().strftime('%Y-%m-%d'),
            description='Movie Tickets',
            category_name_or_id='Entertainment',
            tx_type='expense',
            amount_rupees=1200,
            account_id=1
        )

        budgets_after = self.fin_service.get_budget_overview(profile_id=1, month_year=current_month)
        ent_after = next((b for b in budgets_after if b['name'] == 'Entertainment'), None)
        self.assertEqual(ent_after['spent'], 1200)
        self.assertEqual(ent_after['remaining'], 1800)
        self.assertEqual(ent_after['pct'], 40)

        # 4. Delete budget limit
        self.fin_service.delete_budget(profile_id=1, category_id=ent_after['category_id'], month_year=current_month)
        budgets_final = self.fin_service.get_budget_overview(profile_id=1, month_year=current_month)
        ent_final = next((b for b in budgets_final if b['name'] == 'Entertainment'), None)
        self.assertIsNone(ent_final)

    def test_dynamic_spending_insights(self):
        """Test dynamic spending insights generate without dummy or hardcoded text."""
        insight = self.fin_service.generate_spending_insights(profile_id=1)
        self.assertIsInstance(insight, str)
        self.assertGreater(len(insight), 10)
        # Must not contain dummy strings
        self.assertNotIn('Shopping increased 18% compared with last month. Food spending remains within expected parameters.', insight)

    def test_real_time_financial_alerts(self):
        """Test real-time financial alert generation from actual data."""
        current_month = datetime.date.today().strftime('%Y-%m')

        # Set a small budget of 500 for Shopping
        self.fin_service.set_budget(
            profile_id=1,
            category_name_or_id='Shopping',
            monthly_limit_rupees=500,
            month_year=current_month
        )

        # Log expense of 1000 to trigger budget exceeded danger alert
        self.fin_service.add_transaction(
            profile_id=1,
            date=datetime.date.today().strftime('%Y-%m-%d'),
            description='Excessive Shopping',
            category_name_or_id='Shopping',
            tx_type='expense',
            amount_rupees=1000,
            account_id=1
        )

        alerts = self.fin_service.get_financial_alerts(profile_id=1)
        danger_alerts = [a for a in alerts if a['type'] == 'danger']
        self.assertTrue(any('Budget Exceeded' in a['title'] for a in danger_alerts))

    def test_live_system_diagnostics(self):
        """Test live system diagnostics monitoring calculations, references, and SQLite WAL."""
        diagnostics = self.fin_service.run_system_diagnostics(profile_id=1)
        self.assertIn('status', diagnostics)
        self.assertIn('score', diagnostics)
        self.assertIn('checks', diagnostics)
        self.assertEqual(diagnostics['total_checks'], 5)
        # All 5 standard checks must pass on a healthy database
        self.assertEqual(diagnostics['status'], 'healthy')
        self.assertEqual(diagnostics['score'], 100)

    def test_api_dashboard_account_wise_endpoints(self):
        """Test /api/dashboard returns account summaries and accepts ?account_id= parameter."""
        res = self.client.get('/api/dashboard?account_id=1')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        self.assertIn('selected_account_id', data)
        self.assertIn('primary_account_id', data)
        self.assertIn('account_summaries', data)
        self.assertIn('spending_insight', data)
        self.assertIn('diagnostics', data)
        self.assertIn('alerts', data)

        # Verify account summaries format
        summaries = data['account_summaries']
        self.assertGreaterEqual(len(summaries), 3)
        for s in summaries:
            self.assertIn('id', s)
            self.assertIn('name', s)
            self.assertIn('income', s)
            self.assertIn('expenses', s)
            self.assertIn('current_balance', s)
            self.assertIn('is_primary', s)
            self.assertIn('health_score', s)

        # Test GET /api/diagnostics
        diag_res = self.client.get('/api/diagnostics')
        self.assertEqual(diag_res.status_code, 200)
        self.assertIn('diagnostics', diag_res.get_json())

        # Test GET /api/accounts/summary
        acc_res = self.client.get('/api/accounts/summary')
        self.assertEqual(acc_res.status_code, 200)
        self.assertIn('account_summaries', acc_res.get_json())

if __name__ == '__main__':
    unittest.main()
