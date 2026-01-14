from flask import Flask, request, jsonify
from flask_cors import CORS
import argofamiglia
import uuid
import datetime

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Custom class to allow token-based init (Bypassing Password)
class ArgoTokenAuth(argofamiglia.ArgoFamiglia):
    def __init__(self, school_code, auth_token, access_token):
        # We don't call super().__init__ because it forces password login
        self._ArgoFamiglia__school = school_code
        self._ArgoFamiglia__username = "SessionUser"
        
        # Manually reconstruct headers
        self._ArgoFamiglia__headers = {
            "Content-Type": "Application/json",
            "Authorization": "Bearer " + access_token,
            "Accept": "Application/json",
            "x-cod-min": school_code,
            "x-auth-token": auth_token
        }
        
    def connect(self):
        # Disable connect since we are already authenticated via token
        pass

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    school_code = data.get('schoolCode')
    username = data.get('username')
    password = data.get('password')

    if not all([school_code, username, password]):
        return jsonify({"success": False, "error": "Credenziali mancanti"}), 400

    try:
        # 1. INITIAL LOGIN WITH PASSWORD
        print(f"--- Richiesta Login (Nuova Sessione) ---")
        argo = argofamiglia.ArgoFamiglia(school_code, username, password)
        
        # EXTRACT TOKENS (Private attributes access needed)
        # We need these to allow future requests without password
        auth_token = argo._ArgoFamiglia__headers.get('x-auth-token')
        access_token = argo._ArgoFamiglia__headers.get('Authorization').replace("Bearer ", "")
        
        # Fetch initial data
        raw_response = argo.getCompitiByDate()
        tasks_data = parse_tasks(raw_response)
        
        return jsonify({
            "success": True,
            "session": {
                "schoolCode": school_code,
                "authToken": auth_token,
                "accessToken": access_token
            },
            "student": { "name": username, "class": "DidUP", "school": school_code },
            "tasks": tasks_data
        })

    except Exception as e:
        print(f"❌ Errore Login: {e}")
        return jsonify({"success": False, "error": str(e)}), 401

@app.route('/sync', methods=['POST'])
def sync_data():
    data = request.json
    school = data.get('schoolCode')
    auth_token = data.get('authToken')
    access_token = data.get('accessToken')
    
    if not all([school, auth_token, access_token]):
        return jsonify({"success": False, "error": "Sessione non valida"}), 400
        
    try:
        print(f"--- Richiesta Sync (Sessione Token) ---")
        # Re-hydrate session without password!
        argo = ArgoTokenAuth(school, auth_token, access_token)
        
        raw_response = argo.getCompitiByDate()
        tasks_data = parse_tasks(raw_response)
        
        return jsonify({
            "success": True,
            "tasks": tasks_data
        })
    except Exception as e:
        print(f"❌ Errore Sync: {e}")
        return jsonify({"success": False, "error": "Sessione Scaduta"}), 401

def parse_tasks(raw_response):
    tasks_data = [] 
    if isinstance(raw_response, dict):
         for date_str, details in raw_response.items():
             compiti_list = details.get('compiti', [])
             materie_list = details.get('materie', [])
             for i, desc in enumerate(compiti_list):
                 mat = materie_list[i] if i < len(materie_list) else "Materia"
                 tasks_data.append({
                    "id": str(date_str) + str(uuid.uuid4())[:8], 
                    "text": f"{mat}: {desc}",
                    "done": False,
                    "date": date_str
                 })
    return tasks_data

import os

if __name__ == '__main__':
    # Use PORT provided by Cloud, or fallback to 5002 for local
    port = int(os.environ.get("PORT", 5002))
    print(f"🚀 G-Connect Server running on http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
