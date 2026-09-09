/**
 * اختبارات bestWorstDay.ts — تجميع حقيقي حسب يوم الأسبوع، يرفض إعطاء نتيجة لبيانات قليلة أو
 * فرق ضئيل بين الأيام (صفر استنتاج مضلِّل من عينة صغيرة).
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { analyzeBestWorstDay } from "../bestWorstDay.js";
import type { BehaviorDailyRecord } from "../db/repository.js";

function row(date: string, overrides: Partial<BehaviorDailyRecord> = {}): BehaviorDailyRecord {
  return { user_id: "u1", date, meals_logged: 0, protein_hit_target: false, water_hit_target: false, logged_before_noon: false, ...overrides };
}

describe("analyzeBestWorstDay", () => {
  it("أقل من 14 يوم بيانات -> available=false، سبب صريح", async () => {
    const repo = new InMemoryRepository();
    await repo.upsertBehaviorDaily(row("2026-01-01", { meals_logged: 2 }));
    const result = await analyzeBestWorstDay(repo, "u1", new Date("2026-01-15T06:00:00Z"));
    expect(result.available).toBe(false);
    expect(result.reason).toContain("14 يوم");
  });

  it("فرق حقيقي وواضح بين يوم الجمعة (ممتاز دائمًا) والثلاثاء (ضعيف دائمًا) -> يحدد الاثنين بثقة", async () => {
    const repo = new InMemoryRepository();
    // 2026-01-02 هو يوم جمعة؛ 2026-01-06 هو يوم ثلاثاء (نبني 4 أسابيع = 28 يوم)
    for (let week = 0; week < 4; week++) {
      const friday = new Date(Date.UTC(2026, 0, 2 + week * 7));
      const tuesday = new Date(Date.UTC(2026, 0, 6 + week * 7));
      await repo.upsertBehaviorDaily(row(friday.toISOString().slice(0, 10), { meals_logged: 3, protein_hit_target: true, water_hit_target: true }));
      await repo.upsertBehaviorDaily(row(tuesday.toISOString().slice(0, 10), { meals_logged: 0 }));
      // بقية أيام الأسبوع (سبت/أحد/اثنين/أربعاء/خميس — بدون تصادم مع الجمعة=2 أو الثلاثاء=6)
      // بمستوى وسط حتى تتوفر عينة (مو شرط لكن يقارب واقعية)
      for (const offset of [3, 4, 5, 7, 8]) {
        const other = new Date(Date.UTC(2026, 0, offset + week * 7));
        await repo.upsertBehaviorDaily(row(other.toISOString().slice(0, 10), { meals_logged: 1, protein_hit_target: false, water_hit_target: false }));
      }
    }
    const result = await analyzeBestWorstDay(repo, "u1", new Date("2026-01-30T06:00:00Z"));
    expect(result.available).toBe(true);
    expect(result.best?.label).toBe("الجمعة");
    expect(result.worst?.label).toBe("الثلاثاء");
  });

  it("كل الأيام متطابقة تمامًا -> available=false (ماكو فرق نذكره)", async () => {
    const repo = new InMemoryRepository();
    for (let n = 0; n < 20; n++) {
      const d = new Date(Date.UTC(2026, 0, 1 + n));
      await repo.upsertBehaviorDaily(row(d.toISOString().slice(0, 10), { meals_logged: 2, protein_hit_target: true, water_hit_target: false }));
    }
    const result = await analyzeBestWorstDay(repo, "u1", new Date("2026-01-25T06:00:00Z"));
    expect(result.available).toBe(false);
  });
});
