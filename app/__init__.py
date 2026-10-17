import os
import sys
import secrets

# Ensure vendor directory is in sys.path
vendor_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'vendor')
if os.path.isdir(vendor_dir) and vendor_dir not in sys.path:
    sys.path.insert(0, vendor_dir)

from flask import Flask, jsonify, request
from app.database.connection import init_db

def get_or_create_secret_key(data_dir):
    """
    Retrieves secret key from environment or creates a persistent,
    secure random 32-byte key stored in data/.secret_key with restricted permissions.
    """
    env_key = os.environ.get('SECRET_KEY')
    if env_key:
        return env_key

    os.makedirs(data_dir, exist_ok=True)
    key_file = os.path.join(data_dir, '.secret_key')
    if os.path.isfile(key_file):
        try:
            with open(key_file, 'r', encoding='utf-8') as f:
                key = f.read().strip()
                if key:
                    return key
        except Exception:
            pass

    # Generate new cryptographically secure random key
    new_key = secrets.token_hex(32)
    try:
        with open(key_file, 'w', encoding='utf-8') as f:
            f.write(new_key)
        os.chmod(key_file, 0o600)
    except Exception:
        pass
    return new_key

def create_app(db_path=None):
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    template_dir = os.path.join(root_dir, 'templates')
    static_dir = os.path.join(root_dir, 'static')
    data_dir = os.path.join(root_dir, 'data')

    app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)

    # Security Configurations
    app.config['SECRET_KEY'] = get_or_create_secret_key(data_dir)
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024 # 5 MB upload limit to prevent memory DOS

    if db_path:
        app.config['DB_PATH'] = db_path
        os.environ['MONEYTRACK_DB_PATH'] = db_path

    # Initialize SQLite database schema and seed data
    init_db(db_path)

    # Register blueprints
    from app.routes.views import views_bp
    from app.routes.api import api_bp
    
    app.register_blueprint(views_bp)
    app.register_blueprint(api_bp)

    # Safe error handlers to prevent exposing stack traces
    @app.errorhandler(400)
    def bad_request(e):
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Bad Request: ' + str(e.description if hasattr(e, 'description') else 'Invalid input')}), 400
        return e, 400

    @app.errorhandler(404)
    def not_found(e):
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Resource not found'}), 404
        return e, 404

    @app.errorhandler(413)
    def file_too_large(e):
        if request.path.startswith('/api/'):
            return jsonify({'error': 'File too large. Maximum backup size is 5MB.'}), 413
        return e, 413

    @app.errorhandler(500)
    def server_error(e):
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Internal server error occurred. Please try again.'}), 500
        return e, 500

    return app
