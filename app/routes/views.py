from flask import Blueprint, render_template, request, session
from app.services.financial_service import FinancialService
import datetime

views_bp = Blueprint('views', __name__)
fin_service = FinancialService()

@views_bp.route('/')
def index():
    all_profiles = fin_service.list_user_profiles()
    active_id = session.get('profile_id') or (all_profiles[0]['id'] if all_profiles else 1)
    user = fin_service.get_user_profile(active_id) or {'id': active_id, 'name': 'User', 'currency': '₹', 'status': 'Pro Planner'}
    totals = fin_service.get_ledger_totals(active_id)
    return render_template('index.html', user=user, totals=totals)

@views_bp.route('/report/monthly')
def monthly_report():
    raw_pid = request.args.get('profile_id')
    if raw_pid and raw_pid.isdigit():
        profile_id = int(raw_pid)
    elif 'profile_id' in session:
        profile_id = session['profile_id']
    else:
        all_profiles = fin_service.list_user_profiles()
        profile_id = all_profiles[0]['id'] if all_profiles else 1
    
    month_year = request.args.get('month', datetime.date.today().strftime('%Y-%m'))
    
    user = fin_service.get_user_profile(profile_id)
    if not user:
        all_profiles = fin_service.list_user_profiles()
        if all_profiles:
            profile_id = all_profiles[0]['id']
            user = fin_service.get_user_profile(profile_id)
        else:
            user = {'id': 1, 'name': 'MoneyTrack User', 'currency': '₹', 'status': 'Standard'}

    totals = fin_service.get_ledger_totals(profile_id, month_year=month_year)
    accounts = fin_service.get_accounts(profile_id)
    category_spending = fin_service.get_category_spending(profile_id, month_year=month_year)
    budgets = fin_service.get_budget_overview(profile_id, month_year=month_year)
    goals = fin_service.get_goals(profile_id)
    transactions = fin_service.get_transactions(profile_id=profile_id)
    health = fin_service.calculate_health_score(profile_id)
    
    total_assets = sum(a['current_balance'] for a in accounts if a['account_type'] != 'credit_card')
    total_liabilities = sum(a['current_balance'] for a in accounts if a['account_type'] == 'credit_card')
    net_worth = total_assets - total_liabilities
    
    now = datetime.datetime.now()
    return render_template(
        'report.html',
        user=user,
        totals=totals,
        accounts=accounts,
        total_assets=total_assets,
        total_liabilities=total_liabilities,
        net_worth=net_worth,
        category_spending=category_spending,
        budgets=budgets,
        goals=goals,
        transactions=transactions,
        health=health,
        report_month=month_year,
        generated_date=now.strftime('%B %d, %Y'),
        generated_time=now.strftime('%H:%M:%S')
    )
