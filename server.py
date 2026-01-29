from flask import Flask, request, jsonify
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
from urllib.parse import unquote
from datetime import datetime  # ✅ ADDED IMPORT
from planner_routes import register_planner_routes

# CREA UNA SOLA ISTANZA DI FLASK
app = Flask(__name__)

# CORS: configura una sola volta con i domini corretti
# ✅ FIX 1: CORS PER TUTTE LE ROTTE (Non solo /api/*)
CORS(app, resources={r"/*": {"origins": "*"}})

# REGISTRA LE ROUTE DEL PLANNER SULL'ISTANZA 'app'
register_planner_routes(app)

# ✅ NEW: Supabase
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv() # Load local .env if present

# ============= DEBUG SUPABASE KEY =============
print("\n" + "="*70)
print("🔍 DEBUG: Verifica Supabase Configuration")
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if url:
    print(f"✅ SUPABASE_URL: {url}")
else:
    print("❌ SUPABASE_URL: NOT SET")

if key:
    print(f"✅ SUPABASE_SERVICE_ROLE_KEY presente ({len(key)} caratteri)")
    print(f"   Primi 50 caratteri: {key[:50]}...")
    
    # Decodifica JWT per verificare il ruolo
    try:
        import base64
        import json
        # Il JWT è formato da 3 parti separate da punti
        parts = key.split('.')
        if len(parts) >= 2:
            # Decodifica la seconda parte (payload)
            payload_b64 = parts[1]
            # Aggiungi padding se necessario
            payload_b64 += '=' * (4 - len(payload_b64) % 4)
            # Decodifica
            payload_json = base64.urlsafe_b64decode(payload_b64)
            payload = json.loads(payload_json)
            
            role = payload.get('role', 'UNKNOWN')
            print(f"   Ruolo decodificato dal JWT: {role}")
            
            if role == 'service_role':
                print("   ✅✅✅ PERFETTO! Stai usando la chiave SERVICE_ROLE")
            elif role == 'anon':
                print("   ❌❌❌ ERRORE! Stai usando la chiave ANON (pubblica)")
                print("   ❌ Devi cambiare con la chiave service_role da Supabase Settings → API")
            else:
                print(f"   ⚠️ Ruolo sconosciuto: {role}")
    except Exception as e:
        print(f"   ⚠️ Impossibile decodificare JWT: {e}")
else:
    print("❌ SUPABASE_SERVICE_ROLE_KEY: NOT SET")

print("="*70 + "\n")
# ============= FINE DEBUG =============


# ============= CONSTANTS =============
CHALLENGE_URL = "https://auth.portaleargo.it/oauth2/auth"
LOGIN_URL = "https://www.portaleargo.it/auth/sso/login"
TOKEN_URL = "https://auth.portaleargo.it/oauth2/token"
REDIRECT_URI = "it.argosoft.didup.famiglia.new://login-callback"
CLIENT_ID = "72fd6dea-d0ab-4bb9-8eaa-3ac24c84886c"
ENDPOINT = "https://www.portaleargo.it/appfamiglia/api/rest/"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36"


# ============= CONFIGURAZIONE DEBUG =============
DEBUG_MODE = os.environ.get("DEBUG_MODE", "false").lower() == "true" or True # Default as True for local dev if not set

def debug_log(message, data=None):
    """Helper per logging strutturato"""
    if DEBUG_MODE:
        print(f"\n{'='*60}")
        print(f"🔍 {message}")
        if data:
            if isinstance(data, (dict, list)):
                print(json.dumps(data, indent=2, ensure_ascii=False, default=str)[:2000])
            else:
                print(str(data)[:2000])
        print(f"{'='*60}\n")

# ============= SUPABASE CLIENT =============
supabase: Client = None
try:
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if supabase_url and supabase_key:
        supabase = create_client(supabase_url, supabase_key)
        debug_log("✅ Supabase client inizializzato")
    else:
        debug_log("⚠️ Supabase non configurato (variabili mancanti)")
except Exception as e:
    debug_log("❌ Errore inizializzazione Supabase", str(e))
    supabase = None

# Regex per validazione classe (1A-5Z)
CLASS_REGEX = re.compile(r"^[1-5][A-Z]$")

# Materie e parole scolastiche comuni: evita di trattarle come "COGNOME NOME" (Bug #1)
SUBJECT_TOKENS = {
    # Materie principali
    "ITALIANO","INGLESE","STORIA","GEOGRAFIA","FILOSOFIA","MATEMATICA","SCIENZE","BIOLOGIA",
    "FISICA","ARTE","DISEGNO","RELIGIONE","RELIGIOSA","EDUCAZIONE","MUSICA","TECNOLOGIE",
    "TECNOLOGIA","INFORMATICA","CHIMICA","LATINO","GRECO","FRANCESE","SPAGNOLO","TEDESCO",
    
    # Livelli scolastici
    "TRIENNIO","BIENNIO","PRIMO","SECONDO","TERZO","QUARTO","QUINTO",
    
    # Periodi scolastici (CRITICO: evita "PRIMO QUADRIMESTRE", "SECONDO TRIMESTRE", etc)
    "QUADRIMESTRE","TRIMESTRE","PENTAMESTRE","SCRUTINIO","SCRUTINI","PERIODO",
    
    # Materie composite
    "SCIENZE NATURALI","SCIENZE UMANE","STORIA E GEOGRAFIA",
    "DISEGNO E STORIA DELL'ARTE","EDUCAZIONE FISICA","EDUCAZIONE CIVICA",
    
    # Altro contesto scolastico
    "VALUTAZIONE","VALUTAZIONI","ASSENZE","ASSENZA","VOTI","VOTO"
}

SCHOOL_TOKENS = {
    "LICEO", "SCUOLA", "ISTITUTO", "COMPRENSIVO", "STATALE", "PARITARIO", "MEDIA", "PRIMARIA",
    "TECNICO", "PROFESSIONALE"
}

def is_valid_name(name):
    """
    Valida che una stringa sia un nome reale (non username). (Bug #2)
    Deve avere almeno 2 parole, tutte alfabetiche, min 2 caratteri ciascuna.
    """
    if not name or not isinstance(name, str):
        return False
    # ✅ Escludi stringhe che sembrano materie/periodi scolastici (Hotfix "PRIMO QUADRIMESTRE")
    if looks_like_subject(name):
        return False
    parts = name.strip().upper().split()
    return len(parts) >= 2 and all(p.isalpha() and len(p) >= 2 for p in parts)

def looks_like_subject(text: str) -> bool:
    """Verifica se una stringa sembra una materia scolastica"""
    if not isinstance(text, str):
        return False
    s = text.strip().upper()
    return any(tok in s for tok in SUBJECT_TOKENS)

class AdvancedArgo(argofamiglia.ArgoFamiglia):
    """
    Estensione di ArgoFamiglia con supporto COMPLETO per i profili.
    NUOVO: Usa l'endpoint /login che restituisce l'array 'soggetti' con desNominativo
    """
    def __init__(self, school: str, username: str, password: str, auth_token=None, access_token=None, skip_connect=False):
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
            "Content-Type": "application/json",
            "Authorization": "Bearer " + access_token,
            "Accept": "application/json",
            "x-cod-min": self._ArgoFamiglia__school,
            "x-auth-token": auth_token,
            "User-Agent": USER_AGENT
        }
        self._ArgoFamiglia__token = auth_token

    @staticmethod
    def raw_login(school, username, password):
        """
        ✅ VERSIONE AGGIORNATA
        Esegue il flow OAuth completo e restituisce i profili con desNominativo.
        
        Returns:
            {
                "access_token": str,
                "profiles": [
                    {
                        "index": int,
                        "name": str,           # ← desNominativo
                        "class": str,          # ← classe
                        "school": str,         # ← codiceScuola
                        "token": str,
                        "idSoggetto": str,
                        "raw": dict            # ← soggetto completo
                    }
                ]
            }
        """
        try:
            # 1. Challenge
            CODE_VERIFIER = secrets.token_hex(64)
            CODE_CHALLENGE = base64.urlsafe_b64encode(
                sha256(CODE_VERIFIER.encode()).digest()
            ).decode().replace("=", "")
            
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
            
            # 5. ✅ NUOVO: Chiama /login per ottenere l'array soggetti
            login_headers = {
                "User-Agent": USER_AGENT,
                "Content-Type": "application/json",
                "Authorization": "Bearer " + access_token,
                "Accept": "application/json",
            }
            
            payload = {
                "clientID": secrets.token_urlsafe(64),
                "lista-x-auth-token": "[]",
                "x-auth-token-corrente": "null",
                "lista-opzioni-notifiche": "{}"
            }
            
            argo_resp = requests.post(
                ENDPOINT + "login", 
                headers=login_headers, 
                json=payload
            ).json()
            
            # 6. ✅ PARSING SOGGETTI
            soggetti = argo_resp.get("data", [])
            
            debug_log("🔍 SOGGETTI RICEVUtI DALL'API", {
                "count": len(soggetti),
                "first_keys": list(soggetti[0].keys()) if soggetti else []
            })
            
            # 7. ✅ COSTRUISCI PROFILI - FETCH IDENTITÀ ROBUSTO
            profiles = []
            for idx, sog in enumerate(soggetti):
                auth_token = sog.get('token', '')
                cod_min = sog.get('codMin', school)
                
                # Prova prima i campi diretti
                name = (sog.get('desNominativo') or '').strip().upper()
                cls = (sog.get('classe') or '').strip().upper()
                
                # Se mancano, chiama /scheda
                if not name or not cls:
                    try:
                        scheda_headers = {
                            "User-Agent": USER_AGENT,
                            "Content-Type": "application/json",
                            "Authorization": "Bearer " + access_token,
                            "Accept": "application/json",
                            "x-cod-min": cod_min,
                            "x-auth-token": auth_token
                        }
                        
                        scheda_resp = requests.post(
                            ENDPOINT + "scheda",
                            headers=scheda_headers,
                            json={"opzioni": "{}"},
                            timeout=10
                        ).json()
                        
                        # Estrattore intelligente
                        def deep_get(d, keys):
                            for key in keys:
                                if isinstance(d, dict):
                                    d = d.get(key)
                                else:
                                    return None
                            return d

                        # Punti dove cercare l'alunno
                        roots = [
                            scheda_resp.get('data', {}),
                            scheda_resp.get('data', {}).get('scheda', {}),
                            scheda_resp
                        ]
                        
                        for root in roots:
                            if not isinstance(root, dict): continue
                            
                            # Cerca nome/cognome
                            al = root.get('alunno', {}) if isinstance(root.get('alunno'), dict) else root
                            n = (al.get('desNome') or al.get('nome') or '')
                            c = (al.get('desCognome') or al.get('cognome') or '')
                            full = (al.get('desNominativo') or al.get('nominativo') or '')
                            
                            if not name:
                                if full: name = str(full).strip().upper()
                                elif n or c: name = f"{str(c or '').strip()} {str(n or '').strip()}".strip().upper()
                            
                            if not cls:
                                cls = (al.get('desClasse') or al.get('classe') or root.get('desDenominazione') or '')
                                if cls:
                                    cls = str(cls).strip().upper()
                                    # Fallback se è una descrizione lunga
                                    if not CLASS_REGEX.match(cls):
                                        m = re.search(r'\b([1-5][A-Z])\b', cls)
                                        cls = m.group(1) if m else cls[:5] # Prendi i primi 5 se non match regex
                            
                            if name and cls: break

                        debug_log(f"✅ Identità Profilo {idx}", {"name": name, "class": cls})
                            
                    except Exception as e:
                        debug_log(f"⚠️ Errore fetch identità profilo {idx}", str(e))
                
                profiles.append({
                    "index": idx,
                    "name": name,
                    "class": cls,
                    "school": cod_min.upper(),
                    "token": auth_token,
                    "idSoggetto": sog.get('idSoggetto'),
                    "raw": sog
                })
                
            return {
                "access_token": access_token,
                "profiles": profiles
            }
            
        except Exception as e:
            debug_log("❌ Errore Raw Login", str(e))
            import traceback
            debug_log("Traceback", traceback.format_exc())
            raise e

    def get_full_dashboard(self):
        """Richiede la dashboard completa partendo dall'inizio dell'anno scolastico."""
        try:
            start_date = "2024-09-01 00:00:00"
            
            payload = {
                "dataultimoaggiornamento": start_date,
                "opzioni": json.dumps(argofamiglia.CONSTANTS.DASHBOARD_OPTIONS)
            }
            
            debug_log("📅 Richiesta Full Dashboard dal:", start_date)
            res = requests.post(
                argofamiglia.CONSTANTS.ENDPOINT + "dashboard/dashboard", 
                headers=self._ArgoFamiglia__headers,
                json=payload
            )
            return res.json()
        except Exception as e:
            debug_log("⚠️ Errore Full Dashboard", str(e))
            return {}

    def get_scheda(self):
        """Endpoint per i dettagli anagrafici (fallback)"""
        try:
            res = requests.post(
                argofamiglia.CONSTANTS.ENDPOINT + "scheda", 
                headers=self._ArgoFamiglia__headers, 
                json={"opzioni": "{}"}
            )
            return res.json()
        except Exception as e:
            debug_log("❌ Errore get_scheda", str(e))
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
                                            "materia": v.get('desMateria', 'N/D'),
                                            "valore": v.get('codVoto', ''),
                                            "data": v.get('datGiorno', ''),
                                            "tipo": v.get('desVoto', 'N/D'),
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
    grades = []
    
    # 1. Dashboard Strategy
    try:
        dashboard_data = argo_instance.dashboard()
        data_obj = dashboard_data.get('data', {})
        dati_list = data_obj.get('dati', []) if isinstance(data_obj, dict) else []
        if not dati_list and 'dati' in dashboard_data:
             dati_list = dashboard_data.get('dati', [])
        
        if dati_list:
            main_data = dati_list[0]
            voti_keys = ['votiGiornalieri', 'votiPeriodici', 'votiScrutinio', 'voti', 'valutazioni']
            for key in voti_keys:
                voti_raw = main_data.get(key, [])
                if voti_raw:
                    for v in voti_raw:
                        valore = v.get('codVoto') or v.get('voto') or v.get('valore')
                        materia = v.get('desMateria') or v.get('materia', 'N/D')
                        grades.append({
                            "materia": materia,
                            "valore": valore,
                            "data": v.get('datGiorno') or v.get('data'),
                            "tipo": v.get('desVoto') or v.get('tipo', 'N/D'),
                            "subject": materia,
                            "value": valore,
                            "date": v.get('datGiorno', ''),
                            "id": str(uuid.uuid4())[:12]
                        })
                    return grades
    except:
        pass
        
    # 2. Direct API Strategy (fallback)
    try:
        headers = argo_instance._ArgoFamiglia__headers
        base_url = "https://www.portaleargo.it/famiglia/api/rest"
        endpoints = ["/votiGiornalieri", "/voti"]
        for endpoint in endpoints:
            try:
                res = requests.get(base_url + endpoint, headers=headers, timeout=5)
                if res.status_code == 200:
                    data = res.json()
                    if isinstance(data, list):
                        for v in data:
                            grades.append({
                                "materia": v.get('desMateria', 'N/D'),
                                "valore": v.get('codVoto', ''),
                                "data": v.get('datGiorno', ''),
                                "subject": v.get('desMateria', 'N/D'),
                                "value": v.get('codVoto', ''),
                                "date": v.get('datGiorno', ''),
                                "id": str(uuid.uuid4())[:12]
                            })
                        if grades: return grades
            except:
                continue
    except:
        pass
        
    return grades


# ============= ESTRAZIONE COMPITI =============

def extract_homework_safe(argo_instance):
    tasks_data = []
    try:
        dashboard_data = argo_instance.get_full_dashboard()
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
                    "datCompito": date_str,
                    "materia": mat,
                    "done": False
                })
    except Exception as e:
        debug_log(f"⚠️ Errore compiti", str(e))
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

# --- Student identity via official Argo endpoints ---
def fetch_student_identity(argo_instance):
    """
    Fetch student's identity (name, class) using official Argo REST endpoints
    for the currently selected profile (via argo_instance headers).
    Tries multiple endpoints for robustness across schools.
    Returns (NAME_UPPER, CLASS_UPPER) or (None, None).
    """
    try:
        headers = getattr(argo_instance, "_ArgoFamiglia__headers", {}) or {}
        base = argofamiglia.CONSTANTS.ENDPOINT  # e.g. https://www.portaleargo.it/appfamiglia/api/rest/

        # Candidate endpoints: different schools sometimes expose different paths
        candidates = [
            "anagrafe",             # most common
            "alunno",               # some schools
            "alunno/anagrafe",      # rarer variant
        ]

        def normalize_obj(data):
            # Accept dict or list, sometimes wrapped in {"data": {...}} or {"data": [...]}
            obj = data
            if isinstance(obj, dict) and "data" in obj:
                obj = obj["data"]
            if isinstance(obj, list) and obj:
                obj = obj[0]
            return obj if isinstance(obj, dict) else {}

        for path in candidates:
            try:
                url = base + path
                r = requests.get(url, headers=headers, timeout=12)
                debug_log(f"🔎 fetch_identity GET {url}", {"status": r.status_code})
                if not r.ok:
                    continue
                obj = normalize_obj(r.json())

                # Prefer direct fields, but also check nested structures
                al = obj.get("alunno") if isinstance(obj.get("alunno"), dict) else {}
                nome = (obj.get("desNome") or obj.get("nome") or al.get("desNome") or al.get("nome") or "").strip()
                cognome = (obj.get("desCognome") or obj.get("cognome") or al.get("desCognome") or al.get("cognome") or "").strip()
                classe = (obj.get("desClasse") or obj.get("classe") or obj.get("class") or obj.get("desDenominazione") or "").strip()

                name = None
                cls = None

                if nome or cognome:
                    name = f"{cognome} {nome}".strip().upper()

                if isinstance(classe, str):
                    c = classe.strip().upper()
                    if CLASS_REGEX.match(c):
                        cls = c

                if name or cls:
                    debug_log("✅ Student identity resolved via anagrafe", {"name": name, "class": cls, "endpoint": path})
                    return name, cls
            except Exception as e:
                debug_log("⚠️ fetch_identity endpoint error", str(e))
                continue

    except Exception as e:
        debug_log("⚠️ fetch_student_identity error", str(e))

    return None, None



# ============= HELPERS SESSIONI =============

def create_session(school, user, password, access_token, auth_token):
    """Crea una sessione ArgoFamiglia usando token esistenti"""
    return AdvancedArgo(school, user, password, auth_token=auth_token, access_token=access_token)

# ============= ROUTES =============

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "debug": DEBUG_MODE}), 200

# ============= AVATAR & PROFILE ENDPOINTS =============

@app.route('/api/upload', methods=['POST'])
def upload_avatar():
    """
    Carica un'immagine avatar su Supabase Storage e restituisce l'URL pubblico.
    Request: { "image": "data:image/png;base64,iVBORw0...", "userId": "user_id" }
    Response: { "success": true, "url": "https://...supabase.co/.../avatars/file.png" }
    """
    if not supabase:
        return jsonify({"success": False, "error": "Supabase non configurato"}), 500
    
    try:
        payload = request.json or {}
        base64_image = payload.get('image', '')
        user_id = payload.get('userId', str(uuid.uuid4()))
        
        if not base64_image or not base64_image.startswith('data:image/'):
            return jsonify({"success": False, "error": "Formato immagine non valido"}), 400
        
        # Estrai MIME type e dati
        header, encoded = base64_image.split(',', 1)
        mime_type = header.split(';')[0].split(':')[1]
        file_extension = mime_type.split('/')[1]
        
        # Decodifica base64
        image_bytes = base64.b64decode(encoded)
        
        # Nome file unico
        filename = f"{user_id.replace(':', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{file_extension}"
        
        # Upload su Supabase Storage (bucket: avatars)
        supabase.storage.from_('avatars').upload(
            path=filename,
            file=image_bytes,
            file_options={"content-type": mime_type, "upsert": "true"}
        )
        
        # Ottieni URL pubblico
        public_url = supabase.storage.from_('avatars').get_public_url(filename)
        
        debug_log(f"✅ Avatar uploaded: {filename}", {"url": public_url})
        return jsonify({"success": True, "url": public_url}), 200
        
    except Exception as e:
        debug_log("❌ Avatar upload failed", str(e))
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/profile', methods=['PUT'])
def update_profile():
    """
    Aggiorna il profilo utente (incluso avatar URL).
    Request: { "userId": "school:user:idx", "name": "...", "class": "...", "avatar": "https://..." }
    """
    if not supabase:
        return jsonify({"success": False, "error": "Supabase non configurato"}), 500
    
    try:
        payload = request.json or {}
        user_id = payload.get('userId')
        
        if not user_id:
            return jsonify({"success": False, "error": "userId mancante"}), 400
        
        profile_data = {
            "id": user_id,  # ✅ Fixed: Table uses 'id'
            "last_active": datetime.now().isoformat()
        }
        
        if 'name' in payload:
            profile_data['name'] = payload['name']
        if 'class' in payload:
            profile_data['class'] = payload['class']
        if 'avatar' in payload:
            avatar_url = payload['avatar']
            if avatar_url and not avatar_url.startswith('http'):
                return jsonify({"success": False, "error": "Avatar deve essere un URL"}), 400
            profile_data['avatar'] = avatar_url
        
        # ✅ Fixed: Explicit on_conflict for upsert
        supabase.table("profiles").upsert(profile_data, on_conflict="id").execute()
        debug_log(f"✅ Profile updated: {user_id}")
        return jsonify({"success": True}), 200
        
    except Exception as e:
        debug_log("❌ Profile update failed", str(e))
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/profile/<user_id>', methods=['GET'])
def get_profile(user_id):
    """
    Recupera il profilo utente dal database.
    Response: { "success": true, "data": { "id": "...", "name": "...", "avatar": "..." } }
    """
    if not supabase:
        return jsonify({"success": False, "error": "Supabase non configurato"}), 500
    
    try:
        # ✅ Fixed: Table uses 'id'
        result = supabase.table("profiles").select("*").eq("id", user_id).execute()
        
        if not result.data or len(result.data) == 0:
            return jsonify({"success": False, "error": "Profilo non trovato"}), 404
        
        profile = result.data[0]
        debug_log(f"✅ Profile retrieved: {user_id}", {"hasAvatar": bool(profile.get('avatar'))})
        return jsonify({"success": True, "data": profile}), 200
        
    except Exception as e:
        debug_log("❌ Profile retrieval failed", str(e))
        return jsonify({"success": False, "error": str(e)}), 500


# ============= PERSISTENCE ENDPOINTS =============

@app.route('/api/posts', methods=['GET', 'POST'])
def handle_posts():
    # Supabase mode
    if supabase:
        if request.method == 'GET':
            try:
                resp = supabase.table("posts").select("*").order("created_at", desc=True).limit(100).execute()
                return jsonify({"success": True, "data": resp.data or []}), 200
            except Exception as e:
                debug_log("⚠️ /api/posts GET (Supabase) error, falling back", str(e))
                # Fall through to JSON fallback
        else:
            try:
                new_post = request.json or {}
                if not new_post.get("text"):
                    return jsonify({"success": False, "error": "Missing text"}), 400
                payload = {
                    "author_id": new_post.get("authorId") or new_post.get("author_id"),
                    "author_name": new_post.get("author") or new_post.get("author_name"),
                    "class": new_post.get("class"),
                    "text": new_post.get("text"),
                    "image": new_post.get("image"),
                    "anon": bool(new_post.get("anon", False)),
                }
                supabase.table("posts").insert(payload).execute()
                resp = supabase.table("posts").select("*").order("created_at", desc=True).limit(100).execute()
                return jsonify({"success": True, "data": resp.data or []}), 200
            except Exception as e:
                debug_log("⚠️ /api/posts POST (Supabase) error, falling back", str(e))
                # Fall through to JSON fallback

    # JSON fallback mode
    try:
        if request.method == 'GET':
            data = load_json_file(POSTS_FILE, [])
            return jsonify({"success": True, "data": data}), 200
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
                return jsonify({"success": True, "data": resp.data or []}), 200
            except Exception as e:
                debug_log("⚠️ /api/market GET (Supabase) error, falling back", str(e))
                # Fall through to JSON fallback
        else:
            try:
                new_item = request.json or {}
                if not new_item.get("title") or not new_item.get("price"):
                    return jsonify({"success": False, "error": "Missing title/price"}), 400
                payload = {
                    "seller_id": new_item.get("sellerId") or new_item.get("seller_id"),
                    "seller_name": new_item.get("seller") or new_item.get("seller_name"),
                    "title": new_item.get("title"),
                    "price": new_item.get("price"),
                    "image": new_item.get("image"),
                }
                supabase.table("market_items").insert(payload).execute()
                resp = supabase.table("market_items").select("*").order("created_at", desc=True).limit(200).execute()
                return jsonify({"success": True, "data": resp.data or []}), 200
            except Exception as e:
                debug_log("⚠️ /api/market POST (Supabase) error, falling back", str(e))
                # Fall through to JSON fallback

    # JSON fallback mode
    try:
        if request.method == 'GET':
            items = load_json_file(MARKET_FILE, [])
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
        if os.path.exists(POLLS_FILE):
            with open(POLLS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        debug_log("⚠️ load_polls_file error", str(e))
    return []

def save_polls_file(polls):
    try:
        with open(POLLS_FILE, 'w', encoding='utf-8') as f:
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
    """
    Login DidUP con profili COMPLETI (nome/classe dall'API).
    NON serve più extract_student_identity_from_profile o fallback /scheda!
    """
    body = request.json or {}
    school = (body.get('schoolCode') or body.get('school') or '').strip().upper()
    username = (body.get('username') or '').strip().lower()
    password = body.get('password')
    selected_profile_index = body.get('profileIndex', None)

    if not all([school, username, password]):
        return jsonify({"success": False, "error": "Dati mancanti"}), 400

    try:
        debug_log("LOGIN REQUEST", {
            "school": school, 
            "username": username, 
            "idx": selected_profile_index
        })

        access_token = None
        auth_token = None
        profiles = []
        fallback_mode = False

        # 1) Login con profili COMPLETI
        try:
            login_result = AdvancedArgo.raw_login(school, username, password)
            access_token = login_result['access_token']
            profiles = login_result.get('profiles', []) or []
            
            debug_log("✅ PROFILI RICEVUTI", {
                "count": len(profiles),
                "names": [p.get('name', 'N/A') for p in profiles]
            })
            
        except Exception as e:
            debug_log("⚠️ Advanced Login Fallito", str(e))
            fallback_mode = True

        # 2) Selezione profilo
        target_index = 0
        target_profile = None

        if not fallback_mode and profiles:
            # Usa indice richiesto (se valido), altrimenti 0
            try:
                if selected_profile_index is not None:
                    i = int(selected_profile_index)
                    if 0 <= i < len(profiles):
                        target_index = i
            except Exception:
                pass

            target_profile = profiles[target_index]
            auth_token = target_profile.get('token')

        # 3) Fallback totale se profili/token non disponibili
        if fallback_mode or not access_token or not auth_token:
            debug_log("⚠️ Usando fallback standard")
            tmp = argofamiglia.ArgoFamiglia(school, username, password)
            headers = tmp._ArgoFamiglia__headers
            auth_token = headers.get('x-auth-token', '')
            access_token = headers.get('Authorization', '').replace('Bearer ', '')
            
            # Crea un profilo fake per il fallback
            target_profile = {
                "index": 0,
                "name": username.upper(),
                "class": "N/D",
                "school": school,
                "token": auth_token
            }

        # 4) ✅ ESTRAZIONE IDENTITÀ (SEMPLIFICATA!)
        # I profili arrivano già con name e class dall'API!
        student_name = target_profile.get('name', '').strip()
        student_class = target_profile.get('class', '').strip()

        # Validazione e fallback
        if not student_name or student_name == '':
            student_name = f"Studente {target_index+1}"
            debug_log("⚠️ Nome vuoto, usando fallback", student_name)
        else:
            debug_log("✅ Nome studente dall'API", student_name)

        if not student_class or student_class == '':
            student_class = "N/D"
            debug_log("⚠️ Classe vuota, usando fallback", student_class)
        else:
            debug_log("✅ Classe studente dall'API", student_class)

        # 5) Dati principali (voti/compiti/promemoria)
        argo_voti = create_session(school, username, password, access_token, auth_token)
        grades_data = extract_grades_multi_strategy(argo_voti)

        tasks_data = []
        try:
            argo_tasks = create_session(school, username, password, access_token, auth_token)
            tasks_data = extract_homework_safe(argo_tasks)
        except Exception:
            pass

        announcements_data = []
        try:
            argo_dash = create_session(school, username, password, access_token, auth_token)
            dash = argo_dash.dashboard()
            announcements_data = extract_promemoria(dash)
        except Exception:
            pass

        # 6) Sync profilo su Supabase
        if supabase:
            try:
                pid = f"{school}:{username}:{target_index}"
                supabase.table("profiles").upsert({
                    "id": pid,
                    "name": student_name,
                    "class": student_class,
                    "last_active": datetime.now().isoformat()
                }, on_conflict="id").execute()
                debug_log("👤 Profilo Supabase upsert", {
                    "id": pid,
                    "name": student_name,
                    "class": student_class
                })
            except Exception as e:
                debug_log("⚠️ Supabase upsert error (non fatale)", str(e))

        # 7) Costruisci risposta
        resp = {
            "success": True,
            "session": {
                "schoolCode": school,
                "authToken": auth_token,
                "accessToken": access_token,
                "userName": username,
                "profileIndex": target_index
            },
            "student": {
                "name": student_name,
                "class": student_class,
                "school": school
            },
            "tasks": tasks_data,
            "voti": grades_data,
            "promemoria": announcements_data
        }

        # Includi profilo selezionato
        if target_profile:
            resp["selectedProfile"] = {
                "index": target_index,
                "name": student_name,
                "class": student_class,
                "school": target_profile.get("school") or school,
                "idSoggetto": target_profile.get("idSoggetto"),
                "raw": target_profile.get("raw", {})
            }

        # Se più profili e l'utente non ne ha scelto uno, esponi la lista
        if profiles and len(profiles) > 1 and (selected_profile_index is None):
            resp["status"] = "MULTIPLE_PROFILES"
            resp["profiles"] = [{
                "index": p['index'],
                "name": p['name'] or f"Studente {p['index']+1}",
                "class": p['class'] or "N/D",
                "school": p['school']
            } for p in profiles]

        debug_log("📊 RISPOSTA FINALE", {
            "success": True,
            "student_name": student_name,
            "student_class": student_class,
            "profiles_count": len(profiles)
        })
        
        return jsonify(resp), 200

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        debug_log("❌ LOGIN FAILED", error_trace)
        return jsonify({
            "success": False, 
            "error": str(e), 
            "traceback": error_trace if DEBUG_MODE else None
        }), 401

@app.route('/test/profile-structure', methods=['POST'])
def test_profile_structure():
    """
    Diagnostic endpoint per analizzare la struttura completa dei profili e di /scheda.
    Utile per debuggare scuole con strutture API non standard.
    """
    data = request.json or {}
    school = (data.get('schoolCode') or '').strip().upper()
    user = (data.get('username') or '').strip().lower()
    pwd = data.get('password')
    
    if not all([school, user, pwd]):
        return jsonify({"error": "Missing credentials"}), 400
        
    result = {
        "profiles": [],
        "scheda": None,
        "errors": [],
        "success": False
    }
    
    try:
        # 1. Login Raw Avanzato
        login_res = AdvancedArgo.raw_login(school, user, pwd)
        access_token = login_res['access_token']
        profiles = login_res.get('profiles', [])
        
        for p in profiles:
            # Analisi chiavi profilo
            profile_info = {
                "index": p.get('index'),
                "raw_data": p.get('raw', {}),
                "extraction_test": {
                    "name": p.get('name'),
                    "class": p.get('class')
                }
            }
            result["profiles"].append(profile_info)
        
        result["success"] = True
        return jsonify(result), 200
        
    except Exception as e:
        import traceback
        result["errors"].append({
            "error": str(e),
            "traceback": traceback.format_exc()
        })
        return jsonify(result), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("DEBUG_MODE", "True").lower() == "true"
    app.run(host='0.0.0.0', port=port, debug=debug)
