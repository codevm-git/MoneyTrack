from flask import Blueprint, request, jsonify, Response, session
from app.services.financial_service import FinancialService
from app.services.calculator_service import calculate_emi, calculate_compound_interest, calculate_inflation
from app.services.learning_service import LearningService
from app.services.backup_service import BackupService
import json

api_bp = Blueprint('api', __name__, url_prefix='/api')
fin_service = FinancialService()
learn_service = LearningService()
backup_service = BackupService()

def get_current_profile_id():
    """Retrieves current user profile ID from session or header with fallback to default 1."""
    header_val = request.headers.get('X-Profile-ID')
    if header_val and header_val.isdigit():
        return int(header_val)
    return session.get('profile_id', 1)

# --- Profiles & Multi-User Support ---
@api_bp.route('/profiles', methods=['GET'])
def list_profiles():
    profiles = fin_service.list_user_profiles()
    return jsonify({'profiles': profiles, 'active_profile_id': get_current_profile_id()})

@api_bp.route('/profiles', methods=['POST'])
def create_profile():
    data = request.get_json() or {}
    name = data.get('name')
    currency = data.get('currency', '₹')
    try:
        new_id = fin_service.create_user_profile(name, currency)
        return jsonify({'success': True, 'id': new_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/profiles/<int:profile_id>', methods=['DELETE'])
def delete_profile(profile_id):
    try:
        fin_service.delete_user_profile(profile_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/dashboard', methods=['GET'])
def get_dashboard():
    profile_id = get_current_profile_id()
    user = fin_service.get_user_profile(profile_id)
    totals = fin_service.get_ledger_totals(profile_id)
    category_spending = fin_service.get_category_spending(profile_id)
    budgets = fin_service.get_budget_overview(profile_id)
    health = fin_service.calculate_health_score(profile_id)
    
    # Generate live diagnostic alerts
    alerts = []
    for b in budgets:
        if b['pct'] > 100:
            alerts.append({
                'type': 'danger',
                'message': f"{b['name']} budget exceeded by {b['pct'] - 100}% this month."
            })
        elif b['pct'] >= 85:
            alerts.append({
                'type': 'warning',
                'message': f"{b['name']} budget has reached {b['pct']}% of monthly limit."
            })
    if not alerts:
        alerts.append({
            'type': 'success',
            'message': 'All category spending is within safe budget limits.'
        })

    return jsonify({
        'user': user,
        'totals': totals,
        'category_spending': category_spending,
        'budgets': budgets,
        'health': health,
        'alerts': alerts,
        'accounts': fin_service.get_accounts(profile_id)
    })

# --- Accounts & Account Types ---
@api_bp.route('/accounts', methods=['GET'])
def list_accounts():
    profile_id = get_current_profile_id()
    accounts = fin_service.get_accounts(profile_id)
    return jsonify({
        'accounts': accounts,
        'account_types': fin_service.ACCOUNT_TYPE_META
    })

@api_bp.route('/accounts', methods=['POST'])
def create_account():
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    try:
        name = data.get('name')
        account_type = data.get('account_type') or data.get('accountType', 'savings')
        initial_balance = data.get('initial_balance') if 'initial_balance' in data else data.get('initialBalance', 0)
        color = data.get('color')
        icon = data.get('icon')
        is_default = bool(data.get('is_default') or data.get('isDefault', False))
        
        acc_id = fin_service.add_account(
            profile_id=profile_id,
            name=name,
            account_type=account_type,
            initial_balance=initial_balance,
            color=color,
            icon=icon,
            is_default=is_default
        )
        return jsonify({'success': True, 'id': acc_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/accounts/<int:acc_id>', methods=['PUT'])
def update_account(acc_id):
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    try:
        name = data.get('name')
        account_type = data.get('account_type') or data.get('accountType')
        initial_balance = data.get('initial_balance') if 'initial_balance' in data else data.get('initialBalance')
        color = data.get('color')
        icon = data.get('icon')
        is_default = data.get('is_default') if 'is_default' in data else data.get('isDefault')
        
        fin_service.update_account(
            profile_id=profile_id,
            account_id=acc_id,
            name=name,
            account_type=account_type,
            initial_balance=initial_balance,
            color=color,
            icon=icon,
            is_default=is_default
        )
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/accounts/<int:acc_id>', methods=['DELETE'])
def delete_account(acc_id):
    profile_id = get_current_profile_id()
    try:
        fin_service.delete_account(profile_id, acc_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# --- Transactions ---
@api_bp.route('/transactions', methods=['GET'])
def list_transactions():
    profile_id = get_current_profile_id()
    filter_type = request.args.get('type', 'all')
    category = request.args.get('category', 'ALL')
    search = request.args.get('search', '').strip()
    raw_acc_id = request.args.get('account_id')
    account_id = int(raw_acc_id) if raw_acc_id and raw_acc_id.isdigit() else None

    txs = fin_service.get_transactions(
        profile_id=profile_id,
        filter_type=filter_type,
        category=category,
        search=search,
        account_id=account_id
    )
    return jsonify({'transactions': txs})

@api_bp.route('/transactions', methods=['POST'])
def create_transaction():
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    try:
        date = data.get('date')
        description = data.get('description', '')
        category = data.get('category')
        tx_type = data.get('type', 'expense')
        type_tag = data.get('typeTag', 'necessary')
        amount = data.get('amount')
        raw_acc_id = data.get('account_id') or data.get('accountId')
        account_id = int(raw_acc_id) if raw_acc_id is not None and str(raw_acc_id).isdigit() else None

        tx_id = fin_service.add_transaction(
            profile_id=profile_id,
            date=date,
            description=description,
            category_name=category,
            tx_type=tx_type,
            type_tag=type_tag,
            amount=amount,
            account_id=account_id
        )
        return jsonify({'success': True, 'id': tx_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/transactions/<int:tx_id>', methods=['PUT'])
def update_transaction(tx_id):
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    try:
        date = data.get('date')
        description = data.get('description')
        category = data.get('category')
        tx_type = data.get('type')
        type_tag = data.get('typeTag')
        amount = data.get('amount')
        raw_acc_id = data.get('account_id') or data.get('accountId')
        account_id = int(raw_acc_id) if raw_acc_id is not None and str(raw_acc_id).isdigit() else None

        fin_service.update_transaction(
            profile_id=profile_id,
            tx_id=tx_id,
            date=date,
            description=description,
            category_name=category,
            tx_type=tx_type,
            type_tag=type_tag,
            amount=amount,
            account_id=account_id
        )
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/transactions/<int:tx_id>', methods=['DELETE'])
def delete_transaction(tx_id):
    profile_id = get_current_profile_id()
    fin_service.delete_transaction(profile_id, tx_id)
    return jsonify({'success': True})

# --- Budgets ---
@api_bp.route('/budgets', methods=['GET'])
def list_budgets():
    profile_id = get_current_profile_id()
    month = request.args.get('month')
    budgets = fin_service.get_budget_overview(profile_id, month_year=month)
    return jsonify({'budgets': budgets})

@api_bp.route('/budgets', methods=['POST'])
def set_budget():
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    try:
        category = data.get('category')
        limit_amount = data.get('limit')
        month = data.get('month')
        fin_service.set_budget(profile_id, category, limit_amount, month_year=month)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/budgets/<int:category_id>', methods=['DELETE'])
def delete_budget(category_id):
    profile_id = get_current_profile_id()
    month = request.args.get('month')
    try:
        fin_service.delete_budget(profile_id, category_id, month_year=month)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# --- Savings Goals ---
@api_bp.route('/goals', methods=['GET'])
def list_goals():
    profile_id = get_current_profile_id()
    goals = fin_service.get_goals(profile_id)
    return jsonify({'goals': goals})

@api_bp.route('/goals', methods=['POST'])
def create_goal():
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    try:
        name = data.get('name', '')
        target = data.get('targetAmount')
        current = data.get('currentAmount', 0)
        date = data.get('date')

        goal_id = fin_service.add_goal(profile_id, name, target, current, date)
        return jsonify({'success': True, 'id': goal_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/goals/<int:goal_id>/deposit', methods=['POST'])
def deposit_goal(goal_id):
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    amount = data.get('amount', 1000)
    try:
        fin_service.deposit_goal(profile_id, goal_id, amount)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/goals/<int:goal_id>/withdraw', methods=['POST'])
def withdraw_goal(goal_id):
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    amount = data.get('amount', 500)
    try:
        fin_service.withdraw_goal(profile_id, goal_id, amount)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/goals/<int:goal_id>', methods=['PUT'])
def edit_goal(goal_id):
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    try:
        name = data.get('name')
        target = data.get('targetAmount')
        date = data.get('date')
        fin_service.edit_goal(profile_id, goal_id, name, target, date)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/goals/<int:goal_id>', methods=['DELETE'])
def delete_goal(goal_id):
    profile_id = get_current_profile_id()
    fin_service.delete_goal(profile_id, goal_id)
    return jsonify({'success': True})

# --- Calendar ---
@api_bp.route('/calendar', methods=['GET'])
def list_calendar():
    profile_id = get_current_profile_id()
    events = fin_service.get_calendar_events(profile_id)
    return jsonify({'events': events})

@api_bp.route('/calendar', methods=['POST'])
def add_calendar_event():
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    try:
        title = data.get('title', '')
        amount = data.get('amount')
        ev_type = data.get('type', 'expense')
        date = data.get('date')
        freq = data.get('frequency', 'monthly')

        ev_id = fin_service.add_calendar_event(profile_id, title, amount, ev_type, date, freq)
        return jsonify({'success': True, 'id': ev_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/calendar/<int:event_id>', methods=['DELETE'])
def delete_calendar(event_id):
    profile_id = get_current_profile_id()
    fin_service.delete_calendar_event(profile_id, event_id)
    return jsonify({'success': True})

# --- Simulations ---
@api_bp.route('/simulate/what-if', methods=['POST'])
def simulate_what_if():
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    scenario_type = data.get('scenario_type', 'salary')
    change_amount = data.get('change_amount', 5000)
    try:
        res = fin_service.run_what_if_simulation(profile_id, scenario_type, change_amount)
        return jsonify(res)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/simulate/affordability', methods=['POST'])
def simulate_affordability():
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    item_name = data.get('item_name', 'High Performance Laptop')
    price = data.get('price', 45000)
    try:
        res = fin_service.evaluate_affordability(profile_id, item_name, price)
        return jsonify(res)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# --- Calculators ---
@api_bp.route('/calculators/emi', methods=['POST'])
def calc_emi_api():
    data = request.get_json() or {}
    try:
        p = float(data.get('principal', 500000))
        r = float(data.get('rate', 10.5))
        n = int(data.get('months', 36))
        return jsonify(calculate_emi(p, r, n))
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/calculators/ci', methods=['POST'])
def calc_ci_api():
    data = request.get_json() or {}
    try:
        p = float(data.get('principal', 100000))
        r = float(data.get('rate', 12.0))
        t = float(data.get('years', 10))
        return jsonify(calculate_compound_interest(p, r, t))
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/calculators/inflation', methods=['POST'])
def calc_inf_api():
    data = request.get_json() or {}
    try:
        c = float(data.get('cost', 50000))
        r = float(data.get('rate', 6.0))
        t = float(data.get('years', 10))
        return jsonify(calculate_inflation(c, r, t))
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# --- Learning & Quizzes ---
@api_bp.route('/learning/lessons', methods=['GET'])
def list_lessons():
    lessons = learn_service.get_lessons()
    return jsonify({'lessons': lessons})

@api_bp.route('/learning/quizzes/<int:lesson_id>', methods=['GET'])
def get_quizzes(lesson_id):
    quizzes = learn_service.get_quizzes_for_lesson(lesson_id)
    return jsonify({'quizzes': quizzes})

@api_bp.route('/learning/quizzes/submit', methods=['POST'])
def submit_quiz_answer():
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    quiz_id = data.get('quiz_id')
    selected_idx = data.get('selected_index')
    res = learn_service.submit_quiz_answer(profile_id, quiz_id, selected_idx)
    return jsonify(res)

@api_bp.route('/learning/quizzes/complete', methods=['POST'])
def complete_quiz():
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    lesson_id = data.get('lesson_id')
    score = int(data.get('score', 0))
    total = int(data.get('total', 3))
    learn_service.record_quiz_completion(profile_id, lesson_id, score, total)
    return jsonify({'success': True})

@api_bp.route('/learning/achievements', methods=['GET'])
def list_achievements():
    profile_id = get_current_profile_id()
    achs = learn_service.get_achievements(profile_id)
    return jsonify({'achievements': achs})

# --- Settings & Offline Backup ---
@api_bp.route('/settings/profile', methods=['GET'])
def get_profile():
    profile_id = get_current_profile_id()
    return jsonify(fin_service.get_user_profile(profile_id))

@api_bp.route('/settings/profile', methods=['POST'])
def save_profile():
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    name = data.get('name')
    currency = data.get('currency')
    try:
        res = fin_service.update_user_profile(profile_id, name=name, currency=currency)
        return jsonify({'success': True, 'user': res})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/settings/export/json', methods=['GET'])
def export_json():
    profile_id = get_current_profile_id()
    data = backup_service.export_json_backup(profile_id)
    return Response(
        json.dumps(data, indent=2),
        mimetype="application/json",
        headers={"Content-Disposition": "attachment;filename=moneytrack_backup.json"}
    )

@api_bp.route('/settings/export/csv', methods=['GET'])
def export_csv():
    profile_id = get_current_profile_id()
    csv_str = backup_service.export_csv(profile_id)
    return Response(
        csv_str,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=moneytrack_transactions.csv"}
    )

@api_bp.route('/settings/import/json', methods=['POST'])
def import_json():
    profile_id = get_current_profile_id()
    try:
        if 'file' in request.files:
            file_obj = request.files['file']
            file_content = file_obj.read().decode('utf-8', errors='replace')
            data = json.loads(file_content)
        else:
            data = request.get_json()
        backup_service.import_json_backup(data, profile_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/settings/reset', methods=['POST'])
def reset_database():
    profile_id = get_current_profile_id()
    backup_service.reset_to_seed(profile_id)
    return jsonify({'success': True})
