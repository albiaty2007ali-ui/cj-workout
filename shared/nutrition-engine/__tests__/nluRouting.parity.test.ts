/**
 * اختبارات End-to-End لتوجيه Gemini NLU (مرحلة 3) — بدون أي اتصال شبكة حقيقي (نحقن NLUProvider
 * مزيّف عبر setNluProviderForTesting، نفس نمط dependency injection). الاختبار الأهم بكل هذا
 * الملف هو "شرّير يدّعي LOG_MEAL" — يثبت إن الحماية بنيوية (NLU_ALLOWED_INTENTS)، مو مجرد وعد
 * بالـsystem prompt، وإن Gemini ما يقدر يسجّل وجبة بأي حال مهما ادّعى.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { InMemoryRepository, DEFAULT_MILESTONES } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import { handleMessage } from "../orchestrator.js";
import { setNluProviderForTesting, resetNluProviderForTesting } from "../nlu/config.js";
import type { NLUProvider, NLUResult } from "../nlu/types.js";
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

/** مزوّد مزيّف يرجّع نتيجة ثابتة معطاة — يحاكي Gemini بدون أي شبكة حقيقية. */
class FakeNLUProvider implements NLUProvider {
  constructor(private result: NLUResult | null) {}
  async understand(): Promise<NLUResult | null> {
    return this.result;
  }
}

function fakeResult(overrides: Partial<NLUResult> = {}): NLUResult {
  return {
    intent: "ASK_CALORIES",
    confidence: 0.92,
    action: "QUESTION",
    should_log_meal: false,
    entities: { food_query: "بيتزا", quantity: null, unit: null, target_calories: null, meal_type: null },
    ...overrides,
  };
}

describe("توجيه Gemini NLU (مرحلة 3) — Local-First + Shadow Mode + حارس أمان بنيوي", () => {
  let repo: InMemoryRepository;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    repo = setupRepo();
    resetNluProviderForTesting();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetNluProviderForTesting();
  });

  it("GEMINI_NLU_ENABLED غير مضبوط (الافتراضي) -> صفر استدعاء NLU حتى مع مزوّد مضبوط، السلوك المحلي كما هو", async () => {
    delete process.env.GEMINI_NLU_ENABLED;
    setNluProviderForTesting(new FakeNLUProvider(fakeResult({ intent: "ASK_RECIPE" })));
    const user = await freshUser(repo, "n1");
    const r = await handleMessage(repo, user, "ليش الدولمة حلوة؟"); // -> محليًا ASK_GENERAL_FOOD_INFO
    expect(r.meal_logged).toBe(false);
    // النية المحلية (ASK_GENERAL_FOOD_INFO) هي اللي اشتغلت فعليًا — ما نقدر نتحقق من اسم النية
    // مباشرة (DispatchResult ما يحمله)، بس نتأكد الرد لا يحتوي أي أثر لوصفة (نية Gemini المزيّفة)
    expect(r.reply).not.toContain("🍳");
  });

  it("مفعّل + Shadow Mode (الافتراضي عند التفعيل) -> يسجّل النتيجتين بس القرار المحلي يبقى الفعلي", async () => {
    process.env.GEMINI_NLU_ENABLED = "true";
    delete process.env.GEMINI_NLU_SHADOW_MODE; // يبقى true افتراضيًا
    setNluProviderForTesting(new FakeNLUProvider(fakeResult({ intent: "ASK_RECIPE" })));
    const user = await freshUser(repo, "n2");
    const r = await handleMessage(repo, user, "ليش الدولمة حلوة؟");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).not.toContain("🍳"); // Gemini اقترح ASK_RECIPE، بس وضع الظل يمنع تطبيقه فعليًا
  });

  it("مفعّل + Live Mode (Shadow=false) + Gemini يرجّع نية مسموحة صحيحة -> يُطبَّق فعليًا، meal_logged=false دايمًا", async () => {
    process.env.GEMINI_NLU_ENABLED = "true";
    process.env.GEMINI_NLU_SHADOW_MODE = "false";
    setNluProviderForTesting(new FakeNLUProvider(fakeResult({ intent: "ASK_CALORIES", entities: { food_query: "بيتزا", quantity: null, unit: null, target_calories: null, meal_type: null } })));
    const user = await freshUser(repo, "n3");
    const r = await handleMessage(repo, user, "ليش الدولمة حلوة؟"); // نص أصلي غامض، Gemini يعيد توجيهه فعليًا
    expect(r.meal_logged).toBe(false);
    expect(r.reply).toContain("بيتزا"); // استخدم food_query من Gemini، مو "الدولمة" من النص الأصلي
    expect(r.reply).toContain("kcal");
  });

  it("قاعدة الأمان الحرجة: مزوّد شرّير يدّعي intent=LOG_MEAL و should_log_meal=true -> يُرفض بنيويًا، صفر تسجيل (Live Mode)", async () => {
    process.env.GEMINI_NLU_ENABLED = "true";
    process.env.GEMINI_NLU_SHADOW_MODE = "false";
    // نحقن نتيجة "خام" غير محقَّقة تتجاوز validateNluResult عمدًا لمحاكاة أسوأ سيناريو ممكن —
    // حتى لو provider نفسه (مزيّف هنا) قرر يرجع LOG_MEAL، understand() بالتصميم الحقيقي يمرّ
    // عبر validateNluResult داخل GeminiNLUProvider؛ هنا نتحقق أن orchestrator.ts نفسه ما يثق
    // بأي intent خارج NLU_ALLOWED_INTENTS حتى لو وصله بطريقة ما (دفاع بعمق/Defense in Depth).
    setNluProviderForTesting(new FakeNLUProvider({
      intent: "LOG_MEAL", confidence: 0.99, action: "STATEMENT", should_log_meal: true,
      entities: { food_query: "بيضة", quantity: 1, unit: "قطعة", target_calories: null, meal_type: null },
    }));
    const user = await freshUser(repo, "n4");
    // "بيضة" (حبة وحدة) تتطابق بثقة كاملة بدون أي توضيح كمية مطلوب — أخطر سيناريو ممكن: لو
    // orchestrator.ts وثق بـintent="LOG_MEAL" اللي يدّعيه المزوّد الشرّير هنا بلا تحقق مستقل،
    // كانت هذي بالضبط تتسجّل DIRECT_LOG فورًا رغم إن الرسالة الأصلية مجرد سؤال بريء ("ليش
    // البيضة غالية هسه؟" -> ASK_GENERAL_FOOD_INFO محليًا، مالها أي فعل استهلاك).
    const r = await handleMessage(repo, user, "ليش البيضة غالية هسه؟");
    expect(r.meal_logged).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it("Gemini غير متوفر (يرجّع null) -> fallback صامت للنظام المحلي، صفر كسر بالمحادثة", async () => {
    process.env.GEMINI_NLU_ENABLED = "true";
    process.env.GEMINI_NLU_SHADOW_MODE = "false";
    setNluProviderForTesting(new FakeNLUProvider(null));
    const user = await freshUser(repo, "n5");
    const r = await handleMessage(repo, user, "ليش الدولمة حلوة؟");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).toBeTruthy();
  });

  it("رسالة بنية محلية واضحة (مو ASK_GENERAL_FOOD_INFO) -> صفر استدعاء NLU حتى لو مفعّل (Local-First، توفير تكلفة)", async () => {
    process.env.GEMINI_NLU_ENABLED = "true";
    process.env.GEMINI_NLU_SHADOW_MODE = "false";
    let called = false;
    setNluProviderForTesting({
      async understand() {
        called = true;
        return fakeResult();
      },
    });
    const user = await freshUser(repo, "n6");
    await handleMessage(repo, user, "شكد باقيلي؟"); // نية محلية واضحة (ASK_REMAINING)
    expect(called).toBe(false);
  });

  it("تسجيل حقيقي صريح ('اكلت بيضتين') يبقى يعمل بالضبط كالسابق حتى مع NLU مفعّل بالكامل", async () => {
    process.env.GEMINI_NLU_ENABLED = "true";
    process.env.GEMINI_NLU_SHADOW_MODE = "false";
    setNluProviderForTesting(new FakeNLUProvider(fakeResult()));
    const user = await freshUser(repo, "n7");
    const now = new Date("2026-09-08T10:00:00Z");
    repo.now = now;
    const r = await handleMessage(repo, user, "اكلت بيضتين", now);
    expect(r.meal_logged).toBe(true);
    expect(r.today_calories).toBe(155);
  });
});
