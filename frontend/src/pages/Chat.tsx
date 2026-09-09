import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, type ChatReply, type MeResponse } from "../lib/api";
import type { GreetingResponse } from "../lib/greetingApi";
import type { DailyResponse, WeightStatsResponse } from "../lib/progressApi";
import AppShell from "../components/AppShell";
import AdSlot from "../components/AdSlot";
import { AD_SLOTS } from "../lib/adsConfig";
import { useI18n } from "../i18n/I18nContext";

interface Message {
  role: "user" | "bot";
  text: string;
}

const STATIC_PROMPTS = [
  { label: "🥗 شنو آكل هسه؟", prompt: "شنو آكل هسه؟" },
  { label: "🔥 شكد باقيلي سعرات؟", prompt: "باقيلي شكد سعرات؟" },
  { label: "😴 راح أنام", prompt: "راح أنام" },
];

export default function Chat() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const justOnboarded = params.get("welcome") === "1";
  const [me, setMe] = useState<MeResponse | null>(null);
  const [greeting, setGreeting] = useState<GreetingResponse | null>(null);
  const [daily, setDaily] = useState<DailyResponse | null>(null);
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);
  const [showProgress, setShowProgress] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { syncFromAccount } = useI18n();

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
            ? "خلصت وجباتك المجانية 🌱 تحتاج اشتراك للمتابعة."
            : res.error?.message ?? "صار خطأ، جرب مرة ثانية.";
        setMessages((prev) => [...prev, { role: "bot", text: message }]);
        return;
      }
      const reply = res.data?.reply ?? "...";
      setMessages((prev) => [...prev, { role: "bot", text: reply }]);
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
  const allPrompts = [...(greeting?.prompts ?? []), ...STATIC_PROMPTS];

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin={me.role === "admin"} onQuickPrompt={quickPrompt}>
      <div className="chat-page">
        <div className="chat-header">
          <strong>🥗 CJ WORKOUT</strong>
          <button type="button" className="progress-toggle-btn" onClick={() => setShowProgress((v) => !v)}>📈 التقدم</button>
        </div>

        {daily && daily.meals && (
          <div className="calorie-cards chat-calorie-cards">
            <div className="calorie-card">
              <p className="cc-label">🔥 هدفك اليوم</p>
              <p className="cc-value">{daily.target_calories} kcal</p>
            </div>
            <div className="calorie-card">
              <p className="cc-label">🍽️ أكلت</p>
              <p className="cc-value">{eatenToday} kcal</p>
            </div>
            <div className="calorie-card">
              <p className="cc-label">🎯 المتبقي</p>
              <p className="cc-value">{daily.remaining_calories} kcal</p>
            </div>
            <div className="calorie-card">
              <p className="cc-label">{me.is_premium ? "✓ Premium" : "⭐ تجربة مجانية"}</p>
              <p className="cc-value">{me.is_premium ? "نشط" : `${me.free_meals_remaining} / 6`}</p>
            </div>
          </div>
        )}

        {showProgress && (
          <div className="side-panel">
            <p className="font-display" style={{ fontWeight: 700, margin: 0 }}>تقدمك</p>
            <p>⭐ XP: {me.xp}</p>
            <p>🔥 Streak: {me.streak_days} يوم</p>
            <p>
              💧 الماي اليوم: {daily?.water_ml ?? 0} مل
              {me.profile ? ` / ${me.profile.water_target_ml} مل` : ""}
            </p>
            <p>⚖️ آخر وزن مسجّل: {currentWeight !== null ? `${currentWeight} كغم` : "ماكو تسجيل بعد"}</p>
          </div>
        )}

        <div className="chat-messages">
          {messages.length === 0 && (
            <>
              {justOnboarded && <div className="bubble bot">هلا بيك 👋 أنا كابتنك الغذائي بـ CJ WORKOUT. خلينا نبدأ.</div>}
              {greeting?.text && <div className="bubble bot" style={{ whiteSpace: "pre-line" }}>{greeting.text}</div>}
              {!greeting?.text && <p style={{ color: "#888", textAlign: "center" }}>ابدأ بكتابة شنو أكلت اليوم 🌱</p>}
            </>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>{m.text}</div>
          ))}
          {sending && (
            <div className="bubble bot typing-bubble" aria-label="جاري الكتابة">
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

        {!me.is_premium && <AdSlot html={AD_SLOTS.chatBanner} className="ad-slot ad-slot-inline" />}

        <form className="chat-input" onSubmit={sendMessage}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="اكتب رسالتك... (مثلاً: اكلت بيضتين)"
            disabled={sending}
          />
          <button type="submit" disabled={sending}>إرسال</button>
        </form>
      </div>
    </AppShell>
  );
}
