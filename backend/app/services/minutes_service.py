# backend/services/minutes_service.py
# Central service for all minute deduction logic.
# Called by the telephony webhook after every call ends.

from firebase_admin import firestore
from firebase_admin_init import get_db
from datetime import datetime, timezone
import math


def deduct_minutes(uid: str, duration_seconds: int) -> dict:
    """
    Deducts platform usage minutes for a completed call.
    Minutes are calculated as ceil(duration_seconds / 60).
    Atomic Firestore transaction ensures no race conditions.

    Returns updated plan snapshot.
    """
    minutes_used = math.ceil(duration_seconds / 60)
    if minutes_used <= 0:
        minutes_used = 1  # minimum 1 minute per call

    db  = get_db()
    ref = db.collection("user_plans").document(uid)

    @firestore.transactional
    def _run(transaction, ref):
        snap = ref.get(transaction=transaction)
        if not snap.exists:
            return None

        plan = snap.to_dict()
        if plan.get("status") != "active":
            return plan  # already expired — don't deduct, just return

        current_remaining = plan.get("minutes_remaining", 0)
        current_used      = plan.get("minutes_used", 0)

        new_used      = current_used + minutes_used
        new_remaining = max(0, current_remaining - minutes_used)

        updates = {
            "minutes_used":      new_used,
            "minutes_remaining": new_remaining,
        }

        # If minutes exhausted, mark plan as expired
        if new_remaining <= 0:
            updates["status"] = "expired"

        transaction.update(ref, updates)
        plan.update(updates)
        return plan

    transaction = db.transaction()
    return _run(transaction, ref)


def add_minutes(uid: str, minutes: int, label: str = "extra") -> dict:
    """
    Adds minutes to a user's plan (used after successful payment).
    Works for both new plan activation and extra minute packs.
    """
    db  = get_db()
    ref = db.collection("user_plans").document(uid)

    @firestore.transactional
    def _run(transaction, ref):
        snap = ref.get(transaction=transaction)
        plan = snap.to_dict() if snap.exists else {}

        current_remaining  = plan.get("minutes_remaining", 0)
        current_extra      = plan.get("extra_minutes", 0)

        new_remaining = current_remaining + minutes
        new_extra     = current_extra + minutes if label == "extra" else current_extra

        updates = {
            "minutes_remaining": new_remaining,
            "extra_minutes":     new_extra,
        }
        transaction.update(ref, updates)
        plan.update(updates)
        return plan

    transaction = db.transaction()
    return _run(transaction, ref)


def activate_plan(uid: str, plan_id: str, minutes_per_month: int, months: int) -> dict:
    """
    Activates a new plan after successful payment.
    Resets minutes_used to 0, sets total + remaining.
    """
    db  = get_db()
    ref = db.collection("user_plans").document(uid)

    total_minutes = minutes_per_month  # per billing period (monthly resets monthly, annual gets 3000 per month but tracked total)
    # For annual plan: user gets 3000/month — we track the full period total
    if plan_id == "annual":
        total_minutes = minutes_per_month * months  # 3000 * 12 = 36000

    now     = datetime.now(timezone.utc)
    from dateutil.relativedelta import relativedelta
    expires = now + relativedelta(months=months)

    plan_data = {
        "status":            "active",
        "plan_id":           plan_id,
        "minutes_total":     total_minutes,
        "minutes_used":      0,
        "minutes_remaining": total_minutes,
        "extra_minutes":     0,
        "activated_at":      now.isoformat(),
        "expires_at":        expires.isoformat(),
    }

    ref.set(plan_data, merge=False)

    # Record payment history
    db.collection("payment_history").add({
        "uid":        uid,
        "plan_id":    plan_id,
        "minutes":    total_minutes,
        "type":       "plan_activation",
        "created_at": firestore.SERVER_TIMESTAMP,
    })

    return plan_data