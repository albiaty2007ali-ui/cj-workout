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
  email: string;
  /** هل البريد مؤكَّد فعليًا (كود 6 أرقام عبر Resend) — يُضمَّن بالـJWT نفسه (نفس نمط role/email)
   * فيتحدّث فقط بإعادة توقيع جلسة جديدة (auth-verify-email.mts عند نجاح التحقق) لا بقراءة DB
   * بكل طلب. حسابات قديمة قبل هذي الميزة (undefined بالـDB) تُقرأ false افتراضيًا — تحتاج تحقق
   * أيضًا (طلب صريح: الحسابات القديمة غير المؤكَّدة تُطالَب بالتأكيد عند أي دخول لاحق). */
  email_verified: boolean;
}

/**
 * إشارة تحقق مركزية — نفس فلسفة isAdminClaims (فحص من claims الموقَّعة، صفر قراءة DB إضافية).
 * **مُعطَّلة عمدًا (تُرجع true دائمًا)**: حساب Resend المستخدَم بلا نطاق بريد موثَّق يرفض تسليم
 * أي إيميل لغير بريد صاحب الحساب نفسه (قيد سندج/تجربة قياسي بمزوّدي البريد) — مطالبة مستخدمين
 * حقيقيين بكود تحقق لا يصلهم كانت تقفلهم فعليًا خارج التطبيق بلا أي مخرج. تبقى الدالة والفحوصات
 * اللي تستدعيها (chat.mts/progress-daily.mts) موجودة كنقطة مركزية وحيدة — لو تفعّل نطاق بريد
 * موثَّق مستقبلًا، رجّع الشرط الحقيقي هنا فقط (claims?.email_verified === true) وكل شي غيره
 * يشتغل تلقائيًا بدون لمس أي ملف ثاني.
 */
export function isEmailVerified(_claims: SessionClaims | null): boolean {
  return true;
}

/**
 * نقطة التحقق المركزية الوحيدة من صلاحية أدمن — مصدر الحقيقة هو متغير بيئة ADMIN_EMAIL (Netlify
 * Environment Variables)، وليس فقط حقل role بقاعدة البيانات. هذا يمنع بالضبط الالتباس اللي صار:
 * حساب تجربة تُرفَّع مؤقتًا لأدمن (لاختبار) ويبقى ظاهر للوحة الإدارة حتى بعد التجربة. حتى لو
 * role="admin" بقيت بالخطأ بمستند مستخدم آخر بـFirestore، هذا الفحص يرفضها لأنه يقارن الإيميل
 * الحقيقي المُوقَّع بالـJWT مع القيمة الوحيدة المصرَّح بيها بالبيئة — كل ملفات admin-*.mts تستدعي
 * هذي الدالة، صفر تكرار لمنطق "if user.email == ...".
 */
export function isAdminClaims(claims: SessionClaims | null): boolean {
  if (!claims || claims.role !== "admin") return false;
  // ADMIN_EMAILS (قائمة مفصولة بفواصل) يدعم عدة حسابات إدارة — ADMIN_EMAIL المفرد يبقى يشتغل
  // للتوافق الخلفي لو ADMIN_EMAILS غير مضبوط. نفس فلسفة "مصدر الحقيقة البيئة لا حقل role وحده"
  // الموثَّقة أعلاه — قائمة بيضاء صريحة بالبيئة، صفر اعتماد كامل على role بقاعدة البيانات.
  const list = (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(claims.email.toLowerCase());
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
  password_hash: string | null; // null = حساب أُنشئ عبر Google فقط، بدون كلمة مرور محلية
  disabled: boolean;
  role: string;
  email_verified: boolean;
}

export async function findUserCredentialsByEmail(db: Firestore, email: string): Promise<UserCredentials | null> {
  const snap = await db.collection("users").where("email", "==", email).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0]!;
  const d = doc.data();
  return {
    id: doc.id, password_hash: d.password_hash ?? null, disabled: d.disabled ?? false, role: d.role ?? "user",
    email_verified: d.email_verified === true, // undefined (حسابات قبل هذي الميزة) -> false عمدًا
  };
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

/** كود تحقق 6 أرقام — عشوائي تشفيريًا حقيقي (randomBytes)، مو Math.random(). */
export function generateVerificationCode(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1000000;
  return n.toString().padStart(6, "0");
}

export const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000; // 15 دقيقة
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000; // 60 ثانية

/** ينشئ مستخدم جديد بكلمة مرور مشفَّرة — email_verified:true فورًا (صفر كود/إيميل تحقق، راجع
 * isEmailVerified أعلاه لسبب الإلغاء) فيدخل المستخدم للتطبيق مباشرة بلا انتظار كود ما بوصله. */
export async function createUser(
  db: Firestore, input: NewUserInput,
): Promise<{ id: string; role: string }> {
  const id = randomUUID().replace(/-/g, "");
  const passwordHash = hashPassword(input.password);
  await db.collection("users").doc(id).set({
    name: input.name, email: input.email, password_hash: passwordHash, role: "user", disabled: false,
    xp: 0, streak_days: 0, longest_streak: 0, streak_started_at: null, last_active_date: null,
    free_meals_used: 0, current_recipe_id: null, current_recipe_step: 0,
    pending_recipe_confirmation_id: null, pending_food_topic_json: null, pending_meal_json: null,
    last_direct_log_json: null, ai_response_style: "balanced", streak_freeze_balance: 0,
    email_verified: true,
    created_at: FieldValue.serverTimestamp(),
  });
  return { id, role: "user" };
}

export interface VerifyEmailResult {
  ok: boolean;
  error?: "INVALID_CODE" | "EXPIRED" | "ALREADY_VERIFIED";
}

/** يتحقق كود التحقق المُدخَل مقابل المخزَّن فعليًا للمستخدم — يمسح الكود عند النجاح (استهلاك
 * وحيد، صفر إعادة استخدام). */
export async function verifyEmailCode(db: Firestore, userId: string, code: string): Promise<VerifyEmailResult> {
  const ref = db.collection("users").doc(userId);
  const doc = await ref.get();
  if (!doc.exists) return { ok: false, error: "INVALID_CODE" };
  const d = doc.data()!;
  if (d.email_verified === true) return { ok: false, error: "ALREADY_VERIFIED" };

  const expires = d.email_verification_expires?.toDate?.() ?? d.email_verification_expires;
  if (!d.email_verification_code || !expires || new Date() > new Date(expires)) {
    return { ok: false, error: "EXPIRED" };
  }
  if (d.email_verification_code !== code.trim()) return { ok: false, error: "INVALID_CODE" };

  await ref.update({
    email_verified: true, email_verification_code: null,
    email_verification_expires: null, verified_at: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}

export interface ResendResult {
  ok: boolean;
  error?: "TOO_SOON" | "ALREADY_VERIFIED";
  code?: string;
  retry_after_seconds?: number;
}

/** يولّد كود تحقق جديد ويستبدل القديم — محمي بفترة تهدئة 60 ثانية (صفر إساءة استخدام API إرسال
 * البريد). يرجّع الكود الجديد حتى المستدعي (auth-verify-email.mts) يرسله فعليًا. */
export async function resendVerificationCode(db: Firestore, userId: string): Promise<ResendResult> {
  const ref = db.collection("users").doc(userId);
  const doc = await ref.get();
  if (!doc.exists) return { ok: false, error: "TOO_SOON" };
  const d = doc.data()!;
  if (d.email_verified === true) return { ok: false, error: "ALREADY_VERIFIED" };

  const lastSent = d.email_verification_sent_at?.toDate?.() ?? d.email_verification_sent_at;
  if (lastSent) {
    const elapsedMs = Date.now() - new Date(lastSent).getTime();
    if (elapsedMs < VERIFICATION_RESEND_COOLDOWN_MS) {
      return { ok: false, error: "TOO_SOON", retry_after_seconds: Math.ceil((VERIFICATION_RESEND_COOLDOWN_MS - elapsedMs) / 1000) };
    }
  }

  const code = generateVerificationCode();
  const now = new Date();
  await ref.update({
    email_verification_code: code,
    email_verification_expires: new Date(now.getTime() + VERIFICATION_CODE_TTL_MS),
    email_verification_sent_at: now,
  });
  return { ok: true, code };
}

export interface NewGoogleUserInput {
  name: string;
  email: string;
  google_id: string;
}

/** ينشئ مستخدم جديد عبر تسجيل دخول Google — بدون كلمة مرور محلية (password_hash: null)، نفس باقي
 *  حقول createUser الافتراضية تمامًا حتى لا يختلف سلوك حساب Google عن حساب بريد/كلمة مرور عاديّ.
 *  email_verified:true مباشرة — Google نفسها أثبتت ملكية البريد أصلًا ضمن تدفّق OAuth، تكرار
 *  كود تحقق فوقها إجراء زائد بلا فائدة أمنية حقيقية. */
export async function createUserFromGoogle(db: Firestore, input: NewGoogleUserInput): Promise<{ id: string; role: string }> {
  const id = randomUUID().replace(/-/g, "");
  await db.collection("users").doc(id).set({
    name: input.name, email: input.email, password_hash: null, google_id: input.google_id, role: "user", disabled: false,
    xp: 0, streak_days: 0, longest_streak: 0, streak_started_at: null, last_active_date: null,
    free_meals_used: 0, current_recipe_id: null, current_recipe_step: 0,
    pending_recipe_confirmation_id: null, pending_food_topic_json: null, pending_meal_json: null,
    last_direct_log_json: null, ai_response_style: "balanced", streak_freeze_balance: 0,
    email_verified: true,
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
