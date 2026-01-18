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
    if DEBUG_MODE:
        print(f"\n{'='*60}\n🔍 {message}")
        if data:
            if isinstance(data, (dict, list)):
                print(json.dumps(data, indent=2, ensure_ascii=False, default=str)[:2000])
            else:
                print(str(data)[:2000])
        print(f"{'='*60}\n")

# ============= FIX TIMEZONE (RICHIESTO) =============

def fix_date_timezone(date_str):
    """Corregge lo sfasamento di -1 giorno di DidUP/Argo"""
    if not date_str: return date_str
    try:
        if len(date_str) == 10 and date_str.count('-') == 2:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d')
            fixed_date = date_obj + timedelta(days=1)
            return fixed_date.strftime('%Y-%m-%d')
    except: pass
    return date_str

# ============= FUNZIONI MULTI-PROFILO =============

def get_available_students(argo_instance):
    """Recupera la lista dei figli (schede) disponibili"""
    try:
        url = "https://www.portaleargo.it/famiglia/api/rest/schede"
        headers = argo_instance._ArgoFamiglia__headers
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            schede = response.json()
            profiles = []
            for idx, s in enumerate(schede):
                profiles.append({
                    "id": idx,
                    "prgAlunno": s.get('prgAlunno'),
                    "prgScheda": s.get('prgScheda'),
                    "name": s.get('alunno', {}).get('desNome', 'Sconosciuto') + " " + s.get('alunno', {}).get('desCognome', ''),
                    "nome": s.get('alunno', {}).get('desNome', 'Sconosciuto'),
                    "cognome": s.get('alunno', {}).get('desCognome', ''),
                    "classe": s.get('desClasse', ''),
                    "school": s.get('desScuola', ''),
                    "codMin": s.get('codMin', '')
                })
            return profiles
    except Exception as e:
        debug_log("❌ Errore recupero profili", str(e))
    return []

def switch_student_context(argo_instance, profile_data):
    """Seleziona il profilo attivo negli headers"""
    try:
        argo_instance._ArgoFamiglia__headers['x-cod-min'] = profile_data['codMin']
        argo_instance._ArgoFamiglia__headers['x-prg-alunno'] = str(profile_data['prgAlunno'])
        argo_instance._ArgoFamiglia__headers['x-prg-scheda'] = str(profile_data['prgScheda'])
        debug_log(f"✅ Profilo impostato su: {profile_data['name']}")
    except Exception as e:
        debug_log("❌ Errore switch profilo", str(e))

# ============= LOGICA ESTRAZIONE DATI =============

def estrai_voti_da_dashboard(dashboard_data):
    grades = []
    try:
        if not dashboard_data: return grades
        data_obj = dashboard_data.get('data', {})
        dati_list = data_obj.get('dati', []) or dashboard_data.get('dati', [])
        if not dati_list: return grades
        
        main_data = dati_list[0]
        voti_keys = ['votiGiornalieri', 'votiPeriodici', 'votiScrutinio', 'voti']
        
        for key in voti_keys:
            voti_raw = main_data.get(key, [])
            if voti_raw:
                for v in voti_raw:
                    materia = v.get('desMateria') or v.get('materia', 'N/D')
                    valore = v.get('codVoto') or v.get('voto') or v.get('valore')
                    grades.append({
                        "subject": materia, 
                        "value": valore, 
                        "date": v.get('datGiorno', ''),
                        "tipo": v.get('desVoto', 'N/D'), 
                        "id": str(uuid.uuid4())[:12]
                    })
                break 
    except Exception as e: debug_log("Errore parsing voti", str(e))
    return grades

def extract_homework_robust(argo_instance):
    tasks_data = []
    try:
        raw_homework = argo_instance.getCompitiByDate()
        if isinstance(raw_homework, dict):
            for date_str, details in raw_homework.items():
                # APPLICA FIX DATA
                fixed_date = fix_date_timezone(date_str)
                compiti = details.get('compiti', [])
                materie = details.get('materie', [])
                for i, desc in enumerate(compiti):
                    tasks_data.append({
                        "id": str(uuid.uuid4())[:12], 
                        "text": desc,
                        "subject": materie[i] if i < len(materie) else "Generico",
                        "due_date": fixed_date, 
                        "done": False
                    })
    except Exception as e: debug_log("Errore compiti", str(e))
    return tasks_data

def extract_promemoria(dashboard_data):
    promemoria = []
    try:
        items = dashboard_data.get('data', {}).get('dati', [{}])[0].get('bachecaAlunno', [])
        for i in items:
            promemoria.append({
                "titolo": i.get('desOggetto', 'Avviso'),
                "testo": i.get('desMessaggio', ''),
                "data": i.get('datGiorno', ''), 
                "id": str(uuid.uuid4())[:12]
            })
    except: pass
    return promemoria

# ============= ROUTES =============

@app.route('/login-v2', methods=['POST'])
def login_v2():
    """
    Gestisce il login con supporto multi-profilo.
    CASO A: Se ci sono più profili e selectedProfileIndex non è fornito => restituisce lista profili
    CASO B: Se selectedProfileIndex è fornito o c'è un solo profilo => restituisce dati completi
    """
    data = request.json
    school = data.get('schoolCode')
    user = data.get('username')
    pwd = data.get('password')
    selected_index = data.get('selectedProfileIndex')  # Parameter from frontend

    debug_log("🚀 LOGIN-V2 REQUEST", {
        "schoolCode": school,
        "username": user,
        "hasPassword": bool(pwd),
        "selectedProfileIndex": selected_index
    })

    if not all([school, user, pwd]):
        debug_log("❌ Dati mancanti nel login")
        return jsonify({"success": False, "error": "Dati mancanti"}), 400

    try:
        debug_log(f"🔐 Autenticazione in corso per {user}")
        argo = argofamiglia.ArgoFamiglia(school, user, pwd)
        debug_log("✅ Autenticazione riuscita")
        
        # 1. Gestione Profili Multipli
        profiles = get_available_students(argo)
        debug_log(f"👥 Profili trovati: {len(profiles)}")
        
        if len(profiles) > 1 and selected_index is None:
            debug_log("📋 CASO A: Più profili trovati, richiesta selezione")
            return jsonify({
                "success": True,
                "multi_profile": True,
                "profiles": profiles
            }), 200

        # Se c'è una scelta o se il profilo è unico
        current_profile = None
        if selected_index is not None:
            try:
                idx = int(selected_index)
                if 0 <= idx < len(profiles):
                    current_profile = profiles[idx]
                    debug_log(f"✅ Profilo selezionato: {current_profile.get('name', 'N/D')} (index {idx})")
                else:
                    debug_log(f"❌ Indice profilo fuori range: {idx} (totale: {len(profiles)})")
                    return jsonify({"success": False, "error": f"Indice profilo non valido: {idx}"}), 400
            except ValueError:
                debug_log(f"❌ Indice profilo non valido: {selected_index}")
                return jsonify({"success": False, "error": "Indice profilo deve essere un numero"}), 400
        elif len(profiles) > 0:
            current_profile = profiles[0]
            switch_student_context(argo, current_profile)
            debug_log(f"✅ Profilo unico selezionato automaticamente: {current_profile.get('name', 'N/D')}")
        else:
            debug_log("❌ Nessun profilo disponibile")
            return jsonify({"success": False, "error": "Nessun profilo disponibile"}), 404
        
        if current_profile:
            switch_student_context(argo, current_profile)

        # 2. Recupero Dati (Ordine Critico)
        debug_log("📊 Scarico Dashboard...")
        try:
            dashboard_data = argo.dashboard()
            debug_log("✅ Dashboard recuperata")
        except Exception as e:
            debug_log("⚠️ Errore dashboard, uso dati vuoti", str(e))
            dashboard_data = {}
            
        debug_log("🎓 Estrazione voti...")
        voti = estrai_voti_da_dashboard(dashboard_data)
        debug_log(f"✅ {len(voti)} voti estratti")
        
        debug_log("📢 Estrazione promemoria...")
        memo = extract_promemoria(dashboard_data)
        debug_log(f"✅ {len(memo)} promemoria estratti")
        
        debug_log("📚 Scarico Compiti...")
        compiti = extract_homework_robust(argo)
        debug_log(f"✅ {len(compiti)} compiti estratti")

        # Token per sessione (CRITICI PER FRONTEND)
        headers = argo._ArgoFamiglia__headers
        
        response_data = {
            "success": True,
            "multi_profile": False,
            "session": {
                "schoolCode": school,
                "authToken": headers.get('x-auth-token', ''),
                "accessToken": headers.get('Authorization', '').replace("Bearer ", ""),
                "userName": user
            },
            "student": {
                "name": current_profile['name'] if current_profile else user, 
                "school": current_profile['school'] if current_profile else school,
                "class": current_profile['classe'] if current_profile else "N/D"
            },
            "tasks": compiti,
            "voti": voti,
            "promemoria": memo
        }
        
        debug_log("✅ LOGIN-V2 COMPLETATO", {
            "student": response_data["student"]["name"],
            "voti_count": len(voti),
            "tasks_count": len(compiti),
            "promemoria_count": len(memo)
        })
        
        return jsonify(response_data), 200

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        debug_log("❌ ERRORE LOGIN V2", error_details)
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/login', methods=['POST'])
def login_legacy():
    return login_v2()

@app.route('/sync', methods=['POST'])
def sync_data():
    data = request.json
    school = data.get('schoolCode')
    stored_user = data.get('storedUser')
    stored_pass = data.get('storedPass')
    
    try:
        import base64, urllib.parse
        def decode(s):
            try: return urllib.parse.unquote(base64.b64decode(s).decode('utf-8'))
            except: return s
        user, pwd = decode(stored_user), decode(stored_pass)
        
        argo = argofamiglia.ArgoFamiglia(school, user, pwd)
        # Il sync lavora sul profilo di default (o potremmo salvarlo nella sessione)
        # Per ora manteniamo la logica base di sync
        dashboard_data = argo.dashboard()
        voti = estrai_voti_da_dashboard(dashboard_data)
        memo = extract_promemoria(dashboard_data)
        compiti = extract_homework_robust(argo)
        
        return jsonify({
            "success": True,
            "tasks": compiti,
            "voti": voti,
            "promemoria": memo,
            "new_tokens": {
                "authToken": argo._ArgoFamiglia__headers.get('x-auth-token', ''),
                "accessToken": argo._ArgoFamiglia__headers.get('Authorization', '').replace("Bearer ", "")
            }
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 401

@app.route('/health')
def health(): 
    return jsonify({"status": "ok", "version": "MULTI_PROFILE_FIXED_DATE"}), 200

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5002))
    app.run(host='0.0.0.0', port=port)
