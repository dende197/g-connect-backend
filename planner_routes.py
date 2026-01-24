import os
import requests
from datetime import datetime, timezone
from flask import request, jsonify, Flask

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def sb_headers():
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

def sb_table_url(table: str):
    return f"{SUPABASE_URL}/rest/v1/{table}"

def register_planner_routes(app: Flask):

    @app.get("/api/planner/<path:user_id>")
    def get_planner(user_id):
        url = sb_table_url("planners")
        params = {
            "select": "user_id,planned_tasks,stress_levels,updated_at",
            "user_id": f"eq.{user_id}",
        }
        r = requests.get(url, headers=sb_headers(), params=params)
        rows = r.json() or []

        if not rows:
            return jsonify({"success": True, "data": {
                "userId": user_id,
                "plannedTasks": {},
                "stressLevels": {},
                "updatedAt": None
            }})

        row = rows[0]
        return jsonify({"success": True, "data": {
            "userId": row["user_id"],
            "plannedTasks": row["planned_tasks"] or {},
            "stressLevels": row["stress_levels"] or {},
            "updatedAt": row["updated_at"]
        }})

    @app.put("/api/planner/<path:user_id>")
    def put_planner(user_id):
        body = request.get_json()
        payload = {
            "user_id": user_id,
            "planned_tasks": body.get("plannedTasks", {}),
            "stress_levels": body.get("stressLevels", {}),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        url = sb_table_url("planners")
        headers = sb_headers()
        headers["Prefer"] = "resolution=merge-duplicates,return=representation"

        r = requests.post(url, headers=headers, json=payload)
        return jsonify({"success": True})
