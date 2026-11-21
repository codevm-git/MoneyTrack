import unittest
import os
import sys
import json
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'vendor')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app

class TestApiEndpoints(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.temp_db.close()
        self.app = create_app(self.temp_db.name)
        self.client = self.app.test_client()

    def tearDown(self):
        if os.path.exists(self.temp_db.name):
            os.remove(self.temp_db.name)

    def test_index_page(self):
        res = self.client.get('/')
        self.assertEqual(res.status_code, 200)
        self.assertIn(b'MoneyTrack', res.data)
        self.assertIn(b'Financial Health Score', res.data)

    def test_dashboard_api(self):
        res = self.client.get('/api/dashboard')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn('user', data)
        self.assertIn('totals', data)
        self.assertIn('health', data)
        self.assertIn('budgets', data)
        self.assertIn('alerts', data)

    def test_transactions_crud(self):
        # 1. Get transactions
        res = self.client.get('/api/transactions')
        self.assertEqual(res.status_code, 200)
        initial_count = len(res.get_json()['transactions'])
        self.assertEqual(initial_count, 6)

        # 2. Create transaction
        new_tx = {
            'date': '2026-10-17',
            'description': 'Integration Test Tea',
            'category': 'Food & Dining',
            'type': 'expense',
            'typeTag': 'optional',
            'amount': 50
        }
        res_post = self.client.post('/api/transactions', json=new_tx)
        self.assertEqual(res_post.status_code, 201)
        tx_id = res_post.get_json()['id']

        # Verify added
        res_after = self.client.get('/api/transactions')
        self.assertEqual(len(res_after.get_json()['transactions']), initial_count + 1)

        # 3. Delete transaction
        res_del = self.client.delete(f'/api/transactions/{tx_id}')
        self.assertEqual(res_del.status_code, 200)

        # Verify deleted
        res_final = self.client.get('/api/transactions')
        self.assertEqual(len(res_final.get_json()['transactions']), initial_count)

    def test_goals_api(self):
        res = self.client.get('/api/goals')
        self.assertEqual(res.status_code, 200)
        goals = res.get_json()['goals']
        self.assertEqual(len(goals), 2)

        # Create goal
        new_goal = {
            'name': 'Electric Scooter',
            'targetAmount': 85000,
            'currentAmount': 10000,
            'date': '2027-10-01'
        }
        res_post = self.client.post('/api/goals', json=new_goal)
        self.assertEqual(res_post.status_code, 201)
        goal_id = res_post.get_json()['id']

        # Deposit
        res_dep = self.client.post(f'/api/goals/{goal_id}/deposit', json={'amount': 2000})
        self.assertEqual(res_dep.status_code, 200)

        # Delete
        res_del = self.client.delete(f'/api/goals/{goal_id}')
        self.assertEqual(res_del.status_code, 200)

    def test_calendar_api(self):
        res = self.client.get('/api/calendar')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.get_json()['events']), 4)

        # Add event
        new_event = {
            'title': 'Broadband Bill',
            'amount': 999,
            'type': 'expense',
            'date': '2026-10-25'
        }
        res_post = self.client.post('/api/calendar', json=new_event)
        self.assertEqual(res_post.status_code, 201)
        ev_id = res_post.get_json()['id']

        # Delete event
        res_del = self.client.delete(f'/api/calendar/{ev_id}')
        self.assertEqual(res_del.status_code, 200)

    def test_calculators_api(self):
        # EMI
        emi_res = self.client.post('/api/calculators/emi', json={'principal': 500000, 'rate': 10.5, 'months': 36})
        self.assertEqual(emi_res.status_code, 200)
        self.assertEqual(emi_res.get_json()['monthly_emi'], 16251)

        # CI
        ci_res = self.client.post('/api/calculators/ci', json={'principal': 100000, 'rate': 12, 'years': 10})
        self.assertEqual(ci_res.status_code, 200)
        self.assertEqual(ci_res.get_json()['future_value'], 310585)

        # Inflation
        inf_res = self.client.post('/api/calculators/inflation', json={'cost': 50000, 'rate': 6, 'years': 10})
        self.assertEqual(inf_res.status_code, 200)
        self.assertEqual(inf_res.get_json()['future_cost'], 89542)

        # Savings Growth (SIP)
        sip_res = self.client.post('/api/calculators/savings', json={'deposit': 5000, 'rate': 12, 'years': 10})
        self.assertEqual(sip_res.status_code, 200)
        self.assertEqual(sip_res.get_json()['future_value'], 1161695)
        self.assertEqual(sip_res.get_json()['total_deposited'], 600000)

    def test_learning_and_quizzes(self):
        # Lessons
        res_less = self.client.get('/api/learning/lessons')
        self.assertEqual(res_less.status_code, 200)
        self.assertEqual(len(res_less.get_json()['lessons']), 3)

        # Quizzes
        res_quiz = self.client.get('/api/learning/quizzes/1')
        self.assertEqual(res_quiz.status_code, 200)
        quizzes = res_quiz.get_json()['quizzes']
        self.assertEqual(len(quizzes), 3)

        # Submit answer
        first_q = quizzes[0]
        res_sub = self.client.post('/api/learning/quizzes/submit', json={
            'quiz_id': first_q['id'],
            'selected_index': first_q['correct_index']
        })
        self.assertEqual(res_sub.status_code, 200)
        self.assertTrue(res_sub.get_json()['is_correct'])

        # Achievements
        res_ach = self.client.get('/api/learning/achievements')
        self.assertEqual(res_ach.status_code, 200)
        self.assertEqual(len(res_ach.get_json()['achievements']), 4)

    def test_backup_export_and_import(self):
        # JSON Export
        res_json = self.client.get('/api/settings/export/json')
        self.assertEqual(res_json.status_code, 200)
        backup_data = json.loads(res_json.data)
        self.assertEqual(backup_data['app'], 'MoneyTrack Offline Financial Planner')

        # CSV Export
        res_csv = self.client.get('/api/settings/export/csv')
        self.assertEqual(res_csv.status_code, 200)
        self.assertIn(b'Grocery Market Supplies', res_csv.data)

        # Import JSON
        res_imp = self.client.post('/api/settings/import/json', json=backup_data)
        self.assertEqual(res_imp.status_code, 200)

        # Transfer Funds between Accounts
        acc_res = self.client.get('/api/accounts').get_json()
        if len(acc_res['accounts']) >= 2:
            res_transfer = self.client.post('/api/accounts/transfer', json={
                'from_account_id': acc_res['accounts'][0]['id'],
                'to_account_id': acc_res['accounts'][1]['id'],
                'amount': 250.0,
                'date': '2026-10-24',
                'note': 'Test wallet transfer'
            })
            self.assertEqual(res_transfer.status_code, 201)
            self.assertTrue(res_transfer.get_json()['success'])

    def test_simulator_and_affordability_api(self):
        # 1. Baseline API
        res_base = self.client.get('/api/simulate/baseline')
        self.assertEqual(res_base.status_code, 200)
        base = res_base.get_json()
        self.assertIn('total_liquid_available', base)
        self.assertIn('base_income', base)
        self.assertIn('base_expenses', base)
        self.assertIn('accounts', base)

        # 2. What-If Simulation API
        res_sim = self.client.post('/api/simulate/what-if', json={
            'scenario_type': 'salary',
            'change_amount': 5000
        })
        self.assertEqual(res_sim.status_code, 200)
        sim = res_sim.get_json()
        self.assertIn('sim_savings', sim)
        self.assertIn('baseline_trend', sim)
        self.assertIn('simulated_trend', sim)
        self.assertEqual(len(sim['baseline_trend']), 13)

        # 3. Affordability Check API
        res_aff = self.client.post('/api/simulate/affordability', json={
            'item_name': 'Test Purchase',
            'price': 2500
        })
        self.assertEqual(res_aff.status_code, 200)
        aff = res_aff.get_json()
        self.assertIn('verdict', aff)
        self.assertIn('status', aff)
        self.assertIn(aff['status'], ['safe', 'warning', 'critical'])
        self.assertIn('total_liquid_available', aff)
        self.assertIn('summary_text', aff)

    def test_calendar_month_api(self):
        # 1. Test GET /api/calendar/month
        res = self.client.get('/api/calendar/month?year=2026&month=10')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data['year'], 2026)
        self.assertEqual(data['month'], 10)
        self.assertEqual(data['month_name'], 'October')
        self.assertIn('month_summary', data)
        self.assertIn('income', data['month_summary'])
        self.assertIn('expenses', data['month_summary'])
        self.assertIn('days', data)
        self.assertEqual(len(data['days']), 31)

        # 2. Test account filter
        res_acc = self.client.get('/api/calendar/month?year=2026&month=10&account_id=1')
        self.assertEqual(res_acc.status_code, 200)
        data_acc = res_acc.get_json()
        self.assertIn('days', data_acc)

        # 3. Test type filter
        res_type = self.client.get('/api/calendar/month?year=2026&month=10&type=expense')
        self.assertEqual(res_type.status_code, 200)
        data_type = res_type.get_json()
        self.assertIn('days', data_type)

    def test_analytics_summary_api(self):
        # 1. Test GET /api/analytics/summary
        res = self.client.get('/api/analytics/summary?month_year=2026-10')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data['current_month'], '2026-10')
        self.assertEqual(data['previous_month'], '2026-09')
        self.assertIn('current', data)
        self.assertIn('previous', data)
        self.assertIn('delta', data)
        self.assertIn('category_deltas', data)
        self.assertIn('category_spending', data)
        self.assertIn('ratio_50_30_20', data)
        self.assertIn('trend_history', data)
        self.assertIn('daily_comparison', data)
        self.assertEqual(len(data['trend_history']), 6)
        self.assertEqual(len(data['daily_comparison']), 31)

        # 2. Test with account filter
        res_acc = self.client.get('/api/analytics/summary?account_id=1&month_year=2026-10')
        self.assertEqual(res_acc.status_code, 200)
        self.assertIn('current', res_acc.get_json())

if __name__ == '__main__':
    unittest.main()
