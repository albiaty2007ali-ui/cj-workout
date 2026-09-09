/**
 * اختبارات behaviorAggregator.ts — الطبقة الأولى من Captain CJ Intelligence. الشرط الأهم هنا:
 * لقطة اليوم تُبنى من meal_logs/water_logs الحقيقية فقط، وتُعاد كتابتها بالكامل كل استدعاء
 * (Idempotent، صفر تراكم خاطئ لو استُدعيت أكثر من مرة بنفس اليوم).
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { recordDailyBehavior, recentBehavior } from "../behaviorAggregator.js";
import type { NutritionProfileRecord } from "../db/repository.js";

const PROFILE: NutritionProfileRecord = {
  user_id: "u1", age: 25, weight_kg: 80, height_cm: 175, sex: "male", goal: "lose",
  activity_level: "moderate", bmr: 1774, tdee: 2749, calorie_target: 2249,
  water_target_ml: 2640, goal_weight: null,
};

describe("behaviorAggregator — لقطة سلوك يومية حقيقية", () => {
  it("يوم بدون أي نشاط -> meals_logged=0، صفر أهداف محقّقة", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-01-15T06:00:00Z"); // 09:00 بغداد
    repo.now = now;
    await recordDailyBehavior(repo, "u1", PROFILE, now);

    const row = await repo.findBehaviorDaily("u1", "2026-01-15");
    expect(row).not.toBeNull();
    expect(row!.meals_logged).toBe(0);
    expect(row!.protein_hit_target).toBe(false);
    expect(row!.water_hit_target).toBe(false);
    expect(row!.logged_before_noon).toBe(false);
  });

  it("وجبة بروتين عالي قبل الظهر بتوقيت بغداد -> logged_before_noon=true، protein_hit_target حسب المجموع الحقيقي", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-01-15T06:00:00Z"); // 09:00 بغداد
    repo.now = now;
    await repo.insertMealLog({
      user_id: "u1", meal_type: "breakfast", raw_text: "دجاج", matched_foods_json: "[]",
      total_calories: 400, total_protein: 60, total_carbs: 0, total_fat: 10, is_free_meal: false,
    });
    await recordDailyBehavior(repo, "u1", PROFILE, now);

    const row = await repo.findBehaviorDaily("u1", "2026-01-15");
    expect(row!.meals_logged).toBe(1);
    expect(row!.logged_before_noon).toBe(true);
    // هدف البروتين الحقيقي لهذا البروفايل (80كغم، lose) = round(1.6*80) = 128غ — 60غ لا يكفي
    expect(row!.protein_hit_target).toBe(false);
  });

  it("وجبة بعد الظهر بتوقيت بغداد -> logged_before_noon=false", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-01-15T15:00:00Z"); // 18:00 بغداد
    repo.now = now;
    await repo.insertMealLog({
      user_id: "u1", meal_type: "dinner", raw_text: "رز", matched_foods_json: "[]",
      total_calories: 500, total_protein: 20, total_carbs: 80, total_fat: 5, is_free_meal: false,
    });
    await recordDailyBehavior(repo, "u1", PROFILE, now);

    const row = await repo.findBehaviorDaily("u1", "2026-01-15");
    expect(row!.logged_before_noon).toBe(false);
  });

  it("استدعاء recordDailyBehavior مرتين بنفس اليوم -> صف واحد فقط، القيم الحقيقية الأخيرة (صفر تكديس)", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-01-15T06:00:00Z");
    repo.now = now;
    await recordDailyBehavior(repo, "u1", PROFILE, now);
    await repo.insertMealLog({
      user_id: "u1", meal_type: "breakfast", raw_text: "بيض", matched_foods_json: "[]",
      total_calories: 200, total_protein: 15, total_carbs: 2, total_fat: 10, is_free_meal: false,
    });
    await recordDailyBehavior(repo, "u1", PROFILE, now);

    const rows = await repo.findBehaviorDailyInRange("u1", "2026-01-15", "2026-01-15");
    expect(rows).toHaveLength(1);
    expect(rows[0].meals_logged).toBe(1);
  });

  it("recentBehavior يرجّع فقط الأيام اللي فيها لقطة حقيقية ضمن النافذة، بدون ملء فراغات", async () => {
    const repo = new InMemoryRepository();
    const day1 = new Date("2026-01-10T06:00:00Z");
    repo.now = day1;
    await recordDailyBehavior(repo, "u1", PROFILE, day1);

    const day3 = new Date("2026-01-12T06:00:00Z");
    repo.now = day3;
    await recordDailyBehavior(repo, "u1", PROFILE, day3);

    const rows = await recentBehavior(repo, "u1", 7, day3);
    expect(rows.map((r) => r.date)).toEqual(["2026-01-10", "2026-01-12"]);
  });

  it("مستخدم بدون NutritionProfile -> يسجّل بأمان، water_hit_target=false دايمًا (ماكو هدف)", async () => {
    const repo = new InMemoryRepository();
    const now = new Date("2026-01-15T06:00:00Z");
    repo.now = now;
    await repo.insertWaterLog({ user_id: "u1", ml: 5000 });
    await recordDailyBehavior(repo, "u1", null, now);

    const row = await repo.findBehaviorDaily("u1", "2026-01-15");
    expect(row!.water_hit_target).toBe(false);
    expect(row!.protein_hit_target).toBe(false);
  });
});
