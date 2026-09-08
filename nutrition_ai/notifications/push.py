"""
إرسال Web Push فعلي (VAPID) — طبقة رقيقة فوق pywebpush. فشل الإرسال لا يوقف أي شي ثاني
(نفس مبدأ email_service.py)، واشتراك منتهي الصلاحية يُحذف تلقائيًا بدل ما يفشل كل مرة.
"""
import base64
import json
import os

from pywebpush import webpush, WebPushException

from models import db, PushSubscription


def _vapid_private_key_pem() -> str | None:
    b64 = os.environ.get("VAPID_PRIVATE_KEY_PEM_BASE64", "")
    if not b64 or b64.startswith("CHANGE_ME"):
        return None
    return base64.b64decode(b64).decode("utf-8")


def is_configured() -> bool:
    return _vapid_private_key_pem() is not None


def send_push(subscription: PushSubscription, title: str, body: str, url: str, category: str,
              notification_id: str | None = None) -> bool:
    """يرجّع True لو الإرسال نجح. يحذف الاشتراك تلقائيًا لو صار Expired/Invalid (404/410)."""
    private_key = _vapid_private_key_pem()
    if not private_key:
        return False

    claims_email = os.environ.get("VAPID_CLAIMS_EMAIL", "mailto:you@example.com")
    payload = json.dumps({
        "title": title, "body": body, "url": url, "category": category,
        "notification_id": notification_id,
    }, ensure_ascii=False)

    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=payload,
            vapid_private_key=private_key,
            vapid_claims={"sub": claims_email},
            ttl=3600,
        )
        return True
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            db.session.delete(subscription)
            db.session.commit()
        return False
