/**
 * اختبارات ميزة "تنبيه أكل قليل جدًا" (context.ts's under_target + orchestrator.ts's
 * attachUnderEatingNudge). طلب صريح محدَّث: الفحص محصور ≥21:00 بتوقيت بغداد بالضبط (حرفيًا،
 * صفر التفاف لما بعد منتصف الليل — new Date().getHours() >= 21 كما طُلب)، واستهلاك أقل من
 * 40% من الهدف اليومي (نسبة صريحة، بديل عن الحد المطلق MIN_SAFE_CALORIES المستخدَم سابقًا).
 * يتحقق أيضًا: صفر تناقض مع over_target، nudge_actions الثلاثة تظهر بالحالة الصحيحة، صفر
 * إلحاق فوق حديث عام بحت، وصفر إلحاق فوق سؤال توضيح كمية/هوية جارٍ (pending).
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import { build } from "../context.js";
import { handleMessage } from "../orchestrator.js";
import { UNDER_EATING_NUDGE_TEMPLATES } from "../responses.js";
import type { NutritionProfileRecord } from "../db/repository.js";

const STANDARD_PROFILE: Omit<NutritionProfileRecord, "user_id"> = {
  age: 25, weight_kg: 80, height_cm: 175, sex: "female", goal: "lose", activity_level: "moderate",
  bmr: 1500, tdee: 2000, calorie_target: 1800, water_target_ml: 2200, goal_weight: null,
};

async function freshUser(repo: InMemoryRepository, id: string, overrides: Partial<NutritionProfileRecord> = {}) {
  const user = makeUser({ id });
  repo.nutritionProfiles.set(id, { user_id: id, ...STANDARD_PROFILE, ...overrides });
  await repo.saveUser(user);
  return user;
}

const NIGHT = new Date("2026-01-01T19:00:00Z"); // بغداد 22:00 -> hour>=21 ✓
const EVENING_BEFORE_GATE = new Date("2026-01-01T15:00:00Z"); // بغداد 18:00 -> hour<21 (لا يفحص إطلاقًا)
const AFTER_MIDNIGHT = new Date("2026-01-01T22:00:00Z"); // بغداد 01:00 -> hour<21 حرفيًا (صفر التفاف)
const MORNING = new Date("2026-01-01T04:00:00Z"); // بغداد 07:00

describe("context.build — under_target", () => {
  it("الساعة 22:00 بغداد + استهلاك أقل من 40% من الهدف -> true", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u1");
    const ctx = await build(repo, user.id, repo.nutritionProfiles.get("u1")!, NIGHT);
    expect(ctx.consumed_calories).toBe(0);
    expect(ctx.under_target).toBe(true);
  });

  it("صباحًا رغم استهلاك صفري -> false (خارج نافذة ≥21:00)", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u2");
    const ctx = await build(repo, user.id, repo.nutritionProfiles.get("u2")!, MORNING);
    expect(ctx.under_target).toBe(false);
  });

  it("18:00 بغداد (مساءً بس قبل 21:00) رغم استهلاك صفري -> false (طلب صريح: ≥21:00 حرفيًا)", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u2b");
    const ctx = await build(repo, user.id, repo.nutritionProfiles.get("u2b")!, EVENING_BEFORE_GATE);
    expect(ctx.under_target).toBe(false);
  });

  it("01:00 بغداد (بعد منتصف الليل) -> false (حرفيًا hour>=21 بدون التفاف لما بعد منتصف الليل)", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u2c");
    const ctx = await build(repo, user.id, repo.nutritionProfiles.get("u2c")!, AFTER_MIDNIGHT);
    expect(ctx.under_target).toBe(false);
  });

  it("22:00 بغداد + استهلاك >= 40% من الهدف -> false", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u3");
    repo.now = NIGHT;
    await repo.insertMealLog({
      user_id: "u3", meal_type: "dinner", raw_text: "test", matched_foods_json: "[]",
      total_calories: 1200, total_protein: 50, total_carbs: 100, total_fat: 30, is_free_meal: true,
    });
    const ctx = await build(repo, user.id, repo.nutritionProfiles.get("u3")!, NIGHT);
    expect(ctx.consumed_calories).toBe(1200);
    expect(ctx.under_target).toBe(false);
  });

  it("over_target و under_target لا يتحققان معًا لهدف منطقي", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u4");
    repo.now = NIGHT;
    await repo.insertMealLog({
      user_id: "u4", meal_type: "lunch", raw_text: "test", matched_foods_json: "[]",
      total_calories: 3000, total_protein: 100, total_carbs: 300, total_fat: 100, is_free_meal: true,
    });
    const ctx = await build(repo, user.id, repo.nutritionProfiles.get("u4")!, NIGHT);
    expect(ctx.over_target).toBe(true);
    expect(ctx.under_target).toBe(false);
  });
});

describe("orchestrator.handleMessage — إلحاق تنبيه أكل قليل جدًا (attachUnderEatingNudge)", () => {
  it("'شكد باقيلي؟' الساعة 22:00 بيوم شبه فاضي -> رد يحمل التنبيه + nudge_actions الثلاثة", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u5");
    const r = await handleMessage(repo, user, "شكد باقيلي؟", NIGHT);
    expect(UNDER_EATING_NUDGE_TEMPLATES.some((t) => r.reply!.includes(t))).toBe(true);
    expect(r.nudge_actions).toEqual([
      { icon: "🍽️", label: "أضف وجبة", kind: "navigate", target: "/daily" },
      { icon: "🥗", label: "اقترحلي وجبة مناسبة", kind: "chat", prompt: "اقترحلي وجبة مناسبة" },
      { icon: "👨‍⚕️", label: "استشارة مختص", kind: "consult" },
    ]);
  });

  it("'هلا' الساعة 22:00 بيوم فاضي -> صفر تنبيه رغم under_target=true تقنيًا (حديث عام بحت)", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u6");
    const r = await handleMessage(repo, user, "هلا", NIGHT);
    expect(UNDER_EATING_NUDGE_TEMPLATES.some((t) => r.reply!.includes(t))).toBe(false);
    expect(r.nudge_actions).toBeUndefined();
  });

  it("'تسلم' (شكر) الساعة 22:00 بيوم فاضي -> صفر تنبيه", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u7");
    const r = await handleMessage(repo, user, "تسلم", NIGHT);
    expect(r.nudge_actions).toBeUndefined();
  });

  it("نفس الرسالة ظهرًا (noon) -> صفر تنبيه (خارج نافذة الفحص الزمنية)", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u8");
    const noon = new Date("2026-01-01T09:00:00Z");
    const r = await handleMessage(repo, user, "شكد باقيلي؟", noon);
    expect(r.nudge_actions).toBeUndefined();
  });

  it("مستخدم أكل كمية كافية الساعة 22:00 -> صفر تنبيه، صفر تناقض مع رد طبيعي", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u9");
    repo.now = NIGHT;
    await repo.insertMealLog({
      user_id: "u9", meal_type: "lunch", raw_text: "test", matched_foods_json: "[]",
      total_calories: 1200, total_protein: 50, total_carbs: 100, total_fat: 30, is_free_meal: true,
    });
    const r = await handleMessage(repo, user, "شكد باقيلي؟", NIGHT);
    expect(r.nudge_actions).toBeUndefined();
  });

  it("سؤال توضيح هوية جارٍ (confirm_match حقيقي، خطأ إملائي) الساعة 22:00 بيوم فاضي -> صفر تنبيه فوق سؤال التوضيح", async () => {
    // بگ حقيقي مُكتشَف من شكوى مستخدم ("أكلت تمن وقيمة" -> رد سؤال توضيح ملحوق بتنبيه أكل قليل
    // غير مرتبط، يربك): وجود pending جارٍ يعني الرد أصلًا سؤال متابعة — إلحاق تنبيه فوقه يربك.
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u10");
    const first = await handleMessage(repo, user, "اكلت بيظتين", NIGHT); // خطأ إملائي -> confirm_match حقيقي
    expect(first.meal_logged).toBe(false);
    expect(first.nudge_actions).toBeUndefined();
  });
});
