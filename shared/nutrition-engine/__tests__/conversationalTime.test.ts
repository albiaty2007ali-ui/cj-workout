/**
 * اختبارات getConversationalPeriod (حزمة تطوير الوقت/السياق) — دالة موازية لـgetCurrentPeriod
 * الأصلية، بغداد UTC+3 ثابت (نفس منهجية iraqTime.parity.test.ts).
 */
import { describe, it, expect } from "vitest";
import { getConversationalPeriod, getCurrentPeriod } from "../iraqTime.js";
import { timeAwarePrefix } from "../responses.js";

describe("getConversationalPeriod — بغداد UTC+3 ثابت", () => {
  it("بغداد 04:30 -> fajr", () => {
    expect(getConversationalPeriod(new Date("2026-09-08T01:30:00Z"))).toBe("fajr");
  });
  it("بغداد 06:00 -> morning", () => {
    expect(getConversationalPeriod(new Date("2026-09-08T03:00:00Z"))).toBe("morning");
  });
  it("بغداد 11:00 -> noon", () => {
    expect(getConversationalPeriod(new Date("2026-09-08T08:00:00Z"))).toBe("noon");
  });
  it("بغداد 15:00 -> afternoon", () => {
    expect(getConversationalPeriod(new Date("2026-09-08T12:00:00Z"))).toBe("afternoon");
  });
  it("بغداد 17:00 -> maghrib", () => {
    expect(getConversationalPeriod(new Date("2026-09-08T14:00:00Z"))).toBe("maghrib");
  });
  it("بغداد 19:00 -> evening", () => {
    expect(getConversationalPeriod(new Date("2026-09-08T16:00:00Z"))).toBe("evening");
  });
  it("بغداد 22:00 -> night", () => {
    expect(getConversationalPeriod(new Date("2026-09-08T19:00:00Z"))).toBe("night");
  });
  it("بغداد 00:00 -> late_night", () => {
    expect(getConversationalPeriod(new Date("2026-09-08T21:00:00Z"))).toBe("late_night");
  });
  it("حدود fajr/late_night: بغداد 03:59 -> late_night، 04:00 -> fajr", () => {
    expect(getConversationalPeriod(new Date("2026-09-08T00:59:00Z"))).toBe("late_night");
    expect(getConversationalPeriod(new Date("2026-09-08T01:00:00Z"))).toBe("fajr");
  });
});

describe("عدم كسر getCurrentPeriod الأصلية (4 فترات، مستهلكة بـ15+ ملف)", () => {
  it("نفس القيم القديمة تمامًا لنفس الأوقات المختبرة بـiraqTime.parity.test.ts", () => {
    expect(getCurrentPeriod(new Date("2026-09-08T01:00:00Z"))).toBe("late_night");
    expect(getCurrentPeriod(new Date("2026-09-08T04:00:00Z"))).toBe("morning");
    expect(getCurrentPeriod(new Date("2026-09-08T10:00:00Z"))).toBe("noon");
    expect(getCurrentPeriod(new Date("2026-09-08T16:00:00Z"))).toBe("evening");
  });
});

describe("timeAwarePrefix", () => {
  it("يرجّع نص لكل فترة من الفترات الثمانية", () => {
    for (const period of ["fajr", "morning", "noon", "afternoon", "maghrib", "evening", "night", "late_night"]) {
      const prefix = timeAwarePrefix(period);
      expect(typeof prefix).toBe("string");
      expect((prefix ?? "").length).toBeGreaterThan(0);
    }
  });

  it("فترة غير معروفة -> null (بلا افتراض/اختلاق)", () => {
    expect(timeAwarePrefix("unknown_period")).toBeNull();
  });
});
