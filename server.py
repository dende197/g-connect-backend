from flask import Flask, request, jsonify
from flask_cors import CORS
import argofamiglia
import uuid
import os

app = Flask(__name__)

# CORS configuration
CORS(app, origins=[
    "https://*.netlify.app",
    "http://127.0.0.1:*",
    "http://localhost:*",
    "*"  # Allow all for debugging
])

# ============= HELPER FUNCTIONS =============

def extract_grades_from_dashboard(dashboard_data):
    grades = []
    try:
        if not dashboard_data:
            print("⚠️ Dashboard completamente vuota")
            return grades
        
        # --- INVESTIGAZIONE ---
        data_content = dashboard_data.get('data', {})
        dati_list = data_content.get('dati', [])
        
        if not dati_list:
            # Se dati_list è vuoto, stampiamo le chiavi di 'data' per capire la struttura
            print(f"🔍 DEBUG: Chiavi in 'data': {list(data_content.keys())}")
            # Fallback per casi in cui 'dati' è direttamente in dashboard_data
            if 'dati' in dashboard_data:
                 dati_list = dashboard_data.get('dati', [])
                 print(f"🔍 DEBUG: Trovato 'dati' nella radice: {len(dati_list)} elementi")
            else:
                 return grades

        main_data = dati_list[0] if dati_list else {}
        if main_data:
            print(f"🔍 DEBUG: Chiavi trovate in 'dati[0]': {list(main_data.keys())}")
        
        # Proviamo tutte le varianti conosciute
        voti_keys = ['votiGiornalieri', 'votiPeriodici', 'votiScrutinio', 'voti_giornalieri']
        
        for key in voti_keys:
            voti_raw = main_data.get(key, [])
            if voti_raw:
                print(f"✅ Trovati voti nella chiave: {key} (Totale: {len(voti_raw)})")
                for v in voti_raw:
                    valore = v.get('codVoto') or v.get('voto')
                    materia = v.get('desMateria', 'N/D')
                    
                    grades.append({
                        "materia": materia,
                        "valore": valore,
                        "data": v.get('datGiorno') or v.get('data'),
                        "tipo": v.get('desVoto', 'N/D'),
                        # Campi extra per compatibilità frontend esistente
                        "subject": materia,
                        "value": valore,
                        "voto": valore,
                        "date": v.get('datGiorno', ''),
                        "peso": v.get('numPeso', '100') 
                    })
        
    except Exception as e:
        print(f"❌ Errore critico estrazione: {e}")
        import traceback
        traceback.print_exc()
    
    return grades

def extract_promemoria(dashboard_data):
    """
    Estrae promemoria e avvisi dalla bacheca.
    """
    promemoria = []
    try:
        # Logica di navigazione simile a extract_grades
        data_obj = dashboard_data.get('data', {})
        dati_list = data_obj.get('dati', []) if isinstance(data_obj, dict) else []
        
        if not dati_list and 'dati' in dashboard_data:
            dati_list = dashboard_data.get('dati', [])

        for blocco in dati_list:
            # Cerca in bachecaAlunno E promemoria
            items = blocco.get('bachecaAlunno', []) + blocco.get('promemoria', [])
            
            for i in items:
                promemoria.append({
                    "titolo": i.get('desOggetto') or i.get('titolo', 'Avviso'),
                    "testo": i.get('desMessaggio') or i.get('testo') or i.get('desAnnotazioni', ''),
                    "autore": i.get('desMittente', 'Scuola'),
                    "data": i.get('datGiorno') or i.get('data', ''),
                    "url": i.get('urlAllegato', ''),
                    # Alias per compatibilità
                    "oggetto": i.get('desOggetto') or i.get('titolo', 'Avviso'),
                    "date": i.get('datGiorno', '')
                })
    except Exception as e:
         print(f"⚠️ Errore estrazione promemoria: {e}")
         
    return promemoria


def extract_homework_safe(argo_instance):
    """
    Recupera i compiti usando getCompitiByDate().
    Se fallisce, restituisce lista vuota invece di crashare.
    Formato output: {'2025-01-22': {'compiti': [...], 'materie': [...]}}
    """
    tasks_data = []
    try:
        print("📚 Chiamata getCompitiByDate()...")
        raw_homework = argo_instance.getCompitiByDate()
        print(f"📥 Ricevuti dati compiti, tipo: {type(raw_homework)}")
        
        if isinstance(raw_homework, dict):
            print(f"📅 Trovate {len(raw_homework)} date con compiti")
            for date_str, details in raw_homework.items():
                compiti_list = details.get('compiti', [])
                materie_list = details.get('materie', [])
                
                for i, desc in enumerate(compiti_list):
                    mat = materie_list[i] if i < len(materie_list) else "Generico"
                    tasks_data.append({
                        "id": str(uuid.uuid4())[:12],
                        "text": desc,
                        "subject": mat,
                        "due_date": date_str,  # Questa è la scadenza reale
                        "datCompito": date_str,
                        "datGiorno": date_str,
                        "materia": mat,
                        "done": False
                    })
                    
        elif isinstance(raw_homework, list):
            # Fallback per formato lista
            print(f"📋 Formato lista: {len(raw_homework)} compiti")
            for t in raw_homework:
                tasks_data.append({
                    "id": str(uuid.uuid4())[:12],
                    "text": t.get('desCompito', '') or t.get('compito', ''),
                    "subject": t.get('desMateria', '') or t.get('materia', 'Generico'),
                    "due_date": t.get('datCompito', '') or t.get('dataConsegna', ''),
                    "datCompito": t.get('datCompito', ''),
                    "done": False
                })
        else:
            print(f"⚠️ Formato compiti non riconosciuto: {type(raw_homework)}")

    except Exception as e:
        print(f"⚠️ Errore recupero compiti: {e}")
        import traceback
        traceback.print_exc()
    
    print(f"✅ Totale compiti estratti: {len(tasks_data)}")
    return tasks_data


# ============= ROUTES =============

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
        return jsonify({"success": False, "error": "Dati mancanti"}), 400

    try:
        print(f"🔐 Login attempt: {username}@{school_code}")
        
        # 1. Login con la libreria argofamiglia
        argo = argofamiglia.ArgoFamiglia(school_code, username, password)
        print("✅ Autenticazione riuscita")
        
        # 2. Estrai token per sessioni future
        headers = argo._ArgoFamiglia__headers
        auth_token = headers.get('x-auth-token', '')
        access_token = headers.get('Authorization', '').replace("Bearer ", "")
        print(f"🔑 Token estratti: auth={auth_token[:20] if auth_token else 'N/A'}...")

        # 3. Recupera compiti (PRIORITÀ: questo è per il calendario)
        tasks_data = extract_homework_safe(argo)
        
        # 4. Recupera dashboard per voti e annunci
        print("📊 Recupero dashboard...")
        try:
            dashboard_data = argo.dashboard()
            print("✅ Dashboard recuperata")
        except Exception as e:
            print(f"⚠️ Errore dashboard (non bloccante): {e}")
            dashboard_data = {}

        # 5. Estrai voti e annunci dalla dashboard (non da metodi inesistenti!)
        grades_data = extract_grades_from_dashboard(dashboard_data)
        announcements_data = extract_promemoria(dashboard_data)

        print(f"✅ Login completato! Tasks: {len(tasks_data)}, Voti: {len(grades_data)}, Annunci: {len(announcements_data)}")

        return jsonify({
            "success": True,
            "session": {
                "schoolCode": school_code,
                "authToken": auth_token,
                "accessToken": access_token,
                "userName": username
            },
            "student": {"name": username, "class": "DidUP", "school": school_code},
            "tasks": tasks_data,
            "voti": grades_data,
            "promemoria": announcements_data
        }), 200

    except Exception as e:
        import traceback
        print(f"❌ Login failed: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 401


@app.route('/sync', methods=['POST'])
def sync_data():
    """
    Sync usando credenziali salvate.
    Per semplicità, richiede sempre un re-login completo.
    """
    data = request.json
    school = data.get('schoolCode')
    stored_user = data.get('storedUser')
    stored_pass = data.get('storedPass')
    
    try:
        print(f"🔄 Sync request for school {school}...")
        
        if not all([school, stored_user, stored_pass]):
            return jsonify({"success": False, "error": "Credenziali mancanti per sync"}), 401
        
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
        
        print(f"🔐 Re-login per sync: {user}")
        
        # Login completo
        argo = argofamiglia.ArgoFamiglia(school, user, pass_)
        
        # Recupera dati
        tasks_data = extract_homework_safe(argo)
        
        try:
            dashboard_data = argo.dashboard()
        except:
            dashboard_data = {}
            
        grades_data = extract_grades_from_dashboard(dashboard_data)
        announcements_data = extract_announcements_from_dashboard(dashboard_data)
        
        # Nuovi token
        headers = argo._ArgoFamiglia__headers
        new_auth_token = headers.get('x-auth-token', '')
        new_access_token = headers.get('Authorization', '').replace("Bearer ", "")
        
        print(f"✅ Sync completato! Tasks: {len(tasks_data)}")
        
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
        print(f"❌ Sync failed: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 401


@app.route('/')
def index():
    return "G-Connect Server running. Open the frontend app."


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5002))
    print(f"🚀 G-Connect Server running on port {port}")
    app.run(host='0.0.0.0', port=port, debug=True)
