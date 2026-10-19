import unittest
import os
import sys
import json
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'vendor')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app
from app.services.financial_service import FinancialService

class TestUsernameAuthSystem(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.temp_db.close()
        self.app = create_app(self.temp_db.name)
        self.client = self.app.test_client()
        self.fin_service = FinancialService(self.temp_db.name)

    def tearDown(self):
        if os.path.exists(self.temp_db.name):
            os.remove(self.temp_db.name)

    def test_initial_user_list(self):
        """Verify default seeded user Alex Taylor is present."""
        res = self.client.get('/api/auth/users')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn('users', data)
        self.assertGreaterEqual(len(data['users']), 1)
        self.assertEqual(data['users'][0]['name'], 'Alex Taylor')

    def test_login_success_and_failure(self):
        """Verify password authentication works for existing user."""
        # Incorrect password
        res_fail = self.client.post('/api/auth/login', json={
            'username': 'Alex Taylor',
            'password': 'wrongpassword'
        })
        self.assertEqual(res_fail.status_code, 401)
        self.assertFalse(res_fail.get_json()['success'])

        # Correct password
        res_ok = self.client.post('/api/auth/login', json={
            'username': 'Alex Taylor',
            'password': 'password123'
        })
        self.assertEqual(res_ok.status_code, 200)
        data = res_ok.get_json()
        self.assertTrue(data['success'])
        self.assertEqual(data['user']['name'], 'Alex Taylor')
        self.assertEqual(data['profile_id'], 1)

    def test_register_new_user_and_uniqueness(self):
        """Verify new username creation with password and duplicate prevention."""
        # 1. Register new user
        res = self.client.post('/api/auth/register', json={
            'username': 'RohanVerma',
            'password': 'mypassword',
            'currency': '₹'
        })
        self.assertEqual(res.status_code, 201)
        new_uid = res.get_json()['profile_id']

        # 2. Duplicate registration attempt (case-insensitive)
        res_dup = self.client.post('/api/auth/register', json={
            'username': 'rohanverma',
            'password': 'anotherpassword',
            'currency': '₹'
        })
        self.assertEqual(res_dup.status_code, 400)
        self.assertIn('already taken', res_dup.get_json()['error'])

        # 3. Login with newly registered credentials
        res_login = self.client.post('/api/auth/login', json={
            'username': 'RohanVerma',
            'password': 'mypassword'
        })
        self.assertEqual(res_login.status_code, 200)
        self.assertEqual(res_login.get_json()['profile_id'], new_uid)

    def test_user_data_isolation(self):
        """Verify data recorded by one user is completely isolated from another."""
        # Register user 2
        res2 = self.client.post('/api/auth/register', json={
            'username': 'UserTwo',
            'password': 'password2',
            'currency': '$'
        })
        u2_id = res2.get_json()['profile_id']

        # Add transaction for User 2
        self.fin_service.add_transaction(u2_id, '2026-10-18', 'Private Expense', 'Shopping', 'expense', 'necessary', 4500)

        # Confirm User 1 does not see User 2's transaction
        u1_txs = self.fin_service.get_transactions(profile_id=1)
        self.assertFalse(any(t['description'] == 'Private Expense' for t in u1_txs))

        # Confirm User 2 sees their own transaction
        u2_txs = self.fin_service.get_transactions(profile_id=u2_id)
        self.assertTrue(any(t['description'] == 'Private Expense' for t in u2_txs))

    def test_logout_flow(self):
        """Verify logging out clears authentication session."""
        self.client.post('/api/auth/login', json={'username': 'Alex Taylor', 'password': 'password123'})
        res = self.client.post('/api/auth/logout')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()['success'])

    def test_delete_user_and_cascade_all_data(self):
        """Verify deleting a user removes the user and all associated accounts/records."""
        # 1. Create a user with transactions, account, and goal
        res = self.client.post('/api/auth/register', json={
            'username': 'TempUserToDelete',
            'password': 'temppassword',
            'currency': '€'
        })
        del_uid = res.get_json()['profile_id']
        self.fin_service.add_transaction(del_uid, '2026-10-19', 'Temporary Ledger Entry', 'Other', 'expense', 'optional', 1000)
        self.fin_service.add_goal(del_uid, 'Temp Goal', 50000, 10000, '2027-01-01')

        # 2. Delete the user
        res_del = self.client.delete(f'/api/auth/users/{del_uid}')
        self.assertEqual(res_del.status_code, 200)
        self.assertTrue(res_del.get_json()['success'])

        # 3. Confirm user is gone
        users = self.fin_service.list_user_profiles()
        self.assertFalse(any(u['id'] == del_uid for u in users))

        # 4. Confirm cascade deletion of transactions and goals
        conn = self.fin_service._get_conn()
        try:
            tx_count = conn.execute("SELECT COUNT(*) FROM transactions WHERE profile_id = ?", (del_uid,)).fetchone()[0]
            goal_count = conn.execute("SELECT COUNT(*) FROM savings_goals WHERE profile_id = ?", (del_uid,)).fetchone()[0]
            self.assertEqual(tx_count, 0)
            self.assertEqual(goal_count, 0)
        finally:
            conn.close()

if __name__ == '__main__':
    unittest.main()
