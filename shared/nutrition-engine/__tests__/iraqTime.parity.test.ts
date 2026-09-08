/**
 * اختبارات تكافؤ لـiraqTime.ts — بغداد UTC+3 بدون توقيت صيفي (ثابت منذ 2007)، فنقدر نستخدم
 * أوقات UTC ثابتة محسوبة يدويًا بدل الاعتماد على "الآن" المتغيّر (غير قابل لإعادة الإنتاج).
 */
import { describe, it, expect } from "vitest";
import { getCurrentPeriod, relevantMealForPeriod, nowBaghdad } from "../iraqTime.js";

describe("getCurrentPeriod — بغداد UTC+3 ثابت", () => {
  it("UTC 01:00 -> بغداد 04:00 -> late_night", () => {
    expect(getCurrentPeriod(new Date("2026-09-08T01:00:00Z"))).toBe("late_night");
  });

  it("UTC 04:00 -> بغداد 07:00 -> morning", () => {
    expect(getCurrentPeriod(new Date("2026-09-08T04:00:00Z"))).toBe("morning");
  });

  it("UTC 10:00 -> بغداد 13:00 -> noon", () => {
    expect(getCurrentPeriod(new Date("2026-09-08T10:00:00Z"))).toBe("noon");
  });

  it("UTC 16:00 -> بغداد 19:00 -> evening", () => {
    expect(getCurrentPeriod(new Date("2026-09-08T16:00:00Z"))).toBe("evening");
  });

  it("UTC 21:00 -> بغداد 00:00 (منتصف الليل بالضبط) -> late_night", () => {
    expect(getCurrentPeriod(new Date("2026-09-08T21:00:00Z"))).toBe("late_night");
  });

  it("حدود الفترة الصباحية: بغداد 04:59 -> late_night، 05:00 -> morning", () => {
    expect(getCurrentPeriod(new Date("2026-09-08T01:59:00Z"))).toBe("late_night");
    expect(getCurrentPeriod(new Date("2026-09-08T02:00:00Z"))).toBe("morning");
  });
});

describe("relevantMealForPeriod", () => {
  it("morning -> breakfast، noon -> lunch، evening/late_night -> dinner", () => {
    expect(relevantMealForPeriod("morning")).toBe("breakfast");
    expect(relevantMealForPeriod("noon")).toBe("lunch");
    expect(relevantMealForPeriod("evening")).toBe("dinner");
    expect(relevantMealForPeriod("late_night")).toBe("dinner");
  });
});

describe("nowBaghdad — تحويل صحيح للتاريخ/الوقت", () => {
  it("UTC 2026-09-08T21:30:00Z -> بغداد 2026-09-09 00:30", () => {
    const parts = nowBaghdad(new Date("2026-09-08T21:30:00Z"));
    expect(parts).toMatchObject({ year: 2026, month: 9, day: 9, hour: 0, minute: 30 });
  });
});
