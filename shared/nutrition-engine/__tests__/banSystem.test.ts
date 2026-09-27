/**
 * اختبارات deriveBanStatus (حزمة تطوير الحظر) — منطق اشتقاق حالة الحظر من مستند Firestore خام،
 * بما فيه الانتهاء التلقائي الكسول للحظر المؤقت (بلا Cron).
 */
import { describe, it, expect } from "vitest";
import { deriveBanStatus } from "../auth.js";

describe("deriveBanStatus", () => {
  it("حساب بلا ban_status إطلاقًا -> غير محظور", () => {
    expect(deriveBanStatus({})).toEqual({ banned: false, permanent: false, reason: null, expires_at: null });
  });

  it("ban_status='none' صراحة -> غير محظور", () => {
    expect(deriveBanStatus({ ban_status: "none" })).toEqual({ banned: false, permanent: false, reason: null, expires_at: null });
  });

  it("حظر دائم -> banned:true, permanent:true, صفر تاريخ انتهاء", () => {
    const result = deriveBanStatus({ ban_status: "permanent", ban_reason: "إساءة استخدام" });
    expect(result).toEqual({ banned: true, permanent: true, reason: "إساءة استخدام", expires_at: null });
  });

  it("حظر مؤقت لسا فعّال (تاريخ انتهاء بالمستقبل) -> banned:true", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000); // بعد ساعة
    const result = deriveBanStatus({ ban_status: "temporary", ban_reason: "مخالفة", ban_expires_at: future.toISOString() });
    expect(result.banned).toBe(true);
    expect(result.permanent).toBe(false);
    expect(result.reason).toBe("مخالفة");
    expect(result.expires_at).toBe(future.toISOString());
  });

  it("حظر مؤقت انتهت مدته (تاريخ بالماضي) -> غير محظور فعليًا (انتهاء تلقائي كسول)", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000); // قبل ساعة
    const result = deriveBanStatus({ ban_status: "temporary", ban_reason: "مخالفة", ban_expires_at: past.toISOString() });
    expect(result).toEqual({ banned: false, permanent: false, reason: null, expires_at: null });
  });

  it("حظر مؤقت بلا ban_expires_at (بيانات ناقصة) -> غير محظور بأمان (صفر افتراض تاريخ)", () => {
    const result = deriveBanStatus({ ban_status: "temporary", ban_reason: "مخالفة" });
    expect(result.banned).toBe(false);
  });

  it("يدعم Firestore Timestamp (له toDate()) بجانب ISO string", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const fakeTimestamp = { toDate: () => future };
    const result = deriveBanStatus({ ban_status: "temporary", ban_expires_at: fakeTimestamp });
    expect(result.banned).toBe(true);
    expect(result.expires_at).toBe(future.toISOString());
  });
});
