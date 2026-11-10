import unittest
import os
import sys
import tempfile
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'vendor')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app
from app.services.financial_service import FinancialService

class TestSavingsGoalsWallets(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.temp_db.close()
        self.app = create_app(self.temp_db.name)
        self.client = self.app.test_client()
        self.fin_service = FinancialService(self.temp_db.name)

        # Login default user (profile_id = 1)
        with self.client.session_transaction() as sess:
            sess['profile_id'] = 1
            sess['user_name'] = 'Demo User'

    def tearDown(self):
        if os.path.exists(self.temp_db.name):
            os.remove(self.temp_db.name)

    def test_savings_goal_creates_dedicated_wallet(self):
        """Verify creating a goal creates an associated dedicated savings wallet in accounts."""
        pid = 1
        initial_accounts = self.fin_service.get_accounts(pid)
        initial_acc_count = len(initial_accounts)

        goal_id = self.fin_service.add_goal(
            profile_id=pid,
            name="New Work Laptop",
            target_rupees=60000.0,
            current_rupees=0.0,
            target_date="2027-06-30",
            description="MacBook Pro for development"
        )
        self.assertIsNotNone(goal_id)

        # Verify dedicated savings wallet was created
        accounts_after = self.fin_service.get_accounts(pid)
        self.assertEqual(len(accounts_after), initial_acc_count + 1)

        goal_wallet = next((a for a in accounts_after if a.get('savings_goal_id') == goal_id), None)
        self.assertIsNotNone(goal_wallet)
        self.assertEqual(goal_wallet['name'], "Savings Wallet – New Work Laptop")
        self.assertEqual(goal_wallet['account_type'], "wallet")
        self.assertTrue(goal_wallet['is_savings_wallet'])
        self.assertEqual(goal_wallet['savings_goal_name'], "New Work Laptop")
        self.assertEqual(goal_wallet['current_balance'], 0.0)

        # Verify goal fields and 0 progress
        goals = self.fin_service.get_goals(pid)
        created_goal = next(g for g in goals if int(g['id']) == goal_id)
        self.assertEqual(created_goal['name'], "New Work Laptop")
        self.assertEqual(created_goal['targetAmount'], 60000.0)
        self.assertEqual(created_goal['currentAmount'], 0.0)
        self.assertEqual(created_goal['pct'], 0)
        self.assertEqual(created_goal['remaining'], 60000.0)
        self.assertEqual(created_goal['description'], "MacBook Pro for development")
        self.assertEqual(created_goal['wallet_account_id'], int(goal_wallet['id']))

    def test_goal_creation_initial_funding_from_source_account(self):
        """Verify initial deposit is deducted from selected account and credited to dedicated wallet."""
        pid = 1
        accounts = {a['name']: a for a in self.fin_service.get_accounts(pid)}
        main_bank = accounts['Main Savings Bank']
        bank_initial = main_bank['current_balance']

        deposit_amt = 5000.0
        goal_id = self.fin_service.add_goal(
            profile_id=pid,
            name="Emergency Reserve",
            target_rupees=50000.0,
            current_rupees=deposit_amt,
            target_date="2027-12-31",
            account_id=int(main_bank['id']),
            description="6 months living expenses"
        )

        accounts_after = {a['name']: a for a in self.fin_service.get_accounts(pid)}
        bank_after = accounts_after['Main Savings Bank']
        self.assertEqual(bank_after['current_balance'], bank_initial - deposit_amt)

        wallet_after = accounts_after['Savings Wallet – Emergency Reserve']
        self.assertEqual(wallet_after['current_balance'], deposit_amt)

        # Verify transfer transaction exists
        txs = self.fin_service.get_transactions(pid)
        goal_tx = next(t for t in txs if t['type'] == 'transfer' and str(t['destination_account_id']) == str(wallet_after['id']))
        self.assertEqual(goal_tx['amount'], deposit_amt)
        self.assertEqual(str(goal_tx['account_id']), str(main_bank['id']))
        self.assertEqual(goal_tx['typeTag'], 'savings')

        # Verify goal progress is updated
        goal = next(g for g in self.fin_service.get_goals(pid) if int(g['id']) == goal_id)
        self.assertEqual(goal['currentAmount'], deposit_amt)
        self.assertEqual(goal['pct'], 10)
        self.assertEqual(goal['remaining'], 45000.0)

    def test_goal_creation_insufficient_source_balance(self):
        """Verify initial deposit fails if source account does not have sufficient balance."""
        pid = 1
        # Create a small cash wallet with only 500 INR
        cash_id = self.fin_service.add_account(pid, "Small Cash Pocket", "cash", initial_balance=500.0)

        with self.assertRaises(ValueError) as ctx:
            self.fin_service.add_goal(
                profile_id=pid,
                name="Big Dream Vacation",
                target_rupees=100000.0,
                current_rupees=5000.0, # exceeds 500
                target_date="2028-01-01",
                account_id=cash_id
            )
        self.assertIn("Insufficient funds", str(ctx.exception))

    def test_savings_deposit_deducts_source_and_credits_wallet(self):
        """Verify depositing money into a goal deducts from source account and updates goal wallet."""
        pid = 1
        main_bank = [a for a in self.fin_service.get_accounts(pid) if a['name'] == 'Main Savings Bank'][0]
        bank_initial = main_bank['current_balance']

        goal_id = self.fin_service.add_goal(pid, "Bike Fund", 80000.0, 0.0, "2027-08-15")

        # Deposit 7,000 INR from Main Savings Bank
        self.fin_service.deposit_goal(pid, goal_id, deposit_rupees=7000.0, account_id=int(main_bank['id']), note="Bonus deposit")

        accs_after = {a['name']: a for a in self.fin_service.get_accounts(pid)}
        self.assertEqual(accs_after['Main Savings Bank']['current_balance'], bank_initial - 7000.0)
        self.assertEqual(accs_after['Savings Wallet – Bike Fund']['current_balance'], 7000.0)

        goal_after = next(g for g in self.fin_service.get_goals(pid) if int(g['id']) == goal_id)
        self.assertEqual(goal_after['currentAmount'], 7000.0)
        self.assertEqual(goal_after['remaining'], 73000.0)

        # Deposit bounds check: deposit exceeding available balance must fail
        with self.assertRaises(ValueError):
            self.fin_service.deposit_goal(pid, goal_id, deposit_rupees=9999999.0, account_id=int(main_bank['id']))

    def test_savings_withdrawal_credits_destination_and_debits_wallet(self):
        """Verify withdrawing money from a goal credits destination account and debits goal wallet."""
        pid = 1
        main_bank = [a for a in self.fin_service.get_accounts(pid) if a['name'] == 'Main Savings Bank'][0]
        bank_initial = main_bank['current_balance']

        goal_id = self.fin_service.add_goal(pid, "Gadget Fund", 20000.0, 10000.0, "2027-05-01", account_id=int(main_bank['id']))

        # Withdraw 4,000 INR back to Main Savings Bank
        self.fin_service.withdraw_goal(pid, goal_id, withdraw_rupees=4000.0, account_id=int(main_bank['id']), note="Early withdrawal")

        accs_after = {a['name']: a for a in self.fin_service.get_accounts(pid)}
        self.assertEqual(accs_after['Savings Wallet – Gadget Fund']['current_balance'], 6000.0)
        self.assertEqual(accs_after['Main Savings Bank']['current_balance'], bank_initial - 10000.0 + 4000.0)

        goal_after = next(g for g in self.fin_service.get_goals(pid) if int(g['id']) == goal_id)
        self.assertEqual(goal_after['currentAmount'], 6000.0)

        # Over-withdrawal bounds check: cannot withdraw more than available savings
        with self.assertRaises(ValueError) as ctx:
            self.fin_service.withdraw_goal(pid, goal_id, withdraw_rupees=10000.0, account_id=int(main_bank['id']))
        self.assertIn("exceeds available savings balance", str(ctx.exception))

    def test_savings_movements_isolated_from_income_and_expenses(self):
        """Verify that savings deposits and withdrawals are recorded as transfers and never alter regular income or expense totals."""
        pid = 1
        main_bank = [a for a in self.fin_service.get_accounts(pid) if a['name'] == 'Main Savings Bank'][0]
        
        totals_before = self.fin_service.get_ledger_totals(pid)
        inc_before = totals_before['income']
        exp_before = totals_before['expenses']

        goal_id = self.fin_service.add_goal(pid, "Camera Gear", 40000.0, 5000.0, "2027-09-01", account_id=int(main_bank['id']))
        self.fin_service.deposit_goal(pid, goal_id, 3000.0, account_id=int(main_bank['id']))
        self.fin_service.withdraw_goal(pid, goal_id, 2000.0, account_id=int(main_bank['id']))

        totals_after = self.fin_service.get_ledger_totals(pid)
        self.assertEqual(totals_after['income'], inc_before)
        self.assertEqual(totals_after['expenses'], exp_before)

    def test_goal_deletion_returns_remaining_funds_safely(self):
        """Verify deleting a goal safely returns remaining money to chosen destination and deletes wallet."""
        pid = 1
        main_bank = [a for a in self.fin_service.get_accounts(pid) if a['name'] == 'Main Savings Bank'][0]
        cash_acc = [a for a in self.fin_service.get_accounts(pid) if a['name'] == 'Cash in Hand'][0]
        cash_initial = cash_acc['current_balance']

        goal_id = self.fin_service.add_goal(pid, "Festival Savings", 30000.0, 8000.0, "2027-11-01", account_id=int(main_bank['id']))
        
        # Delete goal and specify return money to Cash in Hand
        self.fin_service.delete_goal(pid, goal_id, destination_account_id=int(cash_acc['id']))

        # Verify Cash in Hand received the 8,000 INR
        cash_after = next(a for a in self.fin_service.get_accounts(pid) if a['name'] == 'Cash in Hand')
        self.assertEqual(cash_after['current_balance'], cash_initial + 8000.0)

        # Verify goal and wallet are completely deleted
        goals_after = self.fin_service.get_goals(pid)
        self.assertFalse(any(int(g['id']) == goal_id for g in goals_after))

        accs_after = self.fin_service.get_accounts(pid)
        self.assertFalse(any(a.get('savings_goal_id') == goal_id for a in accs_after))
        self.assertFalse(any(a['name'] == 'Savings Wallet – Festival Savings' for a in accs_after))

    def test_api_goals_endpoints_with_dedicated_wallets(self):
        """Verify /api/goals CRUD, deposit, and withdraw REST API operations."""
        # 1. List goals
        res = self.client.get('/api/goals')
        self.assertEqual(res.status_code, 200)
        initial_goals_count = len(res.get_json()['goals'])

        # 2. POST create goal
        res_create = self.client.post('/api/goals', json={
            'name': 'API Test Goal',
            'targetAmount': 25000.0,
            'currentAmount': 0.0,
            'date': '2027-10-31',
            'description': 'Created via REST API'
        })
        self.assertEqual(res_create.status_code, 201)
        goal_id = res_create.get_json()['id']

        # 3. POST deposit
        main_acc = self.fin_service.get_accounts(1)[0]
        res_dep = self.client.post(f'/api/goals/{goal_id}/deposit', json={
            'amount': 3500.0,
            'account_id': int(main_acc['id']),
            'note': 'API Deposit'
        })
        self.assertEqual(res_dep.status_code, 200)

        # 4. POST withdraw
        res_with = self.client.post(f'/api/goals/{goal_id}/withdraw', json={
            'amount': 1000.0,
            'account_id': int(main_acc['id']),
            'note': 'API Withdrawal'
        })
        self.assertEqual(res_with.status_code, 200)

        # 5. PUT edit
        res_edit = self.client.put(f'/api/goals/{goal_id}', json={
            'name': 'API Test Goal (Updated)',
            'targetAmount': 30000.0,
            'date': '2028-01-01',
            'description': 'Updated description'
        })
        self.assertEqual(res_edit.status_code, 200)

        # 6. DELETE goal
        res_del = self.client.delete(f'/api/goals/{goal_id}', json={
            'destination_account_id': int(main_acc['id'])
        })
        self.assertEqual(res_del.status_code, 200)

        res_final = self.client.get('/api/goals')
        self.assertEqual(len(res_final.get_json()['goals']), initial_goals_count)

if __name__ == '__main__':
    unittest.main()
