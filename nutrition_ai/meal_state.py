"""
Meal Logging State Machine — تسمية صريحة لكل حالة تمر بيها الوجبة، بدل if/else مبعثرة.
التخزين نفسه يبقى بنفس شكل User.pending_meal_json (dict بسيط بـJSON) لحالة pending الحالية،
وUser.last_direct_log_json (عبر nutrition_ai/direct_log.py) لحالة DIRECT_LOGGED/UNDO_WINDOW.

الحالات:
  DRAFT                 — وجبة جديدة بدون عناصر محسومة بعد
  AWAITING_CLARIFICATION — فيها عنصر واحد أو أكثر يحتاج توضيح كمية/تخمين قبل أي شي
  AWAITING_CONFIRMATION  — كل العناصر محسومة، بانتظار كلمة تأكيد صريحة من المستخدم
  CONFIRMED              — تحوّلت فعليًا إلى MealLog عبر تأكيد صريح (حالة عابرة، تُسجَّل بـdebug فقط)
  DIRECT_LOGGED          — تحوّلت إلى MealLog مباشرة (رسالة واحدة واضحة تمامًا) — حالة عابرة
  UNDO_WINDOW            — لا pending حاليًا، لكن فيه DIRECT_LOG قابل للتراجع/إعادة الفتح
  UNDONE                 — تراجع لتوّه عن DIRECT_LOG (حالة عابرة)
  COMPLETED              — لا شي معلّق ولا قابل للتراجع (الحالة الافتراضية الهادئة)
  CANCELLED              — أُلغيت وجبة قيد الإنشاء (حالة عابرة)
"""
import json

DRAFT = "DRAFT"
AWAITING_CLARIFICATION = "AWAITING_CLARIFICATION"
AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION"
CONFIRMED = "CONFIRMED"
DIRECT_LOGGED = "DIRECT_LOGGED"
UNDO_WINDOW = "UNDO_WINDOW"
UNDONE = "UNDONE"
COMPLETED = "COMPLETED"
CANCELLED = "CANCELLED"


def new_pending(meal_type: str, raw_text: str) -> dict:
    return {
        "meal_type": meal_type,
        "raw_text": raw_text,
        "items": [],
        "pending_clarifications": [],
        "state": DRAFT,
    }


def current_state(pending: dict) -> str:
    if not pending:
        return COMPLETED
    if pending.get("pending_clarifications"):
        return AWAITING_CLARIFICATION
    if pending.get("items"):
        return AWAITING_CONFIRMATION
    return DRAFT


def load_pending(user) -> dict | None:
    if not user.pending_meal_json:
        return None
    try:
        data = json.loads(user.pending_meal_json)
    except (ValueError, TypeError):
        return None
    data.setdefault("pending_clarifications", [])
    data.setdefault("items", [])
    return data


def save_pending(user, db, pending: dict | None) -> None:
    if pending is not None:
        pending["state"] = current_state(pending)
    user.pending_meal_json = json.dumps(pending, ensure_ascii=False) if pending else None
    db.session.commit()
