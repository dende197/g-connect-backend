from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import argofamiglia
import uuid
import os
import json
import requests
import secrets
import re
import base64
from hashlib import sha256
from datetime import datetime

from planner_routes import register_planner_routes

# CREA UNA SOLA ISTANZA DI FLASK
app = Flask(__name__, static_url_path="/static", static_folder="static")

# CORS: configura una sola volta con i domini corretti
CORS(app, resources={r"/*": {"origins": "*"}}, origins=[
    "https://*.netlify.app",
    "http://127.0.0.1:*",
    "http://localhost:*",
    "*"
])

# REGISTRA LE ROUTE DEL PLANNER SULL'ISTANZA 'app'
register_planner_routes(app)

# ✅ NEW: Supabase
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv() # Load local .env if present

# ============= CONSTANTS =============
CHALLENGE_URL = "https://auth.portaleargo.it/oauth2/auth"
LOGIN_URL = "https://www.portaleargo.it/auth/sso/login"
TOKEN_URL = "https://auth.portaleargo.it/oauth2/token"
REDIRECT_URI = "it.argosoft.didup.famiglia.new://login-callback"
CLIENT_ID = "72fd6dea-d0ab-4bb9-8eaa-3ac24c84886c"
ENDPOINT = "https://www.portaleargo.it/appfamiglia/api/rest/"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36"


# ============= CONFIGURAZIONE DEBUG =============
DEBUG_MODE = True  # Imposta False in produzione

import logging

# Configure logging to file
logging.basicConfig(
    filename='server.log',
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    filemode='w'  # Overwrite each time server restarts
)

def debug_log(message, data=None):
    """Helper per logging strutturato su file e console"""
    log_msg = f"{message}"
    if data:
        if isinstance(data, (dict, list)):
            log_msg += f"\n{json.dumps(data, indent=2, ensure_ascii=False, default=str)[:2000]}"
        else:
            log_msg += f"\n{str(data)[:2000]}"
    
    # Write to file
    logging.info(log_msg)
    
    # Print to console (existing behavior)
    if DEBUG_MODE:
        print(f"\n{'='*60}")
        print(f"🔍 {message}")
        if data:
            if isinstance(data, (dict, list)):
                print(json.dumps(data, indent=2, ensure_ascii=False, default=str)[:2000])
            else:
                print(str(data)[:2000])
        print(f"{'='*60}\n")

# ✅ NEW: Supabase client init
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_BUCKET = os.environ.get("SUPABASE_STORAGE_BUCKET", "uploads")
STRICT_SUPABASE = os.environ.get("STRICT_SUPABASE", "false").lower() == "true"

supabase: Client | None = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        debug_log("✅ Supabase configured and connected")
    except Exception as e:
        debug_log("❌ Error initializing Supabase client", str(e))
else:
    debug_log("⚠️ Supabase NOT configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")

# ============= PERSISTENCE CONFIG =============
DATA_DIR = os.path.abspath(".")
STATIC_UPLOAD_DIR = os.path.join(DATA_DIR, "static", "uploads")
os.makedirs(STATIC_UPLOAD_DIR, exist_ok=True)

PLANNER_FILE = "planner.json"

def load_planner(user_id):
    planners = load_json_file(PLANNER_FILE, {})
    return planners.get(user_id, {})

def save_planner(user_id, data):
    planners = load_json_file(PLANNER_FILE, {})
    planners[user_id] = data
    save_json_file(PLANNER_FILE, planners)

POSTS_FILE = "posts.json"
MARKET_FILE = "market.json"
PROFILES_FILE = "profiles.json"
POLLS_FILE = "polls.json"

def load_json_file(filename, default=[]):
    """Carica dati da file JSON locale"""
    try:
        path = os.path.join(DATA_DIR, filename)
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        debug_log(f"⚠️ Errore caricamento {filename}", str(e))
    return default

def save_json_file(filename, data):
    """Salva dati su file JSON locale"""
    try:
        path = os.path.join(DATA_DIR, filename)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        debug_log(f"⚠️ Errore salvataggio {filename}", str(e))

# ============= UPLOAD HELPERS =============
def save_image_local(b64data, prefix="img"):
    try:
        file_id = f"{prefix}_{uuid.uuid4().hex[:12]}.png"
        file_path = os.path.join(STATIC_UPLOAD_DIR, file_id)
        with open(file_path, "wb") as f:
            f.write(base64.b64decode(b64data.split(",")[-1]))
        return f"/static/uploads/{file_id}"
    except Exception as e:
        debug_log("❌ save_image_local error", str(e))
        raise e

def save_image_supabase(b64data, prefix="img"):
    try:
        file_id = f"{prefix}_{uuid.uuid4().hex[:12]}.png"
        # Upload to Supabase Storage
        content_bytes = base64.b64decode(b64data.split(",")[-1])
        supabase.storage.from_(SUPABASE_BUCKET).upload(file_id, content_bytes, file_options={"content-type": "image/png", "upsert": True})
        public_url = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(file_id)
        return public_url
    except Exception as e:
        debug_log("⚠️ save_image_supabase error", str(e))
        # Fallback to local
        return save_image_local(b64data, prefix=prefix)

# ============= ADVANCED ARGO CLASS (MULTI-PROFILE) =============

class AdvancedArgo(argofamiglia.ArgoFamiglia):
    """
    Estensione di ArgoFamiglia per supportare login manuale e selezione profilo.
    """
    def __init__(self, school: str, username: str, password: str, auth_token=None, access_token=None, skip_connect=False):
        # Bypass __init__ originale per evitare connect automatica se richiesto
        self._ArgoFamiglia__school = school
        self._ArgoFamiglia__username = username
        self._ArgoFamiglia__password = password
        self._ArgoFamiglia__token = auth_token
        self._ArgoFamiglia__login_data = {"access_token": access_token} if access_token else None
        self._ArgoFamiglia__headers = {}
        
        if auth_token and access_token:
            self.set_headers(auth_token, access_token)
        elif not skip_connect:
            self.connect()

    def set_headers(self, auth_token, access_token):
        """Imposta gli header manualmente"""
        self._ArgoFamiglia__headers = {
            "Content-Type": "Application/json",
            "Authorization": "Bearer " + access_token,
            "Accept": "Application/json",
            "x-cod-min": self._ArgoFamiglia__school,
            "x-auth-token": auth_token,
            "User-Agent": USER_AGENT
        }
        self._ArgoFamiglia__token = auth_token

    @staticmethod
    def raw_login(school, username, password):
        """
        Esegue il flow OAuth e restituisce TUTTI i profili disponibili.
        """
        try:
            # 1. Challenge
            CODE_VERIFIER = secrets.token_hex(64)
            CODE_CHALLENGE = base64.urlsafe_b64encode(sha256(CODE_VERIFIER.encode()).digest()).decode().replace("=", "")
            
            session = requests.Session()
            
            params = {
                "redirect_uri": REDIRECT_URI,
                "client_id": CLIENT_ID,
                "response_type": "code",
                "prompt": "login",
                "state": secrets.token_urlsafe(32),
                "scope": "openid offline profile user.roles argo",
                "code_challenge": CODE_CHALLENGE,
                "code_challenge_method": "S256"
            }
            
            req = session.get(CHALLENGE_URL, params=params)
            
            # Extract challenge
            challenge_match = re.search(r"login_challenge=([0-9a-f]+)", req.url)
            if not challenge_match:
                raise Exception("Login challenge non trovata")
            login_challenge = challenge_match.group(1)
            
            # 2. Login POST
            login_data = {
                "challenge": login_challenge,
                "client_id": CLIENT_ID,
                "prefill": "true",
                "famiglia_customer_code": school,
                "username": username,
                "password": password,
                "login": "true"
            }
            
            req = session.post(LOGIN_URL, data=login_data, allow_redirects=False)
            if "Location" not in req.headers:
                raise ValueError("Credenziali errate o scuola non valida")
            
            # 3. Follow redirect to get code
            while True:
                location = req.headers["Location"]
                if "code=" in location:
                    break
                req = session.get(location, allow_redirects=False)
            
            code_match = re.search(r"code=([0-9a-zA-Z-_.]+)", location)
            if not code_match:
                raise Exception("Auth code non trovato")
            code = code_match.group(1)
            
            # 4. Exchange code for token
            token_req_data = {
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": REDIRECT_URI,
                "code_verifier": CODE_VERIFIER,
                "client_id": CLIENT_ID
            }
            
            tokens = session.post(TOKEN_URL, data=token_req_data).json()
            access_token = tokens["access_token"]
            
            # 5. Call Argo Login API to get Profiles
            login_headers = {
                "User-Agent": USER_AGENT,
                "Content-Type": "Application/json",
                "Authorization": "Bearer " + access_token,
                "Accept": "Application/json",
            }
            
            payload = {
                "clientID": secrets.token_urlsafe(64),
                "lista-x-auth-token": "[]",
                "x-auth-token-corrente": "null",
                "lista-opzioni-notifiche": "{}"
            }
            
            argo_resp = requests.post(ENDPOINT + "login", headers=login_headers, json=payload).json()
            profiles_data = argo_resp.get("data", [])
            
            return {
                "access_token": access_token,
                "profiles": profiles_data
            }
            
        except Exception as e:
            debug_log("Errore Raw Login", str(e))
            raise e

    def get_full_dashboard(self):
        """
        Richiede la dashboard completa partendo dall'inizio dell'anno scolastico.
        """
        try:
            # Data inizio anno scolastico (es. 1 Settembre 2024)
            # Modificare l'anno dinamicamente se necessario
            start_date = "2024-09-01 00:00:00"
            
            payload = {
                "dataultimoaggiornamento": start_date,
                "opzioni": json.dumps(argofamiglia.CONSTANTS.DASHBOARD_OPTIONS)
            }
            
            debug_log("📅 Richiesta Full Dashboard dal:", start_date)
            res = requests.post(argofamiglia.CONSTANTS.ENDPOINT + "dashboard/dashboard", 
                              headers=self._ArgoFamiglia__headers,
                              json=payload)
            return res.json()
        except Exception as e:
            debug_log("⚠️ Errore Full Dashboard", str(e))
            return {}

# ============= STRATEGIE ESTRAZIONE VOTI =============

def strategia_1_dashboard(argo_instance):
    """
    STRATEGIA 1: Usa il metodo dashboard() della libreria
    """
    grades = []
    try:
        debug_log("STRATEGIA 1: Chiamata dashboard()")
        dashboard_data = argo_instance.dashboard()
        
        debug_log("Dashboard RAW Response", dashboard_data)
        
        if not dashboard_data:
            debug_log("⚠️ Dashboard vuota")
            return grades
        
        # Naviga nella struttura
        data_obj = dashboard_data.get('data', {})
        dati_list = data_obj.get('dati', [])
        
        # Fallback: controlla se 'dati' è nella radice
        if not dati_list and 'dati' in dashboard_data:
            dati_list = dashboard_data.get('dati', [])
        
        if not dati_list:
            debug_log("⚠️ Nessun elemento in 'dati'", {
                "dashboard_keys": list(dashboard_data.keys()),
                "data_keys": list(data_obj.keys()) if isinstance(data_obj, dict) else "N/A"
            })
            return grades
        
        main_data = dati_list[0] if dati_list else {}
        debug_log("Chiavi trovate in dati[0]", list(main_data.keys()))
        
        # Cerca in TUTTE le chiavi possibili
        voti_keys = [
            'votiGiornalieri',
            'votiPeriodici', 
            'votiScrutinio',
            'voti_giornalieri',
            'voti',
            'valutazioni',
            'valutazioniGiornaliere'
        ]
        
        for key in voti_keys:
            voti_raw = main_data.get(key, [])
            if voti_raw:
                debug_log(f"✅ Trovati {len(voti_raw)} voti in '{key}'", voti_raw[:2])
                
                for v in voti_raw:
                    valore = v.get('codVoto') or v.get('voto') or v.get('valore')
                    materia = v.get('desMateria') or v.get('materia', 'N/D')
                    
                    grades.append({
                        "materia": materia,
                        "valore": valore,
                        "data": v.get('datGiorno') or v.get('data') or v.get('dataVoto'),
                        "tipo": v.get('desVoto') or v.get('tipo', 'N/D'),
                        "peso": v.get('numPeso', '100'),
                        # Alias per frontend
                        "subject": materia,
                        "value": valore,
                        "date": v.get('datGiorno', ''),
                        "id": str(uuid.uuid4())[:12]
                    })
                break  # ✅ IMPORTANTE: Esci dopo aver trovato i voti
                    
    except Exception as e:
        debug_log(f"❌ Errore Strategia 1", str(e))
        import traceback
        traceback.print_exc()
    
    return grades


def strategia_2_api_diretta(argo_instance):
    """
    STRATEGIA 2: Chiamata diretta agli endpoint REST di Argo
    """
    grades = []
    try:
        headers = argo_instance._ArgoFamiglia__headers
        base_url = "https://www.portaleargo.it/famiglia/api/rest"
        
        # Lista di endpoint possibili per i voti
        endpoints = [
            "/votiGiornalieri",
            "/voti",
            "/valutazioni/giornaliere",
            "/registro/voti",
            "/votiPeriodici"
        ]
        
        for endpoint in endpoints:
            url = base_url + endpoint
            debug_log(f"STRATEGIA 2: Tentativo GET {url}")
            
            try:
                response = requests.get(url, headers=headers, timeout=10)
                debug_log(f"Response {endpoint}", {
                    "status": response.status_code,
                    "body_preview": response.text[:500]
                })
                
                if response.status_code == 200:
                    try:
                        data = response.json()
                        
                        # Se è una lista diretta
                        if isinstance(data, list) and len(data) > 0:
                            debug_log(f"✅ Trovati {len(data)} voti in {endpoint}", data[:2])
                            
                            for v in data:
                                grades.append({
                                    "materia": v.get('desMateria') or v.get('materia', 'N/D'),
                                    "valore": v.get('codVoto') or v.get('voto') or v.get('valore'),
                                    "data": v.get('datGiorno') or v.get('data'),
                                    "tipo": v.get('desVoto') or v.get('tipo', 'N/D'),
                                    "peso": v.get('numPeso', '100'),
                                    "subject": v.get('desMateria', 'N/D'),
                                    "value": v.get('codVoto', ''),
                                    "date": v.get('datGiorno', ''),
                                    "id": str(uuid.uuid4())[:12]
                                })
                            break  # Ferma se trovati
                            
                        # Se è un dict con array annidato
                        elif isinstance(data, dict):
                            debug_log(f"Risposta dict da {endpoint}", list(data.keys()))
                            
                            # Cerca array annidati
                            for key in ['voti', 'dati', 'data', 'valutazioni']:
                                if key in data and isinstance(data[key], list):
                                    debug_log(f"✅ Trovati {len(data[key])} voti in {endpoint}.{key}")
                                    for v in data[key]:
                                        grades.append({
                                            "materia": v.get('desMateria') or v.get('materia', 'N/D'),
                                            "valore": v.get('codVoto') or v.get('voto') or v.get('valore'),
                                            "data": v.get('datGiorno') or v.get('data'),
                                            "tipo": v.get('desVoto') or v.get('tipo', 'N/D'),
                                            "peso": v.get('numPeso', '100'),
                                            "subject": v.get('desMateria', 'N/D'),
                                            "value": v.get('codVoto', ''),
                                            "date": v.get('datGiorno', ''),
                                            "id": str(uuid.uuid4())[:12]
                                        })
                                    break
                                    
                    except Exception as json_err:
                         debug_log(f"⚠️ Errore parsing JSON {endpoint}: {json_err}")
                         
            except requests.exceptions.RequestException as e:
                debug_log(f"⚠️ Errore request {endpoint}", str(e))
                continue
                
    except Exception as e:
        debug_log(f"❌ Errore Strategia 2", str(e))
        import traceback
        traceback.print_exc()
    
    return grades


def strategia_3_metodo_diretto(argo_instance):
    """
    STRATEGIA 3: Usa metodi specifici della libreria argofamiglia
    """
    grades = []
    try:
        metodi = [
            'voti',
            'getVoti',
            'votiGiornalieri',
            'getVotiGiornalieri',
            'valutazioni'
        ]
        
        for metodo in metodi:
            if hasattr(argo_instance, metodo):
                debug_log(f"STRATEGIA 3: Trovato metodo '{metodo}'")
                try:
                    result = getattr(argo_instance, metodo)()
                    debug_log(f"Risultato {metodo}", result)
                    
                    if result and isinstance(result, (list, dict)):
                        if isinstance(result, list):
                            for v in result:
                                grades.append({
                                    "materia": v.get('desMateria', 'N/D'),
                                    "valore": v.get('codVoto', ''),
                                    "data": v.get('datGiorno', ''),
                                    "tipo": v.get('desVoto', 'N/D'),
                                    "subject": v.get('desMateria', 'N/D'),
                                    "value": v.get('codVoto', ''),
                                    "date": v.get('datGiorno', ''),
                                    "id": str(uuid.uuid4())[:12]
                                })
                        break
                except Exception as e:
                    debug_log(f"⚠️ Errore chiamata {metodo}", str(e))
                    
    except Exception as e:
        debug_log(f"❌ Errore Strategia 3", str(e))
    
    return grades


def extract_grades_multi_strategy(argo_instance):
    """
    MASTER FUNCTION: Prova tutte le strategie in sequenza
    """
    all_grades = []
    
    # Strategia 1
    grades_s1 = strategia_1_dashboard(argo_instance)
    if grades_s1:
        debug_log(f"✅ Strategia 1: {len(grades_s1)} voti")
        all_grades.extend(grades_s1)
        return all_grades  # Ferma se trovati
    
    # Strategia 2
    grades_s2 = strategia_2_api_diretta(argo_instance)
    if grades_s2:
        debug_log(f"✅ Strategia 2: {len(grades_s2)} voti")
        all_grades.extend(grades_s2)
        return all_grades
    
    # Strategia 3
    grades_s3 = strategia_3_metodo_diretto(argo_instance)
    if grades_s3:
        debug_log(f"✅ Strategia 3: {len(grades_s3)} voti")
        all_grades.extend(grades_s3)
        return all_grades
    
    debug_log("❌ NESSUNA STRATEGIA ha restituito voti")
    return all_grades


# ============= ESTRAZIONE COMPITI =============

def extract_homework_safe(argo_instance):
    """Recupera compiti con gestione errori"""
    tasks_data = []
    try:
        debug_log("📚 Extraction Compiti via FULL DASHBOARD")
        # Usa la nostra chiamata custom che parte da inizio anno
        dashboard_data = argo_instance.get_full_dashboard()
        
        # Parsing manuale simile a getCompitiByDate ma su dati custom
        raw_homework = {}
        if 'data' in dashboard_data and 'dati' in dashboard_data['data']:
            dati = dashboard_data['data']['dati']
            if dati and len(dati) > 0:
                registro = dati[0].get('registro', [])
                for element in registro:
                     for compito in element.get("compiti", []):
                        data_consegna = compito.get("dataConsegna")
                        if data_consegna not in raw_homework:
                            raw_homework[data_consegna] = {"compiti": [], "materie": []}
                        raw_homework[data_consegna]["compiti"].append(compito.get("compito"))
                        raw_homework[data_consegna]["materie"].append(element.get("materia"))

        debug_log(f"Compiti Estratti (Giorni): {len(raw_homework)}")
        
        if isinstance(raw_homework, dict):
            for date_str, details in raw_homework.items():
                compiti_list = details.get('compiti', [])
                materie_list = details.get('materie', [])
                
                for i, desc in enumerate(compiti_list):
                    mat = materie_list[i] if i < len(materie_list) else "Generico"
                    tasks_data.append({
                        "id": str(uuid.uuid4())[:12],
                        "text": desc,
                        "subject": mat,
                        "due_date": date_str,
                        "datCompito": date_str,  # ✅ AGGIUNTO
                        "materia": mat,          # ✅ AGGIUNTO
                        "done": False
                    })
                    
        elif isinstance(raw_homework, list):
            for t in raw_homework:
                tasks_data.append({
                    "id": str(uuid.uuid4())[:12],
                    "text": t.get('desCompito', '') or t.get('compito', ''),
                    "subject": t.get('desMateria', '') or t.get('materia', 'Generico'),
                    "due_date": t.get('datCompito', ''),
                    "datCompito": t.get('datCompito', ''),  # ✅ AGGIUNTO
                    "materia": t.get('desMateria', 'Generico'),  # ✅ AGGIUNTO
                    "done": False
                })
                
    except Exception as e:
        debug_log(f"⚠️ Errore compiti", str(e))
        import traceback
        traceback.print_exc()
    
    debug_log(f"✅ Totale compiti: {len(tasks_data)}")
    return tasks_data


def extract_promemoria(dashboard_data):
    """Estrae promemoria dalla dashboard"""
    promemoria = []
    try:
        data_obj = dashboard_data.get('data', {})
        dati_list = data_obj.get('dati', []) if isinstance(data_obj, dict) else []
        
        if not dati_list and 'dati' in dashboard_data:
            dati_list = dashboard_data.get('dati', [])

        for blocco in dati_list:
            items = blocco.get('bachecaAlunno', []) + blocco.get('promemoria', [])
            
            for i in items:
                promemoria.append({
                    "titolo": i.get('desOggetto') or i.get('titolo', 'Avviso'),
                    "testo": i.get('desMessaggio') or i.get('testo') or i.get('desAnnotazioni', ''),
                    "autore": i.get('desMittente', 'Scuola'),
                    "data": i.get('datGiorno') or i.get('data', ''),
                    "url": i.get('urlAllegato', ''),
                    "oggetto": i.get('desOggetto') or i.get('titolo', 'Avviso'),
                    "date": i.get('datGiorno', '')
                })
    except Exception as e:
        debug_log(f"⚠️ Errore promemoria", str(e))
    
    return promemoria


# ============= HELPERS SESSIONI =============

def create_session(school, user, password, access_token, auth_token):
    """Crea una sessione ArgoFamiglia usando token esistenti"""
    return AdvancedArgo(school, user, password, auth_token=auth_token, access_token=access_token)

# ============= ROUTES =============

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "debug": DEBUG_MODE}), 200

# ============= PERSISTENCE ENDPOINTS =============

@app.route('/api/planner/<user_id>', methods=['GET', 'PUT'])
def handle_planner(user_id):
    """
    Gestisce il caricamento e salvataggio del planner (compiti pianificati, stress)
    per un utente specifico. Supporta Supabase (tabella 'planner') e JSON fallback.
    """
    if supabase:
        try:
            if request.method == 'GET':
                resp = supabase.table("planner").select("*").eq("userId", user_id).limit(1).execute()
                rows = resp.data or []
                if STRICT_SUPABASE and not rows:
                    return jsonify({"success": False, "error": "Supabase planner empty"}), 502
                if rows:
                    return jsonify({"success": True, "data": rows[0].get("payload", {})}), 200
                # Fallback locale solo se non strict
                if not STRICT_SUPABASE:
                    return jsonify({"success": True, "data": load_planner(user_id)}), 200
                return jsonify({"success": True, "data": {}}), 200
            else:
                body = request.json or {}
                supabase.table("planner").upsert({"userId": user_id, "payload": body}).execute()
                return jsonify({"success": True}), 200
        except Exception as e:
            debug_log("⚠️ /api/planner Supabase error", str(e))
            if STRICT_SUPABASE:
                return jsonify({"success": False, "error": str(e)}), 502
    
    # JSON fallback
    if request.method == 'GET':
        return jsonify({"success": True, "data": load_planner(user_id)}), 200
    else:
        body = request.json or {}
        save_planner(user_id, body)
        return jsonify({"success": True}), 200

@app.route('/api/upload', methods=['POST'])
def upload_image():
    """
    Accetta {image: base64DataUrl, kind: 'avatar'|'post'|'market'} e ritorna {url}
    Usa Supabase Storage se disponibile, altrimenti filesystem locale.
    """
    body = request.json or {}
    b64 = body.get("image")
    kind = body.get("kind", "img")
    if not b64 or not b64.startswith("data:image"):
        return jsonify({"success": False, "error": "Missing/invalid image"}), 400
    try:
        if supabase:
            url = save_image_supabase(b64, prefix=kind)
        else:
            url = save_image_local(b64, prefix=kind)
        return jsonify({"success": True, "url": url}), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/profile/<user_id>', methods=['GET'])
def get_profile(user_id):
    """
    Restituisce il profilo persistito (name, class, avatar) per user_id
    """
    # Supabase mode
    if supabase:
        try:
            resp = supabase.table("profiles").select("*").eq("userId", user_id).limit(1).execute()
            rows = resp.data or []
            if rows:
                return jsonify({"success": True, "data": rows[0]}), 200
        except Exception as e:
            debug_log("⚠️ /api/profile GET (Supabase) error", str(e))
    # JSON fallback
    profiles = load_json_file(PROFILES_FILE, {})
    data = profiles.get(user_id)
    return jsonify({"success": True, "data": data}), 200

@app.route('/api/profile', methods=['PUT'])
def handle_profile():
    """
    Upsert del profilo persistito. Payload richiesto:
    {
      "userId": "...",            # chiave coerente: school:username:idx
      "name": "Nome visibile",
      "class": "5B" (opzionale),
      "avatar": "URL immagine"    # opzionale
    }
    """
    payload = request.json or {}
    user_id = payload.get("userId")
    if not user_id:
        return jsonify({"success": False, "error": "Missing userId"}), 400
    # Supabase mode
    if supabase:
        try:
            supabase.table("profiles").upsert({
                "userId": user_id,
                "name": payload.get("name"),
                "class": payload.get("class"),
                "avatar": payload.get("avatar"),
                "last_active": datetime.now().isoformat()
            }).execute()
            debug_log(f"👤 Profile upserted in Supabase: {user_id}")
        except Exception as e:
            debug_log(f"⚠️ /api/profile Supabase error: {str(e)}")
            return jsonify({"success": False, "error": str(e)}), 500
    # JSON fallback
    profiles = load_json_file(PROFILES_FILE, {})
    if not isinstance(profiles, dict): profiles = {}
    profiles[user_id] = {
        "userId": user_id,
        "name": payload.get("name"),
        "class": payload.get("class"),
        "avatar": payload.get("avatar"),
        "last_active": datetime.now().isoformat()
    }
    save_json_file(PROFILES_FILE, profiles)
    return jsonify({"success": True, "data": profiles[user_id]}), 200

@app.route('/api/posts', methods=['GET', 'POST'])
def handle_posts():
    # Supabase mode
    if supabase:
        if request.method == 'GET':
            try:
                resp = supabase.table("posts").select("*").order("created_at", desc=True).limit(100).execute()
                posts = resp.data or []
                if STRICT_SUPABASE and not posts:
                    return jsonify({"success": False, "error": "Supabase posts empty"}), 502

                # Enrich avatar
                author_ids = list(set([p.get('author_id') or p.get('authorId') for p in posts if (p.get('author_id') or p.get('authorId'))]))
                if author_ids:
                    prof_resp = supabase.table("profiles").select("userId,avatar").in_("userId", author_ids).execute()
                    prof_map = {pr['userId']: pr.get('avatar') for pr in (prof_resp.data or [])}
                    for p in posts:
                        aid = p.get('author_id') or p.get('authorId')
                        p['author_avatar'] = prof_map.get(aid)
                # Fallback solo se non strict
                if not posts and not STRICT_SUPABASE:
                    posts = load_json_file(POSTS_FILE, [])
                return jsonify({"success": True, "data": posts}), 200
            except Exception as e:
                debug_log("⚠️ /api/posts GET (Supabase) error", str(e))
                if STRICT_SUPABASE:
                    return jsonify({"success": False, "error": str(e)}), 502
        else:
            try:
                new_post = request.json or {}
                if not new_post.get("text"):
                    return jsonify({"success": False, "error": "Missing text"}), 400

                now = datetime.now().isoformat()
                payload = {
                    "author_id": new_post.get("authorId") or new_post.get("author_id"),
                    "author_name": new_post.get("author") or new_post.get("author_name"),
                    "class": new_post.get("class"),
                    "text": new_post.get("text"),
                    "image": new_post.get("image"),
                    "anon": bool(new_post.get("anon", False)),
                    "created_at": now,
                }

                resp_ins = supabase.table("posts").insert(payload).execute()
                if getattr(resp_ins, "error", None):
                    raise Exception(resp_ins.error)

                resp = supabase.table("posts").select("*").order("created_at", desc=True).limit(100).execute()
                posts = resp.data or []
                return jsonify({"success": True, "data": posts}), 200
            except Exception as e:
                debug_log("⚠️ /api/posts POST (Supabase) error", str(e))
                if STRICT_SUPABASE:
                    return jsonify({"success": False, "error": str(e)}), 502

    # JSON fallback mode
    try:
        if request.method == 'GET':
            posts = load_json_file(POSTS_FILE, [])
            profiles = load_json_file(PROFILES_FILE, {})
            for p in posts:
                uid = p.get('authorId') or p.get('author_id')
                if uid and uid in profiles:
                    p['author_avatar'] = profiles[uid].get('avatar')
            return jsonify({"success": True, "data": posts}), 200
        else:
            new_post = request.json or {}
            if 'id' not in new_post:
                new_post['id'] = int(datetime.now().timestamp() * 1000)
            posts = load_json_file(POSTS_FILE, [])
            posts.insert(0, new_post)
            posts = posts[:100]
            save_json_file(POSTS_FILE, posts)
            return jsonify({"success": True, "data": posts}), 200
    except Exception as e:
        debug_log("⚠️ /api/posts fallback error", str(e))
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/market', methods=['GET', 'POST'])
def handle_market():
    # Supabase mode
    if supabase:
        if request.method == 'GET':
            try:
                resp = supabase.table("market_items").select("*").order("created_at", desc=True).limit(200).execute()
                items = resp.data or []
                if STRICT_SUPABASE and not items:
                    return jsonify({"success": False, "error": "Supabase market empty"}), 502

                seller_ids = list(set([it.get('seller_id') or it.get('sellerId') for it in items if (it.get('seller_id') or it.get('sellerId'))]))
                if seller_ids:
                    prof_resp = supabase.table("profiles").select("userId,avatar").in_("userId", seller_ids).execute()
                    prof_map = {pr['userId']: pr.get('avatar') for pr in (prof_resp.data or [])}
                    for it in items:
                        sid = it.get('seller_id') or it.get('sellerId')
                        it['author_avatar'] = prof_map.get(sid)
                
                # Fallback solo se non strict
                if not items and not STRICT_SUPABASE:
                    items = load_json_file(MARKET_FILE, [])
                return jsonify({"success": True, "data": items}), 200
            except Exception as e:
                debug_log("⚠️ /api/market GET (Supabase) error", str(e))
                if STRICT_SUPABASE:
                    return jsonify({"success": False, "error": str(e)}), 502
        else:
            try:
                new_item = request.json or {}
                if not new_item.get("title") or not new_item.get("price"):
                    return jsonify({"success": False, "error": "Missing title/price"}), 400

                now = datetime.now().isoformat()
                payload = {
                    "seller_id": new_item.get("sellerId") or new_item.get("seller_id"),
                    "seller_name": new_item.get("seller") or new_item.get("seller_name"),
                    "title": new_item.get("title"),
                    "price": new_item.get("price"),
                    "image": new_item.get("image"),
                    "created_at": now,
                }

                resp_ins = supabase.table("market_items").insert(payload).execute()
                if getattr(resp_ins, "error", None):
                    raise Exception(resp_ins.error)

                resp = supabase.table("market_items").select("*").order("created_at", desc=True).limit(200).execute()
                items = resp.data or []
                return jsonify({"success": True, "data": items}), 200
            except Exception as e:
                debug_log("⚠️ /api/market POST (Supabase) error", str(e))
                if STRICT_SUPABASE:
                    return jsonify({"success": False, "error": str(e)}), 502

    # JSON fallback mode
    try:
        if request.method == 'GET':
            items = load_json_file(MARKET_FILE, [])
            profiles = load_json_file(PROFILES_FILE, {})
            for it in items:
                uid = it.get('sellerId') or it.get('seller_id')
                if uid and uid in profiles:
                    it['author_avatar'] = profiles[uid].get('avatar')
            return jsonify({"success": True, "data": items}), 200
        else:
            new_item = request.json or {}
            if 'id' not in new_item:
                new_item['id'] = int(datetime.now().timestamp() * 1000)
            items = load_json_file(MARKET_FILE, [])
            items.insert(0, new_item)
            save_json_file(MARKET_FILE, items)
            return jsonify({"success": True, "data": items}), 200
    except Exception as e:
        debug_log("⚠️ /api/market fallback error", str(e))
        return jsonify({"success": False, "error": str(e)}), 500

# ============= POLLS ENDPOINTS =============
POLLS_FILE = "polls.json"

def load_polls_file():
    try:
        path = os.path.join(DATA_DIR, POLLS_FILE)
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        debug_log("⚠️ load_polls_file error", str(e))
    return []

def save_polls_file(polls):
    try:
        path = os.path.join(DATA_DIR, POLLS_FILE)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(polls, f, ensure_ascii=False, indent=2)
    except Exception as e:
        debug_log("⚠️ save_polls_file error", str(e))

def getUserIdFromBody(body):
    """Estrae l'id utente da vari possibili campi nel payload"""
    return body.get("voterId") or body.get("authorId") or body.get("userId") or body.get("voter")

@app.route('/api/polls', methods=['GET', 'POST'])
def handle_polls():
    # GET: list polls
    if request.method == 'GET':
        if supabase:
            try:
                resp = supabase.table("polls").select("*").order("created_at", desc=True).execute()
                return jsonify({"success": True, "data": resp.data or []}), 200
            except Exception as e:
                debug_log("⚠️ /api/polls GET supabase error", str(e))
        polls = load_polls_file()
        return jsonify({"success": True, "data": polls}), 200

    # POST: create poll
    payload = request.json or {}
    question = payload.get("question")
    choices = payload.get("choices", [])  # [{id,text}]
    author = payload.get("authorId") or payload.get("author")
    expires_at = payload.get("expiresAt")
    if not question or not choices:
        return jsonify({"success": False, "error": "Missing question or choices"}), 400

    new_poll = {
        "id": str(uuid.uuid4()),
        "question": question,
        "choices": [{"id": c.get("id") or str(uuid.uuid4()), "text": c.get("text"), "votes": 0} for c in choices],
        "voters": {},  # voterId -> choiceId
        "author": author,
        "created_at": datetime.now().isoformat(),
        "expires_at": expires_at
    }

    if supabase:
        try:
            supabase.table("polls").insert(new_poll).execute()
            resp = supabase.table("polls").select("*").order("created_at", desc=True).limit(10).execute()
            return jsonify({"success": True, "data": resp.data or []}), 200
        except Exception as e:
            debug_log("⚠️ /api/polls POST supabase error", str(e))

    polls = load_polls_file()
    polls.insert(0, new_poll)
    save_polls_file(polls)
    return jsonify({"success": True, "data": polls}), 200

@app.route('/api/polls/<poll_id>/vote', methods=['POST'])
def vote_poll(poll_id):
    body = request.json or {}
    voter = getUserIdFromBody(body)
    choice_id = body.get("choiceId")
    if not voter or not choice_id:
        return jsonify({"success": False, "error": "Missing voterId or choiceId"}), 400

    if supabase:
        try:
            resp = supabase.table("polls").select("*").eq("id", poll_id).limit(1).execute()
            rows = resp.data or []
            if not rows:
                return jsonify({"success": False, "error": "Poll not found"}), 404
            poll = rows[0]
            voters = poll.get("voters") or {}
            prev_choice = voters.get(voter)
            if prev_choice == choice_id:
                return jsonify({"success": True, "data": poll}), 200
            choices = poll.get("choices", [])
            for ch in choices:
                if ch["id"] == choice_id:
                    ch["votes"] = (ch.get("votes") or 0) + 1
                if prev_choice and ch["id"] == prev_choice:
                    ch["votes"] = max(0, (ch.get("votes") or 0) - 1)
            voters[voter] = choice_id
            supabase.table("polls").update({"choices": choices, "voters": voters}).eq("id", poll_id).execute()
            resp = supabase.table("polls").select("*").eq("id", poll_id).limit(1).execute()
            return jsonify({"success": True, "data": (resp.data or [])[0]}), 200
        except Exception as e:
            debug_log("⚠️ /api/polls vote supabase error", str(e))

    polls = load_polls_file()
    poll = next((p for p in polls if p["id"] == poll_id), None)
    if not poll:
        return jsonify({"success": False, "error": "Poll not found"}), 404
    voters = poll.get("voters", {})
    prev_choice = voters.get(voter)
    if prev_choice == choice_id:
        return jsonify({"success": True, "data": poll}), 200
    for ch in poll.get("choices", []):
        if ch["id"] == choice_id:
            ch["votes"] = ch.get("votes", 0) + 1
        if prev_choice and ch["id"] == prev_choice:
            ch["votes"] = max(0, ch.get("votes", 0) - 1)
    voters[voter] = choice_id
    poll["voters"] = voters
    save_polls_file(polls)
    return jsonify({"success": True, "data": poll}), 200

# ============= CHAT (Supabase) =============

@app.route('/api/messages/thread/<thread_id>', methods=['GET'])
def get_thread_messages(thread_id):
    if not supabase:
        return jsonify({"success": False, "error": "Supabase not configured"}), 500

    try:
        resp = (
            supabase.table("chat_messages")
            .select("*")
            .eq("thread_id", thread_id)
            .order("created_at", desc=False)
            .limit(500)
            .execute()
        )
        return jsonify({"success": True, "data": resp.data or []}), 200
    except Exception as e:
        debug_log("⚠️ get_thread_messages error", str(e))
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/messages', methods=['POST'])
def post_message():
    if not supabase:
        return jsonify({"success": False, "error": "Supabase not configured"}), 500

    try:
        msg = request.json or {}
        required = ["threadId", "senderId", "receiverId", "text"]
        if not all(msg.get(k) for k in required):
            return jsonify({"success": False, "error": "Missing fields"}), 400

        payload = {
            "thread_id": msg["threadId"],
            "sender_id": msg["senderId"],
            "sender_name": msg.get("senderName"),
            "receiver_id": msg["receiverId"],
            "text": msg["text"],
        }

        supabase.table("chat_messages").insert(payload).execute()

        # return updated thread
        resp = (
            supabase.table("chat_messages")
            .select("*")
            .eq("thread_id", msg["threadId"])
            .order("created_at", desc=False)
            .limit(500)
            .execute()
        )
        return jsonify({"success": True, "data": resp.data or []}), 200

    except Exception as e:
        debug_log("⚠️ post_message error", str(e))
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    school_code = data.get('schoolCode')
    username = data.get('username')
    password = data.get('password')
    # Nuovo parametro opzionale per selezione profilo
    selected_profile_index = data.get('profileIndex') 

    if not all([school_code, username, password]):
        return jsonify({"success": False, "error": "Dati mancanti"}), 400

    try:
        debug_log("LOGIN REQUEST", {
            "school": school_code,
            "username": username,
            "profileIndex": selected_profile_index
        })
        
        # 1. Login Avanzato (Ottieni Access Token + Lista Profili)
        # Tentativo A: Flow Manuale (Supporta Multi-Profilo)
        
        access_token = None
        auth_token = None
        profiles = []
        fallback_mode = False
        
        try:
            debug_log("🔐 Tentativo A: AdvancedArgo.raw_login (Multi-Profilo)")
            login_result = AdvancedArgo.raw_login(school_code, username, password)
            access_token = login_result['access_token']
            profiles = login_result['profiles']
            debug_log(f"✅ Advanced Login OK. Profili trovati: {len(profiles)}")
            
        except Exception as e_advanced:
            debug_log(f"⚠️ Advanced Login Fallito: {str(e_advanced)}. Attivo FALLBACK.")
            fallback_mode = True
        
        # 2. Gestione Profili Multipli (Solo se tentativo A ok)
        # MODIFICA COMPATIBILITÀ: Non blocchiamo più se non c'è selezione.
        # Se front-end è vecchio, non sa gestire MULTIPLE_PROFILES.
        # Quindi: default a 0, ma mandiamo lista profili per frontend aggiornati.
        
        profiles_payload = []
        if not fallback_mode and profiles:
            if len(profiles) > 1:
                # Prepariamo lista per dopo
                for idx, p in enumerate(profiles):
                    alunno = p.get('alunno', {})
                    nome = alunno.get('desNome', '').strip()
                    cognome = alunno.get('desCognome', '').strip()
                    
                    # Fallback robusto per il nome
                    if not nome and not cognome:
                         nome_completo = f"Studente {idx + 1}"
                    else:
                         nome_completo = f"{nome} {cognome}".strip()

                    profiles_payload.append({
                        "index": idx,
                        "name": nome_completo,
                        "school": p.get('desScuola', 'Scuola'),
                        "class": p.get('desClasse', '')
                    })
                debug_log(f"⚠️ Rilevati {len(profiles)} profili. Auto-select index 0 per compatibilità.")

        # 3. Selezione Profilo (default 0 se unico o non specificato)
        target_index = int(selected_profile_index) if selected_profile_index is not None else 0
        
        # Security check su indice
        if not profiles:
            target_profile = None # Fallback mode gestirà
        elif target_index < len(profiles):
            target_profile = profiles[target_index]
            auth_token = target_profile['token']
            debug_log(f"✅ Profilo selezionato: Indice {target_index}", target_profile.get('alunno', {}))
        else:
             target_index = 0
             target_profile = profiles[0]
             auth_token = target_profile['token']
        
        # 3. Setup Sessione Operativa
        # Se siamo in fallack o se advanced ha fallito qualcosa, usiamo Standard Login
        
        if fallback_mode or not access_token or not auth_token:
            debug_log("🔐 Attivazione Fallback: Standard ArgoFamiglia Login")
            # Login Standard (fa rete)
            temp_argo = argofamiglia.ArgoFamiglia(school_code, username, password)
            # Estrai token dalla sessione standard
            headers = temp_argo._ArgoFamiglia__headers
            auth_token = headers.get('x-auth-token', '')
            access_token = headers.get('Authorization', '').replace("Bearer ", "")
            debug_log("✅ Fallback Login OK")

        # 4. Strategia Sessioni Isolate (Voti -> Compiti -> Dashboard)
        
        # --- SESSIONE 1: VOTI ---
        debug_log("🔐 [1/3] Sessione VOTI...")
        argo_voti = create_session(school_code, username, password, access_token, auth_token)
        grades_data = extract_grades_multi_strategy(argo_voti)
        debug_log(f"✅ Voti recuperati: {len(grades_data)}")

        # --- SESSIONE 2: COMPITI ---
        debug_log("🔐 [2/3] Sessione COMPITI...")
        try:
            argo_tasks = create_session(school_code, username, password, access_token, auth_token)
            tasks_data = extract_homework_safe(argo_tasks)
            debug_log(f"✅ Compiti recuperati: {len(tasks_data)}")
        except Exception as e_tasks:
            debug_log("⚠️ Errore sessione compiti", str(e_tasks))
            tasks_data = []

        # --- SESSIONE 3: DASHBOARD ---
        debug_log("🔐 [3/3] Sessione DASHBOARD...")
        announcements_data = []
        try:
            argo_dash = create_session(school_code, username, password, access_token, auth_token)
            # Usa la FULL dashboard anche qui per sicurezza
            dashboard_data = argo_dash.get_full_dashboard()
            announcements_data = extract_promemoria(dashboard_data)
        except Exception as e_dash:
            debug_log("⚠️ Errore sessione dashboard", str(e_dash))
            
        # Dati studente (Best effort)
        student_name = username
        student_class = "DidUP"
        
        # Se avevamo profili dal advanced login, usiamo quelli per info più precise
        if not fallback_mode and profiles and 'target_index' in locals() and target_profile:
             p = target_profile
             student_name = f"{p.get('alunno', {}).get('desNome', '')} {p.get('alunno', {}).get('desCognome', '')}".strip() or username
             student_class = p.get('desClasse', 'DidUP')

        # ✅ NEW: Register/Update Profile in Supabase for Directory
        if supabase:
            try:
                profile_id = f"{school_code}:{username.lower()}:{target_index}"
                profile_payload = {
                    "userId": profile_id,
                    "name": student_name,
                    "class": student_class,
                    "last_active": datetime.now().isoformat()
                }
                supabase.table("profiles").upsert(profile_payload).execute()
                debug_log(f"👤 Profile sync'd to Supabase: {profile_id}")
            except Exception as e_prof:
                debug_log("⚠️ Profile sync failed (non-fatal)", str(e_prof))

        # Risposta finale
        response_data = {
            "success": True,
            "session": {
                "schoolCode": school_code,
                "authToken": auth_token,
                "accessToken": access_token,
                "userName": username,
                "profileIndex": target_index
            },
            "student": {
                "name": student_name,
                "class": student_class,
                "school": school_code
            },
            "tasks": tasks_data,
            "voti": grades_data,
            "promemoria": announcements_data,
            "debug_info": {
                "voti_count": len(grades_data),
                "tasks_count": len(tasks_data),
                "timestamp": datetime.now().isoformat(),
                "mode": "FALLBACK_HYBRID" if fallback_mode else "MULTI_PROFILE_FAST"
            }
        }
        
        # Se c'erano più profili, li aggiungiamo e settiamo status, MA con success=True
        # Così il vecchio frontend entra (col profilo 0), il nuovo frontend vede status e apre modale
        # FIX: Aggiungiamo status SOLO se client NON ha già scelto (profileIndex is None).
        if profiles_payload and selected_profile_index is None:
            response_data["status"] = "MULTIPLE_PROFILES"
            response_data["profiles"] = profiles_payload
        
        debug_log("RISPOSTA FINALE", response_data)
        return jsonify(response_data), 200

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        debug_log(f"❌ LOGIN FAILED (Fatal)", error_trace)
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": error_trace if DEBUG_MODE else None
        }), 401


@app.route('/sync', methods=['POST'])
def sync_data():
    """Sincronizzazione con credenziali salvate e supporto token refresh"""
    data = request.json
    school = data.get('schoolCode')
    stored_user = data.get('storedUser')
    stored_pass = data.get('storedPass')
    # Se il client ha salvato un indice profilo, lo usiamo
    profile_index = data.get('profileIndex', 0) 
    
    try:
        debug_log("SYNC REQUEST", {"school": school, "profileIndex": profile_index})
        
        if not all([school, stored_user, stored_pass]):
            return jsonify({"success": False, "error": "Credenziali mancanti"}), 401
        
        # Decodifica credenziali
        import base64
        import urllib.parse
        
        def decode_cred(encoded):
            try:
                return urllib.parse.unquote(base64.b64decode(encoded).decode('utf-8'))
            except:
                return encoded

        user = decode_cred(stored_user)
        pass_ = decode_cred(stored_pass)
        
        # --- LOGIN / REFRESH ---
        access_token = None
        auth_token = None
        fallback_mode = False
        
        try:
             # Tentativo A: Advanced Login
            login_result = AdvancedArgo.raw_login(school, user, pass_)
            access_token = login_result['access_token']
            profiles = login_result['profiles']
            
            target_idx = int(profile_index)
            if target_idx >= len(profiles): target_idx = 0
            auth_token = profiles[target_idx]['token']
            
        except Exception:
            # Tentativo B: Fallback Standard
            fallback_mode = True
            debug_log("⚠️ Sync Advanced Fail -> Fallback Standard")
            temp_argo = argofamiglia.ArgoFamiglia(school, user, pass_)
            headers = temp_argo._ArgoFamiglia__headers
            auth_token = headers.get('x-auth-token', '')
            access_token = headers.get('Authorization', '').replace("Bearer ", "")

        
        # --- SESSIONI ISOLATE (Ma veloci con token iniettati) ---
        
        # 1. VOTI
        argo_voti = create_session(school, user, pass_, access_token, auth_token)
        grades_data = extract_grades_multi_strategy(argo_voti)
        
        # 2. COMPITI
        tasks_data = []
        try:
            argo_tasks = create_session(school, user, pass_, access_token, auth_token)
            tasks_data = extract_homework_safe(argo_tasks)
        except:
            pass
            
        # 3. DASHBOARD
        announcements_data = []
        try:
            argo_dash = create_session(school, user, pass_, access_token, auth_token)
            dashboard_data = argo_dash.dashboard()
            announcements_data = extract_promemoria(dashboard_data)
        except:
             pass

        # ✅ NEW: Update Profile Activity in Supabase during Sync
        if supabase:
            try:
                profile_id = f"{school}:{user.lower()}:{profile_index}"
                supabase.table("profiles").update({"last_active": datetime.now().isoformat()}).eq("id", profile_id).execute()
                debug_log(f"👤 Profile activity updated: {profile_id}")
            except Exception as e_sync_prof:
                debug_log("⚠️ Profile sync update failed (non-fatal)", str(e_sync_prof))
        
        # Return
        return jsonify({
            "success": True,
            "tasks": tasks_data,
            "voti": grades_data,
            "promemoria": announcements_data,
            "new_tokens": {
                "authToken": auth_token,
                "accessToken": access_token
            }
        }), 200
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        debug_log(f"❌ SYNC FAILED", error_trace)
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": error_trace if DEBUG_MODE else None
        }), 401


@app.route('/debug/dashboard', methods=['POST'])
def debug_dashboard():
    """
    ENDPOINT DI DEBUG: restituisce la dashboard RAW
    """
    data = request.json
    school = data.get('schoolCode')
    user = data.get('username')
    pwd = data.get('password')
    
    try:
        argo = argofamiglia.ArgoFamiglia(school, user, pwd)
        dashboard = argo.dashboard()
        
        return jsonify({
            "success": True,
            "dashboard": dashboard,
            "type": str(type(dashboard)),
            "keys": list(dashboard.keys()) if isinstance(dashboard, dict) else "N/A"
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/')
def index():
    return """
    <h1>G-Connect Backend - FIXED VERSION</h1>
    <p>Endpoints disponibili:</p>
    <ul>
        <li>POST /login - Autenticazione e recupero dati</li>
        <li>POST /sync - Sincronizzazione</li>
        <li>GET /api/planner/&lt;user_id&gt; - Recupera dati planner personale</li>
        <li>POST /api/messages - Invia messaggio chat</li>
        <li>POST /debug/dashboard - Visualizza dashboard RAW (DEBUG)</li>
        <li>GET /health - Health check</li>
    </ul>
    <p><strong>FIX APPLICATI:</strong></p>
    <ul>
        <li>✅ Ordine corretto: COMPITI → VOTI</li>
        <li>✅ Campo datCompito aggiunto</li>
        <li>✅ Campo materia aggiunto</li>
    </ul>
    """


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5002))
    print(f"\n{'='*70}")
    print(f"🚀 G-Connect Backend - FIXED VERSION")
    print(f"📡 Running on port {port}")
    print(f"🔍 Debug logging: ENABLED")
    print(f"✅ Ordine corretto: COMPITI → VOTI")
    print(f"{'='*70}\n")
    app.run(host='0.0.0.0', port=port, debug=True)
