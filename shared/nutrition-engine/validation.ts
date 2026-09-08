/** منفذ حرفي من validation.py — نفس القواعد بالضبط. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  if (!email || !EMAIL_RE.test(email)) return "البريد الإلكتروني غير صالح";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password || password.length < 8) return "كلمة المرور يجب أن تكون 8 أحرف على الأقل";
  if (!/[A-Za-z]/.test(password)) return "كلمة المرور يجب أن تحتوي على حرف واحد على الأقل";
  if (!/[0-9]/.test(password)) return "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل";
  return null;
}

export function validateName(name: string): string | null {
  if (!name || name.trim().length < 2) return "الاسم قصير جدًا";
  return null;
}
