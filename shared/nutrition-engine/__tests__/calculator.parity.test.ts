/**
 * اختبار تكافؤ لـcalculator.ts's dayUtcRange — القيمة المتوقعة من تشغيل day_utc_range(date(2026,9,8))
 * الحقيقي بايثون مباشرة: (2026-09-07T21:00:00, 2026-09-08T21:00:00).
 */
import { describe, it, expect } from "vitest";
import { dayUtcRange, totalsForItems } from "../calculator.js";

describe("dayUtcRange — تكافؤ حرفي مع day_utc_range(date(2026,9,8))", () => {
  it("بداية/نهاية اليوم البغدادي بتوقيت UTC", () => {
    const [start, end] = dayUtcRange(2026, 9, 8);
    expect(start.toISOString()).toBe("2026-09-07T21:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-08T21:00:00.000Z");
  });
});

describe("totalsForItems", () => {
  it("يجمع calories/protein/carbs/fat بشكل صحيح", () => {
    const totals = totalsForItems([
      { calories: 155, protein: 13, carbs: 1.1, fat: 11 },
      { calories: 65, protein: 2.3, carbs: 12, fat: 0.8 },
    ]);
    expect(totals).toEqual({ calories: 220, protein: 15.3, carbs: 13.1, fat: 11.8 });
  });
});
