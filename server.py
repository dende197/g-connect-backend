from flask import Flask, request, jsonify
from flask_cors import CORS
import argofamiglia
import uuid
import os
import json
import requests
from datetime import datetime

app = Flask(__name__)

# CORS configuration
CORS(app, origins=[
    "https://*.netlify.app",
    "http://127.0.0.1:*",
    "http://localhost:*",
    "*"
])

# ============= CONFIGURAZIONE DEBUG =============
DEBUG_MODE = True

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

# ============= STORAGE SESSIONI (In-Memory) =============
# In produzione, usa Redis o un DB
sessions = {}

def save_session(session_id, argo_instance, school_code, username, password):
    """Salva la sessione Argo per riutilizzo"""
    sessions[session_id] = {
        'argo': argo_instance,
        'school': school_code,
        'username': username,
        'password': password,
        'timestamp': datetime.now()
    }
    debug_log(f"💾 Sessione salvata: {session_id}")

def get_session(session_id):
    """Recupera sessione salvata"""
    return sessions.get(session_id)

# ============= GESTIONE PROFILI =============

def get_profili_disponibili(argo_instance):
    """
    Estrae la lista di profili (figli) disponibili per l'account.
    """
    profili = []
    try:
        debug_log("👥 Recupero profili disponibili...")
        
        # METODO 1: Prova con dashboard
        try:
            dashboard_data = argo_instance.dashboard()
            
            # Naviga nella struttura
            data_obj = dashboard_data.get('data', {})
            dati_list = data_obj.get('dati', [])
            
            # Fallback
            if not dati_list and 'dati' in dashboard_data:
                dati_list = dashboard_data.get('dati', [])
            
            # Se ci sono più elementi in 'dati', potrebbero essere i profili
            if len(dati_list) > 1:
                debug_log(f"✅ Trovati {len(dati_list)} possibili profili in dashboard")
                
                for i, profilo_data in enumerate(dati_list):
                    profili.append({
                        "id": str(i),
                        "nome": profilo_data.get('desAlunno') or profilo_data.get('cognomeNome') or f"Studente {i+1}",
                        "classe": profilo_data.get('desClasse', 'N/D'),
                        "annoScolastico": profilo_data.get('annoscolastico', '2024/2025'),
                        "index": i  # Indice per recuperare i dati
                    })
            
            # Se c'è un solo elemento, potrebbe comunque contenere info su più figli
            elif len(dati_list) == 1:
                main_data = dati_list[0]
                
                # Cerca array di alunni
                alunni_keys = ['alunni', 'figli', 'studenti', 'profili']
                
                for key in alunni_keys:
                    if key in main_data and isinstance(main_data[key], list):
                        debug_log(f"✅ Trovati {len(main_data[key])} profili in '{key}'")
                        
                        for i, alunno in enumerate(main_data[key]):
                            profili.append({
                                "id": alunno.get('prgAlunno') or alunno.get('id') or str(i),
                                "nome": alunno.get('desAlunno') or alunno.get('cognomeNome') or f"Studente {i+1}",
                                "classe": alunno.get('desClasse', 'N/D'),
                                "annoScolastico": alunno.get('annoscolastico', '2024/2025'),
                                "index": i
                            })
                        break
                
                # Se non trovati in array, è un singolo profilo
                if not profili:
                    debug_log("📌 Singolo profilo rilevato")
                    profili.append({
                        "id": "0",
                        "nome": main_data.get('desAlunno') or main_data.get('cognomeNome') or "Studente",
                        "classe": main_data.get('desClasse', 'N/D'),
                        "annoScolastico": main_data.get('annoscolastico', '2024/2025'),
                        "index": 0
                    })
        
        except Exception as e:
            debug_log(f"⚠️ Errore dashboard profili: {e}")
        
        # METODO 2: Chiamata API diretta (se esiste endpoint dedicato)
        if not profili:
            try:
                headers = argo_instance._ArgoFamiglia__headers
                url = "https://www.portaleargo.it/famiglia/api/rest/profili"
                
                response = requests.get(url, headers=headers, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    debug_log("✅ Risposta endpoint /profili", data)
                    
                    if isinstance(data, list):
                        for i, p in enumerate(data):
                            profili.append({
                                "id": p.get('prgAlunno') or str(i),
                                "nome": p.get('desAlunno') or f"Studente {i+1}",
                                "classe": p.get('desClasse', 'N/D'),
                                "annoScolastico": p.get('annoscolastico', '2024/2025'),
                                "index": i
                            })
                            
            except Exception as e:
                debug_log(f"⚠️ Errore API profili: {e}")
        
        # METODO 3: Fallback - Assume singolo profilo
        if not profili:
            debug_log("⚠️ Nessun metodo ha funzionato, assumo profilo singolo")
            profili.append({
                "id": "0",
                "nome": "Studente",
                "classe": "N/D",
                "annoScolastico": "2024/2025",
                "index": 0
            })
        
    except Exception as e:
        debug_log(f"❌ Errore estrazione profili: {e}")
        import traceback
        traceback.print_exc()
    
    debug_log(f"👥 Profili totali trovati: {len(profili)}", profili)
    return profili


def switch_profilo(argo_instance, profilo_index):
    """
    Cambia il profilo attivo nell'istanza Argo.
    Alcuni portali usano un parametro 'prgAlunno' nelle richieste.
    """
    try:
        debug_log(f"🔄 Switch a profilo index: {profilo_index}")
        
        # Se la libreria supporta setProfilo o simili
        if hasattr(argo_instance, 'setProfilo'):
            argo_instance.setProfilo(profilo_index)
            return True
        
        # Altrimenti, aggiungiamo il parametro alle headers
        # (questo dipende dall'implementazione di Argo)
        # headers = argo_instance._ArgoFamiglia__headers
        # headers['X-Profilo-Index'] = str(profilo_index)
        
        debug_log(f"✅ Profilo {profilo_index} impostato")
        return True
        
    except Exception as e:
        debug_log(f"⚠️ Errore switch profilo: {e}")
        return False


# ============= ESTRAZIONE DATI (Uguale a prima) =============

def extract_grades_multi_strategy(argo_instance):
    """Estrae voti con strategia multipla"""
    grades = []
    
    # Strategia 1: Dashboard
    try:
        dashboard_data = argo_instance.dashboard()
        data_obj = dashboard_data.get('data', {})
        dati_list = data_obj.get('dati', [])
        
        if not dati_list and 'dati' in dashboard_data:
            dati_list = dashboard_data.get('dati', [])
        
        main_data = dati_list[0] if dati_list else {}
        
        voti_keys = [
            'votiGiornalieri', 'votiPeriodici', 'votiScrutinio',
            'voti_giornalieri', 'voti', 'valutazioni'
        ]
        
        for key in voti_keys:
            voti_raw = main_data.get(key, [])
            if voti_raw:
                debug_log(f"✅ Trovati {len(voti_raw)} voti in '{key}'")
                
                for v in voti_raw:
                    valore = v.get('codVoto') or v.get('voto') or v.get('valore')
                    materia = v.get('desMateria') or v.get('materia', 'N/D')
                    
                    grades.append({
                        "materia": materia,
                        "valore": valore,
                        "data": v.get('datGiorno') or v.get('data'),
                        "tipo": v.get('desVoto') or v.get('tipo', 'N/D'),
                        "peso": v.get('numPeso', '100'),
                        "subject": materia,
                        "value": valore,
                        "date": v.get('datGiorno', ''),
                        "id": str(uuid.uuid4())[:12]
                    })
                break
    
    except Exception as e:
        debug_log(f"⚠️ Errore estrazione voti: {e}")
    
    # Strategia 2: API diretta (opzionale)
    if not grades:
        try:
            headers = argo_instance._ArgoFamiglia__headers
            endpoints = ["/votiGiornalieri", "/voti", "/valutazioni/giornaliere"]
            
            for endpoint in endpoints:
                url = f"https://www.portaleargo.it/famiglia/api/rest{endpoint}"
                response = requests.get(url, headers=headers, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    if isinstance(data, list) and len(data) > 0:
                        for v in data:
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
            debug_log(f"⚠️ Errore API voti: {e}")
    
    return grades


def extract_homework_safe(argo_instance):
    """Recupera compiti con debug avanzato"""
    tasks_data = []
    try:
        debug_log("📚 Chiamata getCompitiByDate()...")
        raw_homework = argo_instance.getCompitiByDate()
        debug_log(f"📥 Raw homework type: {type(raw_homework)}")
        debug_log(f"📥 Raw homework content preview: {str(raw_homework)[:500]}")
        
        if isinstance(raw_homework, dict):
            debug_log(f"📅 Trovate {len(raw_homework)} date con compiti")
            
            for date_str, details in raw_homework.items():
                compiti_list = details.get('compiti', [])
                materie_list = details.get('materie', [])
                
                debug_log(f"📆 Data {date_str}: {len(compiti_list)} compiti, {len(materie_list)} materie")
                
                for i, desc in enumerate(compiti_list):
                    mat = materie_list[i] if i < len(materie_list) else "Generico"
                    task = {
                        "id": str(uuid.uuid4())[:12],
                        "text": desc,
                        "subject": mat,
                        "due_date": date_str,
                        "materia": mat,
                        "done": False
                    }
                    tasks_data.append(task)
                    debug_log(f"  ✅ Compito {i+1}: {desc[:50]}... per {date_str}")
                    
        elif isinstance(raw_homework, list):
            debug_log(f"📋 Formato lista: {len(raw_homework)} compiti")
            for i, t in enumerate(raw_homework):
                task = {
                    "id": str(uuid.uuid4())[:12],
                    "text": t.get('desCompito', '') or t.get('compito', '') or t.get('text', 'Nessun testo'),
                    "subject": t.get('desMateria', '') or t.get('materia', 'Generico'),
                    "due_date": t.get('datCompito', '') or t.get('dataConsegna', '') or t.get('due_date', ''),
                    "done": False
                }
                tasks_data.append(task)
                debug_log(f"  ✅ Compito {i+1}: {task['text'][:50]}...")
        else:
            debug_log(f"⚠️ Formato compiti NON riconosciuto: {type(raw_homework)}")
            debug_log(f"⚠️ Contenuto completo: {raw_homework}")
                    
    except Exception as e:
        debug_log(f"❌ Errore CRITICO compiti: {e}")
        import traceback
        debug_log(f"Stack trace: {traceback.format_exc()}")
    
    debug_log(f"📊 TOTALE compiti estratti: {len(tasks_data)}")
    if len(tasks_data) > 0:
        debug_log(f"Esempio primo compito: {tasks_data[0]}")
    return tasks_data


def extract_promemoria(dashboard_data):
    """Estrae promemoria"""
    promemoria = []
    try:
        data_obj = dashboard_data.get('data', {})
        dati_list = data_obj.get('dati', [])
        
        if not dati_list and 'dati' in dashboard_data:
            dati_list = dashboard_data.get('dati', [])

        for blocco in dati_list:
            items = blocco.get('bachecaAlunno', []) + blocco.get('promemoria', [])
            
            for i in items:
                promemoria.append({
                    "titolo": i.get('desOggetto') or i.get('titolo', 'Avviso'),
                    "testo": i.get('desMessaggio') or i.get('testo', ''),
                    "autore": i.get('desMittente', 'Scuola'),
                    "data": i.get('datGiorno') or i.get('data', ''),
                    "url": i.get('urlAllegato', ''),
                    "date": i.get('datGiorno', '')
                })
    except Exception as e:
        debug_log(f"⚠️ Errore promemoria: {e}")
    
    return promemoria


# ============= ROUTES =============

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "debug": DEBUG_MODE}), 200


@app.route('/login', methods=['POST'])
def login():
    """
    STEP 1: Login iniziale
    
    Returns:
        - Se 1 profilo: dati completi dello studente
        - Se >1 profili: lista profili da cui scegliere
    """
    data = request.json
    school_code = data.get('schoolCode')
    username = data.get('username')
    password = data.get('password')

    if not all([school_code, username, password]):
        return jsonify({"success": False, "error": "Dati mancanti"}), 400

    try:
        debug_log("LOGIN", {"school": school_code, "username": username})
        
        # 1. Autenticazione
        argo = argofamiglia.ArgoFamiglia(school_code, username, password)
        debug_log("✅ Autenticazione riuscita")
        
        # 2. Estrai token
        headers = argo._ArgoFamiglia__headers
        auth_token = headers.get('x-auth-token', '')
        access_token = headers.get('Authorization', '').replace("Bearer ", "")
        
        # 3. Recupera profili disponibili
        profili = get_profili_disponibili(argo)
        
        # 4. Crea session ID per questa istanza
        session_id = str(uuid.uuid4())
        save_session(session_id, argo, school_code, username, password)
        
        # 5. Se c'è UN SOLO profilo, carica i dati subito
        if len(profili) == 1:
            debug_log("📌 Profilo singolo, carico dati...")
            
            grades_data = extract_grades_multi_strategy(argo)
            tasks_data = extract_homework_safe(argo)
            
            try:
                dashboard_data = argo.dashboard()
            except:
                dashboard_data = {}
            announcements_data = extract_promemoria(dashboard_data)
            
            return jsonify({
                "success": True,
                "multiProfile": False,
                "session": {
                    "sessionId": session_id,
                    "schoolCode": school_code,
                    "authToken": auth_token,
                    "accessToken": access_token,
                    "userName": username
                },
                "student": {
                    "name": profili[0]['nome'],
                    "class": profili[0]['classe'],
                    "school": school_code,
                    "profileId": profili[0]['id']
                },
                "tasks": tasks_data,
                "voti": grades_data,
                "promemoria": announcements_data
            }), 200
        
        # 6. Se ci sono PIÙ profili, restituisci solo la lista
        else:
            debug_log(f"👥 {len(profili)} profili trovati, richiesta selezione")
            
            return jsonify({
                "success": True,
                "multiProfile": True,
                "requiresSelection": True,
                "session": {
                    "sessionId": session_id,
                    "schoolCode": school_code,
                    "authToken": auth_token,
                    "accessToken": access_token,
                    "userName": username
                },
                "profili": profili
            }), 200

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        debug_log(f"❌ LOGIN FAILED", error_trace)
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": error_trace if DEBUG_MODE else None
        }), 401


@app.route('/select-profile', methods=['POST'])
def select_profile():
    """
    STEP 2: Selezione profilo (solo se multiProfile=true)
    
    Body:
        {
            "sessionId": "...",
            "profileId": "0" o "12345"
        }
    """
    data = request.json
    session_id = data.get('sessionId')
    profile_id = data.get('profileId')
    
    if not all([session_id, profile_id]):
        return jsonify({"success": False, "error": "Dati mancanti"}), 400
    
    try:
        debug_log("SELECT PROFILE", {"session": session_id, "profile": profile_id})
        
        # Recupera sessione
        session_data = get_session(session_id)
        if not session_data:
            return jsonify({"success": False, "error": "Sessione scaduta"}), 401
        
        argo = session_data['argo']
        
        # Recupera lista profili per trovare l'index
        profili = get_profili_disponibili(argo)
        selected_profile = next((p for p in profili if p['id'] == profile_id), None)
        
        if not selected_profile:
            return jsonify({"success": False, "error": "Profilo non trovato"}), 404
        
        # Switch al profilo selezionato
        switch_profilo(argo, selected_profile['index'])
        
        # Carica dati del profilo
        debug_log(f"📊 Caricamento dati per {selected_profile['nome']}")
        
        grades_data = extract_grades_multi_strategy(argo)
        tasks_data = extract_homework_safe(argo)
        
        try:
            dashboard_data = argo.dashboard()
        except:
            dashboard_data = {}
        announcements_data = extract_promemoria(dashboard_data)
        
        return jsonify({
            "success": True,
            "student": {
                "name": selected_profile['nome'],
                "class": selected_profile['classe'],
                "school": session_data['school'],
                "profileId": profile_id
            },
            "tasks": tasks_data,
            "voti": grades_data,
            "promemoria": announcements_data
        }), 200
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        debug_log(f"❌ SELECT PROFILE FAILED", error_trace)
        return jsonify({
            "success": False,
            "error": str(e),
            "traceback": error_trace if DEBUG_MODE else None
        }), 500


@app.route('/sync', methods=['POST'])
def sync_data():
    """Sincronizzazione (mantiene compatibilità)"""
    data = request.json
    school = data.get('schoolCode')
    stored_user = data.get('storedUser')
    stored_pass = data.get('storedPass')
    profile_id = data.get('profileId')  # NUOVO: per multi-profilo
    
    try:
        debug_log("SYNC REQUEST", {"school": school, "profile": profile_id})
        
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
        
        # Se c'è un profileId, switch al profilo
        if profile_id:
            profili = get_profili_disponibili(argo)
            selected = next((p for p in profili if p['id'] == profile_id), None)
            if selected:
                switch_profilo(argo, selected['index'])
        
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
        
        debug_log(f"✅ SYNC OK", {"voti": len(grades_data), "tasks": len(tasks_data)})
        
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
        debug_log(f"❌ SYNC FAILED", traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 401


@app.route('/debug/profiles', methods=['POST'])
def debug_profiles():
    """Endpoint di debug per vedere i profili RAW"""
    data = request.json
    school = data.get('schoolCode')
    user = data.get('username')
    pwd = data.get('password')
    
    try:
        argo = argofamiglia.ArgoFamiglia(school, user, pwd)
        dashboard = argo.dashboard()
        profili = get_profili_disponibili(argo)
        
        return jsonify({
            "success": True,
            "dashboard": dashboard,
            "profili_estratti": profili
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/')
def index():
    return """
    <h1>G-Connect Backend - Multi-Profile Support</h1>
    <p>Endpoints disponibili:</p>
    <ul>
        <li>POST /login - Autenticazione (ritorna profili se >1)</li>
        <li>POST /select-profile - Selezione profilo specifico</li>
        <li>POST /sync - Sincronizzazione</li>
        <li>POST /debug/profiles - Visualizza profili RAW (DEBUG)</li>
        <li>GET /health - Health check</li>
    </ul>
    """


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5002))
    print(f"\n{'='*70}")
    print(f"🚀 G-Connect Backend - Multi-Profile Support")
    print(f"📡 Running on port {port}")
    print(f"👥 Supporto account multi-studente attivo")
    print(f"{'='*70}\n")
    app.run(host='0.0.0.0', port=port, debug=True)
