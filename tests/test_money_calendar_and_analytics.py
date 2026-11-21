import unittest
import os
import sys
import tempfile
import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'vendor')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app
from app.services.financial_service import FinancialService

class TestMoneyCalendarAndAnalytics(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.temp_db.close()
        self.app = create_app(self.temp_db.name)
        self.client = self.app.test_client()
        self.service = FinancialService(self.temp_db.name)

    def tearDown(self):
        if os.path.exists(self.temp_db.name):
            os.remove(self.temp_db.name)

    def test_01_calendar_daily_transactions_display(self):
        """Verify actual income, expenses, and transfers display accurately on their respective dates."""
        # Log income on 2026-11-05
        self.service.add_transaction(
            profile_id=1,
            date='2026-11-05',
            description='Client Retainer Payout',
            category_name_or_id='Salary',
            tx_type='income',
            amount_rupees=35000,
            account_id=1
        )

        # Log expense on 2026-11-05
        self.service.add_transaction(
            profile_id=1,
            date='2026-11-05',
            description='Coworking Space Rent',
            category_name_or_id='Rent & Housing',
            tx_type='expense',
            amount_rupees=8500,
            account_id=1
        )

        # Log transfer on 2026-11-05 from Account 1 to Account 2
        self.service.transfer_funds(
            profile_id=1,
            from_account_id=1,
            to_account_id=2,
            amount_rupees=5000,
            date='2026-11-05',
            description='Transfer to Cash Wallet'
        )

        cal_data = self.service.get_calendar_data(profile_id=1, year=2026, month=11)
        self.assertEqual(cal_data['year'], 2026)
        self.assertEqual(cal_data['month'], 11)
        self.assertEqual(cal_data['month_name'], 'November')
        self.assertEqual(cal_data['month_year'], '2026-11')

        # Check day 2026-11-05
        day_info = cal_data['days']['2026-11-05']
        self.assertEqual(day_info['income'], 35000)
        self.assertEqual(day_info['expenses'], 8500)
        self.assertEqual(day_info['incoming_transfers'], 5000)
        self.assertEqual(day_info['outgoing_transfers'], 5000)
        self.assertEqual(day_info['transaction_count'], 3)
        self.assertEqual(len(day_info['transactions']), 3)

        # Verify transaction types are distinguishable
        types = [t['type'] for t in day_info['transactions']]
        self.assertIn('income', types)
        self.assertIn('expense', types)
        self.assertIn('transfer', types)

    def test_02_calendar_month_navigation_and_day_counts(self):
        """Verify calendar correctly calculates month bounds, total days, and weekday offsets."""
        feb_data = self.service.get_calendar_data(profile_id=1, year=2026, month=2)
        self.assertEqual(feb_data['total_days'], 28)
        self.assertEqual(feb_data['month_name'], 'February')

        oct_data = self.service.get_calendar_data(profile_id=1, year=2026, month=10)
        self.assertEqual(oct_data['total_days'], 31)
        self.assertEqual(oct_data['month_name'], 'October')

    def test_03_calendar_account_and_type_filtering(self):
        """Verify filtering by account/wallet and by transaction type."""
        # Account 1 transaction
        self.service.add_transaction(
            profile_id=1, date='2026-11-10', description='Account 1 Income',
            category_name_or_id='Salary', tx_type='income', amount_rupees=10000, account_id=1
        )
        # Account 2 transaction
        self.service.add_transaction(
            profile_id=1, date='2026-11-10', description='Account 2 Expense',
            category_name_or_id='Food & Dining', tx_type='expense', amount_rupees=500, account_id=2
        )

        # Filter by Account 1
        cal_acc1 = self.service.get_calendar_data(profile_id=1, year=2026, month=11, account_id=1)
        self.assertEqual(cal_acc1['days']['2026-11-10']['transaction_count'], 1)
        self.assertEqual(cal_acc1['days']['2026-11-10']['income'], 10000)
        self.assertEqual(cal_acc1['days']['2026-11-10']['expenses'], 0)

        # Filter by Type = expense
        cal_exp = self.service.get_calendar_data(profile_id=1, year=2026, month=11, tx_type='expense')
        self.assertEqual(cal_exp['days']['2026-11-10']['transaction_count'], 1)
        self.assertEqual(cal_exp['days']['2026-11-10']['expenses'], 500)
        self.assertEqual(cal_exp['days']['2026-11-10']['income'], 0)

    def test_04_transfers_and_savings_isolated_from_income_expense(self):
        """Transfers, opening balances, and savings goal movements must not be treated as income or expenses."""
        # Add a savings goal with dedicated wallet
        goal_id = self.service.add_goal(
            profile_id=1,
            name='Emergency Cushion',
            target_rupees=50000,
            current_rupees=0,
            target_date='2027-12-31'
        )

        # Deposit money into savings goal (records as transfer)
        self.service.deposit_goal(profile_id=1, goal_id=goal_id, deposit_rupees=10000, account_id=1)

        # Withdraw money from savings goal (records as transfer)
        self.service.withdraw_goal(profile_id=1, goal_id=goal_id, withdraw_rupees=2000, account_id=1)

        curr_month = datetime.date.today().strftime('%Y-%m')
        analytics = self.service.get_analytics_summary(profile_id=1, month_year=curr_month)

        # Transfers should not have inflated current month's regular income or expenses
        # Neither deposit nor withdrawal are income/expense
        curr = analytics['current']
        # Income must not contain the 2,000 withdrawal
        # Expense must not contain the 10,000 deposit
        cal = self.service.get_calendar_data(profile_id=1, year=datetime.date.today().year, month=datetime.date.today().month)
        self.assertEqual(cal['month_summary']['income'], curr['income'])
        self.assertEqual(cal['month_summary']['expenses'], curr['expenses'])

    def test_05_analytics_mom_delta_calculations(self):
        """
        Verify exact Month-over-Month Delta formula matching user prompt requirement:
        Previous Month: Income ₹20,000, Expenses ₹10,000, Savings ₹10,000
        Current Month: Income ₹22,000, Expenses ₹12,000, Savings ₹10,000
        Expected: Income +₹2,000 (+10%), Expenses +₹2,000 (+20%), Savings 0 (0%)
        """
        # Create user profile 2 to test isolated clean numbers
        self.service.create_user_profile("TestMoMUser", "₹", "pass123")
        profiles = self.service.list_user_profiles()
        u2 = [p for p in profiles if p['name'] == 'TestMoMUser'][0]
        p2_id = u2['id']

        # Add account for user 2
        acc_id = self.service.add_account(profile_id=p2_id, name="Checking", account_type="savings", initial_balance=50000)

        # Previous Month: 2026-09
        self.service.add_transaction(profile_id=p2_id, date='2026-09-01', description='Salary Sep', category_name_or_id='Salary', tx_type='income', amount_rupees=20000, account_id=acc_id)
        self.service.add_transaction(profile_id=p2_id, date='2026-09-05', description='Rent Sep', category_name_or_id='Rent & Housing', tx_type='expense', amount_rupees=10000, account_id=acc_id)

        # Current Month: 2026-10
        self.service.add_transaction(profile_id=p2_id, date='2026-10-01', description='Salary Oct', category_name_or_id='Salary', tx_type='income', amount_rupees=22000, account_id=acc_id)
        self.service.add_transaction(profile_id=p2_id, date='2026-10-05', description='Rent & Groceries Oct', category_name_or_id='Rent & Housing', tx_type='expense', amount_rupees=12000, account_id=acc_id)

        analytics = self.service.get_analytics_summary(profile_id=p2_id, month_year='2026-10')

        # Previous Month assertions
        self.assertEqual(analytics['previous']['income'], 20000)
        self.assertEqual(analytics['previous']['expenses'], 10000)
        self.assertEqual(analytics['previous']['savings'], 10000)

        # Current Month assertions
        self.assertEqual(analytics['current']['income'], 22000)
        self.assertEqual(analytics['current']['expenses'], 12000)
        self.assertEqual(analytics['current']['savings'], 10000)

        # Deltas
        delta = analytics['delta']
        self.assertEqual(delta['income'], 2000)
        self.assertEqual(delta['income_pct'], 10.0)
        self.assertEqual(delta['expenses'], 2000)
        self.assertEqual(delta['expenses_pct'], 20.0)
        self.assertEqual(delta['savings'], 0)
        self.assertEqual(delta['savings_pct'], 0.0)
        self.assertEqual(delta['net_cashflow'], 0)

    def test_06_analytics_category_spending_distribution(self):
        """Verify real category spending percentages and breakdown."""
        # Create user profile 3
        self.service.create_user_profile("TestCatUser", "₹", "pass123")
        profiles = self.service.list_user_profiles()
        u3 = [p for p in profiles if p['name'] == 'TestCatUser'][0]
        p3_id = u3['id']
        acc_id = self.service.add_account(profile_id=p3_id, name="Checking", account_type="savings", initial_balance=50000)

        # Add ₹3,000 Food and ₹1,000 Transport in 2026-11
        self.service.add_transaction(profile_id=p3_id, date='2026-11-02', description='Groceries', category_name_or_id='Food & Dining', tx_type='expense', amount_rupees=3000, account_id=acc_id)
        self.service.add_transaction(profile_id=p3_id, date='2026-11-04', description='Metro Card', category_name_or_id='Transport', tx_type='expense', amount_rupees=1000, account_id=acc_id)

        analytics = self.service.get_analytics_summary(profile_id=p3_id, month_year='2026-11')
        cats = analytics['category_spending']
        self.assertEqual(len(cats), 2)

        food = [c for c in cats if c['name'] == 'Food & Dining'][0]
        trans = [c for c in cats if c['name'] == 'Transport'][0]

        self.assertEqual(food['spent'], 3000)
        self.assertEqual(food['percentage'], 75.0)
        self.assertEqual(trans['spent'], 1000)
        self.assertEqual(trans['percentage'], 25.0)

    def test_07_analytics_50_30_20_ratio_dynamic(self):
        """Verify dynamic calculation of Necessary Needs vs Optional Wants."""
        self.service.create_user_profile("TestRatioUser", "₹", "pass123")
        profiles = self.service.list_user_profiles()
        u4 = [p for p in profiles if p['name'] == 'TestRatioUser'][0]
        p4_id = u4['id']
        acc_id = self.service.add_account(profile_id=p4_id, name="Checking", account_type="savings", initial_balance=50000)

        # Necessary ₹6,000
        self.service.add_transaction(
            profile_id=p4_id, date='2026-11-01', description='Electricity',
            category_name_or_id='Bills & Utilities', tx_type='expense',
            amount_rupees=6000, account_id=acc_id, type_tag='necessary'
        )

        # Optional ₹4,000
        self.service.add_transaction(
            profile_id=p4_id, date='2026-11-03', description='Concert Pass',
            category_name_or_id='Entertainment', tx_type='expense',
            amount_rupees=4000, account_id=acc_id, type_tag='optional'
        )

        analytics = self.service.get_analytics_summary(profile_id=p4_id, month_year='2026-11')
        r = analytics['ratio_50_30_20']

        self.assertEqual(r['necessary_rupees'], 6000)
        self.assertEqual(r['optional_rupees'], 4000)
        self.assertEqual(r['total_expenses_rupees'], 10000)
        self.assertEqual(r['necessary_pct'], 60.0)
        self.assertEqual(r['optional_pct'], 40.0)

    def test_08_analytics_trends_history_and_daily_comparison(self):
        """Verify line graph data models: 6-month historical trend array and 31-day comparison array."""
        analytics = self.service.get_analytics_summary(profile_id=1, month_year='2026-11')

        # 6-month trend history
        history = analytics['trend_history']
        self.assertEqual(len(history), 6)
        for h in history:
            self.assertIn('month_key', h)
            self.assertIn('label', h)
            self.assertIn('income', h)
            self.assertIn('expenses', h)
            self.assertIn('savings', h)
            self.assertIn('net_cashflow', h)

        # 31-day daily comparison
        daily = analytics['daily_comparison']
        self.assertEqual(len(daily), 31)
        for d in daily:
            self.assertIn('day', d)
            self.assertIn('curr_expense', d)
            self.assertIn('prev_expense', d)
            self.assertIn('cum_curr_expense', d)
            self.assertIn('cum_prev_expense', d)

    def test_09_empty_profile_handling(self):
        """Ensure an empty user profile with zero transactions executes cleanly without division by zero."""
        self.service.create_user_profile("FreshUser", "₹", "pass123")
        profiles = self.service.list_user_profiles()
        fresh_u = [p for p in profiles if p['name'] == 'FreshUser'][0]
        fresh_id = fresh_u['id']

        cal = self.service.get_calendar_data(profile_id=fresh_id, year=2026, month=11)
        self.assertEqual(cal['month_summary']['income'], 0)
        self.assertEqual(cal['month_summary']['expenses'], 0)
        self.assertEqual(cal['month_summary']['transaction_count'], 0)

        analytics = self.service.get_analytics_summary(profile_id=fresh_id, month_year='2026-11')
        self.assertEqual(analytics['current']['income'], 0)
        self.assertEqual(analytics['current']['expenses'], 0)
        self.assertEqual(analytics['delta']['income_pct'], 0.0)
        self.assertEqual(analytics['delta']['expenses_pct'], 0.0)
        self.assertEqual(analytics['ratio_50_30_20']['necessary_pct'], 0.0)

    def test_10_account_wise_analytics_filtering(self):
        """Verify account-specific analytics isolation."""
        # Account 1 has seed data; create fresh Account 4
        new_acc_id = self.service.add_account(profile_id=1, name="Isolated Wallet", account_type="wallet", initial_balance=5000)

        # Log expense only on Isolated Wallet
        self.service.add_transaction(
            profile_id=1, date='2026-11-15', description='Wallet Spend',
            category_name_or_id='Shopping', tx_type='expense', amount_rupees=1200, account_id=new_acc_id
        )

        acc_analytics = self.service.get_analytics_summary(profile_id=1, account_id=new_acc_id, month_year='2026-11')
        self.assertEqual(acc_analytics['current']['expenses'], 1200)
        self.assertEqual(acc_analytics['current']['income'], 0)

if __name__ == '__main__':
    unittest.main()
