import unittest
import sys, os

# Ensure vendor and app can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'vendor')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.services.calculator_service import (
    calculate_emi,
    calculate_compound_interest,
    calculate_inflation,
    calculate_emergency_fund
)

class TestFinancialCalculators(unittest.TestCase):
    def test_emi_calculation(self):
        # Test case: Principal=500000, Rate=10.5%, Tenure=36
        result = calculate_emi(500000, 10.5, 36)
        self.assertEqual(result['monthly_emi'], 16251)
        self.assertEqual(result['total_interest'], 85044)
        self.assertEqual(result['total_payable'], 585044)

    def test_emi_zero_interest(self):
        result = calculate_emi(12000, 0, 12)
        self.assertEqual(result['monthly_emi'], 1000)
        self.assertEqual(result['total_interest'], 0)

    def test_compound_interest_calculation(self):
        # Test case matching reference: Principal=100000, Rate=12%, Years=10
        result = calculate_compound_interest(100000, 12, 10, compound_freq=1)
        self.assertEqual(result['future_value'], 310585)
        self.assertEqual(result['interest_earned'], 210585)

    def test_compound_interest_zero_years(self):
        result = calculate_compound_interest(50000, 10, 0)
        self.assertEqual(result['future_value'], 50000)
        self.assertEqual(result['interest_earned'], 0)

    def test_inflation_calculation(self):
        # Test case matching reference: Current=50000, Rate=6%, Years=10
        result = calculate_inflation(50000, 6.0, 10)
        self.assertEqual(result['future_cost'], 89542)
        self.assertEqual(result['purchasing_power_loss_pct'], 44.2)

    def test_emergency_fund_planner(self):
        result = calculate_emergency_fund(18400, target_months=6, current_savings=65000)
        self.assertEqual(result['target_amount'], 110400)
        self.assertEqual(result['shortfall'], 45400)
        self.assertEqual(result['coverage_months'], 3.5)

if __name__ == '__main__':
    unittest.main()
