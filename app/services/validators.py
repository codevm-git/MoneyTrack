import re
import datetime
from decimal import Decimal, InvalidOperation

DATE_REGEX = re.compile(r'^\d{4}-\d{2}-\d{2}$')

def validate_date(date_str):
    """
    Strictly validates that a date string is in YYYY-MM-DD format (or ISO date prefix)
    and represents an actual valid calendar date (including leap years).
    """
    if not isinstance(date_str, str):
        raise ValueError("Date must be in YYYY-MM-DD format.")
    clean_date = date_str.strip().split('T')[0].split(' ')[0]
    if not DATE_REGEX.match(clean_date):
        raise ValueError("Date must be in YYYY-MM-DD format.")
    try:
        parts = [int(p) for p in clean_date.split('-')]
        # datetime.date validates year, month (1-12), and day (1-31 with leap year check)
        datetime.date(parts[0], parts[1], parts[2])
        return clean_date
    except (ValueError, TypeError):
        raise ValueError(f"Invalid calendar date: {date_str}")

def validate_amount(val, field_name="Amount", min_val=0.01, max_val=999999999.0):
    """
    Validates monetary values. Rejects negatives, zero where disallowed,
    and values exceeding practical thresholds (99 Crore).
    """
    if val is None:
        raise ValueError(f"{field_name} is required.")
    try:
        # Convert through string to Decimal to detect scientific notation or NaN
        s = str(val).strip()
        if not s or s.lower() in ('nan', 'inf', '-inf'):
            raise ValueError(f"{field_name} must be a valid number.")
        d = Decimal(s)
        if d < Decimal(str(min_val)):
            raise ValueError(f"{field_name} must be at least {min_val}.")
        if d > Decimal(str(max_val)):
            raise ValueError(f"{field_name} exceeds maximum allowable limit.")
        return float(d)
    except (InvalidOperation, ValueError) as e:
        if isinstance(e, ValueError) and str(e).startswith(field_name):
            raise
        raise ValueError(f"{field_name} must be a valid positive number.")

def sanitize_text(text, field_name="Text", min_len=1, max_len=200):
    """
    Strips whitespace, removes null bytes, escapes dangerous control characters,
    and enforces min/max length constraints.
    """
    if text is None:
        raise ValueError(f"{field_name} is required.")
    cleaned = str(text).replace('\x00', '').strip()
    # Strip HTML tags to prevent stored XSS
    cleaned = re.sub(r'<[^>]*>', '', cleaned)
    if len(cleaned) < min_len:
        raise ValueError(f"{field_name} must contain at least {min_len} character(s).")
    if len(cleaned) > max_len:
        raise ValueError(f"{field_name} cannot exceed {max_len} characters.")
    return cleaned

def validate_backup_payload(data):
    """
    Validates the structure, types, and constraints of an uploaded JSON backup.
    Prevents corrupt, incomplete, or malicious JSON from being imported.
    """
    if not isinstance(data, dict):
        raise ValueError("Invalid backup structure: Root must be a JSON object.")

    app_id = str(data.get('app', '')).lower()
    if 'moneytrack' not in app_id:
        raise ValueError("Incompatible backup file: Invalid or missing MoneyTrack application identifier.")

    # Validate transactions if present
    if 'transactions' in data:
        if not isinstance(data['transactions'], list):
            raise ValueError("'transactions' must be a list.")
        for idx, tx in enumerate(data['transactions']):
            if not isinstance(tx, dict):
                raise ValueError(f"Transaction at index {idx} must be an object.")
            validate_date(tx.get('date', ''))
            sanitize_text(tx.get('description', ''), f"Transaction {idx} description", 1, 250)
            if tx.get('type') not in ('income', 'expense', 'transfer'):
                raise ValueError(f"Transaction {idx} has invalid type: {tx.get('type')}")
            # Validate amount
            amt = tx.get('amount')
            amt_paise = tx.get('amount_paise')
            if amt is None and amt_paise is None:
                raise ValueError(f"Transaction {idx} missing amount.")
            if amt is not None:
                validate_amount(amt, f"Transaction {idx} amount")
            if amt_paise is not None:
                validate_amount(amt_paise, f"Transaction {idx} amount_paise", min_val=1)

    # Validate goals if present
    if 'goals' in data:
        if not isinstance(data['goals'], list):
            raise ValueError("'goals' must be a list.")
        for idx, g in enumerate(data['goals']):
            if not isinstance(g, dict):
                raise ValueError(f"Goal at index {idx} must be an object.")
            sanitize_text(g.get('name', ''), f"Goal {idx} name", 1, 100)
            target = g.get('targetAmount') or g.get('target_amount_paise')
            if target is None:
                raise ValueError(f"Goal {idx} missing target amount.")

    # Validate accounts if present
    if 'accounts' in data:
        if not isinstance(data['accounts'], list):
            raise ValueError("'accounts' must be a list.")
        for idx, acc in enumerate(data['accounts']):
            if not isinstance(acc, dict):
                raise ValueError(f"Account at index {idx} must be an object.")
            sanitize_text(acc.get('name', ''), f"Account {idx} name", 1, 100)
            if 'account_type' in acc:
                validate_account_type(acc.get('account_type'))

    return True

VALID_ACCOUNT_TYPES = {'savings', 'current', 'cash', 'credit_card', 'wallet', 'investment'}

def validate_account_type(acc_type):
    if not acc_type or str(acc_type).lower().strip() not in VALID_ACCOUNT_TYPES:
        raise ValueError(f"Invalid account type '{acc_type}'. Must be one of: {', '.join(sorted(VALID_ACCOUNT_TYPES))}")
    return str(acc_type).lower().strip()

# Aliases
validate_amount_rupees = validate_amount
sanitize_string = sanitize_text
