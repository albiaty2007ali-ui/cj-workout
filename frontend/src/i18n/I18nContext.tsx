import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { translations, type Language } from "./translations";
import { api } from "../lib/api";

const STORAGE_KEY = "cj_language";

type NestedKeyOf<T> = { [K in keyof T & string]: T[K] extends string ? K : `${K}.${NestedKeyOf<T[K]>}` }[keyof T & string];
type TranslationKey = NestedKeyOf<typeof translations.ar>;

interface I18nContextValue {
  language: Language;
  dir: "rtl" | "ltr";
  /** persistToBackend افتراضي true — false تُستخدم بس وقت أول جلب من /api/me حتى ما نكتب نفس القيمة اللي جتنا منه أصلاً. */
  setLanguage: (lang: Language, opts?: { persistToBackend?: boolean }) => void;
  /**
   * تُستخدم فقط من Chat.tsx بعد /api/me — تطبّق تفضيل الحساب المحفوظ بس إذا هذا المتصفح ماله
   * اختيار صريح أصلاً (localStorage فاضي). بدون هذا الشرط: مستخدم يختار English بصفحة التسجيل
   * (persistToBackend:false، الحساب لسا ما موجود)، يسجّل حساب، وبأول /api/me الحساب الجديد
   * يرجّع "ar" (الافتراضي)، فيمسح اختياره اللحظي بالغلط — Bug حقيقي انكشف بالاختبار الحي.
   */
  syncFromAccount: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readSavedLanguage(): Language {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "ar" || v === "en") return v;
  } catch {
    // localStorage معطّل (وضع خاص متشدد مثلاً) — نرجع الافتراضي بأمان
  }
  return "ar";
}

/** يُستخدم أيضًا بسكربت ما-قبل-الرسم بـindex.html (نفس فلسفة data-theme) لمنع "ومضة" اتجاه خاطئ. */
export function applyDocumentDirection(lang: Language): void {
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = lang;
}

/**
 * سهم "رجوع/السابق" حسب الاتجاه الفعلي — باگ حقيقي مكتشَف: روابط الرجوع كانت تستخدم "→" حرفي
 * ثابت بكل مكان (صحيح بصريًا بالعربي RTL، لأن "رجوع" = نحو بداية القراءة = يمين = سهم يمين —
 * بس خاطئ اتجاهيًا بالإنجليزي LTR، وين "رجوع" لازم يكون سهم يسار). backArrow/forwardArrow
 * يشتقّان الاتجاه الصحيح من `dir` الفعلي بدل نص ثابت بكل صفحة.
 */
export function backArrow(dir: "rtl" | "ltr"): string {
  return dir === "rtl" ? "→" : "←";
}
export function forwardArrow(dir: "rtl" | "ltr"): string {
  return dir === "rtl" ? "←" : "→";
}

function hasExplicitLocalChoice(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function getTranslation(lang: Language, key: string): string {
  const parts = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = translations[lang];
  for (const part of parts) {
    if (node == null) break;
    node = node[part];
  }
  return typeof node === "string" ? node : key;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => readSavedLanguage());

  useEffect(() => {
    applyDocumentDirection(language);
  }, [language]);

  function setLanguage(lang: Language, opts?: { persistToBackend?: boolean }) {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // تجاهل بأمان — التفضيل يبقى شغال للجلسة الحالية حتى لو localStorage معطّل
    }
    if (opts?.persistToBackend !== false) {
      api.post("/settings?action=language", { language: lang }).catch(() => {
        // فشل الحفظ بالسيرفر لا يوقف التبديل الفوري بالواجهة — نفس فلسفة best-effort بكل التطبيق
      });
    }
  }

  function syncFromAccount(lang: Language) {
    if (hasExplicitLocalChoice()) return;
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // تجاهل بأمان
    }
  }

  function t(key: TranslationKey): string {
    return getTranslation(language, key);
  }

  return (
    <I18nContext.Provider value={{ language, dir: language === "ar" ? "rtl" : "ltr", setLanguage, syncFromAccount, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n لازم تُستخدم داخل I18nProvider");
  return ctx;
}
