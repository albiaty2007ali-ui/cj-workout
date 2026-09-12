/**
 * Feature flag واحد يتحكّم بكل طبقة المحادثة الجديدة (Gemini-First Conversational Brain) —
 * نفس فلسفة nlu/config.ts (تشغيل/إيقاف بسيط + Shadow Mode، صفر Percentage Rollout). القيمة
 * الافتراضية OFF عمدًا: صفر تغيير على handleMessage() الحالي حتى يُضبَط المتغير صراحة.
 */
import type { ConversationalMode } from "./types.js";

let testOverride: ConversationalMode | "unset" = "unset";

/** للاختبارات فقط — يفرض وضعًا محددًا بغض النظر عن env، صفر اعتماد على process.env بالاختبارات. */
export function setConversationalModeForTesting(mode: ConversationalMode | null): void {
  testOverride = mode ?? "unset";
}

export function resetConversationalModeForTesting(): void {
  testOverride = "unset";
}

export function getConversationalMode(): ConversationalMode {
  if (testOverride !== "unset") return testOverride;
  const raw = process.env.GEMINI_CONVERSATIONAL_MODE;
  if (raw === "ACTIVE" || raw === "SHADOW") return raw;
  return "OFF";
}
