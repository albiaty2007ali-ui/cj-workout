/**
 * اختبارات وحدة لـauth.ts — نظام جديد كليًا (لا مقابل بايثون حرفي هنا، بعكس بقية الملفات)،
 * فالتحقق هنا وظيفي: التشفير/التحقق يعمل، JWT صالح ويرفض التلاعب، واستخراج الكوكي صحيح.
 */
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  hashPassword, checkPassword, signSession, verifySession, extractSessionToken, SESSION_COOKIE_NAME,
  isAdminClaims, isEmailVerified, generateVerificationCode,
} from "../auth.js";

beforeAll(() => {
  process.env.SECRET_KEY = "test-secret-not-for-production";
});

describe("hashPassword / checkPassword", () => {
  it("كلمة مرور صحيحة تنجح، خاطئة تفشل", () => {
    const hash = hashPassword("my-secret-123");
    expect(checkPassword("my-secret-123", hash)).toBe(true);
    expect(checkPassword("wrong-password", hash)).toBe(false);
  });

  it("نفس كلمة المرور تعطي Hash مختلف بكل مرة (Salt عشوائي)", () => {
    const h1 = hashPassword("same-password");
    const h2 = hashPassword("same-password");
    expect(h1).not.toBe(h2);
    expect(checkPassword("same-password", h1)).toBe(true);
    expect(checkPassword("same-password", h2)).toBe(true);
  });

  it("Hash بصيغة غير معروفة يُرفض بأمان (لا يرمي خطأ)", () => {
    expect(checkPassword("x", "not-a-valid-hash")).toBe(false);
  });
});

describe("signSession / verifySession", () => {
  it("توكن صالح يرجّع نفس الـclaims", () => {
    const token = signSession({ sub: "user1", role: "user", email: "user1@example.com", email_verified: true });
    const claims = verifySession(token);
    expect(claims?.sub).toBe("user1");
    expect(claims?.role).toBe("user");
    expect(claims?.email_verified).toBe(true);
  });

  it("توكن ملاعَب فيه يُرفض", () => {
    const token = signSession({ sub: "user1", role: "user", email: "user1@example.com", email_verified: true });
    const tampered = token.slice(0, -2) + "xx";
    expect(verifySession(tampered)).toBeNull();
  });

  it("نص عشوائي مو توكن -> null بأمان", () => {
    expect(verifySession("not-a-jwt")).toBeNull();
  });
});

describe("isEmailVerified", () => {
  it("true فقط لو email_verified === true حرفيًا", () => {
    expect(isEmailVerified({ sub: "u1", role: "user", email: "a@b.com", email_verified: true })).toBe(true);
    expect(isEmailVerified({ sub: "u1", role: "user", email: "a@b.com", email_verified: false })).toBe(false);
  });

  it("null بأمان -> false", () => {
    expect(isEmailVerified(null)).toBe(false);
  });
});

describe("isAdminClaims", () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("يرفض role غير admin حتى لو البريد بالقائمة", () => {
    process.env.ADMIN_EMAILS = "admin@cjfood.app";
    expect(isAdminClaims({ sub: "u1", role: "user", email: "admin@cjfood.app", email_verified: true })).toBe(false);
  });

  it("يقبل أي بريد ضمن قائمة ADMIN_EMAILS مفصولة بفواصل (case-insensitive)", () => {
    process.env.ADMIN_EMAILS = "owner@cjfood.app, Admin1@CJFood.app ,admin2@cjfood.app";
    expect(isAdminClaims({ sub: "u1", role: "admin", email: "admin1@cjfood.app", email_verified: true })).toBe(true);
    expect(isAdminClaims({ sub: "u2", role: "admin", email: "admin2@cjfood.app", email_verified: true })).toBe(true);
    expect(isAdminClaims({ sub: "u3", role: "admin", email: "stranger@cjfood.app", email_verified: true })).toBe(false);
  });

  it("يرجع لـADMIN_EMAIL القديم (توافق خلفي) لو ADMIN_EMAILS غير مضبوط", () => {
    delete process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAIL = "owner@cjfood.app";
    expect(isAdminClaims({ sub: "u1", role: "admin", email: "owner@cjfood.app", email_verified: true })).toBe(true);
  });

  it("null بأمان -> false", () => {
    expect(isAdminClaims(null)).toBe(false);
  });
});

describe("generateVerificationCode", () => {
  it("يرجّع دائمًا نص من 6 أرقام (مع أصفار بادئة عند الحاجة)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateVerificationCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });
});

describe("extractSessionToken", () => {
  it("يستخرج قيمة الكوكي الصحيحة من رأس متعدد القيم", () => {
    const header = `other=1; ${SESSION_COOKIE_NAME}=abc123; another=2`;
    expect(extractSessionToken(header)).toBe("abc123");
  });

  it("يرجع null لو الكوكي غير موجود أو الرأس فاضي", () => {
    expect(extractSessionToken("other=1")).toBeNull();
    expect(extractSessionToken(null)).toBeNull();
    expect(extractSessionToken(undefined)).toBeNull();
  });
});
