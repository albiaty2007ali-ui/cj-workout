/**
 * Feature flag واحد يتحكّم بكل طبقة المحادثة الجديدة (Gemini-First Conversational Brain) —
 * نفس فلسفة nlu/config.ts (تشغيل/إيقاف بسيط + Shadow Mode، صفر Percentage Rollout). القيمة
 * الافتراضية OFF عمدًا: صفر تغيير على handleMessage() الحالي حتى يُضبَط المتغير صراحة.
 */
import { GeminiConversationProvider } from "./geminiConversationProvider.js";
import { NullConversationProvider } from "./types.js";
import type { ConversationalMode, ConversationProvider } from "./types.js";

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

let cachedProvider: ConversationProvider | null = null;
let providerTestOverride: ConversationProvider | null | "unset" = "unset";

/** للاختبارات فقط — يمنع ضرب Gemini API الحقيقي، يسمح بحقن مزوّد مزيّف محكوم (نفس نمط nlu/config.ts). */
export function setConversationProviderForTesting(provider: ConversationProvider | null): void {
  providerTestOverride = provider;
}

export function resetConversationProviderForTesting(): void {
  providerTestOverride = "unset";
}

export function getConversationProvider(): ConversationProvider {
  if (providerTestOverride !== "unset") return providerTestOverride ?? new NullConversationProvider();
  if (cachedProvider) return cachedProvider;
  const key = process.env.GEMINI_API_KEY;
  cachedProvider = key ? new GeminiConversationProvider(key, process.env.GEMINI_MODEL || undefined) : new NullConversationProvider();
  return cachedProvider;
}
