from flask import Blueprint, request, jsonify, Response, session
from app.services.financial_service import FinancialService
from app.services.calculator_service import calculate_emi, calculate_compound_interest, calculate_inflation
from app.services.learning_service import LearningService
from app.services.backup_service import BackupService
import json
from datetime import datetime, timedelta

api_bp = Blueprint('api', __name__, url_prefix='/api')
fin_service = FinancialService()
learn_service = LearningService()
backup_service = BackupService()

def get_current_profile_id():
    """Retrieves current user profile ID from query param, header, or session with fallback to first active profile."""
    query_val = request.args.get('profile_id')
    if query_val and query_val.isdigit():
        return int(query_val)
    header_val = request.headers.get('X-Profile-ID')
    if header_val and header_val.isdigit():
        return int(header_val)
    if 'profile_id' in session:
        return session['profile_id']
    try:
        profiles = fin_service.list_user_profiles()
        if profiles:
            return profiles[0]['id']
    except Exception:
        pass
    return 1

# --- Authentication & Username Multi-User System ---
@api_bp.route('/auth/users', methods=['GET'])
def get_auth_users():
    profiles = fin_service.list_user_profiles()
    active_id = get_current_profile_id()
    return jsonify({
        'users': profiles,
        'active_user_id': active_id,
        'logged_in': 'profile_id' in session
    })

@api_bp.route('/auth/current', methods=['GET'])
def get_current_user():
    active_id = get_current_profile_id()
    user = fin_service.get_user_profile(active_id)
    return jsonify({
        'authenticated': 'profile_id' in session or bool(request.headers.get('X-Profile-ID')),
        'user': user,
        'profile_id': active_id
    })

@api_bp.route('/auth/login', methods=['POST'])
def auth_login():
    data = request.get_json() or {}
    identifier = data.get('username') or data.get('profile_id')
    password = data.get('password', '')
    if not identifier:
        return jsonify({'success': False, 'error': 'Username or user account selection required'}), 400
    if not password:
        return jsonify({'success': False, 'error': 'Password is required'}), 400

    user = fin_service.authenticate_user(identifier, password)
    if user:
        session['profile_id'] = user['id']
        return jsonify({'success': True, 'user': user, 'profile_id': user['id']})
    return jsonify({'success': False, 'error': 'Incorrect password. Please try again.'}), 401

@api_bp.route('/auth/register', methods=['POST'])
def auth_register():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = data.get('password', '')
    currency = data.get('currency', '₹')

    if not username:
        return jsonify({'success': False, 'error': 'Username cannot be empty'}), 400
    if len(username) < 3:
        return jsonify({'success': False, 'error': 'Username must be at least 3 characters long'}), 400
    if not password or len(password) < 4:
        return jsonify({'success': False, 'error': 'Password must be at least 4 characters long'}), 400

    try:
        new_id = fin_service.create_user_profile(username, currency, password)
        session['profile_id'] = new_id
        user = fin_service.get_user_profile(new_id)
        return jsonify({'success': True, 'profile_id': new_id, 'user': user}), 201
    except ValueError as ve:
        return jsonify({'success': False, 'error': str(ve)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': f"Failed to create account: {str(e)}"}), 400

@api_bp.route('/auth/logout', methods=['POST'])
def auth_logout():
    session.pop('profile_id', None)
    return jsonify({'success': True})

@api_bp.route('/auth/users/<int:profile_id>', methods=['DELETE'])
def auth_delete_user(profile_id):
    try:
        fin_service.delete_user_profile(profile_id)
        if session.get('profile_id') == profile_id:
            session.pop('profile_id', None)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

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
    password = data.get('password')
    try:
        new_id = fin_service.create_user_profile(name, currency, password)
        return jsonify({'success': True, 'id': new_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/profiles/<int:profile_id>', methods=['DELETE'])
def delete_profile(profile_id):
    try:
        fin_service.delete_user_profile(profile_id)
        if session.get('profile_id') == profile_id:
            session.pop('profile_id', None)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/dashboard', methods=['GET'])
def get_dashboard():
    profile_id = get_current_profile_id()
    account_param = request.args.get('account_id')
    account_id = None
    if account_param and account_param != 'ALL' and account_param.lower() != 'null' and account_param != '':
        try:
            account_id = int(account_param)
        except ValueError:
            account_id = None

    user = fin_service.get_user_profile(profile_id)
    accounts = fin_service.get_accounts(profile_id)
    
    # Identify primary account
    primary_acc = next((a for a in accounts if a.get('is_default') or a.get('is_primary')), None)
    if not primary_acc and accounts:
        primary_acc = accounts[0]
    primary_id = int(primary_acc['id']) if primary_acc else None

    # Determine active account: use explicitly requested account_id, or default to primary account
    active_account_id = account_id if account_id is not None else primary_id

    # Build individual account-wise & wallet-wise summaries
    account_summaries = []
    for acc in accounts:
        aid = int(acc['id'])
        acc_totals = fin_service.get_ledger_totals(profile_id, account_id=aid)
        acc_health = fin_service.calculate_health_score(profile_id, account_id=aid)
        account_summaries.append({
            'id': str(aid),
            'name': acc['name'],
            'account_type': acc['account_type'],
            'type_label': acc.get('type_label', acc['account_type'].capitalize()),
            'badge_class': acc.get('badge_class', ''),
            'color': acc.get('color', '#3b82f6'),
            'icon': acc.get('icon', 'bank'),
            'is_default': bool(acc.get('is_default')),
            'is_primary': bool(acc.get('is_default')),
            'initial_balance': acc.get('initial_balance', 0),
            'current_balance': acc.get('current_balance', 0),
            'income': acc_totals['income'],
            'expenses': acc_totals['expenses'],
            'balance': acc_totals['balance'],
            'savings': acc_totals['savings'],
            'savings_rate': acc_totals['savings_rate'],
            'health': acc_health,
            'health_score': acc_health['score'],
            'health_status': acc_health['status'],
            'health_badge_class': acc_health['badge_class'],
            'transaction_count': acc.get('transaction_count', 0)
        })

    # Account-specific financial calculations
    totals = fin_service.get_ledger_totals(profile_id, account_id=active_account_id)
    category_spending = fin_service.get_category_spending(profile_id, account_id=active_account_id)
    budgets = fin_service.get_budget_overview(profile_id, account_id=active_account_id)
    health = fin_service.calculate_health_score(profile_id, account_id=active_account_id)
    spending_insight = fin_service.generate_spending_insights(profile_id, account_id=active_account_id)
    alerts = fin_service.get_financial_alerts(profile_id, account_id=active_account_id)
    diagnostics = fin_service.run_system_diagnostics(profile_id)

    return jsonify({
        'user': user,
        'selected_account_id': str(active_account_id) if active_account_id else None,
        'primary_account_id': str(primary_id) if primary_id else None,
        'account_summaries': account_summaries,
        'accounts': accounts,
        'totals': totals,
        'category_spending': category_spending,
        'budgets': budgets,
        'health': health,
        'spending_insight': spending_insight,
        'alerts': alerts,
        'diagnostics': diagnostics
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

@api_bp.route('/accounts/transfer', methods=['POST'])
def transfer_account_funds():
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    from_acc_id = data.get('from_account_id') or data.get('fromAccountId')
    to_acc_id = data.get('to_account_id') or data.get('toAccountId')
    amount = data.get('amount')
    date = data.get('date')
    description = data.get('description') or data.get('note')
    try:
        tx_id = fin_service.transfer_funds(profile_id, from_acc_id, to_acc_id, amount, date, description)
        return jsonify({'success': True, 'transaction_id': tx_id}), 201
    except ValueError as ve:
        return jsonify({'error': str(ve)}), 400
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
        user_accounts = fin_service.get_accounts(profile_id)
        if not user_accounts:
            return jsonify({'error': 'Please create an Account or Wallet first before adding income or expenses.'}), 400

        date = data.get('date')
        description = data.get('description', '')
        category = data.get('category')
        tx_type = data.get('type', 'expense')
        type_tag = 'necessary' if tx_type == 'income' else (data.get('typeTag') or 'necessary')
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
        type_tag = 'necessary' if tx_type == 'income' else data.get('typeTag')
        amount = data.get('amount')
        raw_acc_id = data.get('account_id') or data.get('accountId')
        account_id = int(raw_acc_id) if raw_acc_id is not None and str(raw_acc_id).isdigit() else None
        raw_dest_id = data.get('destination_account_id') or data.get('destinationAccountId')
        destination_account_id = int(raw_dest_id) if raw_dest_id is not None and str(raw_dest_id).isdigit() else None

        fin_service.update_transaction(
            profile_id=profile_id,
            transaction_id=tx_id,
            date=date,
            description=description,
            category_name=category,
            tx_type=tx_type,
            type_tag=type_tag,
            amount=amount,
            account_id=account_id,
            destination_account_id=destination_account_id
        )
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400
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
    acc_param = request.args.get('account_id')
    account_id = None
    if acc_param and acc_param != 'ALL' and acc_param.lower() != 'null' and acc_param != '':
        try:
            account_id = int(acc_param)
        except ValueError:
            account_id = None
    budgets = fin_service.get_budget_overview(profile_id, month_year=month, account_id=account_id)
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

# --- Live System Diagnostics ---
@api_bp.route('/diagnostics', methods=['GET'])
def get_diagnostics():
    profile_id = get_current_profile_id()
    diagnostics = fin_service.run_system_diagnostics(profile_id)
    return jsonify({'diagnostics': diagnostics})

# --- Account-wise & Wallet-wise Summaries ---
@api_bp.route('/accounts/summary', methods=['GET'])
def get_accounts_summary():
    profile_id = get_current_profile_id()
    accounts = fin_service.get_accounts(profile_id)
    summaries = []
    for acc in accounts:
        aid = int(acc['id'])
        acc_totals = fin_service.get_ledger_totals(profile_id, account_id=aid)
        acc_health = fin_service.calculate_health_score(profile_id, account_id=aid)
        summaries.append({
            'id': str(aid),
            'name': acc['name'],
            'account_type': acc['account_type'],
            'type_label': acc.get('type_label', acc['account_type'].capitalize()),
            'badge_class': acc.get('badge_class', ''),
            'color': acc.get('color', '#3b82f6'),
            'icon': acc.get('icon', 'bank'),
            'is_default': bool(acc.get('is_default')),
            'is_primary': bool(acc.get('is_default')),
            'initial_balance': acc.get('initial_balance', 0),
            'current_balance': acc.get('current_balance', 0),
            'income': acc_totals['income'],
            'expenses': acc_totals['expenses'],
            'balance': acc_totals['balance'],
            'savings': acc_totals['savings'],
            'savings_rate': acc_totals['savings_rate'],
            'health': acc_health,
            'health_score': acc_health['score'],
            'health_status': acc_health['status'],
            'health_badge_class': acc_health['badge_class'],
            'transaction_count': acc.get('transaction_count', 0)
        })
    return jsonify({'account_summaries': summaries})

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
        raw_acc_id = data.get('account_id') or data.get('accountId')
        account_id = int(raw_acc_id) if raw_acc_id is not None and str(raw_acc_id).isdigit() else None

        goal_id = fin_service.add_goal(profile_id, name, target, current, date, account_id=account_id)
        return jsonify({'success': True, 'id': goal_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/goals/<int:goal_id>/deposit', methods=['POST'])
def deposit_goal(goal_id):
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    amount = data.get('amount', 1000)
    raw_acc_id = data.get('account_id') or data.get('accountId')
    account_id = int(raw_acc_id) if raw_acc_id is not None and str(raw_acc_id).isdigit() else None
    try:
        fin_service.deposit_goal(profile_id, goal_id, amount, account_id=account_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@api_bp.route('/goals/<int:goal_id>/withdraw', methods=['POST'])
def withdraw_goal(goal_id):
    profile_id = get_current_profile_id()
    data = request.get_json() or {}
    amount = data.get('amount', 500)
    raw_acc_id = data.get('account_id') or data.get('accountId')
    account_id = int(raw_acc_id) if raw_acc_id is not None and str(raw_acc_id).isdigit() else None
    try:
        fin_service.withdraw_goal(profile_id, goal_id, amount, account_id=account_id)
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
    user = fin_service.get_user_profile(profile_id)
    uname = (user['name'] if user and user.get('name') else f"user_{profile_id}").strip().replace(' ', '_').lower()
    date_str = datetime.now().strftime('%Y-%m-%d')
    data = backup_service.export_json_backup(profile_id)
    filename = f"moneytrack_backup_{uname}_{date_str}.json"
    return Response(
        json.dumps(data, indent=2),
        mimetype="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache, no-store, must-revalidate"
        }
    )

@api_bp.route('/settings/export/csv', methods=['GET'])
def export_csv():
    profile_id = get_current_profile_id()
    user = fin_service.get_user_profile(profile_id)
    uname = (user['name'] if user and user.get('name') else f"user_{profile_id}").strip().replace(' ', '_').lower()
    date_str = datetime.now().strftime('%Y-%m-%d')
    csv_str = backup_service.export_csv(profile_id)
    filename = f"moneytrack_statement_{uname}_{date_str}.csv"
    return Response(
        csv_str,
        mimetype="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache, no-store, must-revalidate"
        }
    )

@api_bp.route('/settings/import/json', methods=['POST'])
def import_json():
    profile_id = get_current_profile_id()
    try:
        data = None
        if 'file' in request.files:
            file_obj = request.files['file']
            file_content = file_obj.read().decode('utf-8', errors='replace')
            data = json.loads(file_content)
        else:
            data = request.get_json(silent=True)
            if data is None:
                raw_body = request.get_data(as_text=True)
                if raw_body:
                    data = json.loads(raw_body)
        if not data:
            return jsonify({'error': 'No JSON payload provided'}), 400
        backup_service.import_json_backup(data, profile_id)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400
