/**
 * اختبارات consistencyScore.ts — مقياس منفصل عن Personal Score، نافذة أطول (21 يوم)، يقيس
 * الانتظام نفسه (تسجيل + مهام + عدم انقطاع) لا تحقيق الأهداف اليومية.
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { computeConsistencyScore } from "../consistencyScore.js";
import type { BehaviorDailyRecord } from "../db/repository.js";

function row(date: string, overrides: Partial<BehaviorDailyRecord> = {}): BehaviorDailyRecord {
  return { user_id: "u1", date, meals_logged: 0, protein_hit_target: false, water_hit_target: false, logged_before_noon: false, ...overrides };
}

function isoDaysBack(now: Date, n: number): string {
  const d = new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

describe("computeConsistencyScore — صفر بيانات -> صفر نقاط صريح", () => {
  it("ماكو behavior_daily أبدًا -> score=0 + breakdown 'بيانات غير كافية'", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-01-15T06:00:00Z");
    const result = await computeConsistencyScore(repo, "u1", now);
    expect(result.score).toBe(0);
    expect(result.days_with_activity).toBe(0);
    expect(result.breakdown[0].delta).toBe(0);
  });

  it("21 يوم كاملة مثالية (وجبتين+، كل المهام مكتملة، صفر انقطاع) -> score=100", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-01-21T06:00:00Z");
    for (let n = 0; n < 21; n++) {
      await repo.upsertBehaviorDaily(row(isoDaysBack(now, n), { meals_logged: 3, protein_hit_target: true, water_hit_target: true }));
    }
    const result = await computeConsistencyScore(repo, "u1", now);
    expect(result.score).toBe(100);
    expect(result.days_with_activity).toBe(21);
  });

  it("فجوة 10 أيام متتالية بدون تسجيل -> نقاط الحفاظ على العادة تنخفض فعليًا", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-01-21T06:00:00Z");
    // فقط آخر 5 أيام مسجّلة، أول 10 من النافذة (الأبعد بالتاريخ) بدون أي تسجيل
    for (let n = 0; n < 5; n++) {
      await repo.upsertBehaviorDaily(row(isoDaysBack(now, n), { meals_logged: 2, protein_hit_target: true, water_hit_target: true }));
    }
    const result = await computeConsistencyScore(repo, "u1", now);
    const gapItem = result.breakdown.find((b) => b.label.includes("الحفاظ على العادة"));
    expect(gapItem).toBeDefined();
    expect(gapItem!.delta).toBeLessThan(30);
  });

  it("الدرجة دائمًا بين 0 و100 حتى بأقصى نشاط", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-01-21T06:00:00Z");
    for (let n = 0; n < 21; n++) {
      await repo.upsertBehaviorDaily(row(isoDaysBack(now, n), { meals_logged: 6, protein_hit_target: true, water_hit_target: true }));
    }
    const result = await computeConsistencyScore(repo, "u1", now);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
