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

/** حالة محادثة مركّبة قصيرة (المرحلة 5) — لا تُستخدم قبلها، معرّفة هنا مسبقًا لثبات الشكل. */
export interface ConversationState {
  active_food: { food_id: number; food_name: string } | null;
  active_intent: string | null;
  target_calories: number | null;
  awaiting: "quantity" | "confirmation" | "target_calories" | null;
  last_tool_calls: { tool: string; args_summary: string; result_summary: string }[];
}

export type ConversationalMode = "OFF" | "SHADOW" | "ACTIVE";
