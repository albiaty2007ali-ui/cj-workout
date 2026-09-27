/**
 * تنفيذ ConversationProvider الحقيقي — Gemini عبر Function Calling الأصلي (tools/functionDeclarations)،
 * نفس نمط fetch() الخام المستخدم فعلاً بـnlu/geminiNluProvider.ts وprovider.ts (صفر SDK جديد،
 * صفر تبعية @google/genai). بروتوكول جولتين فقط لكل رسالة (decide ثم finalize لو احتاج أداة) —
 * راجع خطة "Gemini-First Conversational AI Rearchitecture" لتفاصيل ميزانية الوقت والسبب.
 *
 * صفر ثقة بمخرجات Gemini هنا — هذا الملف ينفّذ فقط "افهم واطلب"، التحقق والتنفيذ الفعلي
 * بمكان ثاني كليًا (conversation/brain.ts + tools.ts/mutationTools.ts).
 */
import { CONVERSATION_SYSTEM_INSTRUCTION, toolsToFunctionDeclarations } from "./systemInstruction.js";
import type { CJTool, ConversationDecision, ConversationProvider, ConversationTurnContext, ToolCallDecision } from "./types.js";

export const DECIDE_TIMEOUT_MS = 5000;
export const FINALIZE_TIMEOUT_MS = 4000;
const QUOTA_BACKOFF_MS = 60000;

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
  /** حقل حقيقي اكتُشف عبر Smoke Test ضد Gemini الحقيقي (موديلات "المفكّرة" الأحدث): لازم
   *  يُرجَع حرفيًا بنفس جزء functionCall لما يُعاد إرساله بمحادثة لاحقة، وإلا يرفض الطلب بـ400. */
  thoughtSignature?: string;
}
interface GeminiContent { role: string; parts: GeminiPart[] }
interface GeminiResponse { candidates?: { content?: GeminiContent }[] }

function buildContextText(ctx: ConversationTurnContext): string {
  const lines = [
    `الوقت الحالي ببغداد: ${ctx.current_time_iraq}`,
    ctx.streak_days > 0 ? `سلسلة الالتزام الحالية (Streak): ${ctx.streak_days} يوم` : null,
    ctx.is_premium ? `المستخدم مشترك (Premium)` : null,
    ctx.target_calories !== null ? `هدف السعرات اليومي: ${ctx.target_calories} kcal` : null,
    ctx.remaining_calories !== null ? `الباقي من السعرات اليوم: ${ctx.remaining_calories} kcal` : null,
    ctx.goal ? `هدف المستخدم: ${ctx.goal}` : null,
    ctx.conversation_state.active_food ? `آخر طعام مطروح بالمحادثة: ${ctx.conversation_state.active_food.food_name}` : null,
    ctx.conversation_state.target_calories !== null ? `هدف سعري مذكور بمحادثة سابقة: ${ctx.conversation_state.target_calories} kcal` : null,
    ctx.conversation_state.awaiting ? `المستخدم بانتظار جواب على: ${ctx.conversation_state.awaiting}` : null,
    ctx.conversation_state.disliked_foods.length > 0
      ? `أطعمة صرّح المستخدم برفضها سابقًا (استبعدها من أي اقتراح تصوغه بنفسك بالرد): ${ctx.conversation_state.disliked_foods.join("، ")}`
      : null,
    ctx.conversation_state.preferred_foods.length > 0
      ? `أطعمة صرّح المستخدم بحبّها سابقًا (فضّلها إذا مناسبة بالاقتراحات): ${ctx.conversation_state.preferred_foods.join("، ")}`
      : null,
    ctx.conversation_state.last_suggestion
      ? `آخر اقتراح فعلي عُرض عليه: ${ctx.conversation_state.last_suggestion.items.join("، ")}`
      : null,
  ].filter((l): l is string => l !== null);
  return lines.join("\n");
}

function historyToContents(ctx: ConversationTurnContext, finalUserText: string): GeminiContent[] {
  const history: GeminiContent[] = ctx.recent_turns.slice(-3).map((t) => ({
    role: t.role === "model" ? "model" : "user",
    parts: [{ text: t.text.slice(0, 300) }],
  }));
  history.push({ role: "user", parts: [{ text: finalUserText }] });
  return history;
}

export class GeminiConversationProvider implements ConversationProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private quotaExhaustedUntil = 0;

  constructor(apiKey: string, model = "gemini-3.5-flash-lite") {
    this.apiKey = apiKey;
    this.model = model;
  }

  private async callGemini(contents: GeminiContent[], tools: CJTool<any, any>[] | null, timeoutMs: number): Promise<GeminiResponse | null> {
    if (!this.apiKey) return null;
    if (Date.now() < this.quotaExhaustedUntil) return null; // Circuit breaker — تجاوز Quota مؤخرًا

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const body: Record<string, unknown> = {
        system_instruction: { parts: [{ text: CONVERSATION_SYSTEM_INSTRUCTION }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
      };
      if (tools && tools.length > 0) {
        body.tools = [{ functionDeclarations: toolsToFunctionDeclarations(tools) }];
        body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
      }
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: controller.signal, body: JSON.stringify(body),
      });
      if (res.status === 429) {
        this.quotaExhaustedUntil = Date.now() + QUOTA_BACKOFF_MS;
        console.warn("[conversation] gemini quota exceeded — تعطيل مؤقت 60 ثانية");
        return null;
      }
      if (!res.ok) {
        console.warn("[conversation] gemini request failed:", res.status, await res.text().catch(() => ""));
        return null;
      }
      return (await res.json()) as GeminiResponse;
    } catch (err) {
      console.warn("[conversation] gemini error:", err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async decide(rawMessage: string, ctx: ConversationTurnContext, tools: CJTool<any, any>[]): Promise<ConversationDecision | null> {
    if (!rawMessage.trim()) return null;
    const contents = historyToContents(ctx, `السياق:\n${buildContextText(ctx)}\n\nرسالة المستخدم: ${rawMessage}`);
    const data = await this.callGemini(contents, tools, DECIDE_TIMEOUT_MS);
    const part = data?.candidates?.[0]?.content?.parts?.[0];
    if (!part) return null;
    if (part.functionCall?.name) {
      return {
        kind: "tool_call", toolName: part.functionCall.name, toolArgs: part.functionCall.args ?? {},
        providerMeta: part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : undefined,
      };
    }
    if (part.text) return { kind: "text", text: part.text };
    return null;
  }

  async finalize(rawMessage: string, ctx: ConversationTurnContext, decision: ToolCallDecision, toolResult: unknown): Promise<string | null> {
    const contents = historyToContents(ctx, `السياق:\n${buildContextText(ctx)}\n\nرسالة المستخدم: ${rawMessage}`);
    const thoughtSignature = (decision.providerMeta as { thoughtSignature?: string } | undefined)?.thoughtSignature;
    contents.push({
      role: "model",
      parts: [{ functionCall: { name: decision.toolName, args: decision.toolArgs }, thoughtSignature }],
    });
    // ملاحظة حقيقية (اكتُشفت عبر Smoke Test فعلي ضد Gemini الحقيقي، ليست افتراضًا): role="function"
    // يُرفض صراحة بـ400 INVALID_ARGUMENT على هذا الـendpoint/الموديل — الأدوار المقبولة لا تتضمنه،
    // فقط "user" يعمل لحمل functionResponse هنا (يخالف بعض توثيق Gemini الأقدم، لكن هذا ما تحقق فعليًا).
    contents.push({ role: "user", parts: [{ functionResponse: { name: decision.toolName, response: toolResult } }] });
    const data = await this.callGemini(contents, null, FINALIZE_TIMEOUT_MS);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ?? null;
  }
}
