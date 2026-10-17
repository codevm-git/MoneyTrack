import unittest
import os
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'vendor')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database.connection import init_db
from app.services.financial_service import FinancialService, rupees_to_paise, paise_to_rupees
from app.services.backup_service import BackupService

class TestFinancialService(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.temp_db.close()
        init_db(self.temp_db.name)
        self.service = FinancialService(self.temp_db.name)
        self.backup_service = BackupService(self.temp_db.name)

    def tearDown(self):
        if os.path.exists(self.temp_db.name):
            os.remove(self.temp_db.name)

    def test_paise_conversion(self):
        self.assertEqual(rupees_to_paise(100), 10000)
        self.assertEqual(rupees_to_paise(45.50), 4550)
        self.assertEqual(paise_to_rupees(10000), 100)
        self.assertEqual(paise_to_rupees(4550), 45.50)

    def test_ledger_totals(self):
        totals = self.service.get_ledger_totals(1)
        # Income from seed: 25,000
        # Expenses from seed: 450 + 500 + 3500 + 4600 + 1800 = 10,850
        self.assertEqual(totals['income'], 25000)
        self.assertEqual(totals['expenses'], 10850)
        self.assertEqual(totals['balance'], 14150)
        self.assertEqual(totals['savings'], 14150)
        self.assertEqual(totals['savings_rate'], 56.6)

    def test_add_and_delete_transaction(self):
        initial_totals = self.service.get_ledger_totals(1)
        
        # Add new expense of 1,000
        tx_id = self.service.add_transaction(
            profile_id=1,
            date='2026-10-17',
            description='Test Lunch',
            category_name_or_id='Food & Dining',
            tx_type='expense',
            type_tag='necessary',
            amount_rupees=1000
        )
        self.assertIsNotNone(tx_id)

        updated_totals = self.service.get_ledger_totals(1)
        self.assertEqual(updated_totals['expenses'], initial_totals['expenses'] + 1000)
        self.assertEqual(updated_totals['balance'], initial_totals['balance'] - 1000)

        # Delete transaction
        self.service.delete_transaction(1, tx_id)
        restored_totals = self.service.get_ledger_totals(1)
        self.assertEqual(restored_totals['expenses'], initial_totals['expenses'])
        self.assertEqual(restored_totals['balance'], initial_totals['balance'])

    def test_savings_goals(self):
        goals = self.service.get_goals(1)
        self.assertEqual(len(goals), 2)
        laptop_goal = next(g for g in goals if g['name'] == 'New Work Laptop')
        initial_amount = laptop_goal['currentAmount']

        # Deposit 5,000
        self.service.deposit_goal(1, int(laptop_goal['id']), 5000)
        updated_goals = self.service.get_goals(1)
        updated_laptop = next(g for g in updated_goals if g['id'] == laptop_goal['id'])
        self.assertEqual(updated_laptop['currentAmount'], initial_amount + 5000)

    def test_health_score(self):
        health = self.service.calculate_health_score(1)
        self.assertTrue(0 <= health['score'] <= 100)
        self.assertIn(health['status'], ['Healthy', 'Moderate', 'Needs Attention', 'Critical'])

    def test_backup_and_restore(self):
        backup_data = self.backup_service.export_json_backup(1)
        self.assertIn('transactions', backup_data)
        self.assertIn('user', backup_data)
        self.assertEqual(len(backup_data['transactions']), 6)

        # Modify profile name
        self.service.update_user_profile(1, name='Changed Name')
        self.assertEqual(self.service.get_user_profile(1)['name'], 'Changed Name')

        # Restore from backup
        self.backup_service.import_json_backup(backup_data, 1)
        self.assertEqual(self.service.get_user_profile(1)['name'], 'Alex Taylor')

if __name__ == '__main__':
    unittest.main()
