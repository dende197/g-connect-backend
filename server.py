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
    """
    Estrae i voti dalla struttura nidificata di Argo con ricerca approfondita.
    """
    grades = []
    try:
        if not dashboard_data:
            return grades
        
        # Debug: stampiamo le chiavi principali per vederle nei log di Render
        print(f"🔍 DEBUG Dashboard Keys: {list(dashboard_data.keys())}")
        
        # Cerchiamo la lista 'dati' ovunque sia
        data_obj = dashboard_data.get('data', {})
        # Gestisce sia se 'data' è un dict sia se è direttamente la lista (casi rari)
        dati_list = data_obj.get('dati', []) if isinstance(data_obj, dict) else []
        
        # Fallback: se 'dati' è al primo livello
        if not dati_list and 'dati' in dashboard_data:
            dati_list = dashboard_data.get('dati', [])

        if not dati_list:
            print("⚠️ Nessuna lista 'dati' trovata nella dashboard")
            return grades

        # Itera su tutti i blocchi dati (di solito c'è solo un elemento per studente, ma meglio essere sicuri)
        for blocco in dati_list:
            # 1. Prova a cercare i voti giornalieri
            voti_g = blocco.get('votiGiornalieri', [])
            # 2. Prova a cercare i voti periodici (scrutinio)
            voti_p = blocco.get('votiPeriodici', [])
            
            # Unisci entrambe le liste
            tutti_i_voti = voti_g + voti_p
            
            if tutti_i_voti:
                print(f"✅ Trovati {len(tutti_i_voti)} voti in questo blocco dati")

            for v in tutti_i_voti:
                try:
                    # Estrazione sicura dei campi
                    valore = v.get('codVoto') or v.get('voto') or v.get('codCodice', '')
                    materia = v.get('desMateria', 'N/D')
                    data_voto = v.get('datGiorno') or v.get('data', '')
                    
                    grades.append({
                        "materia": materia,
                        "valore": valore,
                        "voto": valore, # Alias
                        "data": data_voto,
                        "date": data_voto, # Alias
                        "tipo": v.get('desVoto', 'N/D'),
                        "peso": v.get('numPeso', '100'),
                        "commento": v.get('desCommento', ''),
                        # Campi extra per compatibilità frontend
                        "subject": materia,
                        "value": valore
                    })
                except Exception as e:
                    print(f"⚠️ Errore parsing singolo voto: {e}")
        
        print(f"📊 Voti estratti totali: {len(grades)}")
    except Exception as e:
        print(f"❌ Errore estrazione voti: {e}")
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
