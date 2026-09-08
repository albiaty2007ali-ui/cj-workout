/**
 * اختبارات تكافؤ لـdirectLog.ts وmealState.ts. بما إن orchestrator.ts لسا ما تحوّل (يجمع كل
 * القطع سوا)، هذا الاختبار يبني يدويًا نفس تسلسل العمليات اللي _finalize_meal تسويه بايثون
 * (تسجيل MealLog + منح 10XP + streaks.recordActiveDay + بناء Snapshot) ثم يتحقق أن undo()
 * يرجع كل شي بالضبط لما كان عليه — القيم الحقيقية مأخوذة من تشغيل كامل عبر
 * nutrition_engine.handle_message("اكلت بيضتين") ثم handle_message("لا") على تطبيق Flask+
 * SQLAlchemy حقيقي بالذاكرة:
 *
 *   بعد التسجيل: xp=15 (10 وجبة + 5 محطة "أول يوم"), free_meals_used=1, streak_days=1
 *   بعد التراجع: xp=0, free_meals_used=0, streak_days=0, MealLog محذوفة، last_direct_log_json=null
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository, DEFAULT_MILESTONES } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import * as xpEngine from "../xpEngine.js";
import * as streaks from "../streaks.js";
import * as directLog from "../directLog.js";
import * as mealState from "../mealState.js";
import type { NutritionProfileRecord } from "../db/repository.js";

async function simulateDirectLogMeal(repo: InMemoryRepository, user: ReturnType<typeof makeUser>, now: Date) {
  const wasFreeMeal = !user.is_premium;
  if (wasFreeMeal) user.free_meals_used += 1;

  const log = await repo.insertMealLog({
    user_id: user.id, meal_type: "lunch", raw_text: "اكلت بيضتين",
    matched_foods_json: JSON.stringify(["بيضة"]), total_calories: 155,
    total_protein: 13, total_carbs: 1.1, total_fat: 11, is_free_meal: wasFreeMeal,
  });

  const xpAwarded = 10;
  await xpEngine.awardXp(repo, user, xpAwarded, "meal_logged", log.id);
  const streakSnapshot = await streaks.recordActiveDay(repo, user, now);

  const snapshot = directLog.buildMealSnapshot(
    log.id, "lunch", "اكلت بيضتين", [], xpAwarded, wasFreeMeal, streakSnapshot, null, now,
  );
  await directLog.save(repo, user, snapshot);
  await repo.saveUser(user);
  return log;
}

describe("directLog — DIRECT_LOG ثم undo يرجع كل شي حرفيًا لحالته الأصلية", () => {
  it("تطابق تام مع القيم الحقيقية: xp 15->0, free_meals_used 1->0, streak_days 1->0", async () => {
    const repo = new InMemoryRepository();
    repo.streakMilestones = DEFAULT_MILESTONES;
    const user = makeUser();
    const now = new Date("2026-09-08T10:00:00Z");

    await simulateDirectLogMeal(repo, user, now);

    expect(user.xp).toBe(15); // 10 (وجبة) + 5 (محطة "أول يوم")
    expect(user.free_meals_used).toBe(1);
    expect(user.streak_days).toBe(1);
    expect(user.last_direct_log_json).not.toBeNull();

    const result = await directLog.undo(repo, user, now);

    expect(result.reply).toBe("تمام، رجعتها. السعرات والحالة رجعت متل ما كانت قبل التسجيل.");
    expect(user.xp).toBe(0);
    expect(user.free_meals_used).toBe(0);
    expect(user.streak_days).toBe(0);
    expect(user.last_direct_log_json).toBeNull();
    expect(await repo.findMealLogsInRange(user.id, new Date(0), new Date(Date.now() + 1e12))).toHaveLength(0);
  });

  it("بدون أي Snapshot صالح -> رسالة 'ماكو شي أگدر أتراجع عنه'", async () => {
    const repo = new InMemoryRepository();
    const user = makeUser();
    const result = await directLog.undo(repo, user);
    expect(result.reply).toBe("ماكو شي أگدر أتراجع عنه هسه.");
  });

  it("Snapshot منتهي النافذة الزمنية (5 دقايق) -> يُعامَل كأنه ماكو", async () => {
    const repo = new InMemoryRepository();
    repo.streakMilestones = DEFAULT_MILESTONES;
    const user = makeUser();
    const loggedAt = new Date("2026-09-08T10:00:00Z");
    await simulateDirectLogMeal(repo, user, loggedAt);

    const sixMinutesLater = new Date(loggedAt.getTime() + 6 * 60 * 1000);
    const result = await directLog.undo(repo, user, sixMinutesLater);
    expect(result.reply).toBe("ماكو شي أگدر أتراجع عنه هسه.");
    expect(user.last_direct_log_json).toBeNull(); // مُسحت تلقائيًا لأنها منتهية
  });

  it("reopenMealForEdit يرجّع pending قابل للتعديل ويحذف الوجبة القديمة", async () => {
    const repo = new InMemoryRepository();
    repo.streakMilestones = DEFAULT_MILESTONES;
    const user = makeUser();
    const now = new Date("2026-09-08T10:00:00Z");
    await simulateDirectLogMeal(repo, user, now);

    const reopened = await directLog.reopenMealForEdit(repo, user, now);
    expect(reopened).not.toBeNull();
    expect(reopened!.meal_type).toBe("lunch");
    expect(reopened!.state).toBe("AWAITING_CONFIRMATION");
    expect(user.xp).toBe(0); // نفس آثار undo الجانبية
    expect(await repo.findMealLogsInRange(user.id, new Date(0), new Date(Date.now() + 1e12))).toHaveLength(0);
  });
});

describe("mealState — تكافؤ حرفي مع meal_state.py", () => {
  it("newPending/currentState يطابقان الحالات الأربع الأساسية", () => {
    expect(mealState.currentState(null)).toBe(mealState.COMPLETED);
    const draft = mealState.newPending("lunch", "x");
    expect(mealState.currentState(draft)).toBe(mealState.DRAFT);
    draft.items.push({ food_id: 1, food_name: "بيضة", grams: 50, calories: 78, protein: 6.5, carbs: 0.55, fat: 5.5 });
    expect(mealState.currentState(draft)).toBe(mealState.AWAITING_CONFIRMATION);
    draft.pending_clarifications.push({ kind: "quantity", food_id: 2, food_name: "جبن" });
    expect(mealState.currentState(draft)).toBe(mealState.AWAITING_CLARIFICATION);
  });

  it("savePending/loadPending رحلة كاملة عبر Repository", async () => {
    const repo = new InMemoryRepository();
    const user = makeUser();
    const pending = mealState.newPending("dinner", "اكلت جبن");
    await mealState.savePending(repo, user, pending);
    expect(user.pending_meal_json).not.toBeNull();

    const loaded = mealState.loadPending(user);
    expect(loaded).not.toBeNull();
    expect(loaded!.meal_type).toBe("dinner");

    await mealState.savePending(repo, user, null);
    expect(user.pending_meal_json).toBeNull();
    expect(mealState.loadPending(user)).toBeNull();
  });
});
