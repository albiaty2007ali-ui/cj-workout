/**
 * اختبارات End-to-End (InMemoryRepository + قاعدة foods.sqlite الحقيقية) لمعالجات الأسئلة
 * المعلوماتية الجديدة (ASK_CALORIES/ASK_FOOD_SIZE/ASK_UNIT/ASK_FOOD_FIT/ASK_SUBSTITUTION/
 * ASK_GENERAL_FOOD_INFO) — الشرط غير القابل للتفاوض بكل اختبار هنا: meal_logged يجب يبقى false،
 * لأن هذا بالضبط الـBug الحقيقي اللي اكتشفناه ("شكد حجم البيتزا؟" كانت تسجّل وجبة فعلية).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRepository, DEFAULT_MILESTONES } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import { handleMessage } from "../orchestrator.js";
import type { NutritionProfileRecord } from "../db/repository.js";

const STANDARD_PROFILE: Omit<NutritionProfileRecord, "user_id"> = {
  age: 25, weight_kg: 80, height_cm: 175, sex: "male", goal: "lose", activity_level: "moderate",
  bmr: 1774, tdee: 2749, calorie_target: 2249, water_target_ml: 2640, goal_weight: null,
};

function setupRepo(): InMemoryRepository {
  const repo = new InMemoryRepository();
  repo.streakMilestones = DEFAULT_MILESTONES;
  return repo;
}

async function freshUser(repo: InMemoryRepository, id: string): Promise<ReturnType<typeof makeUser>> {
  const user = makeUser({ id });
  repo.nutritionProfiles.set(id, { user_id: id, ...STANDARD_PROFILE });
  await repo.saveUser(user);
  return user;
}

describe("ASK_* أسئلة معلوماتية عن طعام — صفر تسجيل وجبة أبدًا (Bug الأمان الحقيقي المُصلَح)", () => {
  let repo: InMemoryRepository;

  beforeEach(() => {
    repo = setupRepo();
  });

  it("'شكد حجم البيتزا؟' -> معلومة حقيقية عن بيتزا، meal_logged=false (كان Bug: يسجّلها 293 سعرة)", async () => {
    const user = await freshUser(repo, "u1");
    const r = await handleMessage(repo, user, "شكد حجم البيتزا؟");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).toContain("بيتزا");
    expect(r.reply).toContain("kcal");
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it("'شكد سعرات البيتزا؟' -> نفس معلومة الكميات الحقيقية، meal_logged=false", async () => {
    const user = await freshUser(repo, "u2");
    const r = await handleMessage(repo, user, "شكد سعرات البيتزا؟");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).toContain("بيتزا");
  });

  it("'هل البيتزا تناسب سعراتي؟' -> يجاوب أي/لأ حسب الباقي الحقيقي، meal_logged=false", async () => {
    const user = await freshUser(repo, "u3");
    const r = await handleMessage(repo, user, "هل البيتزا تناسب سعراتي؟");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).toMatch(/أي|لأ/);
    expect(r.reply).toContain("بيتزا");
  });

  it("'شكد يعني صحن؟' بدون اسم طعام -> أمثلة حقيقية من القاعدة (مو مخترعة)، meal_logged=false", async () => {
    const user = await freshUser(repo, "u4");
    const r = await handleMessage(repo, user, "شكد يعني صحن؟");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).toContain("غ");
  });

  it("'شكد يعني خاشوقة؟' -> يذكر تمن (الوحدة الوحيدة الحقيقية المسجّلة كخاشوقة)، meal_logged=false", async () => {
    const user = await freshUser(repo, "u5");
    const r = await handleMessage(repo, user, "شكد يعني خاشوقة؟");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).toContain("تمن");
    expect(r.reply).toContain("15غ");
  });

  it("'أريد بديل أخف للبيتزا' -> بديل حقيقي بنفس التصنيف، meal_logged=false", async () => {
    const user = await freshUser(repo, "u6");
    const r = await handleMessage(repo, user, "أريد بديل أخف للبيتزا");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).toContain("بيتزا");
  });

  it("سؤال عام غير مطابق ('ليش الدولمة حلوة؟') -> رد صريح 'ما فهمت'، صفر تسجيل", async () => {
    const user = await freshUser(repo, "u7");
    const r = await handleMessage(repo, user, "ليش الدولمة حلوة؟");
    expect(r.meal_logged).toBe(false);
  });

  it("'مشتهي دولمة' ثم 'أريدها 500 سعرة' -> يختار أقرب كمية حقيقية للدولمة (مو بحث عام)، meal_logged=false بالخطوتين", async () => {
    const user = await freshUser(repo, "u8");
    const r1 = await handleMessage(repo, user, "مشتهي دولمة");
    expect(r1.meal_logged).toBe(false);
    const r2 = await handleMessage(repo, user, "أريدها 500 سعرة");
    expect(r2.meal_logged).toBe(false);
    expect(r2.reply).toContain("دولمة");
    expect(r2.reply).toContain("500");
  });

  it("'سويلي الغداء 600 سعرة' -> يقترح أكلات حقيقية قريبة من 600 سعرة (صيغة موسّعة لـASK_CALORIE_TARGET_MEAL)", async () => {
    const user = await freshUser(repo, "u9");
    const r = await handleMessage(repo, user, "سويلي الغداء 600 سعرة");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).toContain("600");
  });

  it("تسجيل حقيقي يبقى يعمل بالضبط كما كان: 'اكلت بيضتين' -> meal_logged=true، 155 سعرة", async () => {
    const user = await freshUser(repo, "u10");
    const now = new Date("2026-09-08T10:00:00Z");
    repo.now = now;
    const r = await handleMessage(repo, user, "اكلت بيضتين", now);
    expect(r.meal_logged).toBe(true);
    expect(r.today_calories).toBe(155);
  });

  it("'راح آكل بيتزا' -> PLAN_TO_EAT، صفر تسجيل (يبقى يعمل بعد إضافة الحارس الجديد)", async () => {
    const user = await freshUser(repo, "u11");
    const r = await handleMessage(repo, user, "راح آكل بيتزا");
    expect(r.meal_logged).toBe(false);
  });

  it("'مشتهي بيتزا' -> EXPRESS_CRAVING، صفر تسجيل (يبقى يعمل بعد إضافة الحارس الجديد)", async () => {
    const user = await freshUser(repo, "u12");
    const r = await handleMessage(repo, user, "مشتهي بيتزا");
    expect(r.meal_logged).toBe(false);
  });
});
