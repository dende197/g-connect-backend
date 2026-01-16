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
    Estrae i voti in modo sicuro dalla dashboard.
    NON chiama metodi inesistenti come voti() o bacheca().
    """
    grades = []
    try:
        if not dashboard_data or 'data' not in dashboard_data:
            print("⚠️ Dashboard vuota o senza 'data'")
            return grades
            
        dati = dashboard_data.get('data', {}).get('dati', [])
        if not dati:
            print("⚠️ Nessun 'dati' nella dashboard")
            # Debug: mostra chiavi disponibili
            print(f"📋 Chiavi dashboard: {list(dashboard_data.keys())}")
            data_content = dashboard_data.get('data', {})
            if data_content:
                print(f"📋 Chiavi in data: {list(data_content.keys())}")
            return grades
        
        main_data = dati[0] if dati else {}
        
        # ⭐ DEBUG DETTAGLIATO: stampa tutte le chiavi disponibili
        print(f"🔍 Chiavi disponibili in main_data: {list(main_data.keys())}")
        
        # Cerca voti in tutte le possibili posizioni
        possible_voti_keys = ['votiGiornalieri', 'votiPeriodici', 'voti', 'valutazioni', 
                              'Voti', 'VotiGiornalieri', 'valutazioniGiornaliere']
        
        for key in possible_voti_keys:
            if key in main_data and main_data[key]:
                print(f"✅ Trovata chiave voti: '{key}' con {len(main_data[key])} elementi")
                if isinstance(main_data[key], list) and len(main_data[key]) > 0:
                    # Stampa il primo elemento per debug
                    print(f"🔍 Esempio primo voto: {main_data[key][0]}")
        
        # Cerca voti giornalieri
        voti_giornalieri = main_data.get('votiGiornalieri', [])
        if voti_giornalieri:
            print(f"✅ Estraendo {len(voti_giornalieri)} voti giornalieri")
            for v in voti_giornalieri:
                # Log del singolo voto per debug
                voto_val = v.get('codVoto', v.get('voto', v.get('codCodice', '')))
                print(f"  📊 Voto: {v.get('desMateria', '?')} = {voto_val}")
                grades.append({
                    "materia": v.get('desMateria', 'N/D'),
                    "valore": voto_val,
                    "voto": voto_val,  # Campo aggiuntivo per compatibilità
                    "data": v.get('datGiorno', ''),
                    "tipo": v.get('desVoto', v.get('desProva', 'N/D')),
                    "peso": v.get('numPeso', '100'),
                    "commento": v.get('desCommento', ''),
                    # Compatibilità frontend
                    "subject": v.get('desMateria', 'N/D'),
                    "value": voto_val,
                    "date": v.get('datGiorno', '')
                })
        
        # Cerca anche voti periodici
        voti_periodici = main_data.get('votiPeriodici', [])
        if voti_periodici:
            print(f"✅ Estraendo {len(voti_periodici)} voti periodici")
            for v in voti_periodici:
                voto_val = v.get('codVoto', v.get('voto', v.get('codCodice', '')))
                grades.append({
                    "materia": v.get('desMateria', 'N/D'),
                    "valore": voto_val,
                    "voto": voto_val,
                    "data": v.get('datGiorno', ''),
                    "tipo": v.get('desVoto', 'Periodico'),
                    "peso": v.get('numPeso', '100'),
                    "commento": v.get('desCommento', ''),
                    "subject": v.get('desMateria', 'N/D'),
                    "value": voto_val,
                    "date": v.get('datGiorno', '')
                })
                
        if not grades:
            print(f"⚠️ Nessun voto trovato dopo la ricerca.")
            # Stampa TUTTE le chiavi per debug approfondito
            for key, val in main_data.items():
                if isinstance(val, list):
                    print(f"  📋 {key}: lista con {len(val)} elementi")
                elif isinstance(val, dict):
                    print(f"  📋 {key}: dict con chiavi {list(val.keys())[:5]}...")
                else:
                    print(f"  📋 {key}: {type(val).__name__}")
            
    except Exception as e:
        print(f"⚠️ Errore estrazione voti (non bloccante): {e}")
    
    return grades


def extract_announcements_from_dashboard(dashboard_data):
    """
    Estrae annunci/bacheca dalla dashboard in modo sicuro.
    """
    announcements = []
    try:
        if not dashboard_data or 'data' not in dashboard_data:
            return announcements
            
        dati = dashboard_data.get('data', {}).get('dati', [])
        if not dati:
            return announcements
        
        main_data = dati[0] if dati else {}
        
        # Controlla bacheca alunno
        bacheca = main_data.get('bachecaAlunno', [])
        if bacheca:
            print(f"✅ Trovati {len(bacheca)} messaggi in bacheca")
            for b in bacheca:
                announcements.append({
                    "oggetto": b.get('desOggetto', ''),
                    "testo": b.get('desMessaggio', ''),
                    "autore": b.get('desMittente', ''),
                    "data": b.get('datGiorno', ''),
                    "url": b.get('urlAllegato', ''),
                    "title": b.get('desOggetto', ''),
                    "date": b.get('datGiorno', '')
                })
        
        # Controlla promemoria
        promemoria = main_data.get('promemoria', [])
        if promemoria:
            print(f"✅ Trovati {len(promemoria)} promemoria")
            for p in promemoria:
                announcements.append({
                    "oggetto": p.get('desAnnotazioni', '') or p.get('titolo', ''),
                    "testo": p.get('desAnnotazioni', ''),
                    "autore": p.get('desMittente', 'Scuola'),
                    "data": p.get('datGiorno', ''),
                    "url": '',
                    "title": p.get('desAnnotazioni', ''),
                    "date": p.get('datGiorno', '')
                })
                
    except Exception as e:
        print(f"⚠️ Errore estrazione annunci (non bloccante): {e}")
    
    return announcements


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
        announcements_data = extract_announcements_from_dashboard(dashboard_data)

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
