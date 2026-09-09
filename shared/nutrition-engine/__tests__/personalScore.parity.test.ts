/**
 * اختبارات personalScore.ts — Score قابل للتفسير (0-100) من بيانات behavior_daily حقيقية فقط.
 * الشرط الحرج هنا: بيانات غير كافية -> صفر (بدون رقم مخترع)، وكل بند breakdown له مصدر حقيقي.
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { computePersonalScore } from "../personalScore.js";
import type { BehaviorDailyRecord } from "../db/repository.js";

function row(date: string, overrides: Partial<BehaviorDailyRecord> = {}): BehaviorDailyRecord {
  return {
    user_id: "u1", date, meals_logged: 0,
    protein_hit_target: false, water_hit_target: false, logged_before_noon: false,
    ...overrides,
  };
}

describe("computePersonalScore — تكافؤ منطقي (0-100، قابل للتفسير)", () => {
  it("صفر بيانات behavior_daily -> score=0 + breakdown صريح 'بيانات غير كافية'", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-01-15T06:00:00Z");
    const result = await computePersonalScore(repo, "u1", 0, now);
    expect(result.score).toBe(0);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].delta).toBe(0);
  });

  it("أسبوع كامل مثالي (7 أيام: وجبتين+، بروتين محقّق، ماي محقّق) + Streak=30 -> score=100 بالضبط", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-01-15T06:00:00Z");
    for (let d = 9; d <= 15; d++) {
      await repo.upsertBehaviorDaily(row(`2026-01-${String(d).padStart(2, "0")}`, {
        meals_logged: 3, protein_hit_target: true, water_hit_target: true,
      }));
    }
    const result = await computePersonalScore(repo, "u1", 30, now);
    expect(result.score).toBe(100);
    expect(result.breakdown.length).toBe(4); // 4 بنود: وجبات/بروتين/ماي/ستريك
  });

  it("4 أيام فقط من 7 محقّقة جزئيًا + Streak=15 -> نسبة حقيقية مو رقم مقرَّب اعتباطيًا", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-01-15T06:00:00Z");
    for (let d = 12; d <= 15; d++) {
      await repo.upsertBehaviorDaily(row(`2026-01-${String(d).padStart(2, "0")}`, {
        meals_logged: 2, protein_hit_target: true, water_hit_target: true,
      }));
    }
    const result = await computePersonalScore(repo, "u1", 15, now);
    // 4/7*35=20, 4/7*20≈11, 4/7*15≈9, 15/30*30=15 -> 20+11+9+15=55
    expect(result.score).toBe(55);
  });

  it("Streak أعلى من 30 يوم لا يعطي أكثر من 30 نقطة (سقف واضح، مو تراكم لانهائي)", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-01-15T06:00:00Z");
    await repo.upsertBehaviorDaily(row("2026-01-15"));
    const resultAt30 = await computePersonalScore(repo, "u1", 30, now);
    const resultAt100 = await computePersonalScore(repo, "u1", 100, now);
    expect(resultAt30.score).toBe(resultAt100.score);
  });

  it("Score لا يتجاوز 100 ولا ينزل تحت 0 بأي حال", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-01-15T06:00:00Z");
    for (let d = 9; d <= 15; d++) {
      await repo.upsertBehaviorDaily(row(`2026-01-${String(d).padStart(2, "0")}`, {
        meals_logged: 5, protein_hit_target: true, water_hit_target: true,
      }));
    }
    const result = await computePersonalScore(repo, "u1", 9999, now);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
