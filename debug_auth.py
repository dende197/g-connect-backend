import requests
import secrets
import re
import base64
from hashlib import sha256
import json

# Constants
CHALLENGE_URL = "https://auth.portaleargo.it/oauth2/auth"
LOGIN_URL = "https://www.portaleargo.it/auth/sso/login"
TOKEN_URL = "https://auth.portaleargo.it/oauth2/token"
REDIRECT_URI = "it.argosoft.didup.famiglia.new://login-callback"
CLIENT_ID = "72fd6dea-d0ab-4bb9-8eaa-3ac24c84886c"
ENDPOINT = "https://www.portaleargo.it/appfamiglia/api/rest/"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36"

def debug_login(school, username, password):
    print(f"🔹 Starting Debug Login for {username} @ {school}")
    
    try:
        # 1. Challenge
        print("1️⃣ Requesting Challenge...")
        CODE_VERIFIER = secrets.token_hex(64)
        CODE_CHALLENGE = base64.urlsafe_b64encode(sha256(CODE_VERIFIER.encode()).digest()).decode().replace("=", "")
        
        session = requests.Session()
        # Headers mimicking a browser might help, though library doesn't strictly set them for auth flow
        session.headers.update({"User-Agent": USER_AGENT})

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
        print(f"   Challenge URL: {req.url[:100]}...")
        
        challenge_match = re.search(r"login_challenge=([0-9a-f]+)", req.url)
        if not challenge_match:
            print("❌ Challenge NOT found in URL")
            print("   Full URL:", req.url)
            return
        
        login_challenge = challenge_match.group(1)
        print(f"   Challenge ID: {login_challenge}")
        
        # 2. Login POST
        print("2️⃣ Posting Credentials...")
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
        print(f"   Status: {req.status_code}")
        print(f"   Headers: {dict(req.headers)}")
        
        if "Location" not in req.headers:
            print("❌ 'Location' header missing. Login failed.")
            print("   Response Body Preview:", req.text[:500])
            return

        # 3. Follow Redirects
        print("3️⃣ Following Redirects...")
        location = req.headers["Location"]
        while True:
            print(f"   Redirecting to: {location[:50]}...")
            if "code=" in location:
                break
            req = session.get(location, allow_redirects=False)
            if "Location" not in req.headers:
                print("❌ Redirect chain broken")
                return
            location = req.headers["Location"]
            
        code_match = re.search(r"code=([0-9a-zA-Z-_.]+)", location)
        if not code_match:
             print("❌ Auth Code NOT found")
             return
        code = code_match.group(1)
        print(f"   Auth Code: {code[:20]}...")

        # 4. Token Exchange
        print("4️⃣ Exchanging Token...")
        token_req_data = {
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": REDIRECT_URI,
            "code_verifier": CODE_VERIFIER,
            "client_id": CLIENT_ID
        }
        
        token_resp = session.post(TOKEN_URL, data=token_req_data)
        if token_resp.status_code != 200:
            print(f"❌ Token Exchange Failed: {token_resp.status_code}")
            print(token_resp.text)
            return
            
        tokens = token_resp.json()
        access_token = tokens.get("access_token")
        print(f"   Access Token obtained: {access_token[:20]}...")
        
        # 5. Argo Login (Get Profiles)
        print("5️⃣ Calling Argo Login API...")
        login_headers = {
            "User-Agent": USER_AGENT,
            "Content-Type": "Application/json",
            "Authorization": "Bearer " + access_token,
            "Accept": "Application/json",
        }
        
        payload = {
            "clientID": secrets.token_urlsafe(64),
            "lista-x-auth-token": "[]",
            "x-auth-token-corrente": "null",
            "lista-opzioni-notifiche": "{}"
        }
        
        argo_resp = requests.post(ENDPOINT + "login", headers=login_headers, json=payload)
        data = argo_resp.json()
        
        if "data" in data:
            profiles = data["data"]
            print(f"✅ SUCCESS! Found {len(profiles)} profiles.")
            for p in profiles:
                # Mask token for security in logs
                limit_token = p.get('token', '')[:10] + "..."
                print(f"   - {p.get('alunno', {}).get('desNome')} (Token: {limit_token})")
        else:
            print("❌ No data in Argo response")
            print(data)

    except Exception as e:
        print(f"❌ EXCEPTION: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    # Placeholder for user to fill or I will mock if I can't ask
    # But I can't ask credentials. I will rely on the user running this or me running it if I had creds (I don't).
    # Since I cannot get credentials, I will inspect the code again. 
    # WAIT, I can import the logic to server.py and expose a debug endpoint that calls THIS logic with the creds sent by the frontend.
    print("This script is a template. Run via server debug endpoint.")
