import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface Slide {
  icon: string;
  title: string;
  body: string;
}

/**
 * جولة "هلا بيك" التعريفية — تشرح الميزات الحقيقية الموجودة فعليًا بالتطبيق بس (صفر ميزة
 * مستقبلية غير مبنية بعد، زي Smart Meal Planner — تُضاف شريحة لها لما فعليًا تُبنى). منفصلة
 * تمامًا عن Onboarding.tsx (بروفايل غذائي حقيقي، بيانات لحساب السعرات) — هذي بس تعريف بالميزات.
 */
export const INTRO_SLIDES: Slide[] = [
  {
    icon: "🌱",
    title: "هلا بيك بـ CJ WORKOUT",
    body: "CJ WORKOUT هو كابتن تغذية ذكي يساعدك تتابع أكلك وسعراتك وماءك ووزنك، ويقترح عليك وجبات ووصفات مناسبة لهدفك.",
  },
  {
    icon: "🤖",
    title: "Captain CJ",
    body: "كابتنك الغذائي الذكي — يساعدك تفهم أكلك وتعرف شكد باقي لك، وتختار وجبتك القادمة بس بالحچي الطبيعي.",
  },
  {
    icon: "🍽️",
    title: "يومك الغذائي",
    body: "تابع الفطور والغداء والسناك والعشاء، واعرف السعرات المتبقية بلحظتها من صفحة \"يومي الغذائي\".",
  },
  {
    icon: "🥗",
    title: "وصفات",
    body: "وصفات حقيقية موجودة بقاعدة بيانات CJ WORKOUT — بسعرات وبروتين وكارب ودهون ومكونات وخطوات واضحة.",
  },
  {
    icon: "⚖️",
    title: "التقدم",
    body: "تابع وزنك وهدفك والتغيّر والمتوسط والاتجاه العام بمرور الوقت من صفحة \"متابعة الوزن\".",
  },
  {
    icon: "🔥",
    title: "الالتزام",
    body: "Streak وXP ومحطات إنجاز — كل ما تستمر أكثر، كل ما تشوف تقدمك أوضح.",
  },
];

interface IntroTourProps {
  /** لما تُفتح من الإعدادات (إعادة مشاهدة) بدل أول تسجيل دخول — ما ترسل طلب Backend، بس ترجع. */
  replayOnly?: boolean;
}

export default function IntroTour({ replayOnly = false }: IntroTourProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const total = INTRO_SLIDES.length;
  const slide = INTRO_SLIDES[step]!;
  const isLast = step === total - 1;

  async function finish() {
    if (replayOnly) {
      navigate("/settings");
      return;
    }
    setBusy(true);
    try {
      await api.post("/settings?action=intro", { completed: true });
    } finally {
      navigate("/chat");
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card intro-card">
        <div className="intro-icon">{slide.icon}</div>
        <h1 className="font-display">{slide.title}</h1>
        <p className="subtitle">{slide.body}</p>

        <div className="intro-dots">
          {INTRO_SLIDES.map((_, i) => (
            <span key={i} className={`intro-dot ${i === step ? "active" : ""}`} />
          ))}
        </div>

        <div className="ob-nav">
          {!replayOnly && !isLast && (
            <button type="button" className="btn btn-outline-dark" onClick={finish} disabled={busy}>
              تخطي
            </button>
          )}
          {step > 0 && (
            <button type="button" className="btn btn-outline-dark" onClick={() => setStep((s) => s - 1)}>
              السابق
            </button>
          )}
          {!isLast && (
            <button type="button" className="btn btn-moss" onClick={() => setStep((s) => Math.min(total - 1, s + 1))}>
              التالي
            </button>
          )}
          {isLast && (
            <button type="button" className="btn btn-gold" onClick={finish} disabled={busy}>
              {busy ? "..." : replayOnly ? "رجوع للإعدادات ✓" : "ابدأ 🚀"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
