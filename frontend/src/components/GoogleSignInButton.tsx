/**
 * زر "الدخول بـGoogle" الحقيقي — Google Identity Services (accounts.google.com/gsi/client)،
 * id_token حقيقي يُتحقَّق بالباك اند (auth-google.mts) عبر google-auth-library. الزر نفسه يفتح
 * منتقي حساب Google الحقيقي (Account Chooser) لو أكثر من حساب مسجّل بالمتصفح.
 *
 * theme: "filled_black" + shape: "pill" — نفس شكل أزرار الموقع (.btn: border-radius: 999px) ونفس
 * تناسق الواجهة الداكنة، بدل الزر الأبيض الافتراضي اللي كان يطلع كصندوق غريب وسط تصميم غامق.
 * العرض يُحسب فعليًا من عرض البطاقة (مو رقم ثابت) ويُعاد حسابه عند تغيير حجم النافذة — يطابق
 * حقول الإدخال بالضبط بدل ما يفيض أو يضل أصغر منها.
 *
 * داخل تطبيق أندرويد (Capacitor WebView)، Google يرفض تسجيل الدخول من WebView (نفس قيد Push
 * Notifications — راجع lib/push.ts) برسالة "disallowed_useragent" — فنُخفي الزر هناك برسالة
 * واضحة بدل زر مكسور، بدل محاولة حل native منفصل (خارج نطاق هذا التحسين حاليًا).
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { isNativeApp } from "../lib/push";
import { useI18n } from "../i18n/I18nContext";

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize(config: { client_id: string; callback: (resp: GoogleCredentialResponse) => void }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const MIN_WIDTH = 200; // حدود Google Identity Services نفسها لـrenderButton
const MAX_WIDTH = 400;

let scriptLoadingPromise: Promise<void> | null = null;
function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;
  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("فشل تحميل مكتبة Google"));
    document.head.appendChild(script);
  });
  return scriptLoadingPromise;
}

export default function GoogleSignInButton() {
  const navigate = useNavigate();
  const { language, t } = useI18n();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID || isNativeApp() || !buttonRef.current || !wrapperRef.current) return;
    let cancelled = false;

    function drawButton() {
      if (cancelled || !buttonRef.current || !wrapperRef.current || !window.google) return;
      const measured = wrapperRef.current.clientWidth;
      const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, measured || MAX_WIDTH));
      buttonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: "standard", theme: "filled_black", shape: "pill", size: "large", width,
        locale: language === "ar" ? "ar" : "en", text: "continue_with", logo_alignment: "left",
      });
    }

    loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async (resp) => {
            setError("");
            const res = await api.post<{ user_id: string }>("/auth/google", { id_token: resp.credential });
            if (!res.success) {
              setError(res.error?.message ?? "صار خطأ، جرب مرة ثانية");
              return;
            }
            navigate("/chat");
          },
        });
        setReady(true);
        drawButton();
      })
      .catch(() => setError("تعذّر تحميل تسجيل الدخول بـGoogle."));

    const onResize = () => drawButton();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, language]);

  if (!CLIENT_ID) return null;

  if (isNativeApp()) {
    return (
      <>
        <div className="auth-divider"><span>{t("auth.or")}</span></div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", textAlign: "center", margin: "8px 0" }}>
          الدخول بـGoogle غير متاح داخل التطبيق حاليًا — استخدم البريد وكلمة المرور، أو افتح الموقع من متصفح خارجي.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="auth-divider"><span>{t("auth.or")}</span></div>
      <div ref={wrapperRef} style={{ margin: "10px 0" }}>
        {!ready && <div className="google-btn-skeleton" />}
        <div ref={buttonRef} style={{ display: "flex", justifyContent: "center" }} />
        {error && <p className="field-error">{error}</p>}
      </div>
    </>
  );
}
