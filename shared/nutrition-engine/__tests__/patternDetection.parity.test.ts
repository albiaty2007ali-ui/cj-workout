/**
 * اختبارات patternDetection.ts — الشرط الحرج: صفر Insight ببيانات غير كافية، تغيّر بسيط لا يُطلق
 * تنبيه، تغيّر واضح يُطلقه، تكرار نفس اليوم ممنوع (Cooldown)، وصفر أي لغة تشخيصية/طبية بأي نص.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import {
  detectBaselineInsights, checkStreakRisk, pickUnseenBaselineInsight, type InsightType,
} from "../patternDetection.js";
import type { BehaviorDailyRecord } from "../db/repository.js";

const FORBIDDEN_MEDICAL_WORDS = ["مرض", "تشخيص", "خطر على صحتك", "أعراض", "علاج"];

function row(date: string, overrides: Partial<BehaviorDailyRecord> = {}): BehaviorDailyRecord {
  return {
    user_id: "u1", date, meals_logged: 3,
    protein_hit_target: true, water_hit_target: true, logged_before_noon: true,
    ...overrides,
  };
}

async function seedDays(repo: InMemoryRepository, dates: string[], overrides: Partial<BehaviorDailyRecord> = {}) {
  for (const date of dates) await repo.upsertBehaviorDaily(row(date, overrides));
}

const BASELINE_DATES = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10", "2026-01-11"];
const RECENT_DATES = ["2026-01-12", "2026-01-13", "2026-01-14"];
const NOW = new Date("2026-01-15T06:00:00Z");

describe("detectBaselineInsights — بيانات غير كافية", () => {
  it("صفر أيام مسجّلة إطلاقًا -> صفر Insight", async () => {
    const repo = new InMemoryRepository();
    expect(await detectBaselineInsights(repo, "u1", NOW)).toEqual([]);
  });

  it("Baseline موجود لكن أقل من 5 أيام -> صفر Insight (حد أدنى غير محقّق)", async () => {
    const repo = new InMemoryRepository();
    await seedDays(repo, ["2026-01-08", "2026-01-09"]); // baseline بس يومين
    await seedDays(repo, RECENT_DATES);
    expect(await detectBaselineInsights(repo, "u1", NOW)).toEqual([]);
  });
});

describe("detectBaselineInsights — تغيّر بسيط لا يُطلق تنبيه", () => {
  it("انخفاض طفيف بالوجبات (3 -> 2.3) -> صفر Insight (مو انخفاض جوهري)", async () => {
    const repo = new InMemoryRepository();
    await seedDays(repo, BASELINE_DATES, { meals_logged: 3 });
    await seedDays(repo, RECENT_DATES, { meals_logged: 2 }); // انخفاض بسيط، مو 60%+
    const insights = await detectBaselineInsights(repo, "u1", NOW);
    expect(insights.some((i) => i.type === "MEAL_LOGGING_DROP")).toBe(false);
  });
});

describe("detectBaselineInsights — تغيّر واضح يُطلق تنبيه حقيقي", () => {
  it("انخفاض حقيقي وواضح بعدد الوجبات (3 -> 0.3) -> MEAL_LOGGING_DROP", async () => {
    const repo = new InMemoryRepository();
    await seedDays(repo, BASELINE_DATES, { meals_logged: 3 });
    await seedDays(repo, RECENT_DATES, { meals_logged: 0 });
    const insights = await detectBaselineInsights(repo, "u1", NOW);
    expect(insights.some((i) => i.type === "MEAL_LOGGING_DROP")).toBe(true);
  });

  it("انخفاض حقيقي بتحقيق هدف البروتين -> PROTEIN_ADHERENCE_DROP", async () => {
    const repo = new InMemoryRepository();
    await seedDays(repo, BASELINE_DATES, { protein_hit_target: true });
    await seedDays(repo, RECENT_DATES, { protein_hit_target: false });
    const insights = await detectBaselineInsights(repo, "u1", NOW);
    expect(insights.some((i) => i.type === "PROTEIN_ADHERENCE_DROP")).toBe(true);
  });

  it("تأخّر واضح بتسجيل الوجبات عن وقت الصبح المعتاد -> MEAL_TIMING_SHIFT", async () => {
    const repo = new InMemoryRepository();
    await seedDays(repo, BASELINE_DATES, { logged_before_noon: true });
    await seedDays(repo, RECENT_DATES, { logged_before_noon: false });
    const insights = await detectBaselineInsights(repo, "u1", NOW);
    expect(insights.some((i) => i.type === "MEAL_TIMING_SHIFT")).toBe(true);
  });

  it("صفر أي لغة تشخيصية/طبية بأي نص Insight", async () => {
    const repo = new InMemoryRepository();
    await seedDays(repo, BASELINE_DATES);
    await seedDays(repo, RECENT_DATES, { meals_logged: 0, protein_hit_target: false, logged_before_noon: false });
    const insights = await detectBaselineInsights(repo, "u1", NOW);
    expect(insights.length).toBeGreaterThan(0);
    for (const insight of insights) {
      for (const word of FORBIDDEN_MEDICAL_WORDS) expect(insight.message).not.toContain(word);
    }
  });
});

describe("pickUnseenBaselineInsight — Cooldown يومي (صفر تكرار نفس اليوم)", () => {
  let repo: InMemoryRepository;

  beforeEach(async () => {
    repo = new InMemoryRepository();
    await seedDays(repo, BASELINE_DATES);
    await seedDays(repo, RECENT_DATES, { meals_logged: 0, protein_hit_target: false, logged_before_noon: false });
  });

  it("أول استدعاء يرجّع رسالة حقيقية ويسجّلها كـ'انعرضت'", async () => {
    const message = await pickUnseenBaselineInsight(repo, "u1", NOW);
    expect(message).not.toBeNull();
  });

  it("استدعاء ثانٍ بنفس اليوم -> نفس النوع لا يتكرر (يرجّع نوع تاني أو null لو خلصت الأنواع)", async () => {
    const first = await pickUnseenBaselineInsight(repo, "u1", NOW);
    const second = await pickUnseenBaselineInsight(repo, "u1", NOW);
    const third = await pickUnseenBaselineInsight(repo, "u1", NOW);
    const fourth = await pickUnseenBaselineInsight(repo, "u1", NOW);
    // 3 أنواع فقط ممكنة بهذا السيناريو (drop/protein/timing) — الرابع لازم يرجّع null
    const results = [first, second, third, fourth];
    expect(results.filter((r) => r !== null)).toHaveLength(3);
    expect(fourth).toBeNull();
  });
});

describe("checkStreakRisk — خطر انقطاع Streak حقيقي، فحص مستقل", () => {
  it("Streak قصير (<3) -> صفر خطر حتى لو ماكو تسجيل ووقت متأخر", () => {
    const user = makeUser({ id: "u1", streak_days: 2 });
    const result = checkStreakRisk(user, null, new Date("2026-01-15T18:00:00Z")); // 21:00 بغداد
    expect(result).toBeNull();
  });

  it("Streak حقيقي طويل + صفر تسجيل اليوم + وقت متأخر (21:00 بغداد) -> STREAK_RISK", () => {
    const user = makeUser({ id: "u1", streak_days: 10 });
    const result = checkStreakRisk(user, null, new Date("2026-01-15T18:00:00Z"));
    expect(result).not.toBeNull();
    expect(result!.type).toBe("STREAK_RISK" satisfies InsightType);
  });

  it("Streak طويل بس سجّل وجبة اليوم فعلاً -> صفر خطر", () => {
    const user = makeUser({ id: "u1", streak_days: 10 });
    const todayRow = row("2026-01-15", { meals_logged: 1 });
    const result = checkStreakRisk(user, todayRow, new Date("2026-01-15T18:00:00Z"));
    expect(result).toBeNull();
  });

  it("Streak طويل + صفر تسجيل بس الوقت لسا مبكر (14:00 بغداد) -> صفر خطر لسا", () => {
    const user = makeUser({ id: "u1", streak_days: 10 });
    const result = checkStreakRisk(user, null, new Date("2026-01-15T11:00:00Z")); // 14:00 بغداد
    expect(result).toBeNull();
  });
});
