/**
 * اختبارات conversation/brain.ts — دائمًا بمزوّد مزيّف (DI)، صفر اتصال شبكة حقيقي. يغطي: رد
 * نصي مباشر بدون أداة، استدعاء أداة قراءة عادي، فشل المزوّد (Timeout/شبكة مُحاكى)، اسم أداة غير
 * موجود، ونظير "المزوّد الشرّير" لاختبار nluRouting.parity.test.ts القديم — مزوّد يحاول يخلي
 * log_meal يسجّل وجبة من سؤال بريء، ويُرفض هيكليًا رغم "ثقته" رغم إنه هو من يقرر استدعاء الأداة.
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../../db/inMemoryRepository.js";
import { makeUser } from "../testHelpers.js";
import { runConversationalTurn } from "../../conversation/brain.js";
import { READ_ONLY_TOOLS } from "../../conversation/tools.js";
import { logMeal, undoLastMeal } from "../../conversation/mutationTools.js";
import type {
  ConversationDecision, ConversationProvider, ConversationTurnContext, ToolExecContext, ConversationState, ToolCallDecision,
} from "../../conversation/types.js";
import type { NutritionProfileRecord, UserRecord } from "../../db/repository.js";

const STANDARD_PROFILE: Omit<NutritionProfileRecord, "user_id"> = {
  age: 25, weight_kg: 80, height_cm: 175, sex: "male", goal: "lose", activity_level: "moderate",
  bmr: 1774, tdee: 2749, calorie_target: 2249, water_target_ml: 2640, goal_weight: null,
};

async function freshUser(repo: InMemoryRepository, id: string, overrides: Partial<UserRecord> = {}): Promise<UserRecord> {
  const user = makeUser({ id, ...overrides });
  repo.nutritionProfiles.set(id, { user_id: id, ...STANDARD_PROFILE });
  await repo.saveUser(user);
  return user;
}

function execCtxFor(repo: InMemoryRepository, user: UserRecord, rawText: string): ToolExecContext {
  return { repo, user, rawText, ctxFlags: {}, now: new Date() };
}

const EMPTY_STATE: ConversationState = { active_food: null, active_intent: null, target_calories: null, awaiting: null, last_tool_calls: [], recent_turns: [] };

function turnCtx(): ConversationTurnContext {
  return { current_time_iraq: "afternoon", remaining_calories: 1000, target_calories: 2249, goal: "lose", conversation_state: EMPTY_STATE, recent_turns: [] };
}

const ALL_TOOLS = [...READ_ONLY_TOOLS, logMeal, undoLastMeal];

class ScriptedProvider implements ConversationProvider {
  constructor(
    private decision: ConversationDecision | null,
    private finalText: string | null | ((toolResult: unknown) => string | null) = "رد نهائي افتراضي",
  ) {}
  async decide(): Promise<ConversationDecision | null> { return this.decision; }
  async finalize(_raw: string, _ctx: ConversationTurnContext, _decision: ToolCallDecision, toolResult: unknown): Promise<string | null> {
    return typeof this.finalText === "function" ? this.finalText(toolResult) : this.finalText;
  }
}

describe("runConversationalTurn — رد نصي مباشر بدون أداة", () => {
  it("المزوّد يجاوب مباشرة (هلا/شكرًا) -> صفر استدعاء أداة", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "b1");
    const provider = new ScriptedProvider({ kind: "text", text: "هلا بيك 😄" });
    const r = await runConversationalTurn(provider, execCtxFor(repo, user, "هلا"), turnCtx(), ALL_TOOLS);
    expect(r.handled).toBe(true);
    expect(r.reply).toBe("هلا بيك 😄");
    expect(r.toolUsed).toBeUndefined();
    expect(r.mutationOccurred).toBe(false);
  });
});

describe("runConversationalTurn — استدعاء أداة قراءة عادي", () => {
  it("get_daily_summary -> ينفّذ الأداة فعليًا ويصوغ رد نهائي من نتيجتها", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "b2");
    const provider = new ScriptedProvider(
      { kind: "tool_call", toolName: "get_daily_summary", toolArgs: {} },
      (toolResult) => `باقيلك ${(toolResult as { remaining_calories: number }).remaining_calories} سعرة`,
    );
    const r = await runConversationalTurn(provider, execCtxFor(repo, user, "باقيلي شكد؟"), turnCtx(), ALL_TOOLS);
    expect(r.handled).toBe(true);
    expect(r.toolUsed).toBe("get_daily_summary");
    expect(r.reply).toContain(String(STANDARD_PROFILE.calorie_target));
    expect(r.mutationOccurred).toBe(false);
  });
});

describe("runConversationalTurn — فشل المزوّد يسقط بأمان", () => {
  it("decide يرجع null (Timeout/فشل محاكى) -> handled:false، صفر أداة", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "b3");
    const provider = new ScriptedProvider(null);
    const r = await runConversationalTurn(provider, execCtxFor(repo, user, "شكد سعرات البيضة؟"), turnCtx(), ALL_TOOLS);
    expect(r.handled).toBe(false);
    expect(r.mutationOccurred).toBe(false);
  });

  it("اسم أداة غير موجود بسجلنا -> handled:false، صفر تنفيذ", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "b4");
    const provider = new ScriptedProvider({ kind: "tool_call", toolName: "delete_everything", toolArgs: {} });
    const r = await runConversationalTurn(provider, execCtxFor(repo, user, "أي شي"), turnCtx(), ALL_TOOLS);
    expect(r.handled).toBe(false);
    expect(r.mutationOccurred).toBe(false);
  });

  it("finalize يفشل (null) بعد أداة قراءة عادية -> handled:false (صفر تحوّر حصل، السقوط آمن)", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "b5");
    const provider = new ScriptedProvider({ kind: "tool_call", toolName: "get_daily_summary", toolArgs: {} }, null);
    const r = await runConversationalTurn(provider, execCtxFor(repo, user, "باقيلي شكد؟"), turnCtx(), ALL_TOOLS);
    expect(r.handled).toBe(false);
  });
});

describe("runConversationalTurn — 'مزوّد شرّير' يحاول يخلي log_meal يسجّل وجبة من سؤال بريء", () => {
  it("'شكد حجم البيتزا؟' + المزوّد يستدعي log_meal مباشرة -> يُرفض هيكليًا، صفر MealLog", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "evilA");
    // المزوّد "الشرّير" هنا لا يمرر أي بيانات وهمية أصلاً (log_meal لا يقبل معاملات ذات معنى) —
    // لكن حتى لو ادّعى ثقة كاملة باستدعائه لهذا السؤال بالذات، isConsumptionAuthorized يرفضه.
    const provider = new ScriptedProvider(
      { kind: "tool_call", toolName: "log_meal", toolArgs: { confidence: 1, food: "بيتزا", calories: 850 } },
      (toolResult) => {
        const r = toolResult as { ok: boolean; rejection_reason?: string };
        return r.ok ? "سجلتلك الوجبة!" : "تقصد تسأل عن البيتزا مو أكلتها فعلاً؟ 🙂";
      },
    );
    const r = await runConversationalTurn(provider, execCtxFor(repo, user, "شكد حجم البيتزا؟"), turnCtx(), ALL_TOOLS);
    expect(r.handled).toBe(true);
    expect(r.mutationOccurred).toBe(false);
    expect((r.toolResult as { ok: boolean }).ok).toBe(false);
    expect(r.reply).not.toContain("سجلتلك");
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it.each([
    "مشتهي بيتزا", "راح آكل بيتزا", "أريد بيتزا", "هل البيتزا تناسب سعراتي؟", "شنو رايك ببيتزا اليوم؟",
  ])("'%s' + استدعاء log_meal مباشر من المزوّد -> صفر MealLog", async (msg) => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, `evil-${msg.length}-${Math.random()}`);
    const provider = new ScriptedProvider({ kind: "tool_call", toolName: "log_meal", toolArgs: {} });
    const r = await runConversationalTurn(provider, execCtxFor(repo, user, msg), turnCtx(), ALL_TOOLS);
    expect(r.mutationOccurred).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });
});

describe("runConversationalTurn — استهلاك فعلي حقيقي عبر log_meal", () => {
  it("'اكلت بيضتين' + المزوّد يستدعي log_meal -> ok:true، MealLog حقيقي واحد", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "real1");
    const provider = new ScriptedProvider(
      { kind: "tool_call", toolName: "log_meal", toolArgs: {} },
      (toolResult) => `تمام، سجلتلك الوجبة! باقيلك ${(toolResult as { remaining: number }).remaining} سعرة`,
    );
    const r = await runConversationalTurn(provider, execCtxFor(repo, user, "اكلت بيضتين"), turnCtx(), ALL_TOOLS);
    expect(r.handled).toBe(true);
    expect(r.mutationOccurred).toBe(true);
    expect(await repo.countMealLogsForUser(user.id)).toBe(1);
  });

  it("تحوّر ناجح لكن finalize يفشل (null) -> يرجع local_reply الحتمي بدل السقوط، صفر تسجيل مضاعف", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "real2");
    const provider = new ScriptedProvider({ kind: "tool_call", toolName: "log_meal", toolArgs: {} }, null);
    const r = await runConversationalTurn(provider, execCtxFor(repo, user, "اكلت بيضتين"), turnCtx(), ALL_TOOLS);
    expect(r.handled).toBe(true); // صفر سقوط لمسار محلي بعد تحوّر ناجح فعلي
    expect(r.mutationOccurred).toBe(true);
    expect(typeof r.reply).toBe("string");
    expect(await repo.countMealLogsForUser(user.id)).toBe(1); // مرة وحدة فقط
  });
});

describe("runConversationalTurn — SHADOW mode (dryRunMutations) لا يكتب أبدًا", () => {
  it("log_meal برسالة استهلاك حقيقية + dryRunMutations:true -> صفر MealLog، mutationOccurred:false", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "shadow1");
    const provider = new ScriptedProvider({ kind: "tool_call", toolName: "log_meal", toolArgs: {} }, "لو كنت أفعّل الوضع الحقيقي كنت سجلتها");
    const r = await runConversationalTurn(provider, execCtxFor(repo, user, "اكلت بيضتين"), turnCtx(), ALL_TOOLS, { dryRunMutations: true });
    expect(r.mutationOccurred).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });
});
