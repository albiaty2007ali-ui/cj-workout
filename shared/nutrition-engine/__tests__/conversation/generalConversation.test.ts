/**
 * اختبارات المرحلة 6 — محادثة عامة/خارج النية المنظّمة تحت ACTIVE. لا يمكن اختبار "جودة" رد
 * Gemini الحقيقي آليًا (غير حتمي)، لكن يمكن تأكيد الضمانة البنيوية: أي نص يرجّعه المزوّد بدون
 * طلب أداة (decision.kind="text") يمر حرفيًا للمستخدم — صفر رفض تقني، صفر "ما فهمتك" مُدرَج من
 * الكود نفسه، صفر meal_logged، وصفر رقم غذائي مُختلَق (لأنه ماكو أداة استُدعيت أصلًا).
 */
import { describe, it, expect, afterEach } from "vitest";
import { InMemoryRepository } from "../../db/inMemoryRepository.js";
import { makeUser } from "../testHelpers.js";
import { handleMessage } from "../../orchestrator.js";
import {
  setConversationalModeForTesting, resetConversationalModeForTesting,
  setConversationProviderForTesting, resetConversationProviderForTesting,
} from "../../conversation/config.js";
import type { ConversationDecision, ConversationProvider } from "../../conversation/types.js";

afterEach(() => {
  resetConversationalModeForTesting();
  resetConversationProviderForTesting();
});

class DirectTextProvider implements ConversationProvider {
  constructor(private text: string) {}
  async decide(): Promise<ConversationDecision | null> { return { kind: "text", text: this.text }; }
  async finalize(): Promise<string | null> { return null; } // لا يُستدعى أصلًا (صفر أداة)
}

const GENERAL_MESSAGES_AND_REPLIES: [string, string][] = [
  ["هلا", "هلا بيك 😄 شلونك اليوم؟"],
  ["شلونك", "تمام الحمدلله، وياك؟ شلون أكلك اليوم؟"],
  ["حاس اليوم أكلي ملخبط", "تصير، لا تخلي وجبة وحدة تخرب عليك يومك كله 🙏"],
  ["اليوم تعبان", "أتفهم، خذلك راحتك، بس لا تنسى تشرب ماي 💧"],
  ["ما عندي نفس آكل", "براحتك، بس حاول لا تفوّت وجبة كاملة"],
  ["شنو يعني عجز سعرات؟", "يعني تاكل سعرات أقل من اللي جسمك يحرقها باليوم، فينزل وزنك تدريجيًا"],
  ["شجعني", "أنت قدها 💪 كل يوم تلتزم فيه خطوة أقرب لهدفك"],
  ["ها شنو أسوي؟", "شنو بالضبط تسأل عنه، الأكل لو التمرين؟"],
  ["شنو رأيك بهذا؟", "احتاج أفهم أكثر شنو تقصد بالضبط حتى أگدر أساعدك صح"],
  ["مادري", "ماكو مشكلة، خذ وقتك، أنا موجود لو احتجت شي"],
];

describe("محادثة عامة تحت ACTIVE — صفر رفض تقني، صفر رقم مُختلَق", () => {
  it.each(GENERAL_MESSAGES_AND_REPLIES)("'%s' -> رد Gemini يمر حرفيًا، meal_logged:false، صفر MealLog", async (msg, geminiReply) => {
    const repo = new InMemoryRepository();
    const user = makeUser({ id: `gen-${msg.length}-${Math.random()}` });
    await repo.saveUser(user);
    setConversationalModeForTesting("ACTIVE");
    setConversationProviderForTesting(new DirectTextProvider(geminiReply));

    const r = await handleMessage(repo, user, msg);
    expect(r.reply).toBe(geminiReply);
    expect(r.meal_logged).toBe(false);
    expect(r.reply).not.toContain("ما فهمتك");
    expect(r.reply).not.toContain("يرجى إعادة صياغة");
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
    // صفر أداة استُدعيت -> صفر حقل عددي يُفترض قادم من أداة غذائية
    expect(r.today_calories).toBeUndefined();
    expect(r.suggested_recipe).toBeUndefined();
  });
});

describe("عقد 'صفر اختراع' بنص التعليمات — يذكر القواعد الحرجة صراحة", () => {
  it("يحتوي منع 'ما فهمتك' ومنع اختراع الأرقام والوصفات صراحة", async () => {
    const { CONVERSATION_SYSTEM_INSTRUCTION } = await import("../../conversation/systemInstruction.js");
    expect(CONVERSATION_SYSTEM_INSTRUCTION).toContain("ما فهمتك");
    expect(CONVERSATION_SYSTEM_INSTRUCTION).toContain("لا تخترع");
    expect(CONVERSATION_SYSTEM_INSTRUCTION).toContain("recipe_id");
  });
});
