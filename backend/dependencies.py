# backend/dependencies.py
# Replaces old JWT dependency. All routes use get_current_user.

from fastapi import HTTPException, Header
from firebase_admin import auth as fb_auth
from firebase_admin_init import get_db


async def get_current_user(authorization: str = Header(...)) -> dict:
    """
    Verifies Firebase ID token on every protected request.
    Returns the Firestore user doc merged with decoded token claims.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization[7:]
    try:
        decoded = fb_auth.verify_id_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired Firebase token")

    uid = decoded["uid"]
    db  = get_db()
    doc = db.collection("users").document(uid).get()

    if not doc.exists:
        raise HTTPException(status_code=401, detail="User not found. Please sync again.")

    user = doc.to_dict()
    user["uid"] = uid
    return user


async def require_active_plan(current_user: dict = None):
    """
    Dependency for routes that require an active subscription.
    Raises 403 with a specific code if plan is expired/missing.
    """
    if current_user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    uid = current_user["uid"]
    db  = get_db()
    plan_doc = db.collection("user_plans").document(uid).get()

    if not plan_doc.exists:
        raise HTTPException(status_code=403, detail="NO_PLAN")

    plan = plan_doc.to_dict()
    if plan.get("status") != "active":
        raise HTTPException(status_code=403, detail="PLAN_EXPIRED")

    if plan.get("minutes_remaining", 0) <= 0:
        raise HTTPException(status_code=403, detail="NO_MINUTES")

    return plan