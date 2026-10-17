import unittest
import os
import sys
import json
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'vendor')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app
from app.services.financial_service import FinancialService
from app.services.backup_service import BackupService

class TestAccountTypeSystem(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.temp_db.close()
        self.app = create_app(self.temp_db.name)
        self.client = self.app.test_client()
        self.fin_service = FinancialService(self.temp_db.name)
        self.backup_service = BackupService(self.temp_db.name)

    def tearDown(self):
        if os.path.exists(self.temp_db.name):
            os.remove(self.temp_db.name)

    def test_default_seeded_accounts(self):
        """Verify default accounts are seeded upon fresh database initialization."""
        accounts = self.fin_service.get_accounts(profile_id=1)
        self.assertEqual(len(accounts), 3)

        acc_types = [a['account_type'] for a in accounts]
        self.assertIn('savings', acc_types)
        self.assertIn('cash', acc_types)
        self.assertIn('credit_card', acc_types)

        # Default account should be Savings
        default_acc = [a for a in accounts if a['is_default']]
        self.assertEqual(len(default_acc), 1)
        self.assertEqual(default_acc[0]['name'], 'Main Savings Bank')

    def test_create_accounts_for_all_types(self):
        """Verify user can create accounts for each of the 6 defined account types."""
        types = ['savings', 'current', 'cash', 'credit_card', 'wallet', 'investment']
        for t in types:
            acc_id = self.fin_service.add_account(
                profile_id=1,
                name=f"Test {t.capitalize()} Account",
                account_type=t,
                initial_balance=1000.0
            )
            self.assertIsNotNone(acc_id)

        all_accounts = self.fin_service.get_accounts(profile_id=1)
        # 3 initial + 6 new = 9 accounts
        self.assertEqual(len(all_accounts), 9)

    def test_invalid_account_type_rejection(self):
        """Verify adding an account with an invalid type is rejected."""
        with self.assertRaises(ValueError):
            self.fin_service.add_account(
                profile_id=1,
                name="Illegal Account",
                account_type="crypto_token",
                initial_balance=500.0
            )

    def test_api_accounts_crud(self):
        """Test API endpoints for listing, creating, updating, and deleting accounts."""
        # 1. GET /api/accounts
        res = self.client.get('/api/accounts')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn('accounts', data)
        self.assertIn('account_types', data)
        initial_count = len(data['accounts'])

        # 2. POST /api/accounts
        payload = {
            'name': 'HDFC Salary Account',
            'account_type': 'current',
            'initial_balance': 15000.0,
            'color': '#06b6d4',
            'is_default': True
        }
        res = self.client.post('/api/accounts', json=payload)
        self.assertEqual(res.status_code, 201)
        new_id = res.get_json()['id']

        # Verify new account is now default and count increased
        res = self.client.get('/api/accounts')
        accounts = res.get_json()['accounts']
        self.assertEqual(len(accounts), initial_count + 1)
        created = [a for a in accounts if str(a['id']) == str(new_id)][0]
        self.assertEqual(created['name'], 'HDFC Salary Account')
        self.assertEqual(created['account_type'], 'current')
        self.assertEqual(created['current_balance'], 15000.0)
        self.assertTrue(created['is_default'])

        # 3. PUT /api/accounts/<id>
        res = self.client.put(f'/api/accounts/{new_id}', json={'name': 'HDFC Premium Checking'})
        self.assertEqual(res.status_code, 200)

        # 4. DELETE /api/accounts/<id>
        res = self.client.delete(f'/api/accounts/{new_id}')
        self.assertEqual(res.status_code, 200)

        res = self.client.get('/api/accounts')
        self.assertEqual(len(res.get_json()['accounts']), initial_count)

    def test_balance_calculation_asset_vs_credit(self):
        """Verify dynamic balance calculation for asset account vs liability credit card."""
        # Create a Savings account with initial 5,000
        sav_id = self.fin_service.add_account(
            profile_id=1,
            name="Emergency Savings",
            account_type="savings",
            initial_balance=5000.0
        )

        # Create a Credit Card account with initial 0
        cc_id = self.fin_service.add_account(
            profile_id=1,
            name="ICICI Coral Card",
            account_type="credit_card",
            initial_balance=0.0
        )

        # Add Income ₹2,000 to Savings
        self.fin_service.add_transaction(
            profile_id=1,
            date='2026-10-01',
            description='Freelance Project',
            category_name_or_id='Salary',
            tx_type='income',
            type_tag='necessary',
            amount=2000.0,
            account_id=sav_id
        )

        # Add Expense ₹1,500 from Savings
        self.fin_service.add_transaction(
            profile_id=1,
            date='2026-10-02',
            description='Utility Bill',
            category_name_or_id='Bills & Utilities',
            tx_type='expense',
            type_tag='necessary',
            amount=1500.0,
            account_id=sav_id
        )

        # Savings balance = 5000 (initial) + 2000 (income) - 1500 (expense) = 5500
        sav_acc = [a for a in self.fin_service.get_accounts(1) if str(a['id']) == str(sav_id)][0]
        self.assertEqual(sav_acc['current_balance'], 5500.0)
        self.assertEqual(sav_acc['total_inflow'], 2000.0)
        self.assertEqual(sav_acc['total_outflow'], 1500.0)

        # Add Expense ₹3,000 on Credit Card
        self.fin_service.add_transaction(
            profile_id=1,
            date='2026-10-03',
            description='Electronics Purchase',
            category_name_or_id='Shopping',
            tx_type='expense',
            type_tag='optional',
            amount=3000.0,
            account_id=cc_id
        )

        # Credit Card balance represents outstanding liability: ₹3000
        cc_acc = [a for a in self.fin_service.get_accounts(1) if str(a['id']) == str(cc_id)][0]
        self.assertEqual(cc_acc['current_balance'], 3000.0)
        self.assertEqual(cc_acc['total_outflow'], 3000.0)

        # Make Credit Card Payment (Income on CC of ₹1,000)
        self.fin_service.add_transaction(
            profile_id=1,
            date='2026-10-04',
            description='Credit Card Repayment',
            category_name_or_id='Other',
            tx_type='income',
            type_tag='necessary',
            amount=1000.0,
            account_id=cc_id
        )

        # Outstanding liability reduced to 3000 - 1000 = 2000
        cc_acc_after = [a for a in self.fin_service.get_accounts(1) if str(a['id']) == str(cc_id)][0]
        self.assertEqual(cc_acc_after['current_balance'], 2000.0)

    def test_filter_transactions_by_account(self):
        """Verify transactions can be filtered by specific account."""
        acc_id = self.fin_service.add_account(
            profile_id=1,
            name="Dedicated Account",
            account_type="wallet",
            initial_balance=500.0
        )

        # Add transaction to this account
        self.fin_service.add_transaction(
            profile_id=1,
            date='2026-10-05',
            description='Phone Recharge',
            category_name_or_id='Bills & Utilities',
            tx_type='expense',
            type_tag='necessary',
            amount=299.0,
            account_id=acc_id
        )

        # Filter by this account via API
        res = self.client.get(f'/api/transactions?account_id={acc_id}')
        self.assertEqual(res.status_code, 200)
        txs = res.get_json()['transactions']
        self.assertEqual(len(txs), 1)
        self.assertEqual(txs[0]['description'], 'Phone Recharge')
        self.assertEqual(str(txs[0]['account_id']), str(acc_id))

    def test_account_deletion_sets_transactions_account_null(self):
        """Verify deleting an account keeps transactions and cleanly sets their account_id to NULL."""
        acc_id = self.fin_service.add_account(
            profile_id=1,
            name="Temporary Wallet",
            account_type="wallet",
            initial_balance=100.0
        )

        tx_id = self.fin_service.add_transaction(
            profile_id=1,
            date='2026-10-06',
            description='Street Food',
            category_name_or_id='Food & Dining',
            tx_type='expense',
            type_tag='optional',
            amount=80.0,
            account_id=acc_id
        )

        # Delete the account
        self.fin_service.delete_account(profile_id=1, account_id=acc_id)

        # Verify transaction still exists and account_id is None
        txs = self.fin_service.get_transactions(profile_id=1)
        found_tx = [t for t in txs if str(t['id']) == str(tx_id)][0]
        self.assertIsNone(found_tx['account_id'])
        self.assertEqual(found_tx['description'], 'Street Food')

    def test_multi_user_account_isolation(self):
        """Verify user profiles have complete isolation of their accounts."""
        # Create profile 2
        p2_id = self.fin_service.create_user_profile(name="Bob Smith", currency="$")

        # Create account under profile 2
        p2_acc_id = self.fin_service.add_account(
            profile_id=p2_id,
            name="Bob Secret Vault",
            account_type="investment",
            initial_balance=50000.0
        )

        # Profile 1 must NOT see Bob's account
        p1_accounts = self.fin_service.get_accounts(profile_id=1)
        p1_acc_names = [a['name'] for a in p1_accounts]
        self.assertNotIn("Bob Secret Vault", p1_acc_names)

        # Profile 2 MUST see Bob's account
        p2_accounts = self.fin_service.get_accounts(profile_id=p2_id)
        p2_acc_names = [a['name'] for a in p2_accounts]
        self.assertIn("Bob Secret Vault", p2_acc_names)

    def test_backup_and_restore_accounts(self):
        """Verify exporting and importing backup preserves multi-account schema and transaction linkages."""
        # Create unique account
        acc_id = self.fin_service.add_account(
            profile_id=1,
            name="Backup Test Account",
            account_type="investment",
            initial_balance=12345.0
        )

        self.fin_service.add_transaction(
            profile_id=1,
            date='2026-10-07',
            description='Gold Bond Investment',
            category_name_or_id='Other',
            tx_type='expense',
            type_tag='necessary',
            amount=5000.0,
            account_id=acc_id
        )

        # Export backup
        backup_data = self.backup_service.export_json_backup(profile_id=1)
        self.assertIn('accounts', backup_data)
        backup_acc_names = [a['name'] for a in backup_data['accounts']]
        self.assertIn('Backup Test Account', backup_acc_names)

        # Import into fresh DB or reset
        self.backup_service.import_json_backup(backup_data, profile_id=1)

        restored_accounts = self.fin_service.get_accounts(profile_id=1)
        restored_names = [a['name'] for a in restored_accounts]
        self.assertIn('Backup Test Account', restored_names)

        restored_txs = self.fin_service.get_transactions(profile_id=1)
        gold_tx = [t for t in restored_txs if t['description'] == 'Gold Bond Investment'][0]
        self.assertIsNotNone(gold_tx['account_id'])

if __name__ == '__main__':
    unittest.main()
