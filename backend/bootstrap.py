import os
import logging
from datetime import datetime, timezone
from pymongo import MongoClient

logger = logging.getLogger("gama.bootstrap")


def ensure_initial_admin():
    username = os.getenv("GAMA_INITIAL_ADMIN_USER", "alan_teixeira").strip().lower()
    secret = os.getenv("GAMA_INITIAL_ADMIN_SECRET")
    mongo_url = os.getenv("MONGO_URL")
    db_name = os.getenv("DB_NAME")

    if not secret or not mongo_url or not db_name:
        logger.info("Initial admin bootstrap skipped: required variables are not configured.")
        return

    client = None
    try:
        from auth import hash_password

        client = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
        db = client[db_name]
        now = datetime.now(timezone.utc).isoformat()
        existing = db.users.find_one({"username": username})

        data = {
            "username": username,
            "password_hash": hash_password(secret),
            "nome": "Administrador do Sistema",
            "funcao": "Administrador do Sistema",
            "role": "system_admin",
            "company_id": None,
            "validated": True,
            "must_change_password": False,
            "permissions": {},
            "active": True,
            "updated_at": now,
        }

        if existing:
            db.users.update_one({"_id": existing["_id"]}, {"$set": data})
            logger.info("Initial system administrator synchronized: %s", username)
        else:
            data["created_at"] = now
            db.users.insert_one(data)
            logger.info("Initial system administrator created: %s", username)
    except Exception:
        logger.exception("Initial system administrator bootstrap failed")
    finally:
        if client is not None:
            client.close()


ensure_initial_admin()
