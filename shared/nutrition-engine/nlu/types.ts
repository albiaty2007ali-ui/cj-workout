/**
 * مرحلة 3 — Gemini كطبقة NLU (Language Understanding)، مو Nutrition Engine ولا Text Rewriter.
 * دوره الوحيد: يفهم الرسالة (نية + كيانات خام)، ويرجّع Structured Intent. أي رقم سعرات/كمية
 * نهائي يبقى يجي حصرًا من foods.sqlite عبر calculator.ts/foodSearch.ts — لا نثق بأي رقم يرجّعه
 * Gemini مباشرة، ولا نسمح له يسجّل وجبة (انظر nlu/knownIntents.ts وnlu/router.ts).
 */

export interface NLUEntities {
  food_query: string | null;
  quantity: number | null;
  unit: string | null;
  target_calories: number | null;
  meal_type: string | null;
}

export type NLUAction = "QUESTION" | "STATEMENT" | "REQUEST";

export interface NLUResult {
  intent: string;
  confidence: number;
  entities: NLUEntities;
  action: NLUAction;
  /** ادّعاء Gemini فقط — لا يكفي وحده لتسجيل وجبة أبدًا، انظر nlu/router.ts. */
  should_log_meal: boolean;
}

/** سياق محدود ومفيد فقط — أبدًا لا قاعدة بيانات كاملة ولا سجل محادثة بلا حدود (بند 8 بالطلب). */
export interface NLUContext {
  current_time_iraq: string;
  remaining_calories: number | null;
  target_calories: number | null;
  goal: string | null;
  pending_food_topic: string | null;
  has_pending_meal: boolean;
}

export interface NLUProvider {
  understand(rawMessage: string, context: NLUContext): Promise<NLUResult | null>;
}

export class NullNLUProvider implements NLUProvider {
  async understand(): Promise<NLUResult | null> {
    return null;
  }
}
