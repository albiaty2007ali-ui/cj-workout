/**
 * Feature flags + اختيار Provider — نفس نمط provider.ts's getProvider() (اختيار مرة وحدة،
 * يُخزَّن). عمدًا بدون Percentage Rollout حقيقي بهذي المرحلة (ماكو قاعدة مستخدمين تبرر بنية
 * A/B كاملة الآن — راجع AI_ARCHITECTURE.md لسبب هذا القرار) — بس تشغيل/إيقاف بسيط GEMINI_NLU_ENABLED،
 * وShadow Mode افتراضي (GEMINI_NLU_SHADOW_MODE) حتى ما يغيّر أي رد فعلي إلا بعد تفعيله صراحة.
 */
import { GeminiNLUProvider } from "./geminiNluProvider.js";
import { NullNLUProvider, type NLUProvider } from "./types.js";

export function isNluEnabled(): boolean {
  return process.env.GEMINI_NLU_ENABLED === "true";
}

/** افتراضي true عمدًا — تفعيل NLU بدون تحديد صريح لوضع الظل يبقى آمن (يراقب بدون يغيّر شي). */
export function isShadowMode(): boolean {
  return process.env.GEMINI_NLU_SHADOW_MODE !== "false";
}

let cachedProvider: NLUProvider | null = null;
let testOverride: NLUProvider | null | "unset" = "unset";

/** للاختبارات فقط — يمنع ضرب Gemini API الحقيقي، ويسمح بحقن استجابات مزيّفة محكومة. */
export function setNluProviderForTesting(provider: NLUProvider | null): void {
  testOverride = provider;
}

export function resetNluProviderForTesting(): void {
  testOverride = "unset";
}

export function getNluProvider(): NLUProvider {
  if (testOverride !== "unset") return testOverride ?? new NullNLUProvider();
  if (cachedProvider) return cachedProvider;
  const key = process.env.GEMINI_API_KEY;
  cachedProvider = key ? new GeminiNLUProvider(key, process.env.GEMINI_MODEL || undefined) : new NullNLUProvider();
  return cachedProvider;
}
