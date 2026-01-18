from flask import request, jsonify
import argofamiglia
import requests
import os

# --- PUNTO CRUCIALE: Importiamo il tuo vecchio server ---
# Questo carica tutte le funzioni che già funzionano senza toccare il file originale
from server import app, extract_homework_robust, estrai_voti_da_dashboard, extract_promemoria, debug_log

# --- NUOVE FUNZIONI AGGIUNTIVE ---

def get_available_students(argo_instance):
    """Scarica la lista dei figli (Schede)"""
    try:
        debug_log("📥 Recupero profili studenti...")
        # Endpoint per ottenere le schede dei figli
        url = "https://www.portaleargo.it/famiglia/api/rest/schede"
        headers = argo_instance._ArgoFamiglia__headers
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            schede = response.json()
            debug_log(f"✅ Ricevute {len(schede)} schede", schede)
            profiles = []
            for idx, s in enumerate(schede):
                nome_completo = s.get('alunno', {}).get('desNome', 'Sconosciuto') + " " + s.get('alunno', {}).get('desCognome', '')
                profiles.append({
                    "id": idx, 
                    "prgAlunno": s.get('prgAlunno'),
                    "prgScheda": s.get('prgScheda'),
                    "name": nome_completo.strip(),
                    "nome": s.get('alunno', {}).get('desNome', 'Sconosciuto'),
                    "cognome": s.get('alunno', {}).get('desCognome', ''),
                    "classe": s.get('desClasse', ''),
                    "school": s.get('desScuola', ''),
                    "codMin": s.get('codMin', '')
                })
            debug_log(f"✅ {len(profiles)} profili processati")
            return profiles
        else:
            debug_log(f"❌ Errore HTTP {response.status_code} recupero profili")
    except Exception as e:
        debug_log("❌ Errore recupero profili", str(e))
    return []

def switch_student_context(argo_instance, profile_data):
    """Dice ad Argo quale figlio stiamo guardando"""
    try:
        debug_log(f"🔄 Switch al profilo: {profile_data.get('name', 'N/D')}")
        argo_instance._ArgoFamiglia__headers['x-cod-min'] = profile_data['codMin']
        argo_instance._ArgoFamiglia__headers['x-prg-alunno'] = str(profile_data['prgAlunno'])
        argo_instance._ArgoFamiglia__headers['x-prg-scheda'] = str(profile_data['prgScheda'])
        debug_log(f"✅ Cambio profilo su: {profile_data.get('name', profile_data.get('nome', 'N/D'))}")
    except Exception as e:
        debug_log("❌ Errore cambio contesto", str(e))

# --- NUOVA ROTTA DI LOGIN (V2) ---
# Usiamo un nome diverso (/login-v2) così la vecchia (/login) resta intatta
@app.route('/login-v2', methods=['POST'])
def login_v2():
    """
    Gestisce il login con supporto multi-profilo.
    CASO A: Se ci sono più profili e selectedProfileIndex non è fornito => restituisce lista profili
    CASO B: Se selectedProfileIndex è fornito o c'è un solo profilo => restituisce dati completi
    """
    data = request.json
    school_code = data.get('schoolCode')
    username = data.get('username')
    password = data.get('password')
    selected_index = data.get('selectedProfileIndex')  # Indice del figlio cliccato

    debug_log("🚀 LOGIN-V2 REQUEST", {
        "schoolCode": school_code,
        "username": username,
        "hasPassword": bool(password),
        "selectedProfileIndex": selected_index
    })

    if not all([school_code, username, password]):
        debug_log("❌ Dati mancanti nel login")
        return jsonify({"success": False, "error": "Dati mancanti"}), 400

    try:
        # 1. Login Standard
        debug_log("🔐 Autenticazione in corso...")
        argo = argofamiglia.ArgoFamiglia(school_code, username, password)
        debug_log("✅ Autenticazione riuscita")
        
        # 2. Scarica la lista dei figli
        profiles = get_available_students(argo)
        debug_log(f"👥 Profili trovati: {len(profiles)}")
        
        # CASO A: Multi-profilo e nessuna scelta fatta
        if len(profiles) > 1 and selected_index is None:
            debug_log("📋 CASO A: Più profili trovati, richiesta selezione")
            return jsonify({
                "success": True,
                "multi_profile": True,  # Segnale per il frontend
                "profiles": profiles,
                "session_data": {"schoolCode": school_code, "username": username}
            }), 200

        # CASO B: Selezione del profilo (o profilo unico)
        target_profile = None
        
        # Validazione e selezione del profilo
        if selected_index is not None:
            try:
                idx = int(selected_index)
                if 0 <= idx < len(profiles):
                    target_profile = profiles[idx]
                    debug_log(f"✅ Profilo selezionato: {target_profile.get('name', 'N/D')} (index {idx})")
                else:
                    debug_log(f"❌ Indice profilo fuori range: {idx} (totale: {len(profiles)})")
                    return jsonify({"success": False, "error": f"Indice profilo non valido: {idx}"}), 400
            except ValueError:
                debug_log(f"❌ Indice profilo non valido: {selected_index}")
                return jsonify({"success": False, "error": "Indice profilo deve essere un numero"}), 400
        elif len(profiles) > 0:
            target_profile = profiles[0]
            debug_log(f"✅ Profilo unico selezionato automaticamente: {target_profile.get('name', 'N/D')}")
        else:
            debug_log("❌ Nessun profilo disponibile")
            return jsonify({"success": False, "error": "Nessun profilo disponibile"}), 404

        # 3. Applica la scelta del profilo
        if target_profile:
            switch_student_context(argo, target_profile)
        
        # 4. Scarica i dati usando le funzioni del vecchio file
        debug_log("📊 Recupero dashboard...")
        try:
            dboard = argo.dashboard()
            debug_log("✅ Dashboard recuperata")
        except Exception as e:
            debug_log("⚠️ Errore dashboard, uso dati vuoti", str(e))
            dboard = {}
        
        debug_log("🎓 Estrazione voti...")
        grades = estrai_voti_da_dashboard(dboard)
        debug_log(f"✅ {len(grades)} voti estratti")
        
        debug_log("📚 Estrazione compiti...")
        tasks = extract_homework_robust(argo)
        debug_log(f"✅ {len(tasks)} compiti estratti")
        
        debug_log("📢 Estrazione promemoria...")
        memo = extract_promemoria(dboard)
        debug_log(f"✅ {len(memo)} promemoria estratti")

        # 5. Prepara sessione (CRITICI PER FRONTEND)
        headers = argo._ArgoFamiglia__headers
        session_data = {
            "schoolCode": school_code,
            "authToken": headers.get('x-auth-token', ''),
            "accessToken": headers.get('Authorization', '').replace("Bearer ", ""),
            "userName": username
        }

        response_data = {
            "success": True,
            "multi_profile": False,
            "student": {
                "name": target_profile.get('name', target_profile.get('nome', username)),
                "class": target_profile.get('classe', 'N/D'),
                "school": target_profile.get('school', school_code)
            },
            "voti": grades,
            "tasks": tasks,
            "promemoria": memo,
            "session": session_data
        }
        
        debug_log("✅ LOGIN-V2 COMPLETATO", {
            "student": response_data["student"]["name"],
            "voti_count": len(grades),
            "tasks_count": len(tasks),
            "promemoria_count": len(memo)
        })
        
        return jsonify(response_data), 200

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        debug_log("❌ ERRORE LOGIN-V2", error_details)
        return jsonify({"success": False, "error": str(e)}), 500

# Avvio del server esteso
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5002))
    print(f"🚀 SERVER EXTENDED RUNNING ON PORT {port}")
    app.run(host='0.0.0.0', port=port, debug=True)
