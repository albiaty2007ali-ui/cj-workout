/**
 * منسّق دورة محادثة واحدة (decide -> [تنفيذ أداة] -> finalize) — لا يُستدعى بعد من
 * orchestrator.ts (الربط الفعلي بالمرحلة 4). يُختبَر هنا فقط بمزوّد مزيّف (DI)، صفر اتصال شبكة
 * حقيقي، تمامًا نفس فلسفة nlu/config.ts's setNluProviderForTesting.
 *
 * قاعدة حرجة (راجع خطة "Gemini-First..."، قسم السقوط الآمن): السقوط لمسار محلي بديل يصح فقط
 * **قبل** نجاح أي أداة تحوّر — أداة log_meal/undo_last_meal ناجحة تُرجع نتيجتها فورًا، لا سقوط
 * بعدها أبدًا (يمنع تسجيل وجبة مرتين لو فشل استدعاء finalize بعد أداة تحوّر نجحت فعليًا).
 */
import type {
  CJTool, ConversationProvider, ConversationTurnContext, ToolExecContext,
} from "./types.js";

export interface ConversationalTurnOutcome {
  /** false = المزوّد فشل/غير متاح/طلب أداة غير موجودة قبل أي تحوّر فعلي -> الطالب يسقط لمسار محلي كامل بأمان. */
  handled: boolean;
  reply?: string;
  toolUsed?: string;
  toolResult?: unknown;
  /** true فقط لو أداة تحوّر فعلية نُفّذت بنجاح — الطالب يجب لا يسقط لمسار محلي بعدها إطلاقًا. */
  mutationOccurred: boolean;
}

function mutationSucceeded(tool: CJTool<any, any>, result: unknown): boolean {
  if (!tool.mutates) return false;
  if (result && typeof result === "object" && "ok" in result) return (result as { ok: unknown }).ok !== false;
  return true; // أداة تحوّر بدون حقل ok صريح (مثل undo_last_meal) — تُعامَل كمُنفَّذة فعليًا (نتيجتها الحقيقية بالرد نفسه)
}

export async function runConversationalTurn(
  provider: ConversationProvider,
  execCtx: ToolExecContext,
  turnCtx: ConversationTurnContext,
  allTools: CJTool<any, any>[],
  options: { dryRunMutations?: boolean } = {},
): Promise<ConversationalTurnOutcome> {
  const decision = await provider.decide(execCtx.rawText, turnCtx, allTools);
  if (!decision) return { handled: false, mutationOccurred: false };

  if (decision.kind === "text") {
    return { handled: true, reply: decision.text, mutationOccurred: false };
  }

  const tool = allTools.find((t) => t.name === decision.toolName);
  if (!tool) {
    // أداة غير موجودة أصلاً بسجلنا — صفر تحوّر حصل، آمن نسقط لمسار محلي كامل
    return { handled: false, mutationOccurred: false };
  }

  let toolResult: unknown;
  if (tool.mutates && options.dryRunMutations) {
    // SHADOW mode — صفر تنفيذ حقيقي لأداة تحوّر مهما طلب المزوّد
    toolResult = { ok: false, simulated: true };
  } else {
    try {
      toolResult = await tool.execute(execCtx, decision.toolArgs);
    } catch {
      toolResult = { ok: false, error: "TOOL_ERROR" };
    }
  }

  const mutationOccurred = mutationSucceeded(tool, toolResult);
  const finalText = await provider.finalize(execCtx.rawText, turnCtx, decision, toolResult);

  if (finalText === null) {
    if (mutationOccurred) {
      // تحوّر حقيقي حصل لكن صياغة الرد النهائي فشلت — نرجع الرد الحتمي المحلي بدل السقوط الكامل
      const localReply =
        (toolResult as { local_reply?: unknown })?.local_reply ??
        (toolResult as { reply?: unknown })?.reply ??
        null;
      return {
        handled: true, reply: typeof localReply === "string" ? localReply : undefined,
        toolUsed: decision.toolName, toolResult, mutationOccurred: true,
      };
    }
    return { handled: false, mutationOccurred: false };
  }

  return { handled: true, reply: finalText, toolUsed: decision.toolName, toolResult, mutationOccurred };
}
