import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

/**
 * انتقال ناعم بين الصفحات (حزمة تحسين UI/UX) — fade+translate خفيف بـCSS فقط، صفر مكتبة جديدة.
 * `key={pathname}` يخلي React يعيد تركيب المحتوى عند تغيّر المسار فيلعب حركة الدخول تلقائيًا
 * (نفس فكرة .modal-card-in) — **صفر لمس لـ<Routes>/<Route>/Navigate نفسها**، هذا غلاف عرض
 * بصري بحت فوگها بـApp.tsx، الـrouting/redirects/deep-links/زر الرجوع كلها تشتغل بالضبط متل
 * قبل. تأثير جانبي بسيط ومقبول: صفحة بباراميتر متغيّر فقط (مثل /recipes/:slug من وصفة لوصفة)
 * تُعاد تركيبها بدل إعادة استخدام نفس الـinstance — نفس النتيجة البصرية النهائية، فقط عبر
 * remount بدل تحديث prop داخلي.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-transition">
      {children}
    </div>
  );
}
