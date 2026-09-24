/**
 * اختبارات الربط الفعلي بـorchestrator.handleMessage تحت الأوضاع الثلاث (OFF/SHADOW/ACTIVE) —
 * بمزوّد مزيّف (DI) دائمًا، صفر اتصال شبكة حقيقي. الهدف: تأكيد أن OFF يبقى المسار المحلي حرفيًا
 * (شبكة الأمان)، SHADOW لا يكتب أبدًا ولا يؤثر على الرد الفعلي، وACTIVE يستخدم الأداة الحقيقية
 * مع سقوط آمن للمسار المحلي عند فشل المزوّد — وصفر سقوط بعد نجاح تحوّر فعلي.
 */
import { describe, it, expect, afterEach } from "vitest";
import { InMemoryRepository } from "../../db/inMemoryRepository.js";
import { makeUser } from "../testHelpers.js";
import { handleMessage } from "../../orchestrator.js";
import {
  setConversationalModeForTesting, resetConversationalModeForTesting,
  setConversationProviderForTesting, resetConversationProviderForTesting,
} from "../../conversation/config.js";
import type { ConversationDecision, ConversationProvider, ConversationTurnContext, ToolCallDecision } from "../../conversation/types.js";
import type { NutritionProfileRecord, UserRecord } from "../../db/repository.js";

const STANDARD_PROFILE: Omit<NutritionProfileRecord, "user_id"> = {
  age: 25, weight_kg: 80, height_cm: 175, sex: "male", goal: "lose", activity_level: "moderate",
  bmr: 1774, tdee: 2749, calorie_target: 2249, water_target_ml: 2640, goal_weight: null,
};

async function freshUser(repo: InMemoryRepository, id: string): Promise<UserRecord> {
  const user = makeUser({ id });
  repo.nutritionProfiles.set(id, { user_id: id, ...STANDARD_PROFILE });
  await repo.saveUser(user);
  return user;
}

class ScriptedProvider implements ConversationProvider {
  constructor(
    private decision: ConversationDecision | null,
    private finalText: string | null | ((toolResult: unknown) => string | null) = "رد تجريبي",
  ) {}
  async decide(): Promise<ConversationDecision | null> { return this.decision; }
  async finalize(_raw: string, _ctx: ConversationTurnContext, _decision: ToolCallDecision, toolResult: unknown): Promise<string | null> {
    return typeof this.finalText === "function" ? this.finalText(toolResult) : this.finalText;
  }
}

afterEach(() => {
  resetConversationalModeForTesting();
  resetConversationProviderForTesting();
});

/** يسجّل كل سياق استُدعي فيه decide() — يسمح نتحقق شنو "شاف" Gemini بالدورة الثانية فعليًا. */
class QueuedSpyProvider implements ConversationProvider {
  public seenContexts: ConversationTurnContext[] = [];
  private queue: ConversationDecision[];
  constructor(decisions: ConversationDecision[], private finalText: string | ((toolResult: unknown) => string) = "رد") {
    this.queue = [...decisions];
  }
  async decide(_raw: string, ctx: ConversationTurnContext): Promise<ConversationDecision | null> {
    this.seenContexts.push(ctx);
    return this.queue.shift() ?? null;
  }
  async finalize(_raw: string, _ctx: ConversationTurnContext, _decision: ToolCallDecision, toolResult: unknown): Promise<string | null> {
    return typeof this.finalText === "function" ? this.finalText(toolResult) : this.finalText;
  }
}

describe("handleMessage — ذاكرة المحادثة (المرحلة 5) تعبر رسائل منفصلة فعليًا", () => {
  it("رسالة ثانية تشوف آخر أداة استُدعيت وrecent_turns من الرسالة الأولى", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "mem1");
    setConversationalModeForTesting("ACTIVE");
    const spy = new QueuedSpyProvider([
      { kind: "tool_call", toolName: "get_food_nutrition", toolArgs: { food_query: "رز", grams: 100 } },
      { kind: "text", text: "تمام" },
    ], (toolResult) => `الرز فيه ${(toolResult as { calories: number }).calories} سعرة`);
    setConversationProviderForTesting(spy);

    const first = await handleMessage(repo, user, "شكد سعرات الرز؟");
    expect(first.reply).toContain("سعرة");
    expect(spy.seenContexts).toHaveLength(1);
    expect(spy.seenContexts[0].conversation_state.active_food).toBeNull(); // أول رسالة، صفر ذاكرة بعد

    const reloadedUser = (await repo.findUser(user.id))!;
    await handleMessage(repo, reloadedUser, "وإذا ثنتين؟");
    expect(spy.seenContexts).toHaveLength(2);
    // الرسالة الثانية لازم تشوف الطعام المطروح بالأولى + نص الدورين السابقين
    expect(spy.seenContexts[1].conversation_state.active_food?.food_id).toBe(8);
    expect(spy.seenContexts[1].recent_turns.some((t) => t.text === "شكد سعرات الرز؟")).toBe(true);
    expect(spy.seenContexts[1].recent_turns.some((t) => t.text.includes("سعرة"))).toBe(true);
  });
});

describe("handleMessage — وضع OFF (الافتراضي)", () => {
  it("صفر استدعاء لأي مزوّد — نفس المسار المحلي حرفيًا حتى مع مزوّد مضبوط", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "off1");
    setConversationProviderForTesting(new ScriptedProvider({ kind: "text", text: "لازم ما توصل هذا الرد" }));
    const r = await handleMessage(repo, user, "اكلت بيضتين");
    expect(r.meal_logged).toBe(true);
    expect(r.reply).not.toBe("لازم ما توصل هذا الرد");
  });
});

describe("handleMessage — وضع SHADOW", () => {
  it("المزوّد يعمل بالخلفية لكن الرد الفعلي دائمًا من المسار المحلي، صفر تحوّر حتى لو طلب log_meal", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "shadow1");
    setConversationalModeForTesting("SHADOW");
    setConversationProviderForTesting(new ScriptedProvider({ kind: "tool_call", toolName: "log_meal", toolArgs: {} }, "رد Gemini المحاكى"));
    const r = await handleMessage(repo, user, "اكلت بيضتين");
    expect(r.meal_logged).toBe(true); // المسار المحلي فعلًا يسجّل (هذا سلوك اليوم الحقيقي، مو Gemini)
    expect(r.reply).not.toBe("رد Gemini المحاكى");
    expect(await repo.countMealLogsForUser(user.id)).toBe(1); // مرة وحدة، من المحلي فقط
  });

  it("سؤال بريء (حادثة البيتزا) + مزوّد شرّير يطلب log_meal بوضع SHADOW -> صفر تسجيل من أي مصدر", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "shadow2");
    setConversationalModeForTesting("SHADOW");
    setConversationProviderForTesting(new ScriptedProvider({ kind: "tool_call", toolName: "log_meal", toolArgs: {} }));
    const r = await handleMessage(repo, user, "شكد حجم البيتزا؟");
    expect(r.meal_logged).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });
});

describe("handleMessage — وضع ACTIVE", () => {
  it("رد نصي مباشر من المزوّد (صفر أداة) -> يوصل حرفيًا للمستخدم", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "active1");
    setConversationalModeForTesting("ACTIVE");
    setConversationProviderForTesting(new ScriptedProvider({ kind: "text", text: "هلا بيك، شلونك اليوم؟" }));
    // noonBaghdad — يمنع نتيجة under_target (context.ts) من التداخل مع تطابق نص حرفي غير مرتبط
    const r = await handleMessage(repo, user, "هلا", new Date("2026-01-01T09:00:00Z"));
    expect(r.reply).toBe("هلا بيك، شلونك اليوم؟");
    expect(r.meal_logged).toBe(false);
  });

  it("استدعاء أداة قراءة (get_daily_summary) -> الحقول العددية من الأداة، النص من Gemini", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "active2");
    setConversationalModeForTesting("ACTIVE");
    setConversationProviderForTesting(new ScriptedProvider(
      { kind: "tool_call", toolName: "get_daily_summary", toolArgs: {} },
      "باقيلك سعرات هواية اليوم 🌱",
    ));
    const r = await handleMessage(repo, user, "باقيلي شكد؟", new Date("2026-01-01T09:00:00Z"));
    expect(r.reply).toBe("باقيلك سعرات هواية اليوم 🌱");
    expect(r.meal_logged).toBe(false);
  });

  it("استهلاك فعلي حقيقي ('اكلت بيضتين') عبر log_meal -> MealLog حقيقي واحد، الأرقام من الأداة", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "active3");
    setConversationalModeForTesting("ACTIVE");
    setConversationProviderForTesting(new ScriptedProvider(
      { kind: "tool_call", toolName: "log_meal", toolArgs: {} },
      (toolResult) => `تمام، سجلتلك! باقيلك ${(toolResult as { remaining: number }).remaining} سعرة`,
    ));
    const r = await handleMessage(repo, user, "اكلت بيضتين");
    expect(r.meal_logged).toBe(true);
    expect(r.reply).toContain("سجلتلك");
    expect(await repo.countMealLogsForUser(user.id)).toBe(1);
  });

  it("حادثة البيتزا تحت ACTIVE — مزوّد شرّير يطلب log_meal مباشرة لسؤال بريء -> يُرفض، Gemini يجاوب طبيعيًا بدون تسجيل", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "active4");
    setConversationalModeForTesting("ACTIVE");
    setConversationProviderForTesting(new ScriptedProvider(
      { kind: "tool_call", toolName: "log_meal", toolArgs: {} },
      (toolResult) => ((toolResult as { ok: boolean }).ok ? "سجلتلك!" : "تقصد تسأل عن حجمها بس؟ 🙂"),
    ));
    const r = await handleMessage(repo, user, "شكد حجم البيتزا؟");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).not.toContain("سجلتلك");
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it("المزوّد يفشل (decide يرجع null) -> يسقط تلقائيًا للمسار المحلي بنفس نتيجته", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "active5");
    setConversationalModeForTesting("ACTIVE");
    setConversationProviderForTesting(new ScriptedProvider(null));
    const r = await handleMessage(repo, user, "اكلت بيضتين");
    expect(r.meal_logged).toBe(true); // المسار المحلي سجّلها فعليًا رغم فشل Gemini بالكامل
    expect(await repo.countMealLogsForUser(user.id)).toBe(1);
  });

  it("تحوّر ناجح لكن صياغة الرد النهائي فشلت -> صفر سقوط لمسار محلي بعده (يمنع تسجيل مزدوج)", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "active6");
    setConversationalModeForTesting("ACTIVE");
    setConversationProviderForTesting(new ScriptedProvider({ kind: "tool_call", toolName: "log_meal", toolArgs: {} }, null));
    const r = await handleMessage(repo, user, "اكلت بيضتين");
    expect(r.meal_logged).toBe(true);
    expect(await repo.countMealLogsForUser(user.id)).toBe(1); // مرة وحدة فقط، صفر تسجيل مضاعف
  });

  it("سقف الوجبات المجانية يبقى فعّال تحت ACTIVE — مستخدم غير مشترك ووصل السقف -> premium_required:true، صفر تسجيل رغم موافقة Gemini", async () => {
    const repo = new InMemoryRepository();
    const user = makeUser({ id: "active-cap", is_premium: false, free_meals_used: 6 }); // 6 = FREE_MEALS_CAP
    repo.nutritionProfiles.set(user.id, { user_id: user.id, ...STANDARD_PROFILE });
    await repo.saveUser(user);
    setConversationalModeForTesting("ACTIVE");
    setConversationProviderForTesting(new ScriptedProvider(
      { kind: "tool_call", toolName: "log_meal", toolArgs: {} },
      (toolResult) => ((toolResult as { ok: boolean }).ok ? "سجلتلك!" : "خلص اشتراكك المجاني، اشترك حتى تكمل 🌱"),
    ));
    const r = await handleMessage(repo, user, "اكلت بيضتين");
    expect((r as { premium_required?: boolean }).premium_required).toBe(true);
    expect(r.meal_logged).toBe(false);
    expect(r.reply).not.toContain("سجلتلك");
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it("علامة _composed_by_gemini الداخلية موجودة (chat.mts يستخدمها لتخطي rephrase الزائد)", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "active7");
    setConversationalModeForTesting("ACTIVE");
    setConversationProviderForTesting(new ScriptedProvider({ kind: "text", text: "هلا" }));
    const r = await handleMessage(repo, user, "هلا");
    expect((r as { _composed_by_gemini?: boolean })._composed_by_gemini).toBe(true);
  });
});

describe("handleMessage — علامة _composed_by_gemini غائبة خارج ACTIVE", () => {
  it("OFF: صفر علامة _composed_by_gemini", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "marker-off");
    const r = await handleMessage(repo, user, "اكلت بيضتين");
    expect((r as { _composed_by_gemini?: boolean })._composed_by_gemini).toBeUndefined();
  });

  it("SHADOW: صفر علامة _composed_by_gemini (الرد من المسار المحلي)", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "marker-shadow");
    setConversationalModeForTesting("SHADOW");
    setConversationProviderForTesting(new ScriptedProvider({ kind: "text", text: "رد Gemini المحاكى" }));
    const r = await handleMessage(repo, user, "اكلت بيضتين");
    expect((r as { _composed_by_gemini?: boolean })._composed_by_gemini).toBeUndefined();
  });
});
