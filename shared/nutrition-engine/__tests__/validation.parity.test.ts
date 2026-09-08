/** اختبارات تكافؤ لـvalidation.ts — قواعد مطابقة حرفيًا لـvalidation.py، بلا تعقيد يستدعي تشغيل Python. */
import { describe, it, expect } from "vitest";
import { validateEmail, validatePassword, validateName } from "../validation.js";

describe("validateEmail", () => {
  it.each(["a@b.com", "user.name@sub.domain.co"])("%s صالح", (e) => expect(validateEmail(e)).toBeNull());
  it.each(["", "no-at.com", "a@b", "a b@c.com"])("%s غير صالح", (e) => expect(validateEmail(e)).not.toBeNull());
});

describe("validatePassword", () => {
  it("أقصر من 8 أحرف -> مرفوض", () => expect(validatePassword("ab1")).not.toBeNull());
  it("بدون رقم -> مرفوض", () => expect(validatePassword("abcdefgh")).not.toBeNull());
  it("بدون حرف -> مرفوض", () => expect(validatePassword("12345678")).not.toBeNull());
  it("8+ أحرف مع حرف ورقم -> مقبول", () => expect(validatePassword("abcd1234")).toBeNull());
});

describe("validateName", () => {
  it("أقل من حرفين -> مرفوض", () => expect(validateName("ا")).not.toBeNull());
  it("حرفين أو أكثر -> مقبول", () => expect(validateName("علي")).toBeNull());
});
