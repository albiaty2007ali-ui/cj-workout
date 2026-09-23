/**
 * تخزين/استرجاع ConversationState — نفس نمط pending_food_topic_json/last_direct_log_json تمامًا
 * (JSON على حقل UserRecord، صفر جدول/مجموعة جديدة). المرحلة 5: ذاكرة محادثة حقيقية.
 */
import type { Repository, UserRecord } from "../db/repository.js";
import type { ConversationState } from "./types.js";

export const EMPTY_CONVERSATION_STATE: ConversationState = {
  active_food: null, active_intent: null, target_calories: null, awaiting: null,
  last_tool_calls: [], recent_turns: [],
};

const MAX_RECENT_TURNS = 3;
const MAX_TOOL_CALLS_REMEMBERED = 3;

export function loadConversationState(user: UserRecord): ConversationState {
  if (!user.conversation_state_json) return EMPTY_CONVERSATION_STATE;
  try {
    const parsed = JSON.parse(user.conversation_state_json) as Partial<ConversationState>;
    return {
      active_food: parsed.active_food ?? null,
      active_intent: parsed.active_intent ?? null,
      target_calories: parsed.target_calories ?? null,
      awaiting: parsed.awaiting ?? null,
      last_tool_calls: parsed.last_tool_calls ?? [],
      recent_turns: parsed.recent_turns ?? [],
    };
  } catch {
    return EMPTY_CONVERSATION_STATE; // JSON تالف — تجاهل بأمان، نفس تسامح بقية الكود مع pending_*_json
  }
}

export async function saveConversationState(repo: Repository, user: UserRecord, state: ConversationState): Promise<void> {
  user.conversation_state_json = JSON.stringify(state);
  await repo.saveUser(user);
}

function summarize(value: unknown, maxLen = 120): string {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  } catch {
    return "";
  }
}

/**
 * يبني الحالة التالية بعد دورة محادثة واحدة — إضافي بحت (لا يحذف معلومة قديمة صالحة إلا
 * باستبدالها بمعلومة جديدة أدق). لا يخترع حقلًا لا تدعمه نتيجة الأداة نفسها.
 */
export function nextConversationState(
  prev: ConversationState, rawText: string, modelReply: string | null,
  toolUsed?: string, toolArgs?: Record<string, unknown>, toolResult?: unknown,
): ConversationState {
  const next: ConversationState = { ...prev };

  if (toolUsed && toolResult && typeof toolResult === "object") {
    const tr = toolResult as Record<string, unknown>;
    // أي أداة رجّعت food_id+food_name حقيقيين (get_food_nutrition, search_food أول نتيجة عبر
    // find_recipes...) تحدّث "آخر طعام مطروح" — هذا ما يخلي "وإذا ثنتين؟" مفهومة بدون تكرار الاسم.
    if (typeof tr.food_id === "number" && typeof tr.food_name === "string") {
      // حقول التغذية (وبالتالي إذن التأكيد القصير الاحتياطي بـlog_meal) تُملأ فقط لو الاستدعاء
      // نفسه علّم for_logging:true صراحة — يمنع سؤال معلوماتي بحت ("شكد سعرات البيتزا؟") من
      // تحويل رد تأكيد لاحق غير متعلق ("تمام") لتسجيل وجبة لم يصرّح المستخدم بأكلها إطلاقًا
      // (نفس فئة خطر "حادثة البيتزا"، راجع mutationTools.ts's logMeal لاستخدام هذا الحقل).
      const forLogging = toolArgs?.for_logging === true && typeof tr.calories === "number";
      next.active_food = {
        food_id: tr.food_id, food_name: tr.food_name,
        ...(forLogging ? {
          grams: typeof tr.grams === "number" ? tr.grams : undefined,
          calories: tr.calories as number,
          protein: typeof tr.protein === "number" ? tr.protein : undefined,
          carbs: typeof tr.carbs === "number" ? tr.carbs : undefined,
          fat: typeof tr.fat === "number" ? tr.fat : undefined,
        } : {}),
      };
    }
    // تسجيل وجبة ناجح ينهي موضوع "آخر طعام مطروح" — يمنع رد تأكيد لاحق غير متعلق من إعادة
    // تسجيل نفس الوجبة صدفة عبر نفس مسار الإذن الاحتياطي (راجع mutationTools.ts).
    if (toolUsed === "log_meal" && tr.ok === true) {
      next.active_food = null;
    }
    next.last_tool_calls = [
      ...prev.last_tool_calls,
      { tool: toolUsed, args_summary: summarize(toolArgs ?? {}), result_summary: summarize(toolResult) },
    ].slice(-MAX_TOOL_CALLS_REMEMBERED);
  }

  const turns = [...prev.recent_turns, { role: "user" as const, text: rawText }];
  if (modelReply) turns.push({ role: "model" as const, text: modelReply });
  next.recent_turns = turns.slice(-MAX_RECENT_TURNS);

  return next;
}
