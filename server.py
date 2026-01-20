from flask import Flask, request, jsonify
from flask_cors import CORS
import argofamiglia
import uuid
import os
import json
import requests
from datetime import datetime, timedelta

app = Flask(__name__)

# CORS configuration - Più permissivo come richiesto
CORS(app, origins=["*"])

# ============= CONFIGURAZIONE DEBUG =============
DEBUG_MODE = True 

def debug_log(message, data=None):
    """Helper per logging strutturato"""
    if DEBUG_MODE:
        print(f"\n{'='*60}\n🔍 {message}")
        if data:
            if isinstance(data, (dict, list)):
                print(json.dumps(data, indent=2, ensure_ascii=False, default=str)[:2000])
            else:
                print(str(data)[:2000])
        print(f"{'='*60}\n")

# ============= FIX TIMEZONE =============
def fix_date_timezone(date_str):
    """Corregge lo sfasamento di -1 giorno"""
    if not date_str: return date_str
    try:
        if len(date_str) == 10 and date_str.count('-') == 2:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d')
            fixed_date = date_obj + timedelta(days=1)
            return fixed_date.strftime('%Y-%m-%d')
    except: pass
    return date_str

# ============= LOGICA ESTRAZIONE DATI =============

def get_available_students(argo_instance):
    """Scarica la lista dei figli (Schede) associati all'account"""
    try:
        # Endpoint per ottenere le schede dei figli
        url = "https://www.portaleargo.it/famiglia/api/rest/schede"
        headers = argo_instance._ArgoFamiglia__headers
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            schede = response.json()
            profiles = []
            
            # Handle both list and dict with 'data' key
            if isinstance(schede, dict) and 'data' in schede:
                schede = schede['data']
            
            if isinstance(schede, list):
                for idx, s in enumerate(schede):
                    profiles.append({
                        "id": idx, 
                        "prgAlunno": s.get('prgAlunno'),
                        "prgScheda": s.get('prgScheda'),
                        "nome": s.get('alunno', {}).get('desNome', 'Sconosciuto') if isinstance(s.get('alunno'), dict) else s.get('desNome', 'Sconosciuto'),
                        "cognome": s.get('alunno', {}).get('desCognome', '') if isinstance(s.get('alunno'), dict) else s.get('desCognome', ''),
                        "classe": s.get('desClasse', ''),
                        "scuola": s.get('desScuola', ''),
                        "codMin": s.get('codMin', '')
                    })
            debug_log(f"✅ Trovati {len(profiles)} profili", profiles)
            return profiles
    except Exception as e:
        debug_log("❌ Errore recupero profili", str(e))
    return []

def switch_student_context(argo_instance, profile_data):
    """Dice ad Argo quale figlio stiamo guardando"""
    try:
        if 'codMin' in profile_data and profile_data['codMin']:
            argo_instance._ArgoFamiglia__headers['x-cod-min'] = profile_data['codMin']
        if 'prgAlunno' in profile_data and profile_data['prgAlunno']:
            argo_instance._ArgoFamiglia__headers['x-prg-alunno'] = str(profile_data['prgAlunno'])
        if 'prgScheda' in profile_data and profile_data['prgScheda']:
            argo_instance._ArgoFamiglia__headers['x-prg-scheda'] = str(profile_data['prgScheda'])
        debug_log(f"✅ Cambio profilo su: {profile_data.get('nome', 'Unknown')}")
    except Exception as e:
        debug_log("❌ Errore cambio contesto", str(e))

def estrai_voti_da_dashboard(dashboard_data):
    """Estrae i voti direttamente dalla dashboard"""
    grades = []
    try:
        if not dashboard_data: return grades
        
        data_obj = dashboard_data.get('data', {})
        dati_list = data_obj.get('dati', [])
        
        if not dati_list and 'dati' in dashboard_data:
            dati_list = dashboard_data.get('dati', [])
        
        if not dati_list: return grades
        
        main_data = dati_list[0] if dati_list else {}
        
        voti_keys = [
            'votiGiornalieri', 'votiPeriodici', 'votiScrutinio',
            'voti_giornalieri', 'voti', 'valutazioni', 'valutazioniGiornaliere'
        ]
        
        for key in voti_keys:
            voti_raw = main_data.get(key, [])
            if voti_raw:
                debug_log(f"✅ Voti trovati in chiave: '{key}'", len(voti_raw))
                for v in voti_raw:
                    materia = v.get('desMateria') or v.get('materia', 'N/D')
                    valore = v.get('codVoto') or v.get('voto') or v.get('valore')
                    
                    grades.append({
                        "materia": materia,
                        "valore": valore,
                        "data": v.get('datGiorno') or v.get('data') or v.get('dataVoto'),
                        "tipo": v.get('desVoto') or v.get('tipo', 'N/D'),
                        "peso": v.get('numPeso', '100'),
                        "subject": materia,
                        "value": valore,
                        "date": v.get('datGiorno', ''),
                        "id": str(uuid.uuid4())[:12]
                    })
                break 
    except Exception as e:
        debug_log(f"❌ Errore parsing voti", str(e))
    return grades

def fallback_api_voti(argo_instance):
    """Tentativo diretto API se la dashboard fallisce"""
    grades = []
    try:
        headers = argo_instance._ArgoFamiglia__headers
        base_url = "https://www.portaleargo.it/famiglia/api/rest"
        endpoints = ["/votiGiornalieri", "/voti", "/registro/voti"]
        
        for endpoint in endpoints:
            try:
                res = requests.get(base_url + endpoint, headers=headers, timeout=5)
                if res.status_code == 200:
                    data = res.json()
                    items = []
                    if isinstance(data, list): items = data
                    elif isinstance(data, dict) and 'dati' in data: items = data['dati']
                    
                    if items:
                        debug_log(f"✅ Voti recuperati da API {endpoint}")
                        for v in items:
                            grades.append({
                                "subject": v.get('desMateria', 'N/D'),
                                "value": v.get('codVoto', ''),
                                "date": v.get('datGiorno', ''),
                                "id": str(uuid.uuid4())[:12],
                                "materia": v.get('desMateria', 'N/D'),
                                "valore": v.get('codVoto', '')
                            })
                        break
            except: continue
    except Exception as e:
        debug_log("Errore fallback API", str(e))
    return grades

def extract_homework_robust(argo_instance):
    """Parser robusto per i compiti e date corrette"""
    tasks_data = []
    try:
        raw_homework = argo_instance.getCompitiByDate()
        
        if isinstance(raw_homework, dict):
            for date_str, details in raw_homework.items():
                fixed_date = fix_date_timezone(date_str) # FIX
                compiti_list = details.get('compiti', [])
                materie_list = details.get('materie', [])
                
                for i, desc in enumerate(compiti_list):
                    mat = materie_list[i] if i < len(materie_list) else "Generico"
                    tasks_data.append({
                        "id": str(uuid.uuid4())[:12],
                        "text": desc,
                        "subject": mat,
                        "due_date": fixed_date,
                        "datCompito": fixed_date,
                        "materia": mat,
                        "done": False
                    })
                    
        elif isinstance(raw_homework, list):
            for t in raw_homework:
                date_s = t.get('datCompito', '')
                fixed_date = fix_date_timezone(date_s) # FIX
                
                tasks_data.append({
                    "id": str(uuid.uuid4())[:12],
                    "text": t.get('desCompito', '') or t.get('compito', ''),
                    "subject": t.get('desMateria', '') or t.get('materia', 'Generico'),
                    "due_date": fixed_date,
                    "datCompito": fixed_date,
                    "materia": t.get('desMateria', 'Generico'),
                    "done": False
                })
    except Exception as e:
        debug_log(f"⚠️ Errore estrazione compiti", str(e))
    return tasks_data

def extract_promemoria(dashboard_data):
    """Estrae promemoria e bacheca"""
    promemoria = []
    try:
        data_obj = dashboard_data.get('data', {})
        dati_list = data_obj.get('dati', []) or dashboard_data.get('dati', [])
        
        for blocco in dati_list:
            items = blocco.get('bachecaAlunno', []) + blocco.get('promemoria', [])
            for i in items:
                promemoria.append({
                    "titolo": i.get('desOggetto') or i.get('titolo', 'Avviso'),
                    "testo": i.get('desMessaggio') or i.get('testo') or i.get('desAnnotazioni', ''),
                    "autore": i.get('desMittente', 'Scuola'),
                    "data": i.get('datGiorno') or i.get('data', ''),
                    "url": i.get('urlAllegato', ''),
                    "id": str(uuid.uuid4())[:12]
                })
    except Exception: pass
    return promemoria

# ============= ROUTES =============

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    school = data.get('schoolCode')
    user = data.get('username')
    pwd = data.get('password')
    selected_profile_index = data.get('selectedProfileIndex')  # Optional: for profile selection

    if not all([school, user, pwd]):
        return jsonify({"success": False, "error": "Dati mancanti"}), 400

    try:
        debug_log("🚀 LOGIN REQUEST", {"user": user, "profileIndex": selected_profile_index})
        
        argo = argofamiglia.ArgoFamiglia(school, user, pwd)
        
        # Get available profiles/students for this account
        profiles = get_available_students(argo)
        
        # CASE A: Multiple profiles and no selection made yet
        if len(profiles) > 1 and selected_profile_index is None:
            return jsonify({
                "success": True,
                "multiProfile": True,  # Signal to frontend
                "profiles": profiles,
                "sessionData": {
                    "schoolCode": school,
                    "username": user
                }
            }), 200
        
        # CASE B: No profiles found
        if len(profiles) == 0:
            return jsonify({
                "success": False,
                "error": "Nessun profilo associato a questo account"
            }), 404
        
        # CASE C: Single profile or profile selected
        target_profile = profiles[0]  # Default to first profile
        if selected_profile_index is not None and 0 <= int(selected_profile_index) < len(profiles):
            target_profile = profiles[int(selected_profile_index)]
        
        # Apply profile context
        if target_profile:
            switch_student_context(argo, target_profile)
        
        # 1. Dashboard & Voti
        try:
            dashboard_data = argo.dashboard()
        except:
            dashboard_data = {}

        grades_data = estrai_voti_da_dashboard(dashboard_data)
        if not grades_data:
            grades_data = fallback_api_voti(argo)

        # 2. Promemoria
        announcements_data = extract_promemoria(dashboard_data)

        # 3. Compiti (Ultimi per sicurezza)
        tasks_data = extract_homework_robust(argo)

        headers = argo._ArgoFamiglia__headers
        
        return jsonify({
            "success": True,
            "multiProfile": False,
            "session": {
                "schoolCode": school,
                "authToken": headers.get('x-auth-token', ''),
                "accessToken": headers.get('Authorization', '').replace("Bearer ", ""),
                "userName": user,
                "activeProfile": target_profile
            },
            "student": {
                "name": f"{target_profile.get('nome', '')} {target_profile.get('cognome', '')}".strip() or user,
                "class": target_profile.get('classe', ''),
                "school": school
            },
            "tasks": tasks_data,
            "voti": grades_data,
            "promemoria": announcements_data,
            "profiles": profiles  # Include all profiles for profile switching
        }), 200

    except Exception as e:
        import traceback
        debug_log("❌ FATAL ERROR LOGIN", traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 401


@app.route('/sync', methods=['POST'])
def sync_data():
    data = request.json
    school = data.get('schoolCode')
    stored_user = data.get('storedUser')
    stored_pass = data.get('storedPass')
    active_profile = data.get('activeProfile')  # Profile to sync for
    
    try:
        if not all([school, stored_user, stored_pass]):
            return jsonify({"success": False, "error": "Credenziali mancanti"}), 401
        
        import base64, urllib.parse
        def decode(s):
            try: return urllib.parse.unquote(base64.b64decode(s).decode('utf-8'))
            except: return s
        user, pwd = decode(stored_user), decode(stored_pass)
        
        argo = argofamiglia.ArgoFamiglia(school, user, pwd)
        
        # Apply profile context if provided
        if active_profile:
            switch_student_context(argo, active_profile)
        
        try: dashboard_data = argo.dashboard()
        except: dashboard_data = {}
            
        grades_data = estrai_voti_da_dashboard(dashboard_data)
        if not grades_data: grades_data = fallback_api_voti(argo)
            
        announcements_data = extract_promemoria(dashboard_data)
        tasks_data = extract_homework_robust(argo)
        
        return jsonify({
            "success": True,
            "tasks": tasks_data,
            "voti": grades_data,
            "promemoria": announcements_data,
            "new_tokens": {
                "authToken": argo._ArgoFamiglia__headers.get('x-auth-token', ''),
                "accessToken": argo._ArgoFamiglia__headers.get('Authorization', '').replace("Bearer ", "")
            }
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 401

@app.route('/switch-profile', methods=['POST'])
def switch_profile():
    """Switch to a different profile without re-login"""
    data = request.json
    school = data.get('schoolCode')
    stored_user = data.get('storedUser')
    stored_pass = data.get('storedPass')
    profile_index = data.get('profileIndex')
    
    try:
        if not all([school, stored_user, stored_pass]) or profile_index is None:
            return jsonify({"success": False, "error": "Dati mancanti"}), 400
        
        import base64, urllib.parse
        def decode(s):
            try: return urllib.parse.unquote(base64.b64decode(s).decode('utf-8'))
            except: return s
        user, pwd = decode(stored_user), decode(stored_pass)
        
        argo = argofamiglia.ArgoFamiglia(school, user, pwd)
        
        # Get all profiles
        profiles = get_available_students(argo)
        
        if profile_index < 0 or profile_index >= len(profiles):
            return jsonify({"success": False, "error": "Indice profilo non valido"}), 400
        
        target_profile = profiles[profile_index]
        switch_student_context(argo, target_profile)
        
        # Get data for the new profile
        try: dashboard_data = argo.dashboard()
        except: dashboard_data = {}
            
        grades_data = estrai_voti_da_dashboard(dashboard_data)
        if not grades_data: grades_data = fallback_api_voti(argo)
            
        announcements_data = extract_promemoria(dashboard_data)
        tasks_data = extract_homework_robust(argo)
        
        return jsonify({
            "success": True,
            "student": {
                "name": f"{target_profile.get('nome', '')} {target_profile.get('cognome', '')}".strip(),
                "class": target_profile.get('classe', ''),
                "school": school
            },
            "activeProfile": target_profile,
            "tasks": tasks_data,
            "voti": grades_data,
            "promemoria": announcements_data
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 401

@app.route('/health')
def health():
    return jsonify({"status": "ok", "version": "MULTI_PROFILE_SUPPORT"}), 200

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5002))
    app.run(host='0.0.0.0', port=port)
