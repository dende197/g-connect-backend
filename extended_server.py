from flask import request, jsonify
import argofamiglia
import requests
import os

# --- PUNTO CRUCIALE: Importiamo il tuo vecchio server ---
# Questo carica tutte le funzioni che già funzionano senza toccare il file originale
from server import app, extract_grades_multi_strategy, extract_homework_safe, extract_promemoria, debug_log

# --- NUOVE FUNZIONI AGGIUNTIVE ---

def get_available_students(argo_instance):
    """Scarica la lista dei figli (Schede)"""
    try:
        # Endpoint per ottenere le schede dei figli
        url = "https://www.portaleargo.it/famiglia/api/rest/schede"
        headers = argo_instance._ArgoFamiglia__headers
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            schede = response.json()
            profiles = []
            for idx, s in enumerate(schede):
                nome = s.get('alunno', {}).get('desNome', 'Sconosciuto')
                cognome = s.get('alunno', {}).get('desCognome', '')
                profiles.append({
                    "id": idx, 
                    "prgAlunno": s.get('prgAlunno'),
                    "prgScheda": s.get('prgScheda'),
                    "nome": nome,
                    "cognome": cognome,
                    "name": f"{nome} {cognome}".strip(),  # Combined name for frontend convenience
                    "classe": s.get('desClasse', ''),
                    "scuola": s.get('desScuola', ''),
                    "codMin": s.get('codMin', '')
                })
            return profiles
    except Exception as e:
        debug_log("❌ Errore recupero profili", str(e))
    return []

def switch_student_context(argo_instance, profile_data):
    """Dice ad Argo quale figlio stiamo guardando"""
    try:
        argo_instance._ArgoFamiglia__headers['x-cod-min'] = profile_data['codMin']
        argo_instance._ArgoFamiglia__headers['x-prg-alunno'] = str(profile_data['prgAlunno'])
        argo_instance._ArgoFamiglia__headers['x-prg-scheda'] = str(profile_data['prgScheda'])
        debug_log(f"✅ Cambio profilo su: {profile_data['nome']}")
    except Exception as e:
        debug_log("❌ Errore cambio contesto", str(e))

# --- NUOVA ROTTA DI LOGIN (V2) ---
# Usiamo un nome diverso (/login-v2) così la vecchia (/login) resta intatta
@app.route('/login-v2', methods=['POST'])
def login_v2():
    data = request.json
    school_code = data.get('schoolCode')
    username = data.get('username')
    password = data.get('password')
    selected_index = data.get('selectedProfileIndex') # Indice del figlio cliccato

    if not all([school_code, username, password]):
        return jsonify({"success": False, "error": "Dati mancanti"}), 400

    try:
        # 1. Login Standard
        argo = argofamiglia.ArgoFamiglia(school_code, username, password)
        
        # 2. Scarica la lista dei figli
        profiles = get_available_students(argo)
        
        # CASO A: Multi-profilo e nessuna scelta fatta
        if len(profiles) > 1 and selected_index is None:
            return jsonify({
                "success": True,
                "multi_profile": True, # Segnale per il frontend
                "profiles": profiles,
                "session_data": { "schoolCode": school_code, "username": username }
            }), 200

        # CASO B: Selezione del profilo
        target_profile = profiles[0] # Default
        if selected_index is not None and 0 <= int(selected_index) < len(profiles):
            target_profile = profiles[int(selected_index)]

        # 3. Applica la scelta
        if target_profile:
            switch_student_context(argo, target_profile)
        
        # 4. Scarica i dati usando le funzioni del TUO vecchio file
        grades = extract_grades_multi_strategy(argo)
        tasks = extract_homework_safe(argo)
        try: dboard = argo.dashboard()
        except: dboard = {}
        memo = extract_promemoria(dboard)

        return jsonify({
            "success": True,
            "multi_profile": False,
            "student": {
                "name": target_profile.get('name', target_profile['nome']),
                "class": target_profile['classe'],
                "school": school_code
            },
            "voti": grades,
            "tasks": tasks,
            "promemoria": memo
        }), 200

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 401

# Avvio del server esteso
if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5002))
    print(f"🚀 SERVER EXTENDED RUNNING ON PORT {port}")
    app.run(host='0.0.0.0', port=port, debug=True)
