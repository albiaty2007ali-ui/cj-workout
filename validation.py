import re

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def validate_email(email: str) -> str | None:
    if not email or not EMAIL_RE.match(email):
        return "البريد الإلكتروني غير صالح"
    return None


def validate_password(password: str) -> str | None:
    if not password or len(password) < 8:
        return "كلمة المرور يجب أن تكون 8 أحرف على الأقل"
    if not re.search(r"[A-Za-z]", password):
        return "كلمة المرور يجب أن تحتوي على حرف واحد على الأقل"
    if not re.search(r"[0-9]", password):
        return "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل"
    return None


def validate_name(name: str) -> str | None:
    if not name or len(name.strip()) < 2:
        return "الاسم قصير جدًا"
    return None
