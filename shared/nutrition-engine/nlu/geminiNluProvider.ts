/**
 * تنفيذ NLUProvider الوحيد الحالي — Gemini عبر Structured Output (responseSchema)، مقيّد بلائحة
 * NLU_ALLOWED_INTENTS (knownIntents.ts). لا يرمي أبدًا (best-effort، نفس فلسفة provider.ts) —
 * أي فشل/تايم-أوت/JSON غير صالح/نية غير مدرجة يرجّع null، والمستدعي (orchestrator.ts) يبقى
 * بالمسار المحلي فورًا بدون أي تعطيل بالرد.
 */
import { NLU_ALLOWED_INTENTS, validateNluResult } from "./knownIntents.js";
import type { NLUProvider, NLUResult, NLUContext } from "./types.js";

const NLU_TIMEOUT_MS = 4000;

const SYSTEM_INSTRUCTION =
  "انت طبقة فهم لغة (NLU) فقط لتطبيق تغذية عراقي اسمه CJ WORKOUT — دورك تفهم رسالة المستخدم " +
  "وترجّع نية مصنّفة (Structured Intent) بصيغة JSON فقط، حسب الـschema المعطى. " +
  "ممنوع تمامًا: لا تحسب سعرات، لا تخترع كمية غرام، لا تخترع تحويل وحدة (مثل كم غرام الصحن) — " +
  "هذي الأرقام تُحسب لاحقًا من قاعدة بيانات حقيقية، مو من معرفتك. مهمتك بس: (1) تحديد النية من " +
  `اللائحة المعطاة بالضبط، (2) استخراج اسم الطعام/الكمية/الوحدة/الهدف السعري لو مذكورين حرفيًا ` +
  "بالرسالة أو بالسياق (مو تخمين)، (3) تحديد إذا الرسالة سؤال/جملة إخبارية/طلب. " +
  "يجب أن تكون قيمة intent واحدة بالضبط من هذي اللائحة: " +
  `${Array.from(NLU_ALLOWED_INTENTS).join(", ")}. ` +
  "should_log_meal يجب يكون false دايمًا — تصنيف تسجيل الوجبات مو من مسؤوليتك إطلاقًا ويُقرَّر " +
  "بمكان ثاني بقواعد صارمة. استخدم السياق المعطى (آخر موضوع طعام مطروح، الوقت، الهدف) لفهم " +
  'رسائل متابعة قصيرة مثل "500 سعرة" بعد "مشتهي دولمة" — يعني تخص نفس الطعام المطروح توًا.';

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    intent: { type: "STRING" },
    confidence: { type: "NUMBER" },
    action: { type: "STRING", enum: ["QUESTION", "STATEMENT", "REQUEST"] },
    should_log_meal: { type: "BOOLEAN" },
    entities: {
      type: "OBJECT",
      properties: {
        food_query: { type: "STRING", nullable: true },
        quantity: { type: "NUMBER", nullable: true },
        unit: { type: "STRING", nullable: true },
        target_calories: { type: "NUMBER", nullable: true },
        meal_type: { type: "STRING", nullable: true },
      },
      required: ["food_query", "quantity", "unit", "target_calories", "meal_type"],
    },
  },
  required: ["intent", "confidence", "action", "should_log_meal", "entities"],
};

function buildContextText(context: NLUContext): string {
  const lines = [
    `الوقت الحالي ببغداد: ${context.current_time_iraq}`,
    context.target_calories !== null ? `هدف السعرات اليومي: ${context.target_calories} kcal` : null,
    context.remaining_calories !== null ? `الباقي من السعرات اليوم: ${context.remaining_calories} kcal` : null,
    context.goal ? `هدف المستخدم: ${context.goal}` : null,
    context.pending_food_topic ? `آخر طعام مطروح بالمحادثة (لو الرسالة الحالية متابعة قصيرة، اربطها فيه): ${context.pending_food_topic}` : null,
    context.has_pending_meal ? "فيه وجبة قيد البناء حاليًا بالمحادثة (لا تعتبرها بهذا التصنيف)." : null,
  ].filter((l): l is string => l !== null);
  return lines.join("\n");
}

export class GeminiNLUProvider implements NLUProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = "gemini-3.5-flash-lite") {
    this.apiKey = apiKey;
    this.model = model;
  }

  async understand(rawMessage: string, context: NLUContext): Promise<NLUResult | null> {
    if (!this.apiKey || !rawMessage.trim()) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NLU_TIMEOUT_MS);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [
            { role: "user", parts: [{ text: `السياق:\n${buildContextText(context)}\n\nرسالة المستخدم: ${rawMessage}` }] },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 300,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      });
      if (!res.ok) {
        console.warn("[nlu] gemini request failed:", res.status, await res.text().catch(() => ""));
        return null;
      }
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return null;

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        console.warn("[nlu] gemini returned invalid JSON:", text.slice(0, 200));
        return null;
      }
      const result = validateNluResult(parsed);
      if (!result) console.warn("[nlu] gemini response failed schema validation:", JSON.stringify(parsed).slice(0, 300));
      return result;
    } catch (err) {
      console.warn("[nlu] gemini error:", err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
