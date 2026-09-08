/**
 * اختبارات وحدة لـauth.ts — نظام جديد كليًا (لا مقابل بايثون حرفي هنا، بعكس بقية الملفات)،
 * فالتحقق هنا وظيفي: التشفير/التحقق يعمل، JWT صالح ويرفض التلاعب، واستخراج الكوكي صحيح.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { hashPassword, checkPassword, signSession, verifySession, extractSessionToken, SESSION_COOKIE_NAME } from "../auth.js";

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
    const token = signSession({ sub: "user1", role: "user", email: "user1@example.com" });
    const claims = verifySession(token);
    expect(claims?.sub).toBe("user1");
    expect(claims?.role).toBe("user");
  });

  it("توكن ملاعَب فيه يُرفض", () => {
    const token = signSession({ sub: "user1", role: "user", email: "user1@example.com" });
    const tampered = token.slice(0, -2) + "xx";
    expect(verifySession(tampered)).toBeNull();
  });

  it("نص عشوائي مو توكن -> null بأمان", () => {
    expect(verifySession("not-a-jwt")).toBeNull();
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
