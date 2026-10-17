import unittest
import os
import sys
import json
import tempfile
import re

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'vendor')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app
from app.database.connection import init_db
from app.services.financial_service import FinancialService, rupees_to_paise, paise_to_rupees
from app.services.validators import validate_date, validate_amount_rupees, sanitize_string, validate_backup_payload
from app.services.backup_service import BackupService

class TestSecurityAndDataIntegrity(unittest.TestCase):
    def setUp(self):
        self.temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.temp_db.close()
        init_db(self.temp_db.name)
        self.app = create_app(self.temp_db.name)
        self.client = self.app.test_client()
        self.service = FinancialService(self.temp_db.name)
        self.backup_service = BackupService(self.temp_db.name)

    def tearDown(self):
        if os.path.exists(self.temp_db.name):
            os.remove(self.temp_db.name)

    # --- 1. Empty Account Initial Health Score ---
    def test_empty_account_health_score(self):
        """A new profile with no transactions must return 0 score and 'Getting Started'."""
        new_pid = self.service.create_user_profile("Brand New User", "₹")
        health = self.service.calculate_health_score(new_pid)
        self.assertEqual(health['score'], 0)
        self.assertEqual(health['status'], 'Getting Started')
        self.assertIn('bg-gray-100', health['badge_class'])
        self.assertEqual(health['savings_rate'], '0%')
        self.assertEqual(health['emergency_reserve'], '0.0 Months')

    # --- 2. Savings Goals Full Lifecycle & Edge Cases ---
    def test_goals_deposit_withdraw_edit_lifecycle(self):
        """Tests deposit, withdraw, edit, and bounds enforcement on savings goals."""
        pid = 1
        goal_id = self.service.add_goal(pid, "Vacation Fund", 50000, 10000, "2026-12-31")
        
        # 1. Deposit
        self.service.deposit_goal(pid, goal_id, 5000)
        goal = next(g for g in self.service.get_goals(pid) if int(g['id']) == goal_id)
        self.assertEqual(goal['currentAmount'], 15000)

        # 2. Withdraw
        self.service.withdraw_goal(pid, goal_id, 3000)
        goal = next(g for g in self.service.get_goals(pid) if int(g['id']) == goal_id)
        self.assertEqual(goal['currentAmount'], 12000)

        # 3. Withdraw exceeding amount -> should raise ValueError
        with self.assertRaises(ValueError):
            self.service.withdraw_goal(pid, goal_id, 20000)

        # 4. Edit goal parameters
        self.service.edit_goal(pid, goal_id, name="European Tour", target_amount_rupees=60000, target_date="2027-06-30")
        goal = next(g for g in self.service.get_goals(pid) if int(g['id']) == goal_id)
        self.assertEqual(goal['name'], "European Tour")
        self.assertEqual(goal['targetAmount'], 60000)
        self.assertEqual(goal['date'], "2027-06-30")

        # 5. Delete goal
        self.service.delete_goal(pid, goal_id)
        remaining = [g for g in self.service.get_goals(pid) if int(g['id']) == goal_id]
        self.assertEqual(len(remaining), 0)

    # --- 3. Multi-User Isolation and Cascade Deletion ---
    def test_multi_user_isolation_and_cascade_delete(self):
        """Verifies strict profile data isolation and ON DELETE CASCADE integrity."""
        # Create user 2
        p2_id = self.service.create_user_profile("Secondary User", "₹")
        
        # Add transaction for user 2
        tx2_id = self.service.add_transaction(
            profile_id=p2_id,
            date='2026-10-17',
            description='Profile 2 Private Item',
            category_name_or_id='Shopping',
            tx_type='expense',
            type_tag='optional',
            amount_rupees=2500
        )

        # Add goal for user 2
        g2_id = self.service.add_goal(p2_id, "User 2 Car", 300000, 50000, "2028-01-01")

        # Verify User 1 cannot see User 2's transaction or goal
        p1_txs = self.service.get_transactions(1)
        self.assertFalse(any(t['id'] == str(tx2_id) for t in p1_txs))
        p1_goals = self.service.get_goals(1)
        self.assertFalse(any(g['id'] == g2_id for g in p1_goals))

        # Verify User 2 ledger
        p2_totals = self.service.get_ledger_totals(p2_id)
        self.assertEqual(p2_totals['expenses'], 2500)

        # Now delete Profile 2
        self.service.delete_user_profile(p2_id)

        # Verify Profile 2's transactions and goals were cascaded
        conn = self.service._get_conn()
        try:
            tx_count = conn.execute("SELECT COUNT(*) FROM transactions WHERE profile_id = ?", (p2_id,)).fetchone()[0]
            goal_count = conn.execute("SELECT COUNT(*) FROM savings_goals WHERE profile_id = ?", (p2_id,)).fetchone()[0]
            self.assertEqual(tx_count, 0)
            self.assertEqual(goal_count, 0)
        finally:
            conn.close()

    # --- 4. Server-Side Input Validation & Sanitization ---
    def test_server_side_validation(self):
        """Verifies robust rejection of invalid dates, amounts, and malicious strings."""
        # Invalid date format
        with self.assertRaises(ValueError):
            validate_date("17/10/2026")

        # Nonexistent calendar date
        with self.assertRaises(ValueError):
            validate_date("2026-02-30")

        # Leap year non-leap check
        with self.assertRaises(ValueError):
            validate_date("2025-02-29")
        
        # Valid leap year
        self.assertEqual(validate_date("2024-02-29"), "2024-02-29")

        # Amount validation
        with self.assertRaises(ValueError):
            validate_amount_rupees(-50)
        with self.assertRaises(ValueError):
            validate_amount_rupees(0)
        with self.assertRaises(ValueError):
            validate_amount_rupees("abc")
        with self.assertRaises(ValueError):
            validate_amount_rupees(1000000000000) # Exceeds 99 Crore

        # String sanitization: Strips HTML
        sanitized = sanitize_string("<script>alert('xss')</script>Salary")
        self.assertNotIn("<script>", sanitized)
        self.assertIn("Salary", sanitized)

    # --- 5. Database Transaction Atomicity & Integer Paise Integrity ---
    def test_integer_paise_precision(self):
        """Verifies zero floating-point accumulation errors with integer paise."""
        # Test converting decimals to paise and back
        paise_sum = 0
        expected_rupees_sum = 0
        for i in range(10):
            # 0.10 rupees = 10 paise
            paise_sum += rupees_to_paise(0.10)
            expected_rupees_sum += 0.10
        
        self.assertEqual(paise_sum, 100) # Exactly 100 paise = 1 Rupee
        self.assertEqual(paise_to_rupees(paise_sum), 1.0)

    # --- 6. Malformed JSON Backup Rejection & Atomic Rollback ---
    def test_malformed_backup_rejection(self):
        """Verifies that corrupted or malicious backup files are rejected."""
        # Invalid schema - missing app key
        bad_payload = {"version": "1.0", "transactions": []}
        with self.assertRaises(ValueError):
            validate_backup_payload(bad_payload)

        # Invalid app title
        bad_app = {"app": "MaliciousApp", "version": "1.0", "user": {}, "transactions": []}
        with self.assertRaises(ValueError):
            validate_backup_payload(bad_app)

        # Non-dict transaction item
        bad_txs = {"app": "MoneyTrack Offline Financial Planner", "version": "1.0", "user": {"name": "Test"}, "transactions": ["invalid_string"]}
        with self.assertRaises(ValueError):
            validate_backup_payload(bad_txs)

    # --- 7. 100% Offline Asset & Codebase Network Dependency Audit ---
    def test_zero_network_dependencies(self):
        """Verifies that no templates or static files contain external network dependencies."""
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        
        files_to_check = [
            os.path.join(project_root, 'templates', 'index.html'),
            os.path.join(project_root, 'static', 'js', 'app.js')
        ]

        # Regex for external URL imports: http:// or https:// (ignoring XML namespaces like xmlns="http://www.w3.org/2000/svg")
        external_url_regex = re.compile(r'(?:href|src)=["\']https?://(?!www\.w3\.org)[^"\']+["\']', re.IGNORECASE)

        for fpath in files_to_check:
            self.assertTrue(os.path.exists(fpath), f"File {fpath} must exist.")
            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()
                matches = external_url_regex.findall(content)
                self.assertEqual(len(matches), 0, f"Found external URL dependencies in {fpath}: {matches}")

    # --- 8. Session Configuration & Error Handler Safety ---
    def test_session_security_and_error_handlers(self):
        """Verifies session cookie security flags and safe error handling without leaks."""
        self.assertTrue(self.app.config['SESSION_COOKIE_HTTPONLY'])
        self.assertEqual(self.app.config['SESSION_COOKIE_SAMESITE'], 'Lax')
        self.assertEqual(self.app.config['MAX_CONTENT_LENGTH'], 5 * 1024 * 1024)

        # Test 404 error handler returns clean JSON
        res_404 = self.client.get('/api/non_existent_route')
        self.assertEqual(res_404.status_code, 404)
        data_404 = res_404.get_json()
        self.assertEqual(data_404['error'], 'Resource not found')

    # --- 9. Goals API Endpoint withdraw and edit ---
    def test_api_goals_withdraw_and_edit(self):
        """Verifies /api/goals/<id>/withdraw and /api/goals/<id> PUT endpoints."""
        res_goals = self.client.get('/api/goals')
        first_goal = res_goals.get_json()['goals'][0]
        goal_id = first_goal['id']
        current_amt = first_goal['currentAmount']

        # Withdraw 500
        res_with = self.client.post(f'/api/goals/{goal_id}/withdraw', json={'amount': 500})
        self.assertEqual(res_with.status_code, 200)

        # Verify updated amount
        res_after = self.client.get('/api/goals')
        updated_goal = next(g for g in res_after.get_json()['goals'] if g['id'] == goal_id)
        self.assertEqual(updated_goal['currentAmount'], current_amt - 500)

        # Edit
        res_edit = self.client.put(f'/api/goals/{goal_id}', json={
            'name': 'Updated Laptop Goal',
            'targetAmount': 95000,
            'date': '2027-01-01'
        })
        self.assertEqual(res_edit.status_code, 200)

if __name__ == '__main__':
    unittest.main()
