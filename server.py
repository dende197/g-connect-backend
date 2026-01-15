from flask import Flask, request, jsonify
from flask_cors import CORS
import argofamiglia
import uuid
import datetime
import os

app = Flask(__name__)

# Simplified CORS for Token Bridge (No credentials needed in body-based approach)
CORS(app, origins=[
    "https://*.netlify.app",
    "http://127.0.0.1:*",
    "http://localhost:*",
    "*" # Allow all for debugging, restrict later
])

class ArgoTokenAuth(argofamiglia.ArgoFamiglia):
    def __init__(self, school_code, auth_token, access_token):
        # We set ALL internal attributes to ensure base class methods work correctly
        self._ArgoFamiglia__school = school_code
        self._ArgoFamiglia__username = "SessionUser"
        self._ArgoFamiglia__token = auth_token
        self._ArgoFamiglia__login_data = {"access_token": access_token}
        
        # Manually reconstruct headers used by dashboard() and getCompitiByDate()
        self._ArgoFamiglia__headers = {
            "Content-Type": "Application/json",
            "Authorization": "Bearer " + access_token,
            "Accept": "Application/json",
            "x-cod-min": school_code,
            "x-auth-token": auth_token
        }
        
    def connect(self):
        # Already connected via tokens
        pass

    def bacheca(self):
        try:
             import requests
             url = "https://www.portaleargo.it/famiglia/api/rest/bacheca"
             resp = requests.get(url, headers=self._ArgoFamiglia__headers)
             return resp.json()
        except:
             return []

    def voti(self):
        try:
             import requests
             url = "https://www.portaleargo.it/famiglia/api/rest/voti"
             resp = requests.get(url, headers=self._ArgoFamiglia__headers)
             return resp.json()
        except:
             return []

    def get_homework(self):
        try:
             import requests
             # This endpoint returns the full list of tasks with datCompito (deadline)
             url = "https://www.portaleargo.it/famiglia/api/rest/compitididattica"
             resp = requests.get(url, headers=self._ArgoFamiglia__headers)
             return resp.json()
        except:
             return []

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"}), 200

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    school_code = data.get('schoolCode')
    username = data.get('username')
    password = data.get('password')

    if not all([school_code, username, password]):
        return jsonify({"success": False, "error": "Credenziali mancanti"}), 400

    try:
        print(f"🔐 Login attempt: {username}@{school_code}")
        
        # Authenticate with Argo
        argo = argofamiglia.ArgoFamiglia(school_code, username, password)
        
        # EXTRACT TOKENS (Private attributes access)
        auth_token = argo._ArgoFamiglia__headers.get('x-auth-token')
        access_token = argo._ArgoFamiglia__headers.get('Authorization').replace("Bearer ", "")
        
        # Fetch initial data using Token Auth wrapper for consistency
        argo_bridge = ArgoTokenAuth(school_code, auth_token, access_token)
        tasks_data = parse_tasks(argo_bridge.get_homework())
        
        print(f"✅ Login success. Returning tokens to client.")
        
        return jsonify({
            "success": True,
            "session": {
                "schoolCode": school_code,
                "authToken": auth_token,
                "accessToken": access_token,
                "userName": username
            },
            "student": { "name": username, "class": "DidUP", "school": school_code },
            "tasks": tasks_data,
            "voti": parse_grades(argo.voti()),
            "promemoria": parse_bacheca(argo.bacheca())
        }), 200

    except Exception as e:
        print(f"❌ Login failed: {e}")
        return jsonify({"success": False, "error": str(e)}), 401

@app.route('/sync', methods=['POST'])
def sync_data():
    """Sync using tokens provided in the request body (Stateless)"""
    data = request.json
    school = data.get('schoolCode')
    auth_token = data.get('authToken')
    access_token = data.get('accessToken')
    
    try:
        print(f"🔄 Stateless sync for school {school}...")
        
        # If tokens are missing but credentials are provided, perform a re-login
        if not auth_token or not access_token:
            stored_user = data.get('storedUser')
            stored_pass = data.get('storedPass')
            if school and stored_user and stored_pass:
                print(f"🔐 Tokens missing, attempting re-login for {school}...")
                
                import base64
                import urllib.parse
                
                def decode_cred(encoded):
                    try:
                        # Decode base64 and then unquote for URL encoding
                        return urllib.parse.unquote(base64.b64decode(encoded).decode('utf-8'))
                    except:
                        return encoded

                user = decode_cred(stored_user)
                pass_ = decode_cred(stored_pass)
                
                argo = argofamiglia.ArgoFamiglia(school, user, pass_)
                tasks_data = parse_tasks(argo.get_homework())
                
                return jsonify({
                    "success": True,
                    "tasks": tasks_data,
                    "voti": parse_grades(argo.voti()),
                    "promemoria": parse_bacheca(argo.bacheca()),
                    "new_tokens": {
                        "authToken": argo._ArgoFamiglia__headers.get('x-auth-token'),
                        "accessToken": argo._ArgoFamiglia__headers.get('Authorization').replace("Bearer ", "")
                    }
                }), 200
            else:
                 return jsonify({"success": False, "error": "Token di sessione mancanti e credenziali non fornite"}), 401
                 
        # Re-hydrate session using tokens
        argo = ArgoTokenAuth(school, auth_token, access_token)
        
        # Fetch data
        tasks_data = parse_tasks(argo.get_homework())
        
        return jsonify({
            "success": True,
            "tasks": tasks_data,
            "voti": parse_grades(argo.voti()),
            "promemoria": parse_bacheca(argo.bacheca())
        }), 200
        
    except Exception as e:
        import traceback
        print(f"❌ Sync failed for {school}: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 401

@app.route('/voti', methods=['POST'])
def get_voti():
    data = request.json
    try:
        # Usiamo la tua classe ArgoTokenAuth che abbiamo già creato
        argo = ArgoTokenAuth(data['schoolCode'], data['authToken'], data['accessToken'])
        voti = argo.voti() # Metodo standard della libreria argo
        return jsonify({"success": True, "voti": voti})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 401

@app.route('/promemoria', methods=['POST'])
def get_promemoria():
    data = request.json
    try:
        argo = ArgoTokenAuth(data['schoolCode'], data['authToken'], data['accessToken'])
        # Recupera i messaggi in bacheca o i promemoria
        bacheca = argo.bacheca() 
        return jsonify({"success": True, "promemoria": bacheca})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 401

@app.route('/web/<path:path>')
def serve_web(path):
    return send_from_directory('web', path)

@app.route('/')
def index():
    try:
        from flask import send_from_directory
        return send_from_directory('web', 'index.html')
    except:
        return "G-Connect Server is running. Please open the frontend."

def parse_tasks(raw_response):
    tasks_data = [] 
    
    # If raw_response is a list (from get_homework / compitididattica)
    if isinstance(raw_response, list):
        for t in raw_response:
            # datGiorno = assignment date, datCompito = deadline date
            due_date = t.get('datCompito') or t.get('datGiorno')
            desc = t.get('desCompito') or ""
            mat = t.get('desMateria') or "Generico"
            
            tasks_data.append({
                "id": str(t.get('prgCompito')) if t.get('prgCompito') else str(uuid.uuid4())[:12],
                "text": desc,
                "subject": mat,
                "done": False,
                "date": t.get('datGiorno'),
                "due_date": due_date,
                "desCompito": desc,
                "datCompito": due_date,
                "datGiorno": t.get('datGiorno'),
                "materia": mat
            })
            
    # Fallback for grouped dashboard response (if needed)
    elif isinstance(raw_response, dict):
         for date_str, details in raw_response.items():
             compiti_list = details.get('compiti', [])
             materie_list = details.get('materie', [])
             
             for i, desc in enumerate(compiti_list):
                 mat = materie_list[i] if i < len(materie_list) else "Generico"
                 tasks_data.append({
                    "id": str(uuid.uuid4())[:12], 
                    "text": desc,
                    "subject": mat,
                    "done": False,
                    "date": date_str,
                    "due_date": date_str, # In this format, we often don't have datCompito
                    "desCompito": desc,
                    "datCompito": date_str,
                    "materia": mat
                 })
                 
    return tasks_data

def parse_grades(raw_voti):
    grades = []
    if isinstance(raw_voti, list):
        for g in raw_voti:
            # Argo keys: desMateria, codVoto (valore), datGiorno (data), desVoto (tipo), numPeso (peso)
            grades.append({
                "materia": g.get('desMateria') or g.get('materia'),
                "valore": g.get('codVoto') or g.get('voto'),
                "data": g.get('datGiorno') or g.get('data'),
                "tipo": g.get('desVoto') or "N/D",
                "peso": g.get('numPeso') or "100",
                "subject": g.get('desMateria'), # Legacy compatibility
                "value": g.get('codVoto'),      # Legacy compatibility
                "date": g.get('datGiorno')       # Legacy compatibility
            })
    return grades

def parse_bacheca(raw_b):
    announcements = []
    if isinstance(raw_b, list):
        for b in raw_b:
            announcements.append({
                "oggetto": b.get('desOggetto') or b.get('titolo'),
                "testo": b.get('desMessaggio') or b.get('testo'),
                "autore": b.get('desMittente') or b.get('autore'),
                "data": b.get('datGiorno') or b.get('data'),
                "url": b.get('urlAllegato') or b.get('url'),
                "title": b.get('desOggetto'), # Legacy compatibility
                "date": b.get('datGiorno')     # Legacy compatibility
            })
    return announcements

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5002))
    print(f"🚀 G-Connect Server running on port {port}")
    app.run(host='0.0.0.0', port=port, debug=True)
