/**
 * أنواع طبقة المحادثة (Gemini-First Conversational Brain) — راجع خطة "Gemini-First
 * Conversational AI Rearchitecture" للسياق الكامل. صفر منطق هنا، تعريفات فقط.
 */
import type { Repository, UserRecord } from "../db/repository.js";
import type { IntentContext } from "../intents.js";

/** سياق تنفيذ أداة واحدة — نفس المعطيات اللي orchestrator.ts يبنيها أصلًا لكل رسالة. */
export interface ToolExecContext {
  repo: Repository;
  user: UserRecord;
  /** النص الخام الأصلي كما كتبه المستخدم — أدوات التحوّر تعتمد عليه حصرًا، لا على أي شي يدّعيه Gemini. */
  rawText: string;
  ctxFlags: IntentContext;
  now: Date;
  /** حالة المحادثة المحفوظة (active_food إلخ) — log_meal يستخدمها فقط كمسار احتياطي آمن لرد
   *  تأكيد قصير ("ثبت"/"اي") بعد سؤال "أثبته؟"، راجع active_food's التوثيق بـtypes.ts. */
  conversationState: ConversationState;
}

/** أداة واحدة يقدر Gemini يطلب تنفيذها — description/parameters تُرسَل لـGemini حرفيًا كـfunctionDeclaration. */
export interface CJTool<TArgs = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  /** JSON Schema بصيغة Gemini (type: "OBJECT"/"STRING"/"NUMBER"/"ARRAY"/"BOOLEAN"، أحرف كبيرة). */
  parameters: object;
  /** true فقط لأدوات التحوّر (log_meal/undo_last_meal) — يقرر سلوك SHADOW mode (محاكاة بدل تنفيذ حقيقي). */
  mutates: boolean;
  execute(ctx: ToolExecContext, args: TArgs): Promise<TResult>;
}

/** حالة محادثة مركّبة، تُحفَظ فعليًا بـUserRecord.conversation_state_json (المرحلة 5). */
export interface ConversationState {
  /**
   * آخر طعام مطروح بالمحادثة — food_id/food_name يتحدّثون من أي استدعاء ناجح لـget_food_nutrition
   * (عرض فقط، صفر خطر). حقول التغذية (grams/calories/...) **تُملأ فقط** لو الاستدعاء نفسه مرّر
   * for_logging:true (راجع tools.ts) — هذا بالضبط الفارق بين "استفسار معلوماتي" و"تحضير لتسجيل
   * وجبة". log_meal يعتمد على وجود calories هنا كإذن احتياطي لرد تأكيد قصير فقط، صفر ثقة بأي
   * ادّعاء آخر من Gemini — الأرقام نفسها محسوبة بـcalculator.ts الحقيقي دائمًا، لا تُخترَع هنا.
   */
  active_food: {
    food_id: number; food_name: string;
    grams?: number; calories?: number; protein?: number; carbs?: number; fat?: number;
  } | null;
  active_intent: string | null;
  target_calories: number | null;
  awaiting: "quantity" | "confirmation" | "target_calories" | null;
  last_tool_calls: { tool: string; args_summary: string; result_summary: string }[];
  /** آخر 3 أدوار محادثة كحد أقصى (مستخدم+نموذج) — هذا ما يخلي متابعات قصيرة مثل "وإذا ثنتين؟"
   *  أو "500" (بعد "مشتهي دولمة") مفهومة لـGemini بدون إعادة سؤال المستخدم. */
  recent_turns: { role: "user" | "model"; text: string }[];
}

export type ConversationalMode = "OFF" | "SHADOW" | "ACTIVE";

/** سياق محدود يُرسَل لـGemini — أرقام حقيقية جاهزة (صفر داعي يطلبها بأداة منفصلة) + آخر أدوار قصيرة. */
export interface ConversationTurnContext {
  current_time_iraq: string;
  remaining_calories: number | null;
  target_calories: number | null;
  goal: string | null;
  conversation_state: ConversationState;
  /** آخر 3 أدوار كحد أقصى، كل نص مختصر — صفر تاريخ محادثة كامل غير محدود (ضبط تكلفة). */
  recent_turns: { role: "user" | "model"; text: string }[];
}

export interface ToolCallDecision {
  kind: "tool_call";
  toolName: string;
  toolArgs: Record<string, unknown>;
  /** بيانات خاصة بالمزوّد نفسه (مثلاً thoughtSignature بموديلات Gemini "المفكّرة") — تُمرَّر
   *  حرفيًا لـfinalize() لاحقًا بنفس المزوّد، لا يفتحها أو يفسّرها أي كود عام. */
  providerMeta?: unknown;
}

export type ConversationDecision = { kind: "text"; text: string } | ToolCallDecision;

/** الواجهة اللي أي مزوّد محادثة (Gemini حقيقي أو مزيّف بالاختبارات) يطبّقها — بروتوكول جولتين. */
export interface ConversationProvider {
  /** الجولة الأولى: رسالة + سياق + قائمة الأدوات المتاحة -> نص مباشر أو طلب أداة واحد. null = فشل/غير متاح. */
  decide(rawMessage: string, ctx: ConversationTurnContext, tools: CJTool[]): Promise<ConversationDecision | null>;
  /** الجولة الثانية: بعد تنفيذ الأداة فعليًا، يُعطى الناتج الموثوق فقط لصياغة رد نهائي طبيعي. null = فشل. */
  finalize(rawMessage: string, ctx: ConversationTurnContext, decision: ToolCallDecision, toolResult: unknown): Promise<string | null>;
}

export class NullConversationProvider implements ConversationProvider {
  async decide(): Promise<ConversationDecision | null> { return null; }
  async finalize(): Promise<string | null> { return null; }
}
