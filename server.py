from flask import Flask, request, jsonify
from flask_cors import CORS
import argofamiglia
import uuid
import os
import json
import requests
from datetime import datetime, timedelta

app = Flask(__name__)

# CORS configuration
CORS(app, origins=[
    "https://*.netlify.app",
    "http://127.0.0.1:*",
    "http://localhost:*",
    "*"
])

# ============= CONFIGURAZIONE DEBUG =============
DEBUG_MODE = True  # Imposta False in produzione

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

# ============= FIX TIMEZONE =============

def fix_date_timezone(date_str):
    """
    Corregge il problema delle date sfasate di un giorno.
    DidUP restituisce date che potrebbero essere interpretate come UTC,
    causando uno spostamento di -1 giorno quando convertite in locale.
    """
    if not date_str:
        return date_str
    
    try:
        # Se la data è in formato YYYY-MM-DD, aggiunge un giorno
        # per compensare il timezone
        if len(date_str) == 10 and date_str.count('-') == 2:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d')
            # Aggiungi 1 giorno per compensare il fuso orario
            fixed_date = date_obj + timedelta(days=1)
            return fixed_date.strftime('%Y-%m-%d')
    except:
        pass
    
    return date_str

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
        
        # Salva la risposta completa per analisi
        try:
            with open('/tmp/dashboard_debug.json', 'w') as f:
                json.dump(dashboard_data, f, indent=2, default=str)
            debug_log("✅ Dashboard salvata in /tmp/dashboard_debug.json")
        except:
            pass # Ignore write errors on read-only systems
        
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
                    "headers": dict(response.headers),
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
                                    # Processa come sopra... (logic simplified for brevity/safety)
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
                         debug_log(f"⚠️ Errore parsing JSON {endpoint}: {json_err}. Content: {response.text[:100]}")
                         
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
        # Alcuni metodi che potrebbero esistere
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
                        # Processa il risultato
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
        debug_log("📚 Chiamata getCompitiByDate()")
        raw_homework = argo_instance.getCompitiByDate()
        debug_log("Compiti RAW", raw_homework)
        
        if isinstance(raw_homework, dict):
            for date_str, details in raw_homework.items():
                # FIX TIMEZONE: Correggi la data
                fixed_date = fix_date_timezone(date_str)
                
                compiti_list = details.get('compiti', [])
                materie_list = details.get('materie', [])
                
                for i, desc in enumerate(compiti_list):
                    mat = materie_list[i] if i < len(materie_list) else "Generico"
                    tasks_data.append({
                        "id": str(uuid.uuid4())[:12],
                        "text": desc,
                        "subject": mat,
                        "due_date": fixed_date,  # Usa data corretta
                        "materia": mat,
                        "done": False
                    })
                    
        elif isinstance(raw_homework, list):
            for t in raw_homework:
                date_s = t.get('datCompito', '')
                fixed_date = fix_date_timezone(date_s)
                
                tasks_data.append({
                    "id": str(uuid.uuid4())[:12],
                    "text": t.get('desCompito', '') or t.get('compito', ''),
                    "subject": t.get('desMateria', '') or t.get('materia', 'Generico'),
                    "due_date": fixed_date,
                    "done": False
                })
                
    except Exception as e:
        debug_log(f"⚠️ Errore compiti", str(e))
    
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


# ============= ROUTES =============

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "debug": DEBUG_MODE}), 200


@app.route('/login', methods=['POST'])
def login():
    data = request.json
    school_code = data.get('schoolCode')
    username = data.get('username')
    password = data.get('password')

    if not all([school_code, username, password]):
        return jsonify({"success": False, "error": "Dati mancanti"}), 400

    try:
        debug_log("LOGIN", {
            "school": school_code,
            "username": username,
            "timestamp": datetime.now().isoformat()
        })
        
        # 1. Autenticazione
        argo = argofamiglia.ArgoFamiglia(school_code, username, password)
        debug_log("✅ Autenticazione riuscita")
        
        # 2. Estrai token
        headers = argo._ArgoFamiglia__headers
        auth_token = headers.get('x-auth-token', '')
        access_token = headers.get('Authorization', '').replace("Bearer ", "")
        
        debug_log("Token estratti", {
            "auth_token": auth_token[:30] + "..." if auth_token else "N/A",
            "access_token": access_token[:30] + "..." if access_token else "N/A"
        })

        # 3. Recupera VOTI con strategia multipla
        debug_log("🎓 INIZIO ESTRAZIONE VOTI")
        grades_data = extract_grades_multi_strategy(argo)
        debug_log(f"🎓 VOTI FINALI: {len(grades_data)} elementi", grades_data[:3])
        
        # 4. Recupera compiti
        tasks_data = extract_homework_safe(argo)
        
        # 5. Recupera promemoria
        try:
            dashboard_data = argo.dashboard()
        except:
            dashboard_data = {}
        announcements_data = extract_promemoria(dashboard_data)

        # Risposta finale
        response_data = {
            "success": True,
            "session": {
                "schoolCode": school_code,
                "authToken": auth_token,
                "accessToken": access_token,
                "userName": username
            },
            "student": {
                "name": username,
                "class": "DidUP",
                "school": school_code
            },
            "tasks": tasks_data,
            "voti": grades_data,
            "promemoria": announcements_data,
            "debug_info": {
                "voti_count": len(grades_data),
                "tasks_count": len(tasks_data),
                "timestamp": datetime.now().isoformat()
            }
        }
        
        debug_log("RISPOSTA FINALE", response_data)
        return jsonify(response_data), 200

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        debug_log(f"❌ LOGIN FAILED", error_trace)
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": error_trace if DEBUG_MODE else None
        }), 401


@app.route('/sync', methods=['POST'])
def sync_data():
    """Sincronizzazione con credenziali salvate"""
    data = request.json
    school = data.get('schoolCode')
    stored_user = data.get('storedUser')
    stored_pass = data.get('storedPass')
    
    try:
        debug_log("SYNC REQUEST", {"school": school})
        
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
        
        # Re-login
        argo = argofamiglia.ArgoFamiglia(school, user, pass_)
        
        # Recupera dati
        grades_data = extract_grades_multi_strategy(argo)
        tasks_data = extract_homework_safe(argo)
        
        try:
            dashboard_data = argo.dashboard()
        except:
            dashboard_data = {}
        announcements_data = extract_promemoria(dashboard_data)
        
        # Nuovi token
        headers = argo._ArgoFamiglia__headers
        new_auth_token = headers.get('x-auth-token', '')
        new_access_token = headers.get('Authorization', '').replace("Bearer ", "")
        
        debug_log(f"✅ SYNC OK", {
            "voti": len(grades_data),
            "tasks": len(tasks_data)
        })
        
        return jsonify({
            "success": True,
            "tasks": tasks_data,
            "voti": grades_data,
            "promemoria": announcements_data,
            "new_tokens": {
                "authToken": new_auth_token,
                "accessToken": new_access_token
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
    Usa questo per vedere ESATTAMENTE cosa torna Argo
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
    <h1>G-Connect Backend - Debug Mode</h1>
    <p>Endpoints disponibili:</p>
    <ul>
        <li>POST /login - Autenticazione e recupero dati</li>
        <li>POST /sync - Sincronizzazione</li>
        <li>POST /debug/dashboard - Visualizza dashboard RAW (DEBUG)</li>
        <li>GET /health - Health check</li>
    </ul>
    <p>Debug mode: <b>ATTIVO</b> - Controlla i log del server</p>
    """


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5002))
    print(f"\n{'='*70}")
    print(f"🚀 G-Connect Backend - DEBUG MODE")
    print(f"📡 Running on port {port}")
    print(f"🔍 Debug logging: ENABLED")
    print(f"{'='*70}\n")
    app.run(host='0.0.0.0', port=port, debug=True)
