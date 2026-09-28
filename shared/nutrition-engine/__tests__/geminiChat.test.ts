/**
 * اختبارات النظام الجديد — محادثة Gemini المباشرة (geminiChat.ts). الشات الجديد **بنيويًا** عاجز
 * عن تعديل أي بيانات: geminiChat.ts لا يستقبل Repository إطلاقًا (توقيع الدالة نفسه لا يقبله)،
 * ولا يمرّر حقل `tools`/`functionDeclarations` لـGemini أبدًا — فحتى لو "وافق" Gemini المزيَّف
 * على تسجيل وجبة بالرد النصي، ماكو أي آلية بهذا الملف تقدر تنفّذ ذلك. هذا يثبت قسم 4/5/21 من
 * طلب المستخدم (رسائل مثل "أكلت بيضتين"/"سجللي وجبة"/"غير وزني إلى 60"/"احذف آخر وجبة"/
 * "أضف 500 سعرة" لا يترتب عليها أي كتابة قاعدة بيانات) دون حاجة لمحاكاة Firestore — الإثبات
 * بنيوي بمستوى توقيع الدالة نفسها، أقوى من اختبار سلوكي.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { callGeminiChat, isChatConfigured, type ChatContextData, type ChatHistoryTurn } from "../geminiChat.js";

const BASE_CTX: ChatContextData = {
  displayName: "علي", age: 25, currentWeight: 80, goal: "lose",
  calorieTarget: 2000, remainingCalories: 800, level: 3, levelTitle: "مبتدئ",
  streakDays: 5, isPremium: false,
};

function mockGeminiResponse(text: string, ok = true) {
  return {
    ok, status: ok ? 200 : 500,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  } as Response;
}

describe("geminiChat.callGeminiChat — الشات الجديد بلا Tools، بلا تعديل بيانات", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it("بدون GEMINI_API_KEY: يرجع NOT_CONFIGURED فورًا، صفر نداء fetch", async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await callGeminiChat("هلا", [], BASE_CTX);
    expect(result).toEqual({ reply: null, error: "NOT_CONFIGURED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("isChatConfigured يعكس وجود المفتاح مباشرة، صفر تخزين مؤقت عابر للاستدعاءات", () => {
    delete process.env.GEMINI_API_KEY;
    expect(isChatConfigured()).toBe(false);
    process.env.GEMINI_API_KEY = "test-key";
    expect(isChatConfigured()).toBe(true);
  });

  const MUTATION_ATTEMPT_MESSAGES = [
    "أكلت بيضتين",
    "سجللي وجبة",
    "غير وزني إلى 60",
    "احذف آخر وجبة",
    "أضف 500 سعرة",
    "مشتهي برگر",
  ];

  for (const msg of MUTATION_ATTEMPT_MESSAGES) {
    it(`"${msg}" — الطلب المُرسَل لـGemini بلا حقل tools/functionDeclarations إطلاقًا`, async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const fetchSpy = vi.fn().mockResolvedValue(mockGeminiResponse("تمام كابتن، بس هذا مجرد حچي، ما راح أسجّل شي فعليًا."));
      vi.stubGlobal("fetch", fetchSpy);

      const result = await callGeminiChat(msg, [], BASE_CTX);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const sentBody = JSON.parse(init.body as string);
      expect(sentBody.tools).toBeUndefined();
      expect(sentBody.functionDeclarations).toBeUndefined();
      expect(sentBody.tool_config).toBeUndefined();
      // الرد نص محادثة فقط — صفر حقل meal_logged/xp/remaining/أي أثر جانبي بالشكل المُرجَع.
      expect(Object.keys(result).sort()).toEqual(["error", "reply"]);
      expect(result.error).toBeNull();
      expect(typeof result.reply).toBe("string");
    });
  }

  it("السياق (history) يُمرَّر لـGemini بترتيبه — يخدم فهم المتابعة (مشتهي بيتزا ← شنو الحجم؟) بلا Intent System خارجي", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchSpy = vi.fn().mockResolvedValue(mockGeminiResponse("زين، حجم وسط يعطيك سعرات معقولة."));
    vi.stubGlobal("fetch", fetchSpy);

    const history: ChatHistoryTurn[] = [
      { role: "user", text: "مشتهي بيتزا" },
      { role: "assistant", text: "يصير، شنو الحجم المناسب؟" },
    ];
    await callGeminiChat("حجم وسط", history, BASE_CTX);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    const userTurns = sentBody.contents.filter((c: { role: string }) => c.role === "user").map((c: { parts: { text: string }[] }) => c.parts[0].text);
    expect(userTurns).toContain("مشتهي بيتزا");
    expect(userTurns).toContain("حجم وسط");
    // الرسالة الجديدة تجي آخر شي بالمحادثة (بعد الـhistory)، لا قبله.
    expect(sentBody.contents[sentBody.contents.length - 1].parts[0].text).toBe("حجم وسط");
  });

  it("فشل شبكة Gemini (fetch يرمي) → TIMEOUT، صفر استثناء يتسرّب للمستدعي", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await callGeminiChat("هلا", [], BASE_CTX);
    expect(result).toEqual({ reply: null, error: "TIMEOUT" });
  });

  it("استجابة Gemini غير ناجحة (HTTP != 200) → API_ERROR، صفر رمي", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockGeminiResponse("", false)));
    const result = await callGeminiChat("هلا", [], BASE_CTX);
    expect(result).toEqual({ reply: null, error: "API_ERROR" });
  });

  it("رد Gemini فاضي/بدون نص → API_ERROR بدل رد فاضي للمستخدم", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockGeminiResponse("   ")));
    const result = await callGeminiChat("هلا", [], BASE_CTX);
    expect(result.error).toBe("API_ERROR");
    expect(result.reply).toBeNull();
  });

  it("بيانات المستخدم تُرسَل كسياق قراءة فقط بالرسالة الأولى — توقيع الدالة لا يقبل Repository/UserRecord إطلاقًا (إثبات بنيوي لقسم 8)", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchSpy = vi.fn().mockResolvedValue(mockGeminiResponse("رد عادي"));
    vi.stubGlobal("fetch", fetchSpy);
    await callGeminiChat("هلا", [], BASE_CTX);
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.contents[0].parts[0].text).toContain("علي");
    expect(sentBody.contents[0].parts[0].text).toContain("للقراءة فقط");
  });
});
