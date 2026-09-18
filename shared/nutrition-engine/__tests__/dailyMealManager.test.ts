/**
 * اختبارات "مدير وجبات اليوم" — logMealManually/updateMealLogTotals/deleteMealLogById
 * (orchestrator.ts). تتحقق من: إضافة يدوية حقيقية عبر بحث الأطعمة تُنشئ MealLog بأرقام حقيقية
 * (صفر اختراع)، تعديل يغيّر الأرقام الأربعة فقط (صفر أثر XP/ستريك)، حذف يرجّع XP وعداد الوجبات
 * المجانية الحقيقيين، وحذف/تعديل وجبة من خارج نطاق اليوم الحالي يُرفَض.
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import { logMealManually, updateMealLogTotals, deleteMealLogById } from "../orchestrator.js";
import type { NutritionProfileRecord } from "../db/repository.js";

const STANDARD_PROFILE: Omit<NutritionProfileRecord, "user_id"> = {
  age: 25, weight_kg: 80, height_cm: 175, sex: "male", goal: "lose", activity_level: "moderate",
  bmr: 1774, tdee: 2749, calorie_target: 2249, water_target_ml: 2640, goal_weight: null,
};

async function freshUser(repo: InMemoryRepository, id = "u1") {
  const user = makeUser({ id });
  repo.nutritionProfiles.set(id, { user_id: id, ...STANDARD_PROFILE });
  await repo.saveUser(user);
  return user;
}

describe("logMealManually — إضافة وجبة يدويًا عبر بحث الأطعمة الحقيقي", () => {
  it("food_id=1 (بيضة) بـ100غ -> MealLog حقيقي بأرقام حقيقية، XP وعداد مجاني يتحدّثون", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo);
    const now = new Date("2026-09-08T10:00:00Z");
    repo.now = now;

    const result = await logMealManually(repo, user, "breakfast", 1, "بيضة", 100, now);
    expect(result.meal_logged).toBe(true);

    const logs = await repo.findMealLogsInRange(user.id, new Date("2026-09-08T00:00:00Z"), new Date("2026-09-09T00:00:00Z"));
    expect(logs).toHaveLength(1);
    expect(logs[0].total_calories).toBeGreaterThan(0);
    expect(logs[0].is_free_meal).toBe(true);

    expect(user.free_meals_used).toBe(1);
    expect(user.xp).toBe(10);
  });
});

describe("updateMealLogTotals — تعديل يدوي للأرقام الأربعة فقط", () => {
  it("يغيّر الأرقام المخزَّنة بس، صفر أثر على XP/عداد الوجبات المجانية", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo);
    const now = new Date("2026-09-08T10:00:00Z");
    repo.now = now;

    await logMealManually(repo, user, "lunch", 1, "بيضة", 100, now);
    const [log] = await repo.findMealLogsInRange(user.id, new Date("2026-09-08T00:00:00Z"), new Date("2026-09-09T00:00:00Z"));
    const xpBefore = user.xp;
    const freeMealsBefore = user.free_meals_used;

    const result = await updateMealLogTotals(
      repo, user, log.id,
      { total_calories: 500, total_protein: 30, total_carbs: 40, total_fat: 10 },
      now,
    );
    expect(result.ok).toBe(true);

    const updated = await repo.findMealLog(log.id);
    expect(updated).toMatchObject({ total_calories: 500, total_protein: 30, total_carbs: 40, total_fat: 10 });
    expect(user.xp).toBe(xpBefore);
    expect(user.free_meals_used).toBe(freeMealsBefore);
  });

  it("وجبة من يوم ثاني -> NOT_FOUND، صفر تعديل", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo);
    const yesterday = new Date("2026-09-07T10:00:00Z");
    const today = new Date("2026-09-08T10:00:00Z");
    repo.now = yesterday;

    await logMealManually(repo, user, "lunch", 1, "بيضة", 100, yesterday);
    const [log] = await repo.findMealLogsInRange(user.id, new Date("2026-09-07T00:00:00Z"), new Date("2026-09-08T00:00:00Z"));

    const result = await updateMealLogTotals(
      repo, user, log.id,
      { total_calories: 999, total_protein: 1, total_carbs: 1, total_fat: 1 },
      today,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe("NOT_FOUND");
    const untouched = await repo.findMealLog(log.id);
    expect(untouched!.total_calories).not.toBe(999);
  });
});

describe("deleteMealLogById — حذف أي وجبة من اليوم، مو بس الأخيرة", () => {
  it("يحذف السجل، يرجّع XP وعداد الوجبات المجانية الحقيقيين، صفر أثر ستريك (قيد موثَّق)", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo);
    const now = new Date("2026-09-08T10:00:00Z");
    repo.now = now;

    // وجبتان — نحذف الأولى فقط، نتأكد الثانية تبقى سليمة
    await logMealManually(repo, user, "breakfast", 1, "بيضة", 100, now);
    await logMealManually(repo, user, "lunch", 1, "بيضة", 100, now);
    const logsBefore = await repo.findMealLogsInRange(user.id, new Date("2026-09-08T00:00:00Z"), new Date("2026-09-09T00:00:00Z"));
    expect(logsBefore).toHaveLength(2);
    const xpAfterTwoMeals = user.xp;
    const streakDaysBefore = user.streak_days;

    const result = await deleteMealLogById(repo, user, logsBefore[0].id, now);
    expect(result.ok).toBe(true);

    const logsAfter = await repo.findMealLogsInRange(user.id, new Date("2026-09-08T00:00:00Z"), new Date("2026-09-09T00:00:00Z"));
    expect(logsAfter).toHaveLength(1);
    expect(logsAfter[0].id).toBe(logsBefore[1].id);

    expect(user.free_meals_used).toBe(1); // كانت 2، رجعت وحدة بعد حذف وجبة مجانية وحدة
    expect(user.xp).toBe(xpAfterTwoMeals - 10); // XP الوجبة المحذوفة بالضبط، مو رقم ثابت مفترَض
    expect(user.streak_days).toBe(streakDaysBefore); // قيد موثَّق: الحذف لا يلمس الستريك إطلاقًا
  });

  it("حذف وجبة مستخدم ثاني -> NOT_FOUND، صفر حذف", async () => {
    const repo = new InMemoryRepository();
    const owner = await freshUser(repo, "owner");
    const attacker = await freshUser(repo, "attacker");
    const now = new Date("2026-09-08T10:00:00Z");
    repo.now = now;

    await logMealManually(repo, owner, "breakfast", 1, "بيضة", 100, now);
    const [log] = await repo.findMealLogsInRange(owner.id, new Date("2026-09-08T00:00:00Z"), new Date("2026-09-09T00:00:00Z"));

    const result = await deleteMealLogById(repo, attacker, log.id, now);
    expect(result.ok).toBe(false);
    expect(await repo.findMealLog(log.id)).not.toBeNull();
  });
});
