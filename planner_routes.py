import os
import requests
from datetime import datetime, timezone
from flask import request, jsonify, Flask

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def sb_headers():
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars")
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

def sb_table_url(table: str):
    return f"{SUPABASE_URL}/rest/v1/{table}"

from urllib.parse import unquote

def register_planner_routes(app: Flask):

    @app.route("/api/planner/<path:user_id>", methods=["GET", "PUT", "OPTIONS"])
    def planner_manager(user_id):
        if request.method == "OPTIONS":
            return jsonify({"success": True}), 200
            
        user_id = unquote(user_id)
        
        # =========================
        # GET → carica planner
        # =========================
        if request.method == "GET":
            try:
                url = sb_table_url("planner")
                params = {
                    "select": "user_id,planned_tasks,stress_levels,planned_details,updated_at",
                    "user_id": f"eq.{user_id}",
                    "order": "updated_at.desc",
                    "limit": "1"
                }
                r = requests.get(url, headers=sb_headers(), params=params, timeout=15)
                if not r.ok:
                    return jsonify({"success": False, "error": r.text}), r.status_code

                rows = r.json() or []
                if not rows:
                    return jsonify({
                        "success": True,
                        "data": {
                            "userId": user_id,
                            "plannedTasks": {},
                            "stressLevels": {},
                            "plannedDetails": {},
                            "updatedAt": None
                        }
                    })

                row = rows[0]
                return jsonify({
                    "success": True,
                    "data": {
                        "userId": row.get("user_id"),
                        "plannedTasks": row.get("planned_tasks") or {},
                        "stressLevels": row.get("stress_levels") or {},
                        "plannedDetails": row.get("planned_details") or {},
                        "updatedAt": row.get("updated_at"),
                    }
                })
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500

        # =========================
        # PUT → salva planner
        # =========================
        if request.method == "PUT":
            try:
                body = request.get_json(force=True) or {}
                planned_tasks = body.get("plannedTasks", {}) or {}
                stress_levels = body.get("stressLevels", {}) or {}
                planned_details = body.get("plannedDetails", {}) or {}

                payload = {
                    "user_id": user_id,
                    "planned_tasks": planned_tasks,
                    "stress_levels": stress_levels,
                    "planned_details": planned_details,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }

                url = f"{sb_table_url('planner')}?on_conflict=user_id"
                headers = sb_headers()
                headers["Prefer"] = "resolution=merge-duplicates,return=representation"

                r = requests.post(url, headers=headers, json=payload, timeout=15)
                if not r.ok:
                    return jsonify({"success": False, "error": r.text}), r.status_code

                rows = r.json() or []
                row = rows[0] if rows else payload

                return jsonify({
                    "success": True,
                    "data": {
                        "userId": row.get("user_id", user_id),
                        "plannedTasks": row.get("planned_tasks", planned_tasks),
                        "stressLevels": row.get("stress_levels", stress_levels),
                        "plannedDetails": row.get("planned_details", planned_details),
                        "updatedAt": row.get("updated_at"),
                    }
                })
            except Exception as e:
                return jsonify({"success": False, "error": str(e)}), 500
