import { createContext, useContext, type ReactNode } from "react";
import { translations } from "./translations";

type NestedKeyOf<T> = { [K in keyof T & string]: T[K] extends string ? K : `${K}.${NestedKeyOf<T[K]>}` }[keyof T & string];
export type TranslationKey = NestedKeyOf<typeof translations.ar>;

interface I18nContextValue {
  dir: "rtl";
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * سهم "رجوع/السابق" — عربي فقط (RTL ثابت) بعد حذف الإنجليزية، فالاتجاه لم يعد متغيّرًا. الوسيط
 * اختياري وغير مستخدَم (يبقيه توافقيًا مع مواقع الاستدعاء الخمسة الحالية، `backArrow(dir)`، بدون
 * تغيير أي منها).
 */
export function backArrow(_dir?: "rtl" | "ltr"): string {
  return "→";
}
export function forwardArrow(_dir?: "rtl" | "ltr"): string {
  return "←";
}

function getTranslation(key: string): string {
  const parts = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = translations.ar;
  for (const part of parts) {
    if (node == null) break;
    node = node[part];
  }
  return typeof node === "string" ? node : key;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  function t(key: TranslationKey): string {
    return getTranslation(key);
  }

  return <I18nContext.Provider value={{ dir: "rtl", t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n لازم تُستخدم داخل I18nProvider");
  return ctx;
}
