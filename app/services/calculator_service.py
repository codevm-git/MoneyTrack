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
    Returns monthly EMI, total interest, total payable, and payment breakdown.
    """
    try:
        P = float(principal)
        annual_rate = float(annual_rate_pct)
        N = int(tenure_months)
    except (ValueError, TypeError):
        return {
            'principal': 0, 'monthly_emi': 0, 'total_interest': 0,
            'total_payable': 0, 'principal_pct': 0.0, 'interest_pct': 0.0,
            'amortization_schedule': []
        }
    
    if P <= 0 or N <= 0:
        return {
            'principal': max(0, round_curr(P)),
            'monthly_emi': 0,
            'total_interest': 0,
            'total_payable': max(0, round_curr(P)),
            'principal_pct': 100.0 if P > 0 else 0.0,
            'interest_pct': 0.0,
            'amortization_schedule': []
        }
        
    r = annual_rate / 12 / 100
    
    if r > 0:
        factor = math.pow(1 + r, N)
        emi = (P * r * factor) / (factor - 1)
    else:
        emi = P / N
        
    total_payable = emi * N
    total_interest = total_payable - P

    # Generate balance breakdown schedule for charts
    schedule = []
    balance = P
    step = max(1, N // 10)
    for month in range(1, N + 1):
        if r > 0:
            interest_month = balance * r
            principal_month = emi - interest_month
            balance = max(0.0, balance - principal_month)
        else:
            balance = max(0.0, balance - emi)

        if month % step == 0 or month == N:
            schedule.append({
                'month': month,
                'year': round(month / 12, 1),
                'remaining_balance': round_curr(balance)
            })

    principal_curr = round_curr(P)
    tot_payable_curr = round_curr(total_payable)
    tot_interest_curr = round_curr(total_interest)
    interest_pct = round((tot_interest_curr / tot_payable_curr) * 100, 1) if tot_payable_curr > 0 else 0.0
    principal_pct = round(100.0 - interest_pct, 1)
    
    return {
        'principal': principal_curr,
        'monthly_emi': round_curr(emi),
        'total_interest': tot_interest_curr,
        'total_payable': tot_payable_curr,
        'principal_pct': principal_pct,
        'interest_pct': interest_pct,
        'amortization_schedule': schedule
    }

def calculate_compound_interest(principal, annual_rate_pct, tenure_years, compound_freq=1):
    """
    Computes Compound Interest: A = P * (1 + r/n)^(n*t)
    where n = compounding frequency (default 1 = annually).
    Returns future value, interest earned, growth multiplier, and yearly schedule.
    """
    try:
        P = float(principal)
        r = float(annual_rate_pct) / 100
        t = float(tenure_years)
        n = int(compound_freq) if int(compound_freq) > 0 else 1
    except (ValueError, TypeError):
        return {
            'initial_principal': 0, 'future_value': 0,
            'interest_earned': 0, 'growth_multiplier': 1.0,
            'yearly_schedule': []
        }
    
    if P <= 0 or t <= 0:
        return {
            'initial_principal': max(0, round_curr(P)),
            'future_value': max(0, round_curr(P)),
            'interest_earned': 0,
            'growth_multiplier': 1.0,
            'yearly_schedule': []
        }
        
    future_value = P * math.pow(1 + (r / n), n * t)
    interest_earned = future_value - P
    multiplier = round(future_value / P, 2) if P > 0 else 1.0

    # Generate yearly schedule for line graph
    schedule = []
    step = 1 if t <= 15 else (2 if t <= 30 else max(1, int(t // 10)))
    years_points = list(range(0, int(t) + 1, step))
    if int(t) not in years_points:
        years_points.append(int(t))

    for y in years_points:
        y_val = P * math.pow(1 + (r / n), n * y)
        schedule.append({
            'year': y,
            'principal': round_curr(P),
            'value': round_curr(y_val),
            'balance': round_curr(y_val),
            'interest': round_curr(max(0.0, y_val - P))
        })
    
    return {
        'initial_principal': round_curr(P),
        'future_value': round_curr(future_value),
        'interest_earned': round_curr(interest_earned),
        'growth_multiplier': multiplier,
        'yearly_schedule': schedule
    }

def calculate_savings_growth(monthly_deposit, annual_rate_pct, tenure_years):
    """
    Computes Future Wealth for regular monthly contributions (SIP / Recurring Savings):
    FV = P * [((1 + r)^n - 1) / r] * (1 + r)
    where P = monthly deposit, r = annual_rate / 12 / 100, n = tenure_years * 12.
    """
    try:
        P = float(monthly_deposit)
        annual_rate = float(annual_rate_pct)
        t = float(tenure_years)
    except (ValueError, TypeError):
        return {
            'monthly_deposit': 0, 'tenure_years': 0, 'total_deposited': 0,
            'future_value': 0, 'interest_earned': 0, 'growth_pct': 0.0,
            'yearly_schedule': []
        }

    if P <= 0 or t <= 0:
        return {
            'monthly_deposit': max(0, round_curr(P)),
            'tenure_years': max(0, round(t, 1)),
            'total_deposited': 0,
            'future_value': 0,
            'interest_earned': 0,
            'growth_pct': 0.0,
            'yearly_schedule': []
        }

    n = int(t * 12)
    r = (annual_rate / 100) / 12

    if r > 0:
        fv = P * ((math.pow(1 + r, n) - 1) / r) * (1 + r)
    else:
        fv = P * n

    total_deposited = P * n
    interest_earned = max(0.0, fv - total_deposited)
    growth_pct = round((interest_earned / total_deposited) * 100, 1) if total_deposited > 0 else 0.0

    schedule = []
    step = 1 if t <= 15 else (2 if t <= 30 else max(1, int(t // 10)))
    years_points = list(range(1, int(t) + 1, step))
    if int(t) not in years_points:
        years_points.append(int(t))

    for y in years_points:
        months_y = y * 12
        if r > 0:
            val_y = P * ((math.pow(1 + r, months_y) - 1) / r) * (1 + r)
        else:
            val_y = P * months_y
        dep_y = P * months_y
        schedule.append({
            'year': y,
            'deposited': round_curr(dep_y),
            'total_deposited': round_curr(dep_y),
            'future_value': round_curr(val_y),
            'returns': round_curr(max(0.0, val_y - dep_y))
        })

    return {
        'monthly_deposit': round_curr(P),
        'tenure_years': round(t, 1),
        'total_deposited': round_curr(total_deposited),
        'future_value': round_curr(fv),
        'interest_earned': round_curr(interest_earned),
        'growth_pct': growth_pct,
        'yearly_schedule': schedule
    }

def calculate_inflation(current_cost, inflation_rate_pct, tenure_years):
    """
    Computes Future Equivalent Cost and purchasing power erosion:
    FV = PV * (1 + i)^t
    """
    try:
        PV = float(current_cost)
        i = float(inflation_rate_pct) / 100
        t = float(tenure_years)
    except (ValueError, TypeError):
        return {
            'current_cost': 0, 'future_cost': 0,
            'price_increase': 0, 'inflation_rate': 0.0,
            'purchasing_power_loss_pct': 0.0
        }
    
    if PV <= 0 or t <= 0:
        return {
            'current_cost': max(0, round_curr(PV)),
            'future_cost': max(0, round_curr(PV)),
            'price_increase': 0,
            'inflation_rate': float(inflation_rate_pct) if inflation_rate_pct else 0.0,
            'purchasing_power_loss_pct': 0.0
        }
        
    future_cost = PV * math.pow(1 + i, t)
    price_increase = future_cost - PV
    loss_pct = (1.0 - (PV / future_cost)) * 100 if future_cost > 0 else 0.0
    
    return {
        'current_cost': round_curr(PV),
        'future_cost': round_curr(future_cost),
        'price_increase': round_curr(price_increase),
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
