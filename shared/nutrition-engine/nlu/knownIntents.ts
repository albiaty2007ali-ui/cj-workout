/**
 * لائحة النيات المسموح لـGemini يرجّعها — مبنية برمجيًا من ثوابت intents.ts نفسها (صفر تكرار
 * يدوي يمكن ينحرف عن الأصل). عمدًا تستثني نيات حساسة بحالة المحادثة (CONFIRM/CANCEL/CORRECTION/
 * ADD_FOOD/REMOVE_FOOD/CHANGE_QUANTITY/SWAP_FOOD/COOKING_STEP) — هذي تعتمد على pending state دقيق
 * ما ينفع تسليمه لقرار LLM. وتستثني LOG_MEAL نفسها بالذات (قاعدة الأمان الحرجة، بند 6 بالطلب):
 * Gemini ما يقدر أبدًا يوجّه رسالة لمسار تسجيل وجبة، حتى لو ادّعى should_log_meal=true.
 */
import * as intents from "../intents.js";

export const NLU_ALLOWED_INTENTS: ReadonlySet<string> = new Set([
  intents.ASK_CALORIES,
  intents.ASK_FOOD_SIZE,
  intents.ASK_UNIT,
  intents.ASK_FOOD_FIT,
  intents.ASK_SUBSTITUTION,
  intents.ASK_PORTION_FOR_FOOD,
  intents.ASK_REMAINING,
  intents.ASK_RECOMMENDATION,
  intents.ASK_CALORIE_TARGET_MEAL,
  intents.EXPRESS_CRAVING,
  intents.PLAN_TO_EAT,
  intents.ASK_RECIPE,
  intents.GENERAL_NUTRITION,
  intents.ASK_GENERAL_FOOD_INFO,
  intents.WHAT_IF,
  intents.COOK_FROM_INGREDIENTS,
]);

const NLU_ACTIONS = new Set(["QUESTION", "STATEMENT", "REQUEST"]);

/**
 * تحقّق صارم من شكل استجابة Gemini قبل استخدامها — أي حقل ناقص/نوع خاطئ/نية غير مدرجة
 * بـNLU_ALLOWED_INTENTS يرجّع null (يُعامَل كفشل NLU، يرجع النظام للمسار المحلي فورًا).
 */
export function validateNluResult(raw: unknown): import("./types.js").NLUResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.intent !== "string" || !NLU_ALLOWED_INTENTS.has(r.intent)) return null;
  if (typeof r.confidence !== "number" || Number.isNaN(r.confidence) || r.confidence < 0 || r.confidence > 1) return null;
  if (typeof r.should_log_meal !== "boolean") return null;
  if (typeof r.action !== "string" || !NLU_ACTIONS.has(r.action)) return null;

  const e = r.entities;
  if (typeof e !== "object" || e === null) return null;
  const ent = e as Record<string, unknown>;

  const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim().length > 0 ? v : null);
  const numOrNull = (v: unknown): number | null => (typeof v === "number" && !Number.isNaN(v) ? v : null);

  return {
    intent: r.intent,
    confidence: r.confidence,
    action: r.action as "QUESTION" | "STATEMENT" | "REQUEST",
    should_log_meal: r.should_log_meal,
    entities: {
      food_query: strOrNull(ent.food_query),
      quantity: numOrNull(ent.quantity),
      unit: strOrNull(ent.unit),
      target_calories: numOrNull(ent.target_calories),
      meal_type: strOrNull(ent.meal_type),
    },
  };
}
