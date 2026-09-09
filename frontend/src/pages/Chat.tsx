import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, type ChatReply, type MeResponse, type SuggestedRecipe } from "../lib/api";
import type { GreetingResponse } from "../lib/greetingApi";
import type { DailyResponse, WeightStatsResponse } from "../lib/progressApi";
import type { DailySummaryResponse } from "../lib/intelligenceApi";
import AppShell from "../components/AppShell";
import { useI18n } from "../i18n/I18nContext";

interface Message {
  role: "user" | "bot";
  text: string;
  recipeCard?: SuggestedRecipe;
}

/**
 * label تُترجَم (تُقرأ من translations.ts وقت العرض عبر t())، بس prompt يبقى نص عربي حرفي دائمًا
 * بغض النظر عن لغة الواجهة — هذا النص الفعلي المُرسَل لـ/chat، ومحرك NLU الخلفي عربي فقط
 * (قيد معماري موثَّق بـtranslations.ts، مو نسيان ترجمة).
 */
const STATIC_PROMPTS: Array<{ labelKey: "chat.quickPromptWhatToEat" | "chat.quickPromptRemaining" | "chat.quickPromptSleep"; prompt: string }> = [
  { labelKey: "chat.quickPromptWhatToEat", prompt: "شنو آكل هسه؟" },
  { labelKey: "chat.quickPromptRemaining", prompt: "باقيلي شكد سعرات؟" },
  { labelKey: "chat.quickPromptSleep", prompt: "راح أنام" },
];

export default function Chat() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const justOnboarded = params.get("welcome") === "1";
  const [me, setMe] = useState<MeResponse | null>(null);
  const [greeting, setGreeting] = useState<GreetingResponse | null>(null);
  const [daily, setDaily] = useState<DailyResponse | null>(null);
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);
  const [intelligence, setIntelligence] = useState<DailySummaryResponse | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { t, syncFromAccount } = useI18n();

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) {
        navigate("/login");
        return;
      }
      // نزامن تفضيل اللغة المحفوظ بالحساب مع الواجهة — بس لو هذا المتصفح ماله اختيار صريح
      // أصلاً (أول فتح من جهاز/متصفح جديد). راجع تعليق syncFromAccount بـI18nContext.tsx.
      syncFromAccount(res.data.language);
      if (!res.data.intro_completed) {
        navigate("/intro");
        return;
      }
      if (!res.data.onboarding_completed) {
        navigate("/onboarding");
        return;
      }
      setMe(res.data);
      if (res.data.profile) setRemaining(res.data.profile.calorie_target);
    });
    api.get<GreetingResponse>("/greeting").then((res) => {
      if (res.success && res.data) setGreeting(res.data);
    });
    api.get<DailyResponse>("/progress/daily").then((res) => {
      if (res.success && res.data && res.data.meals) setDaily(res.data);
    });
    // آخر وزن مسجّل — عرض معلوماتي بس بالوحة التقدم (لوحة الدشبورد المصغّرة)، صفر حساب/قرار
    // يعتمد عليه هنا (نفس مصدر الحقيقة الوحيد: weightStats.ts، مستخدم فعليًا بصفحة "متابعة الوزن").
    api.get<WeightStatsResponse>("/progress/weight?period=30").then((res) => {
      if (res.success && res.data) setCurrentWeight(res.data.current_weight);
    });
    api.get<DailySummaryResponse>("/intelligence?action=daily-summary").then((res) => {
      if (res.success && res.data) setIntelligence(res.data);
    });
  }, [navigate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setSending(true);

    try {
      const res = await api.post<ChatReply>("/chat", { message: text });
      if (!res.success) {
        const message =
          res.error?.code === "TRIAL_EXHAUSTED"
            ? t("chat.trialExhausted")
            : res.error?.message ?? t("chat.genericError");
        setMessages((prev) => [...prev, { role: "bot", text: message }]);
        return;
      }
      const reply = res.data?.reply ?? "...";
      setMessages((prev) => [...prev, { role: "bot", text: reply, recipeCard: res.data?.suggested_recipe ?? undefined }]);
      if (typeof res.data?.remaining === "number") setRemaining(res.data.remaining);
      if (typeof res.data?.today_calories === "number" && daily) {
        setDaily({ ...daily, target_calories: daily.target_calories });
      }
      // أرقام اليوم (أكلت/متبقي) ممكن تكون تغيّرت بعد أي رسالة (تسجيل وجبة/ماي) — نجيبها من جديد
      api.get<DailyResponse>("/progress/daily").then((r) => {
        if (r.success && r.data && r.data.meals) setDaily(r.data);
      });
    } finally {
      setSending(false);
    }
  }

  function quickPrompt(prompt: string) {
    setInput(prompt);
  }

  if (!me) return null; // بانتظار /api/me — لا نعرض القائمة الجانبية بدون اسم مستخدم حقيقي

  const eatenToday = daily ? daily.target_calories! - daily.remaining_calories! : null;
  // ملاحظة labelKey/label: prompts القادمة من الـBackend (greeting.prompts) نص عربي جاهز (توليد
  // ديناميكي حسب حالة المستخدم، مو Component)؛ STATIC_PROMPTS تُترجَم شكليًا هنا بس نص prompt
  // المُرسَل يبقى عربي (نفس القيد المعماري الموثَّق بـtranslations.ts).
  const allPrompts: { label: string; prompt: string }[] = [
    ...(greeting?.prompts ?? []),
    ...STATIC_PROMPTS.map((p) => ({ label: t(p.labelKey), prompt: p.prompt })),
  ];

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin={me.role === "admin"} onQuickPrompt={quickPrompt}>
      <div className="chat-page">
        <div className="chat-header">
          <strong>{t("chat.appName")}</strong>
          <button type="button" className="progress-toggle-btn" onClick={() => setShowProgress((v) => !v)}>{t("chat.progressButton")}</button>
        </div>

        {daily && daily.meals && (
          <div className="calorie-cards chat-calorie-cards">
            <div className="calorie-card">
              <p className="cc-label">{t("chat.targetLabel")}</p>
              <p className="cc-value">{daily.target_calories} kcal</p>
            </div>
            <div className="calorie-card">
              <p className="cc-label">{t("chat.eatenLabel")}</p>
              <p className="cc-value">{eatenToday} kcal</p>
            </div>
            <div className="calorie-card">
              <p className="cc-label">{t("chat.remainingLabel")}</p>
              <p className="cc-value">{daily.remaining_calories} kcal</p>
            </div>
            <div className="calorie-card">
              <p className="cc-label">{me.is_premium ? t("chat.premiumActive") : t("chat.freeTrialLabel")}</p>
              <p className="cc-value">{me.is_premium ? t("chat.activeStatus") : `${me.free_meals_remaining} / 6`}</p>
            </div>
          </div>
        )}

        {showProgress && (
          <div className="side-panel">
            <p className="font-display" style={{ fontWeight: 700, margin: 0 }}>{t("chat.yourProgressTitle")}</p>
            <p>⭐ XP: {me.xp}</p>
            <p>🔥 Streak: {me.streak_days} {t("profile.daysUnit")}</p>
            <p>
              {t("chat.waterTodayLabel")}: {daily?.water_ml ?? 0} مل
              {me.profile ? ` / ${me.profile.water_target_ml} مل` : ""}
            </p>
            <p>{t("chat.lastWeightLabel")}: {currentWeight !== null ? `${currentWeight} كغم` : t("chat.noWeightYet")}</p>
            {intelligence && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <p className="font-display" style={{ fontWeight: 700, margin: 0 }}>
                  {t("intelligence.scoreLabel")}: {intelligence.score}/100
                </p>
                <div className="tutorial-progress-bar">
                  <div className="tutorial-progress-fill" style={{ width: `${intelligence.score}%` }} />
                </div>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: 0 }}>{intelligence.insight}</p>
              </div>
            )}
          </div>
        )}

        <div className="chat-messages">
          {messages.length === 0 && (
            <>
              {justOnboarded && <div className="bubble bot">{t("chat.welcomeMessage")}</div>}
              {greeting?.text && <div className="bubble bot" style={{ whiteSpace: "pre-line" }}>{greeting.text}</div>}
              {!greeting?.text && <p style={{ color: "#888", textAlign: "center" }}>{t("chat.emptyStatePrompt")}</p>}
            </>
          )}
          {messages.map((m, i) => (
            <div key={i}>
              <div className={`bubble ${m.role}`}>{m.text}</div>
              {m.recipeCard && (
                <Link className="recipe-card chat-recipe-card" to={`/recipes/${encodeURIComponent(m.recipeCard.slug)}`}>
                  <div className="recipe-card-img-placeholder">🍽️</div>
                  <div className="recipe-card-body">
                    <p className="recipe-card-name">{m.recipeCard.name}</p>
                    <p className="recipe-card-macros">
                      {m.recipeCard.calories} kcal · بروتين {m.recipeCard.protein}غ · كارب {m.recipeCard.carbs}غ · دهون {m.recipeCard.fat}غ
                    </p>
                    <span className="btn btn-outline-dark recipe-card-btn">{t("chat.viewRecipeButton")}</span>
                  </div>
                </Link>
              )}
            </div>
          ))}
          {sending && (
            <div className="bubble bot typing-bubble" aria-label={t("chat.typingLabel")}>
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {allPrompts.length > 0 && (
          <div className="quick-prompts">
            {allPrompts.map((p, i) => (
              <button type="button" key={i} className="qp-btn" onClick={() => quickPrompt(p.prompt)}>{p.label}</button>
            ))}
          </div>
        )}

        <form className="chat-input" onSubmit={sendMessage}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("chat.inputPlaceholder")}
            disabled={sending}
          />
          <button type="submit" disabled={sending}>{t("chat.sendButton")}</button>
        </form>
      </div>
    </AppShell>
  );
}
