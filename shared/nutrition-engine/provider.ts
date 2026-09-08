/**
 * منفذ من nutrition_ai/provider.py — AIProvider يصيغ الجملة فقط (Natural Conversation)، ممنوع
 * يرجّع رقم سعرات/كمية يُستخدم بالحساب — الأرقام دائمًا جاهزة سلفًا من calculator.ts/responses.ts
 * وتُمرَّر كنص جاهز بـbaseText. GeminiProvider يستخدم Google AI Studio (Gemini API) المجاني —
 * بدون مفتاح بالبيئة (GEMINI_API_KEY) يرجّع isAvailable()=false ولا يُستدعى إطلاقًا.
 * لا يرمي أبدًا (best-effort) — أي فشل/تايم-أوت يرجّع null، والمستدعي (chat.mts) يستخدم النص
 * الأصلي من القوالب بدون أي تعطيل بالرد.
 */

export interface RephraseContext {
  /** اسم قصير للحدث (مثلاً "meal_logged"، "greeting") — يساعد الموديل يفهم السياق فقط، لا يُستخدم بالحساب. */
  kind?: string;
}

export interface AIProvider {
  isAvailable(): boolean;
  rephrase(baseText: string, context: RephraseContext): Promise<string | null>;
}

export class NullAIProvider implements AIProvider {
  isAvailable(): boolean {
    return false;
  }
  async rephrase(): Promise<string | null> {
    return null;
  }
}

const REPHRASE_TIMEOUT_MS = 4000;

const SYSTEM_INSTRUCTION =
  "انت تعيد صياغة جملة رد بوت تغذية عراقي بس، بلهجة عراقية طبيعية وودودة (خاطب المستخدم بـ\"كابتن\" أحيانًا). " +
  "ممنوع تغيّر أي رقم أو معنى موجود بالجملة الأصلية، وممنوع تضيف معلومة جديدة مو موجودة أصلًا، وممنوع تحذف أي رقم. " +
  "رجّع فقط الجملة المُعاد صياغتها، بدون علامات اقتباس وبدون أي شرح إضافي، وخليها بنفس الطول تقريبًا أو أقصر.";

export class GeminiProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = "gemini-3.5-flash-lite") {
    this.apiKey = apiKey;
    this.model = model;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async rephrase(baseText: string, context: RephraseContext): Promise<string | null> {
    if (!this.apiKey || !baseText.trim()) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REPHRASE_TIMEOUT_MS);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [
            { role: "user", parts: [{ text: `السياق: ${context.kind ?? "رد عام"}\nالجملة الأصلية: ${baseText}` }] },
          ],
          generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
        }),
      });
      if (!res.ok) {
        console.warn("gemini rephrase failed:", res.status, await res.text().catch(() => ""));
        return null;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      return text && text.length > 0 ? text : null;
    } catch (err) {
      console.warn("gemini rephrase error:", err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

let cachedProvider: AIProvider | null = null;

/** يُختار مرة وحدة ويُخزَّن (نفس نمط get_provider() بايثون) — AI_PROVIDER=gemini + GEMINI_API_KEY بالبيئة يفعّلها. */
export function getProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;
  const kind = process.env.AI_PROVIDER;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (kind === "gemini" && geminiKey) {
    cachedProvider = new GeminiProvider(geminiKey, process.env.GEMINI_MODEL || undefined);
  } else {
    cachedProvider = new NullAIProvider();
  }
  return cachedProvider;
}
