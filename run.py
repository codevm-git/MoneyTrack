
import os
import sys
import webbrowser
from threading import Timer

# Ensure vendor directory is in sys.path for offline execution
vendor_dir = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'vendor'
)

if os.path.isdir(vendor_dir) and vendor_dir not in sys.path:
    sys.path.insert(0, vendor_dir)

from app import create_app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    host = '127.0.0.1'
    url = f'http://{host}:{port}'

    print(f"Starting MoneyTrack Offline Financial Planner on {url}")

    # Automatically open the app in the default browser
    Timer(1.5, lambda: webbrowser.open(url)).start()

    # Start Flask server
    app.run(
        host='0.0.0.0',
        port=port,
        debug=False
    )

