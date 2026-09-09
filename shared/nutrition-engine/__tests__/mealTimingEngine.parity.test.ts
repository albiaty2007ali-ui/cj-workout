/**
 * اختبارات mealTimingEngine.ts — الفترة/نوافذ الوجبات تُحسب فعليًا من جدول نوم المستخدم الحقيقي،
 * وFallback حرفي لفترات بغداد الثابتة لمن ما ضبط جدول نوم (صفر كسر للسلوك الحالي).
 */
import { describe, it, expect } from "vitest";
import {
  currentPeriodForUser, mealWindowsForSchedule, waterWindowForSchedule, isWithinMinuteRange,
  type SleepSchedule,
} from "../mealTimingEngine.js";
import { getCurrentPeriod } from "../iraqTime.js";

describe("currentPeriodForUser — Fallback + جدول نوم حقيقي", () => {
  it("بدون جدول نوم -> نفس نتيجة iraqTime.getCurrentPeriod حرفيًا (Fallback)", () => {
    const now = new Date("2026-01-15T06:00:00Z"); // 09:00 بغداد
    expect(currentPeriodForUser(now, null)).toBe(getCurrentPeriod(now));
  });

  it("جدول نوم عادي (استيقاظ 08:00، نوم 00:00) — أول الوقت بعد الاستيقاظ = morning", () => {
    const schedule: SleepSchedule = { wake_time: "08:00", sleep_time: "00:00" };
    const now = new Date("2026-01-15T05:30:00Z"); // 08:30 بغداد (30 دقيقة بعد الاستيقاظ)
    expect(currentPeriodForUser(now, schedule)).toBe("morning");
  });

  it("جدول نوم ليلي (استيقاظ 12:00 ظهرًا، نوم 04:00 فجرًا) — منتصف النافذة تقريبًا = noon", () => {
    const schedule: SleepSchedule = { wake_time: "12:00", sleep_time: "04:00" };
    // نافذة الاستيقاظ 16 ساعة (12:00 -> 04:00 اليوم التالي)، الساعة 20:00 بغداد = 8 ساعات بعد
    // الاستيقاظ = 50% من النافذة -> ضمن نطاق noon (0.2-0.55)
    const now = new Date("2026-01-15T17:00:00Z"); // 20:00 بغداد
    expect(currentPeriodForUser(now, schedule)).toBe("noon");
  });

  it("خارج نافذة الاستيقاظ فعليًا (وقت نوم حقيقي) -> late_night", () => {
    const schedule: SleepSchedule = { wake_time: "08:00", sleep_time: "00:00" };
    const now = new Date("2026-01-15T21:00:00Z"); // 00:00 بغداد بالضبط (بداية وقت النوم)
    expect(currentPeriodForUser(now, schedule)).toBe("late_night");
  });
});

describe("mealWindowsForSchedule / waterWindowForSchedule — نوافذ حقيقية نسبية لجدول النوم", () => {
  it("استيقاظ 08:00، نوم 00:00 (نافذة 16 ساعة = 960 دقيقة) — الفطور يبدأ قريب من وقت الاستيقاظ", () => {
    const schedule: SleepSchedule = { wake_time: "08:00", sleep_time: "00:00" };
    const windows = mealWindowsForSchedule(schedule);
    const breakfast = windows.find((w) => w.key === "breakfast")!;
    // 5% من 960 = 48 دقيقة بعد 08:00 = 08:48
    expect(breakfast.startMinuteOfDay).toBe(8 * 60 + 48);
  });

  it("waterWindowForSchedule يطابق نافذة الاستيقاظ بالكامل", () => {
    const schedule: SleepSchedule = { wake_time: "07:00", sleep_time: "23:00" };
    const water = waterWindowForSchedule(schedule);
    expect(water.startMinuteOfDay).toBe(7 * 60);
    expect(water.endMinuteOfDay).toBe(23 * 60);
  });
});

describe("isWithinMinuteRange — يتعامل صح مع اللف حول منتصف الليل", () => {
  it("نطاق عادي (بدون لف): 08:00-10:00", () => {
    const range = { startMinuteOfDay: 8 * 60, endMinuteOfDay: 10 * 60 };
    expect(isWithinMinuteRange(9 * 60, range)).toBe(true);
    expect(isWithinMinuteRange(11 * 60, range)).toBe(false);
  });

  it("نطاق يلف منتصف الليل: 22:00-06:00", () => {
    const range = { startMinuteOfDay: 22 * 60, endMinuteOfDay: 6 * 60 };
    expect(isWithinMinuteRange(23 * 60, range)).toBe(true); // 23:00 -> ضمن النطاق
    expect(isWithinMinuteRange(2 * 60, range)).toBe(true); // 02:00 -> ضمن النطاق (بعد اللف)
    expect(isWithinMinuteRange(12 * 60, range)).toBe(false); // 12:00 ظهرًا -> خارج النطاق
  });
});
