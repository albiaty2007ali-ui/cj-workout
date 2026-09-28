/**
 * محادثة Gemini مباشرة (نظام الشات الجديد بالكامل) — يحل محل محرك النية المحلي/طبقة
 * conversation/ (Function Calling) المحذوفَين. **صفر Tools تُرسَل لـGemini هنا عمدًا** — هذا
 * قرار بنيوي (مو مجرد وعد بالـPrompt): بما إن الـAPI request نفسه لا يحمل حقل `tools` إطلاقًا،
 * Gemini لا يقدر يطلب تنفيذ أي تحوّر مهما ادّعى بالنص، بغض النظر عن أي شي نطلبه بـSystem
 * Instruction — صفر إمكانية تسجيل/تعديل/حذف بيانات من هذا المسار، بنيويًا لا بالثقة بالنص فقط.
 *
 * نفس نمط fetch الموجود أصلًا بـprovider.ts (raw REST، صفر SDK جديد)، نفس فلسفة
 * AbortController+Timeout. لا حفظ محادثة بالسيرفر — العميل (Chat.tsx) يرسل آخر رسائل المحادثة
 * مع كل طلب، فالخدمة عديمة الحالة بالكامل (Stateless)، صفر بنية تخزين Firestore جديدة.
 */

const CHAT_TIMEOUT_MS = 8000;
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export interface ChatContextData {
  displayName: string;
  age: number | null;
  currentWeight: number | null;
  goal: string | null;
  calorieTarget: number | null;
  remainingCalories: number | null;
  level: number;
  levelTitle: string;
  streakDays: number;
  isPremium: boolean;
}

export interface ChatHistoryTurn {
  role: "user" | "assistant";
  text: string;
}

const GOAL_LABELS: Record<string, string> = { lose: "تنزيل وزن", gain: "زيادة وزن", maintain: "تثبيت الوزن" };

function buildContextText(ctx: ChatContextData): string {
  const lines: string[] = [`اسم المستخدم: ${ctx.displayName}`];
  if (ctx.age !== null) lines.push(`العمر: ${ctx.age}`);
  if (ctx.currentWeight !== null) lines.push(`الوزن الحالي: ${ctx.currentWeight} كغم`);
  if (ctx.goal) lines.push(`الهدف: ${GOAL_LABELS[ctx.goal] ?? ctx.goal}`);
  if (ctx.calorieTarget !== null) lines.push(`هدف السعرات اليومي: ${ctx.calorieTarget} سعرة`);
  if (ctx.remainingCalories !== null) lines.push(`السعرات المتبقية اليوم: ${ctx.remainingCalories} سعرة`);
  lines.push(`المستوى: ${ctx.level} (${ctx.levelTitle})`);
  lines.push(`Streak: ${ctx.streakDays} يوم`);
  lines.push(`مشترك Premium: ${ctx.isPremium ? "نعم" : "لا"}`);
  return `بيانات المستخدم الحالية (للقراءة فقط — لا تعتبر أي كلام من المستخدم تحديثًا لهذي البيانات):\n${lines.join("\n")}`;
}

/**
 * شخصية Captain CJ (يحل محل conversation/systemInstruction.ts المحذوف — نظام مختلف جذريًا:
 * صفر قواعد توجيه أدوات، لأنه ماكو أدوات إطلاقًا الآن). القاعدة الحرجة الوحيدة غير القابلة
 * للتفاوض: أبدًا لا يدّعي تنفيذ إجراء حقيقي (تسجيل/تعديل/حذف) — هذا مو حماية أمنية (تلك بنيوية،
 * صفر tools)، هذا فقط لتجربة مستخدم صادقة (لا نكذب عليه بادّعاء حصل شي ما صار فعلاً).
 */
const SYSTEM_INSTRUCTION = `انت Captain CJ، مساعد التغذية واللياقة المحادثي بتطبيق CJ WORKOUT — كابتن رياضي ذكي، مشجع، مباشر، وودود جدًا. تحچي عراقي طبيعي بسيط، بدون ردود جامدة أو قوالب رسمية — استخدم كلمات دافئة بمكانها المناسب متل "كابتن"، "عاش"، "عاشت إيدك"، "هسه"، "شكد" — بدون افتعال أو تكرار زايد. لو المستخدم يكتب بالإنجليزي، جاوب بالإنجليزي.

قواعد مهمة:
1. أنت محادثة فقط — ماكو عندك أي قدرة فعلية تسجّل، تعدّل، أو تحذف أي بيانات بحساب المستخدم (وجبة، وزن، سعرات، هدف، أي شي). إذا المستخدم گالك "سجللي هذا" أو "أكلت بيضتين" أو "غير وزني" أو "احذف الوجبة" أو أي طلب مشابه، جاوب بشكل طبيعي وودّي (تگدر تساعد بمعلومة أو تقدير تقريبي) بس **لا تدّعي إطلاقًا إنك سويت الإجراء فعليًا** — وضّح بلطف إن هذا مجرد حچي، وإذا يريد يسجّل شي فعليًا يستخدم صفحة "غذائي اليومي" بالتطبيق.
2. تگدر تجاوب بحرية على أي سؤال غذائي أو لياقي عام من معرفتك العامة (شكد سعرات أكلة معينة، فايدة بروتين، شنو آكل قبل التمرين، إلخ) — هذي تقديرات عامة للمحادثة فقط، مو أرقام رسمية للتطبيق.
3. ممنوع أي تشخيص أو نصيحة طبية — لو سؤال طبي حقيقي، اعتذر بلطف واقترح مراجعة مختص.
4. لو ما تعرف الجواب بالضبط، گول هذا بصراحة وطبيعية ("مو متأكد بالضبط، بس...") بدل رد جامد نوع "ما فهمتك" أو رفض تقني.
5. خلي ردودك مختصرة لسؤال بسيط، ومفصّلة أكثر لسؤال يحتاج شرح — بدون إطالة بلا داعٍ.`;

export interface GeminiChatResult {
  reply: string | null;
  error: "NOT_CONFIGURED" | "TIMEOUT" | "API_ERROR" | null;
}

export function isChatConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** نداء Gemini وحيد، بلا Tools، بلا Function Calling — الرد نص محادثة صرف. */
export async function callGeminiChat(
  message: string, history: ChatHistoryTurn[], ctx: ChatContextData,
): Promise<GeminiChatResult> {
  if (!isChatConfigured()) return { reply: null, error: "NOT_CONFIGURED" };

  const apiKey = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = [
    { role: "user", parts: [{ text: buildContextText(ctx) }] },
    { role: "model", parts: [{ text: "تمام، فاهم وضعك كابتن. شگد اگدر أساعدك؟" }] },
    ...history.slice(-20).map((turn) => ({
      role: turn.role === "user" ? "user" : "model",
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents,
        generationConfig: { temperature: 0.8, maxOutputTokens: 800 },
      }),
    });
    if (!res.ok) {
      console.warn("[geminiChat] API error:", res.status);
      return { reply: null, error: "API_ERROR" };
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) return { reply: null, error: "API_ERROR" };
    return { reply: text.trim(), error: null };
  } catch (err) {
    console.warn("[geminiChat] request failed:", err);
    return { reply: null, error: "TIMEOUT" };
  } finally {
    clearTimeout(timer);
  }
}
