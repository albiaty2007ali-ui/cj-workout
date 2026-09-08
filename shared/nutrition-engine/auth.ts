/**
 * طبقة المصادقة الجديدة (JWT + Cookie موقّع HttpOnly) — بديل Flask-Login/Session التقليدية،
 * قرار موثّق بـNETLIFY_MIGRATION_AUDIT.md: JWT ذاتي التوقيع بدل مزوّد Auth خارجي، لأن نظام
 * كلمات المرور الحالي (الأدوار، الحظر، البريد) يعمل فعلاً ولا يحتاج هجرة لخدمة ثالثة.
 *
 * تشفير كلمات المرور: scrypt المدمجة بـNode (لا حاجة لمكتبة خارجية، لا توافق مطلوب مع تنسيق
 * werkzeug's pbkdf2:sha256 القديم لأنه — كما وثّقنا بالتدقيق — لا يوجد مستخدمون حقيقيون بعد
 * على أي بيئة إنتاج، فلا داعي لتعقيد الهجرة بدعم تنسيقين.
 */
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

const SCRYPT_KEYLEN = 64;

export function hashPassword(rawPassword: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(rawPassword, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function checkPassword(rawPassword: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const candidate = scryptSync(rawPassword, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hashHex, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export interface SessionClaims {
  sub: string; // user id
  role: string;
}

const SESSION_LIFETIME_SECONDS = 14 * 24 * 60 * 60; // 14 يوم — نفس PERMANENT_SESSION_LIFETIME الحالي

function getSecret(): string {
  const secret = process.env.SECRET_KEY;
  if (!secret) throw new Error("SECRET_KEY غير مضبوط بالبيئة");
  return secret;
}

export function signSession(claims: SessionClaims): string {
  return jwt.sign(claims, getSecret(), { expiresIn: SESSION_LIFETIME_SECONDS, algorithm: "HS256" });
}

export function verifySession(token: string): SessionClaims | null {
  try {
    return jwt.verify(token, getSecret(), { algorithms: ["HS256"] }) as unknown as SessionClaims;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = "cj_session";

/** يبني قيمة رأس Set-Cookie الآمن — HttpOnly+Secure+SameSite=Lax، نفس إعدادات app.py الحالية. */
export function buildSessionCookie(token: string): string {
  const maxAge = SESSION_LIFETIME_SECONDS;
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function buildLogoutCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * يتحقق من طلب HTTP وارد (Netlify Function) ويرجّع claims الجلسة، أو null لو غير مسجّل دخول/
 * توكن غير صالح. يستخدمها كل Function محمية بدل middleware تقليدي (Netlify Functions مستقلة).
 */
export function authenticateRequest(req: Request): SessionClaims | null {
  const token = extractSessionToken(req.headers.get("cookie"));
  if (!token) return null;
  return verifySession(token);
}

// ---- استعلامات مصادقة مباشرة (auth-login/auth-register) — خارج نمط Repository عمدًا، لأنها
// بنية تحتية بحتة (بحث/إنشاء حساب) وليست منطق أعمال يحتاج اختبار بمعزل عبر InMemoryRepository.
// ملاحظة هجرة: email عمود بحث بـPostgres لكنه مجرد حقل عادي بـFirestore — البحث عنه هنا Query
// عادي (where email ==)، وليس بحثًا بمعرّف الوثيقة (معرّف وثيقة users هو الـid الداخلي دائمًا).

export interface UserCredentials {
  id: string;
  password_hash: string;
  disabled: boolean;
  role: string;
}

export async function findUserCredentialsByEmail(db: Firestore, email: string): Promise<UserCredentials | null> {
  const snap = await db.collection("users").where("email", "==", email).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  const d = doc.data();
  return { id: doc.id, password_hash: d.password_hash, disabled: d.disabled ?? false, role: d.role ?? "user" };
}

export async function emailExists(db: Firestore, email: string): Promise<boolean> {
  const snap = await db.collection("users").where("email", "==", email).limit(1).get();
  return !snap.empty;
}

export interface NewUserInput {
  name: string;
  email: string;
  password: string;
}

/** ينشئ مستخدم جديد بكلمة مرور مشفَّرة — يرجّع (id, role) لبناء الجلسة فورًا بعد التسجيل. */
export async function createUser(db: Firestore, input: NewUserInput): Promise<{ id: string; role: string }> {
  const id = randomUUID().replace(/-/g, "");
  const passwordHash = hashPassword(input.password);
  await db.collection("users").doc(id).set({
    name: input.name, email: input.email, password_hash: passwordHash, role: "user", disabled: false,
    xp: 0, streak_days: 0, longest_streak: 0, streak_started_at: null, last_active_date: null,
    free_meals_used: 0, current_recipe_id: null, current_recipe_step: 0,
    pending_recipe_confirmation_id: null, pending_food_topic_json: null, pending_meal_json: null,
    last_direct_log_json: null, ai_response_style: "balanced",
    created_at: FieldValue.serverTimestamp(),
  });
  return { id, role: "user" };
}

/** يستخرج قيمة كوكي الجلسة من رأس Cookie الخام لطلب HTTP وارد. */
export function extractSessionToken(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === SESSION_COOKIE_NAME) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}
