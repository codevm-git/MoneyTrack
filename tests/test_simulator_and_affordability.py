import unittest
import os
import sys
import tempfile
import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'vendor')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database.connection import init_db
from app.services.financial_service import FinancialService, rupees_to_paise, paise_to_rupees

class TestSimulatorAndAffordability(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.temp_db.close()
        init_db(self.temp_db.name)
        self.service = FinancialService(self.temp_db.name)

    def tearDown(self):
        if os.path.exists(self.temp_db.name):
            os.remove(self.temp_db.name)

    # Test Case 1: User has sufficient available balance
    def test_case_01_sufficient_available_balance(self):
        accounts = self.service.get_accounts(1)
        savings_acc = next(a for a in accounts if a['account_type'] == 'savings' and not a.get('is_savings_wallet'))
        
        # In seed data, savings_acc has sufficient balance (> 20,000 INR)
        # Small purchase of 500 INR
        res = self.service.evaluate_affordability(
            profile_id=1,
            item_name="Wireless Mouse",
            price_rupees=500,
            account_id=savings_acc['id']
        )
        self.assertEqual(res['status'], 'safe')
        self.assertEqual(res['verdict'], 'You can afford this.')
        self.assertEqual(res['price'], 500)
        self.assertGreater(res['account_post_balance'], 0)
        self.assertGreater(res['total_post_liquid'], 0)
        self.assertGreaterEqual(res['coverage_months'], 3.0)

        # Verify no database state was changed
        refreshed_acc = next(a for a in self.service.get_accounts(1) if a['id'] == savings_acc['id'])
        self.assertEqual(refreshed_acc['current_balance'], savings_acc['current_balance'])

    # Test Case 2: User has insufficient available balance (exceeds total liquid funds)
    def test_case_02_insufficient_available_balance(self):
        res = self.service.evaluate_affordability(
            profile_id=1,
            item_name="Luxury Car",
            price_rupees=50000000 # 5 Crore
        )
        self.assertEqual(res['status'], 'critical')
        self.assertEqual(res['verdict'], 'This purchase exceeds your available balance.')
        self.assertLess(res['total_post_liquid'], 0)
        self.assertIn("exceeds your", res['summary_text'])

    # Test Case 3: Purchase affects an active Savings Goal (paying from dedicated goal wallet)
    def test_case_03_purchase_from_savings_goal_wallet(self):
        # Create a dedicated savings goal wallet
        goal_id = self.service.add_goal(1, "Vacation Fund", 50000, 15000, "2027-12-31")
        accounts = self.service.get_accounts(1)
        goal_wallet = next(a for a in accounts if a.get('is_savings_wallet') and a.get('savings_goal_id') == goal_id)
        
        # Ensure goal wallet funds are NOT counted in freely available spending cash
        regular_asset_accounts = [a for a in accounts if a['account_type'] != 'credit_card' and not a.get('is_savings_wallet')]
        expected_free_cash = sum(a['current_balance'] for a in regular_asset_accounts)
        
        # Test affordability when selecting the goal wallet
        res = self.service.evaluate_affordability(
            profile_id=1,
            item_name="Airfare",
            price_rupees=5000,
            account_id=goal_wallet['id']
        )
        self.assertEqual(res['status'], 'warning')
        self.assertEqual(res['verdict'], 'This purchase may affect your savings.')
        self.assertTrue(res['is_savings_wallet'])
        self.assertIn("dedicated Savings Goal wallet", res['summary_text'])
        self.assertEqual(res['total_liquid_available'], expected_free_cash)

    # Test Case 4: Purchase exceeds the selected account balance even if other accounts have money
    def test_case_04_purchase_exceeds_selected_account_balance(self):
        accounts = self.service.get_accounts(1)
        cash_acc = next(a for a in accounts if a['account_type'] == 'cash') # In seed, 5,000 INR
        savings_acc = next(a for a in accounts if a['account_type'] == 'savings') # 20,000+ INR
        
        # User tries to buy item of 10,000 INR from cash account (has only 5,000)
        res = self.service.evaluate_affordability(
            profile_id=1,
            item_name="Office Desk",
            price_rupees=10000,
            account_id=cash_acc['id']
        )
        # Must NOT say 'safe' even though total across accounts (25,000+) is enough!
        self.assertEqual(res['status'], 'critical')
        self.assertEqual(res['verdict'], 'This purchase exceeds your available balance.')
        self.assertLess(res['account_post_balance'], 0)
        self.assertIn("exceeds your available balance in 'Cash in Hand'", res['summary_text'])

    # Test Case 5: User has multiple accounts and wallets (separates assets vs liabilities)
    def test_case_05_multi_account_and_wallet_separation(self):
        baseline = self.service.get_simulator_baseline(1)
        self.assertIn('accounts', baseline)
        self.assertIn('total_liquid_available', baseline)
        self.assertIn('savings_wallets_total', baseline)

        # Total liquid available must exclude credit cards and exclude savings wallets
        for a in baseline['regular_asset_accounts']:
            self.assertNotEqual(a['account_type'], 'credit_card')
            self.assertFalse(a.get('is_savings_wallet'))

    # Test Case 6: User has recurring expenses and scheduled commitments
    def test_case_06_recurring_expenses_and_commitments(self):
        cal_events = self.service.get_calendar_events(1)
        scheduled_commitments = sum(e['amount'] for e in cal_events if e['type'] == 'expense' and e['status'] == 'scheduled')
        self.assertGreater(scheduled_commitments, 0)

        # If a purchase leaves remaining balance less than scheduled bills
        accounts = self.service.get_accounts(1)
        regular_asset_accounts = [a for a in accounts if a['account_type'] != 'credit_card' and not a.get('is_savings_wallet')]
        total_liquid = sum(a['current_balance'] for a in regular_asset_accounts)
        
        # Price that leaves total_post_liquid < scheduled_commitments
        price = total_liquid - (scheduled_commitments / 2)
        res = self.service.evaluate_affordability(
            profile_id=1,
            item_name="Big Purchase",
            price_rupees=price
        )
        self.assertEqual(res['status'], 'warning')
        self.assertEqual(res['verdict'], 'This purchase may affect your savings.')
        self.assertIn("scheduled bills", res['summary_text'])

    # Test Case 7: User has no transaction history (fresh profile)
    def test_case_07_no_transaction_history(self):
        # Create fresh profile
        new_prof_id = self.service.create_user_profile("Newcomer", "₹", "password123")
        res_afford = self.service.evaluate_affordability(
            profile_id=new_prof_id,
            item_name="Book",
            price_rupees=500
        )
        self.assertIn(res_afford['status'], ['critical', 'warning', 'safe'])
        self.assertIsNotNone(res_afford['verdict'])

        res_sim = self.service.run_what_if_simulation(
            profile_id=new_prof_id,
            scenario_type="salary",
            change_amount_rupees=5000
        )
        self.assertEqual(res_sim['base_income'], 0.0)
        self.assertEqual(res_sim['sim_income'], 5000.0)
        self.assertEqual(len(res_sim['baseline_trend']), 13)
        self.assertEqual(len(res_sim['simulated_trend']), 13)

    # Test Case 8: User has zero balance
    def test_case_08_user_has_zero_balance(self):
        new_prof_id = self.service.create_user_profile("ZeroBalUser", "₹", "password123")
        # Ensure accounts have 0 balance
        conn = self.service._get_conn()
        try:
            conn.execute("UPDATE accounts SET initial_balance_paise = 0 WHERE profile_id = ?;", (new_prof_id,))
            conn.commit()
        finally:
            conn.close()

        res = self.service.evaluate_affordability(
            profile_id=new_prof_id,
            item_name="Headphones",
            price_rupees=1500
        )
        self.assertEqual(res['status'], 'critical')
        self.assertEqual(res['verdict'], 'This purchase exceeds your available balance.')

    # Test Case 9: User changes scenario inputs repeatedly (testing all What-If scenarios)
    def test_case_09_all_what_if_scenarios(self):
        # 1. Increase monthly expenses
        sim1 = self.service.run_what_if_simulation(1, scenario_type="expense_increase", change_amount_rupees=2000)
        self.assertEqual(sim1['diff_monthly'], -2000)
        self.assertEqual(sim1['impact'], 'negative')
        self.assertEqual(len(sim1['baseline_trend']), 13)
        self.assertEqual(len(sim1['simulated_trend']), 13)

        # 2. Income decreases
        sim2 = self.service.run_what_if_simulation(1, scenario_type="income_decrease", change_amount_rupees=4000)
        self.assertLess(sim2['sim_income'], sim2['base_income'])
        self.assertEqual(sim2['impact'], 'negative')

        # 3. Income increases (Raise)
        sim3 = self.service.run_what_if_simulation(1, scenario_type="salary", change_amount_rupees=10000)
        self.assertEqual(sim3['diff_monthly'], 10000)
        self.assertEqual(sim3['impact'], 'positive')

        # 4. Save a fixed extra amount
        sim4 = self.service.run_what_if_simulation(1, scenario_type="extra_savings", change_amount_rupees=3000)
        self.assertEqual(sim4['diff_monthly'], 3000)
        self.assertEqual(sim4['impact'], 'positive')

        # 5. One-time expensive item purchase
        sim5 = self.service.run_what_if_simulation(1, scenario_type="one_time_purchase", change_amount_rupees=30000)
        self.assertEqual(sim5['one_time_cost'], 30000)
        # Immediate drop in Month 0 simulated trend
        self.assertEqual(sim5['simulated_trend'][0], sim5['baseline_trend'][0] - 30000)
        self.assertEqual(sim5['diff_balance_12m'], -30000)

        # 6. Reduce spending in category
        sim6 = self.service.run_what_if_simulation(1, scenario_type="category_reduction", change_amount_rupees=1500)
        self.assertEqual(sim6['diff_monthly'], 1500)
        self.assertEqual(sim6['impact'], 'positive')

    # Test Case 10: User updates actual transactions and recalculates results
    def test_case_10_transaction_update_and_recalculation(self):
        initial_afford = self.service.evaluate_affordability(1, "Smartphone", 12000)
        initial_reserve = initial_afford['total_liquid_available']

        # Add a major expense transaction of 15,000 INR
        tx_id = self.service.add_transaction(
            profile_id=1,
            date='2026-10-25',
            description='Medical Checkup',
            category_name_or_id='Other',
            tx_type='expense',
            type_tag='necessary',
            amount_rupees=15000
        )

        # Recalculate affordability
        updated_afford = self.service.evaluate_affordability(1, "Smartphone", 12000)
        self.assertEqual(updated_afford['total_liquid_available'], initial_reserve - 15000)

        # Test transfer does not count as income or expense
        accounts = self.service.get_accounts(1)
        acc1 = accounts[0]['id']
        acc2 = accounts[1]['id']
        xfer_id = self.service.add_transaction(
            profile_id=1,
            date='2026-10-26',
            description='Transfer to Cash',
            category_name_or_id='Transfer',
            tx_type='transfer',
            type_tag='necessary',
            amount_rupees=2000,
            account_id=acc1,
            destination_account_id=acc2
        )

        # Total liquid reserves across all accounts should remain identical after an internal transfer!
        after_xfer_afford = self.service.evaluate_affordability(1, "Smartphone", 12000)
        self.assertEqual(after_xfer_afford['total_liquid_available'], updated_afford['total_liquid_available'])

        # Clean up transactions
        self.service.delete_transaction(1, xfer_id)
        self.service.delete_transaction(1, tx_id)

    # Test Case 11: Budget limits constraint evaluation in affordability
    def test_case_11_category_budget_constraint(self):
        budgets = self.service.get_budget_overview(1)
        if budgets:
            b = budgets[0]
            cat_id = b['category_id']
            # Price higher than remaining category budget
            high_price = b['remaining'] + 5000
            res = self.service.evaluate_affordability(
                profile_id=1,
                item_name="Exceeds Budget Item",
                price_rupees=high_price,
                category_id=cat_id
            )
            self.assertEqual(res['status'], 'warning')
            self.assertIsNotNone(res['budget'])
            self.assertTrue(res['budget']['exceeded'])
            self.assertIn("exceeds your monthly budget limit", res['summary_text'])

    # Test Case 12: Data immutability verification
    def test_case_12_simulation_never_mutates_database(self):
        # Record counts and balances before running simulation
        accounts_before = self.service.get_accounts(1)
        totals_before = self.service.get_ledger_totals(1)
        goals_before = self.service.get_goals(1)
        cal_before = self.service.get_calendar_events(1)

        # Run multiple hypothetical scenarios and affordability checks
        self.service.evaluate_affordability(1, "Test 1", 10000)
        self.service.evaluate_affordability(1, "Test 2", 9999999)
        self.service.run_what_if_simulation(1, "salary", 50000)
        self.service.run_what_if_simulation(1, "one_time_purchase", 100000)
        self.service.run_what_if_simulation(1, "income_decrease", 20000)

        # Verify exact equality of records
        accounts_after = self.service.get_accounts(1)
        totals_after = self.service.get_ledger_totals(1)
        goals_after = self.service.get_goals(1)
        cal_after = self.service.get_calendar_events(1)

        self.assertEqual(len(accounts_before), len(accounts_after))
        for b, a in zip(accounts_before, accounts_after):
            self.assertEqual(b['current_balance'], a['current_balance'])

        self.assertEqual(totals_before['balance'], totals_after['balance'])
        self.assertEqual(totals_before['income'], totals_after['income'])
        self.assertEqual(totals_before['expenses'], totals_after['expenses'])
        self.assertEqual(len(goals_before), len(goals_after))
        self.assertEqual(len(cal_before), len(cal_after))

if __name__ == '__main__':
    unittest.main()
