import unittest
import os
import sys
import tempfile
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'vendor')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app
from app.services.financial_service import FinancialService
from app.database.connection import get_db_connection

class TestMoneyAndTransactions(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.temp_db.close()
        self.app = create_app(self.temp_db.name)
        self.client = self.app.test_client()
        self.fin_service = FinancialService(self.temp_db.name)

    def tearDown(self):
        if os.path.exists(self.temp_db.name):
            os.remove(self.temp_db.name)

    # ---------------------------------------------------------
    # 0. Account & Wallet Creation Requirement
    # ---------------------------------------------------------
    def test_account_creation_requirement_for_transactions(self):
        """Users must create at least one Account or Wallet before adding transactions."""
        # Create a new isolated profile with no accounts
        new_pid = self.fin_service.create_user_profile("NoAccountUser", "₹", "password123")
        # Remove starter accounts to test empty account state
        conn = get_db_connection(self.temp_db.name)
        conn.execute("DELETE FROM accounts WHERE profile_id = ?;", (new_pid,))
        conn.commit()
        conn.close()

        # Attempting to add an income transaction with no accounts must raise ValueError
        with self.assertRaises(ValueError) as ctx:
            self.fin_service.add_transaction(
                profile_id=new_pid,
                date="2026-11-01",
                description="Salary",
                category_name="Salary",
                tx_type="income",
                amount=50000
            )
        self.assertIn("Account or Wallet", str(ctx.exception))

        # Attempting to add an expense transaction with no accounts must raise ValueError
        with self.assertRaises(ValueError) as ctx2:
            self.fin_service.add_transaction(
                profile_id=new_pid,
                date="2026-11-01",
                description="Dinner",
                category_name="Food & Dining",
                tx_type="expense",
                amount=500
            )
        self.assertIn("Account or Wallet", str(ctx2.exception))

        # API endpoint POST /api/transactions must also reject when no accounts exist
        with self.client.session_transaction() as sess:
            sess['profile_id'] = new_pid

        res = self.client.post('/api/transactions', json={
            'date': '2026-11-01',
            'description': 'Freelance Income',
            'category': 'Salary',
            'type': 'income',
            'amount': 10000
        }, headers={'X-Profile-ID': str(new_pid)})
        self.assertEqual(res.status_code, 400)
        self.assertIn("create an Account or Wallet first", res.get_json()['error'])

        # Now create an account, transaction must succeed
        acc_id = self.fin_service.add_account(new_pid, "My Bank", "savings", 1000)
        tx_id = self.fin_service.add_transaction(
            profile_id=new_pid,
            date="2026-11-01",
            description="Salary",
            category_name="Salary",
            tx_type="income",
            amount=50000,
            account_id=acc_id
        )
        self.assertIsNotNone(tx_id)

    # ---------------------------------------------------------
    # 1. Account & Wallet-to-Wallet Transfers
    # ---------------------------------------------------------
    def test_transfers_between_all_account_combinations(self):
        """Transfers between Account -> Account, Account -> Wallet, Wallet -> Account, Wallet -> Wallet."""
        pid = 1
        bank1_id = self.fin_service.add_account(pid, "Primary Bank", "savings", 10000)
        bank2_id = self.fin_service.add_account(pid, "Secondary Bank", "current", 5000)
        wallet1_id = self.fin_service.add_account(pid, "PayTM Wallet", "wallet", 2000)
        wallet2_id = self.fin_service.add_account(pid, "Amazon Pay Wallet", "wallet", 1000)

        # 1. Account -> Account (Primary Bank -> Secondary Bank: ₹2,000)
        tx1 = self.fin_service.transfer_funds(pid, bank1_id, bank2_id, 2000, "2026-11-02", "Interbank transfer")
        self.assertIsNotNone(tx1)
        accs = {a['id']: a for a in self.fin_service.get_accounts(pid)}
        self.assertEqual(accs[str(bank1_id)]['current_balance'], 8000)
        self.assertEqual(accs[str(bank2_id)]['current_balance'], 7000)

        # 2. Account -> Wallet (Primary Bank -> PayTM Wallet: ₹1,500)
        tx2 = self.fin_service.transfer_funds(pid, bank1_id, wallet1_id, 1500, "2026-11-03", "Wallet Top-up")
        self.assertIsNotNone(tx2)
        accs = {a['id']: a for a in self.fin_service.get_accounts(pid)}
        self.assertEqual(accs[str(bank1_id)]['current_balance'], 6500)
        self.assertEqual(accs[str(wallet1_id)]['current_balance'], 3500)

        # 3. Wallet -> Account (PayTM Wallet -> Secondary Bank: ₹500)
        tx3 = self.fin_service.transfer_funds(pid, wallet1_id, bank2_id, 500, "2026-11-04", "Withdraw to Bank")
        self.assertIsNotNone(tx3)
        accs = {a['id']: a for a in self.fin_service.get_accounts(pid)}
        self.assertEqual(accs[str(wallet1_id)]['current_balance'], 3000)
        self.assertEqual(accs[str(bank2_id)]['current_balance'], 7500)

        # 4. Wallet -> Wallet (PayTM Wallet -> Amazon Pay: ₹1,000)
        tx4 = self.fin_service.transfer_funds(pid, wallet1_id, wallet2_id, 1000, "2026-11-05", "UPI to wallet")
        self.assertIsNotNone(tx4)
        accs = {a['id']: a for a in self.fin_service.get_accounts(pid)}
        self.assertEqual(accs[str(wallet1_id)]['current_balance'], 2000)
        self.assertEqual(accs[str(wallet2_id)]['current_balance'], 2000)

    def test_transfer_validation_rules(self):
        """Validate same account rejection, insufficient balance rejection, zero/negative rejection."""
        pid = 1
        bank_id = self.fin_service.add_account(pid, "Savings Acc", "savings", 5000)
        cash_id = self.fin_service.add_account(pid, "Cash Wallet", "cash", 1000)

        # 1. Source and destination cannot be identical
        with self.assertRaises(ValueError) as ctx:
            self.fin_service.transfer_funds(pid, bank_id, bank_id, 500)
        self.assertIn("must be different", str(ctx.exception))

        # 2. Cannot transfer amount <= 0
        with self.assertRaises(ValueError):
            self.fin_service.transfer_funds(pid, bank_id, cash_id, 0)
        with self.assertRaises(ValueError):
            self.fin_service.transfer_funds(pid, bank_id, cash_id, -100)

        # 3. Cannot transfer exceeding available source balance
        with self.assertRaises(ValueError) as ctx2:
            self.fin_service.transfer_funds(pid, bank_id, cash_id, 6000)
        self.assertIn("Insufficient funds", str(ctx2.exception))

        # Check balances remained untouched
        accs = {a['id']: a for a in self.fin_service.get_accounts(pid)}
        self.assertEqual(accs[str(bank_id)]['current_balance'], 5000)
        self.assertEqual(accs[str(cash_id)]['current_balance'], 1000)

    # ---------------------------------------------------------
    # 2. Transfers in Transaction History & Ledger Totals
    # ---------------------------------------------------------
    def test_transfers_in_history_and_ledger_isolation(self):
        """Transfers must appear in transactions list and must NOT count as income or expense."""
        pid = 1
        src_id = self.fin_service.add_account(pid, "Source Bank", "savings", 10000)
        dest_id = self.fin_service.add_account(pid, "Dest Bank", "savings", 2000)

        init_totals = self.fin_service.get_ledger_totals(pid)

        # Execute transfer of ₹3,000
        tx_id = self.fin_service.transfer_funds(pid, src_id, dest_id, 3000, "2026-11-06", "Test savings allocation")

        # Verify transfer appears in transaction history
        txs = self.fin_service.get_transactions(pid, filter_type='transfer')
        matching = [t for t in txs if str(t['id']) == str(tx_id)]
        self.assertEqual(len(matching), 1)
        transfer_tx = matching[0]
        self.assertEqual(transfer_tx['type'], 'transfer')
        self.assertEqual(transfer_tx['amount'], 3000)
        self.assertEqual(transfer_tx['source_account_name'], 'Source Bank')
        self.assertEqual(transfer_tx['dest_account_name'], 'Dest Bank')
        self.assertEqual(transfer_tx['account_id'], str(src_id))
        self.assertEqual(transfer_tx['destination_account_id'], str(dest_id))

        # Verify ledger totals: Income and Expenses MUST NOT CHANGE
        post_totals = self.fin_service.get_ledger_totals(pid)
        self.assertEqual(post_totals['income'], init_totals['income'])
        self.assertEqual(post_totals['expenses'], init_totals['expenses'])

    # ---------------------------------------------------------
    # 3. Opening Balance Logic
    # ---------------------------------------------------------
    def test_opening_balance_accuracy_and_isolation(self):
        """Opening balance must display immediately, not count as income, and not duplicate."""
        pid = 1
        init_totals = self.fin_service.get_ledger_totals(pid)

        # Create account with ₹5,000 opening balance
        acc_id = self.fin_service.add_account(pid, "New Fixed Reserve", "savings", 5000)
        acc = [a for a in self.fin_service.get_accounts(pid) if str(a['id']) == str(acc_id)][0]

        # 1. Account balance immediately displays ₹5,000
        self.assertEqual(acc['current_balance'], 5000)
        self.assertEqual(acc['initial_balance'], 5000)

        # 2. Total asset balance in ledger increases by ₹5,000 opening balance
        new_totals = self.fin_service.get_ledger_totals(pid)
        self.assertEqual(new_totals['total_balance'], init_totals['total_balance'] + 5000)

        # 3. Regular income must NOT be affected
        self.assertEqual(new_totals['income'], init_totals['income'])

        # 4. Regular expenses must NOT be affected
        self.assertEqual(new_totals['expenses'], init_totals['expenses'])

        # 5. Opening balance does NOT appear as a regular transaction in the ledger
        txs = self.fin_service.get_transactions(pid, account_id=acc_id)
        self.assertEqual(len(txs), 0)

        # 6. Editing opening balance updates current balance accurately without duplicating
        self.fin_service.update_account(pid, acc_id, initial_balance=8000)
        updated_acc = [a for a in self.fin_service.get_accounts(pid) if str(a['id']) == str(acc_id)][0]
        self.assertEqual(updated_acc['current_balance'], 8000)

    # ---------------------------------------------------------
    # 4 & 8. FinancialService.update_transaction() & Custom GUI Editing
    # ---------------------------------------------------------
    def test_update_transaction_with_tx_id_and_all_fields(self):
        """Verify update_transaction() handles tx_id parameter and updates all fields."""
        pid = 1
        acc1 = self.fin_service.add_account(pid, "Bank 1", "savings", 10000)
        acc2 = self.fin_service.add_account(pid, "Bank 2", "current", 5000)

        # Add initial expense of ₹1,000 to acc1
        tx_id = self.fin_service.add_transaction(
            profile_id=pid,
            date="2026-11-01",
            description="Initial Purchase",
            category_name="Shopping",
            tx_type="expense",
            type_tag="optional",
            amount=1000,
            account_id=acc1
        )

        acc1_before = [a for a in self.fin_service.get_accounts(pid) if str(a['id']) == str(acc1)][0]
        self.assertEqual(acc1_before['current_balance'], 9000)

        # Update transaction using tx_id keyword argument and changing all fields
        self.fin_service.update_transaction(
            profile_id=pid,
            tx_id=tx_id,
            date="2026-11-05",
            description="Updated Purchase Note",
            category_name="Food & Dining",
            tx_type="expense",
            type_tag="necessary",
            amount=2500,
            account_id=acc2
        )

        # Verify transaction fields updated
        txs = self.fin_service.get_transactions(pid)
        updated_tx = [t for t in txs if str(t['id']) == str(tx_id)][0]
        self.assertEqual(updated_tx['description'], "Updated Purchase Note")
        self.assertEqual(updated_tx['amount'], 2500)
        self.assertEqual(updated_tx['date'], "2026-11-05")
        self.assertEqual(updated_tx['category'], "Food & Dining")
        self.assertEqual(updated_tx['account_id'], str(acc2))
        self.assertEqual(updated_tx['typeTag'], "necessary")

        # Verify balances: acc1 effect was reversed (+1000 back to 10000), acc2 effect applied (5000 - 2500 = 2500)
        accs = {a['id']: a for a in self.fin_service.get_accounts(pid)}
        self.assertEqual(accs[str(acc1)]['current_balance'], 10000)
        self.assertEqual(accs[str(acc2)]['current_balance'], 2500)

    def test_api_put_update_transaction(self):
        """Verify API PUT /api/transactions/<tx_id> works with full payload."""
        pid = 1
        acc = self.fin_service.add_account(pid, "API Test Bank", "savings", 15000)
        tx_id = self.fin_service.add_transaction(
            profile_id=pid,
            date="2026-11-01",
            description="Pre-edit description",
            category_name="Transport",
            tx_type="expense",
            amount=500,
            account_id=acc
        )

        with self.client.session_transaction() as sess:
            sess['profile_id'] = pid

        res = self.client.put(f'/api/transactions/{tx_id}', json={
            'description': 'Post-edit API description',
            'amount': 850,
            'date': '2026-11-04',
            'category': 'Transport',
            'type': 'expense',
            'typeTag': 'necessary',
            'account_id': acc
        }, headers={'X-Profile-ID': str(pid)})

        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()['success'])

        tx = [t for t in self.fin_service.get_transactions(pid) if str(t['id']) == str(tx_id)][0]
        self.assertEqual(tx['description'], 'Post-edit API description')
        self.assertEqual(tx['amount'], 850)

    # ---------------------------------------------------------
    # 5. Remove Necessity Classification from Add Income
    # ---------------------------------------------------------
    def test_income_creation_without_necessity_classification(self):
        """Income transactions must succeed without providing necessity classification."""
        pid = 1
        acc = self.fin_service.add_account(pid, "Income Checking", "current", 1000)

        # Call add_transaction without type_tag for income
        tx_id = self.fin_service.add_transaction(
            profile_id=pid,
            date="2026-11-07",
            description="Dividend Payout",
            category_name="Salary",
            tx_type="income",
            amount=4200,
            account_id=acc
        )
        self.assertIsNotNone(tx_id)

        tx = [t for t in self.fin_service.get_transactions(pid) if str(t['id']) == str(tx_id)][0]
        self.assertEqual(tx['type'], 'income')
        self.assertEqual(tx['amount'], 4200)
        self.assertEqual(tx['typeTag'], 'necessary') # Default schema tag intact

if __name__ == '__main__':
    unittest.main()
