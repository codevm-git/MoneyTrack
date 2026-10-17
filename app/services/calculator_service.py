import math
from decimal import Decimal, ROUND_HALF_UP

def round_curr(val):
    """Rounds a numeric value to the nearest integer currency unit."""
    return int(Decimal(str(val)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))

def calculate_emi(principal, annual_rate_pct, tenure_months):
    """
    Computes Loan EMI using the standard reducing balance formula:
    E = (P * r * (1 + r)^N) / ((1 + r)^N - 1)
    where r = annual_rate / 12 / 100, N = tenure in months.
    """
    P = float(principal)
    annual_rate = float(annual_rate_pct)
    N = int(tenure_months)
    
    if P <= 0 or N <= 0:
        return {'monthly_emi': 0, 'total_interest': 0, 'total_payable': 0}
        
    r = annual_rate / 12 / 100
    
    if r > 0:
        factor = math.pow(1 + r, N)
        emi = (P * r * factor) / (factor - 1)
    else:
        emi = P / N
        
    total_payable = emi * N
    total_interest = total_payable - P
    
    return {
        'principal': round_curr(P),
        'monthly_emi': round_curr(emi),
        'total_interest': round_curr(total_interest),
        'total_payable': round_curr(total_payable)
    }

def calculate_compound_interest(principal, annual_rate_pct, tenure_years, compound_freq=1):
    """
    Computes Compound Interest: A = P * (1 + r/n)^(n*t)
    where n = compounding frequency (default 1 = annually).
    """
    P = float(principal)
    r = float(annual_rate_pct) / 100
    t = float(tenure_years)
    n = int(compound_freq)
    
    if P <= 0 or t <= 0:
        return {'future_value': round_curr(P), 'interest_earned': 0}
        
    future_value = P * math.pow(1 + (r / n), n * t)
    interest_earned = future_value - P
    
    return {
        'initial_principal': round_curr(P),
        'future_value': round_curr(future_value),
        'interest_earned': round_curr(interest_earned)
    }

def calculate_inflation(current_cost, inflation_rate_pct, tenure_years):
    """
    Computes Future Equivalent Cost and purchasing power erosion:
    FV = PV * (1 + i)^t
    """
    PV = float(current_cost)
    i = float(inflation_rate_pct) / 100
    t = float(tenure_years)
    
    if PV <= 0 or t <= 0:
        return {'future_cost': round_curr(PV), 'purchasing_power_loss_pct': 0.0}
        
    future_cost = PV * math.pow(1 + i, t)
    loss_pct = (1.0 - (PV / future_cost)) * 100 if future_cost > 0 else 0.0
    
    return {
        'current_cost': round_curr(PV),
        'future_cost': round_curr(future_cost),
        'inflation_rate': float(inflation_rate_pct),
        'purchasing_power_loss_pct': round(loss_pct, 1)
    }

def calculate_emergency_fund(monthly_essential_expense, target_months=6, current_savings=0):
    """
    Computes Emergency Fund targets and gap analysis.
    """
    monthly = float(monthly_essential_expense)
    months = int(target_months)
    current = float(current_savings)
    
    target_amount = monthly * months
    shortfall = max(0.0, target_amount - current)
    coverage_months = round(current / monthly, 1) if monthly > 0 else 0.0
    
    return {
        'monthly_expense': round_curr(monthly),
        'target_months': months,
        'target_amount': round_curr(target_amount),
        'current_savings': round_curr(current),
        'shortfall': round_curr(shortfall),
        'coverage_months': coverage_months
    }

def calculate_debt_payoff(debts, extra_monthly_payment=0, strategy='avalanche'):
    """
    Calculates debt payoff schedule.
    debts = [{'name': 'Credit Card', 'balance': 50000, 'interest_rate': 36.0, 'min_payment': 2500}]
    strategy: 'avalanche' (highest interest first) or 'snowball' (lowest balance first).
    """
    if not debts:
        return {'total_debt': 0, 'months_to_debt_free': 0, 'total_interest': 0}
        
    debt_list = [dict(d) for d in debts]
    total_debt = sum(d['balance'] for d in debt_list)
    
    if strategy == 'avalanche':
        debt_list.sort(key=lambda x: x['interest_rate'], reverse=True)
    else:
        debt_list.sort(key=lambda x: x['balance'])
        
    months = 0
    total_interest_paid = 0.0
    extra = float(extra_monthly_payment)
    
    while any(d['balance'] > 0 for d in debt_list) and months < 360:
        months += 1
        current_extra = extra
        
        # Accrue monthly interest
        for d in debt_list:
            if d['balance'] > 0:
                monthly_rate = (d['interest_rate'] / 100) / 12
                interest = d['balance'] * monthly_rate
                total_interest_paid += interest
                d['balance'] += interest
                
        # Pay minimums
        for d in debt_list:
            if d['balance'] > 0:
                min_p = min(d['balance'], d['min_payment'])
                d['balance'] -= min_p
                
        # Apply extra to top priority debt
        for d in debt_list:
            if d['balance'] > 0 and current_extra > 0:
                payment = min(d['balance'], current_extra)
                d['balance'] -= payment
                current_extra -= payment
                
    return {
        'total_debt': round_curr(total_debt),
        'months_to_debt_free': months,
        'total_interest': round_curr(total_interest_paid)
    }
