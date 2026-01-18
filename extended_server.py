"""
Extended Server - Redirects to main server.py

Note: This file is kept for backward compatibility.
The actual multi-profile login implementation is in server.py
which already includes the complete /login-v2 route.
"""

import os

if __name__ == '__main__':
    # Import and run the main server
    from server import app
    
    port = int(os.environ.get("PORT", 5002))
    print(f"🚀 SERVER RUNNING ON PORT {port}")
    print("ℹ️  Multi-profile login available at /login-v2")
    app.run(host='0.0.0.0', port=port, debug=True)

