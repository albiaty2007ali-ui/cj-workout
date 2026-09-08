import os
import urllib.parse


def build_whatsapp_link(message: str) -> str:
    """رابط واتساب جاهز (wa.me) بالرقم من SUPPORT_WHATSAPP_NUMBER — يرجّع "" إذا الرقم غير مضبوط."""
    number = os.environ.get("SUPPORT_WHATSAPP_NUMBER", "")
    if not number:
        return ""
    return f"https://wa.me/{number}?text={urllib.parse.quote(message)}"


def consultation_whatsapp_link() -> str:
    message = "السلام عليكم، أريد الاستفسار عن CJ WORKOUT والاستشارة الغذائية."
    return build_whatsapp_link(message)
