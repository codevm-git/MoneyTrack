from flask import Blueprint, render_template, request
from app.services.financial_service import FinancialService
import datetime

views_bp = Blueprint('views', __name__)
fin_service = FinancialService()

@views_bp.route('/')
def index():
    user = fin_service.get_user_profile(1)
    totals = fin_service.get_ledger_totals(1)
    return render_template('index.html', user=user, totals=totals)

@views_bp.route('/report/monthly')
def monthly_report():
    profile_id = int(request.args.get('profile_id', 1))
    month_year = request.args.get('month', datetime.date.today().strftime('%Y-%m'))
    
    user = fin_service.get_user_profile(profile_id)
    totals = fin_service.get_ledger_totals(profile_id, month_year=month_year)
    category_spending = fin_service.get_category_spending(profile_id, month_year=month_year)
    budgets = fin_service.get_budget_overview(profile_id, month_year=month_year)
    goals = fin_service.get_goals(profile_id)
    transactions = fin_service.get_transactions(profile_id=profile_id)
    health = fin_service.calculate_health_score(profile_id)
    
    return render_template(
        'report.html',
        user=user,
        totals=totals,
        category_spending=category_spending,
        budgets=budgets,
        goals=goals,
        transactions=transactions,
        health=health,
        report_month=month_year,
        generated_date=datetime.date.today().strftime('%B %d, %Y')
    )
