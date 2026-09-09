import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useI18n } from "../i18n/I18nContext";
import LanguageToggle from "../components/LanguageToggle";

interface Slide {
  icon: string;
  title: string;
  body: string;
}

/**
 * جولة "هلا بيك" التعريفية — تشرح الميزات الحقيقية الموجودة فعليًا بالتطبيق بس (صفر ميزة
 * مستقبلية غير مبنية بعد، زي Smart Meal Planner — تُضاف شريحة لها لما فعليًا تُبنى). منفصلة
 * تمامًا عن Onboarding.tsx (بروفايل غذائي حقيقي، بيانات لحساب السعرات) — هذي بس تعريف بالميزات.
 * تُستخدم أيضًا من Settings.tsx (قسم "عن CJ WORKOUT") — لهذا مصدّرة كـhook منفصل.
 */
export function useIntroSlides(): Slide[] {
  const { t } = useI18n();
  return [
    { icon: "🌱", title: t("intro.slide1Title"), body: t("intro.slide1Body") },
    { icon: "🤖", title: t("intro.slide2Title"), body: t("intro.slide2Body") },
    { icon: "🍽️", title: t("intro.slide3Title"), body: t("intro.slide3Body") },
    { icon: "🥗", title: t("intro.slide4Title"), body: t("intro.slide4Body") },
    { icon: "⚖️", title: t("intro.slide5Title"), body: t("intro.slide5Body") },
    { icon: "🔥", title: t("intro.slide6Title"), body: t("intro.slide6Body") },
  ];
}

interface IntroTourProps {
  /** لما تُفتح من الإعدادات (إعادة مشاهدة) بدل أول تسجيل دخول — ما ترسل طلب Backend، بس ترجع. */
  replayOnly?: boolean;
}

export default function IntroTour({ replayOnly = false }: IntroTourProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const slides = useIntroSlides();
  // الخطوة 0 = اختيار اللغة (أول شي يشوفه أي حساب جديد، حسب الطلب الصريح)، وبعدها شرائح المزايا.
  // بوضع الإعادة (replayOnly) نتخطى اختيار اللغة — المستخدم أصلاً عنده تفضيل محفوظ ومسوّي حساب.
  const [step, setStep] = useState(replayOnly ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const totalSteps = slides.length + 1; // +1 لشريحة اللغة
  const isLangStep = step === 0;
  const slide = isLangStep ? null : slides[step - 1]!;
  const isLast = step === totalSteps - 1;

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
        {isLangStep ? (
          <>
            <div className="intro-icon">🌐</div>
            <h1 className="font-display">{t("lang.title")}</h1>
            <p className="subtitle">{t("lang.subtitle")}</p>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
              <LanguageToggle />
            </div>
          </>
        ) : (
          <>
            <div className="intro-icon">{slide!.icon}</div>
            <h1 className="font-display">{slide!.title}</h1>
            <p className="subtitle">{slide!.body}</p>
          </>
        )}

        <div className="intro-dots">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span key={i} className={`intro-dot ${i === step ? "active" : ""}`} />
          ))}
        </div>

        <div className="ob-nav">
          {!replayOnly && !isLast && (
            <button type="button" className="btn btn-outline-dark" onClick={finish} disabled={busy}>
              {t("common.skip")}
            </button>
          )}
          {step > (replayOnly ? 1 : 0) && (
            <button type="button" className="btn btn-outline-dark" onClick={() => setStep((s) => s - 1)}>
              {t("common.back")}
            </button>
          )}
          {!isLast && (
            <button type="button" className="btn btn-moss" onClick={() => setStep((s) => Math.min(totalSteps - 1, s + 1))}>
              {t("common.next")}
            </button>
          )}
          {isLast && (
            <button type="button" className="btn btn-gold" onClick={finish} disabled={busy}>
              {busy ? t("common.loading") : replayOnly ? t("intro.finishReplay") : t("intro.start")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
