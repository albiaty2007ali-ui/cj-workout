import { useState } from "react";
import { useI18n } from "../i18n/I18nContext";

const APP_VERSION = "v0.1.0 (Build 2026)";

const CHANGELOG_ITEMS = [
  "حساب السعرات بمساعدة الذكاء الاصطناعي (Captain CJ + Gemini)",
  "إضافة السعرات المباشرة بدون طعام محدد (\"ضيف 500 سعرة\")",
  "الدفع اليدوي عبر تحويل بنكي/كارد",
  "تصميم جديد للقائمة الجانبية ومساعد CJ",
];

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "كيف يتم حساب سعراتي الحرارية؟",
    a: "يعتمد التطبيق على معادلات الحرق المباشر المعتمدة رياضيًا بالاقتران مع نموذج الذكاء الاصطناعي Gemini API لتحليل الوجبات وحساب المتبقي من هدفك اليومي.",
  },
  {
    q: "كيف أفعّل اشتراكي بعد التحويل اليدوي؟",
    a: "بعد تحويل المبلغ عبر رقم زين كاش / ماستر كارد الموضح بصفحة الدفع وإدخال الرقم المرجعي، يقوم فريقنا بمراجعة العملية وتفعيل حسابك خلال بضع دقائق إلى 24 ساعة كحد أقصى.",
  },
];

const DEV_WHATSAPP_LINK = "https://wa.me/9647700107358?text=" + encodeURIComponent("مرحبا علي، أود الاستفسار عن تطوير تطبيق/موقع");
const DEV_TEL_LINK = "tel:07700107358";

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="about-faq">
      {FAQ_ITEMS.map((item, i) => (
        <div className="about-faq-item" key={i}>
          <button type="button" className="about-faq-question" onClick={() => setOpen((o) => (o === i ? null : i))}>
            <span>س: {item.q}</span>
            <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>{open === i ? "▲" : "▼"}</span>
          </button>
          {open === i && <p className="about-faq-answer">ج: {item.a}</p>}
        </div>
      ))}
    </div>
  );
}

/** "حول التطبيق والشروط" — صفحة/مودال شامل: إصدار+سجل تحديثات، بطاقة المطور، أسئلة شائعة،
 * إخلاء مسؤولية طبية، شروط الخدمة والاشتراك، سياسة الخصوصية، تذييل حقوق. محتوى ثابت بالكامل
 * (نفس استثناء MEAL_LABELS بـtranslations.ts — عربي فقط، صفر منطق سعرات/بيانات مستخدم هنا). */
export default function AboutAppModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [showChangelog, setShowChangelog] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card about-app-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" aria-label={t("common.close")} onClick={onClose}>✕</button>

        <p className="font-display" style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: 0 }}>ℹ️ حول التطبيق والشروط</p>

        <div className="about-app-version-row">
          <span>{APP_VERSION}</span>
          <button type="button" className="btn btn-outline-dark" style={{ height: 30, padding: "0 12px", fontSize: "0.8rem" }} onClick={() => setShowChangelog((v) => !v)}>
            {showChangelog ? "إخفاء سجل التحديثات" : "عرض سجل التحديثات"}
          </button>
        </div>
        {showChangelog && (
          <ul className="about-changelog">
            {CHANGELOG_ITEMS.map((item) => <li key={item}>{item}</li>)}
          </ul>
        )}

        <div className="about-app-section">
          <p className="about-app-section-title">👨‍💻 مطور المشروع</p>
          <p style={{ margin: "0 0 4px", fontWeight: 700 }}>علي البياتي</p>
          <p style={{ margin: "0 0 10px", color: "var(--text-muted)", fontSize: "0.88rem" }}>
            المطور والمنفذ البرمجي لتطبيق CJ FOOD لتطبيقات الويب والموبايل والذكاء الاصطناعي.
          </p>
          <p style={{ margin: "0 0 10px", color: "var(--text-muted)", fontSize: "0.85rem" }}>
            رقم التواصل للتطوير والحلول البرمجية: 07700107358
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={DEV_WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="btn btn-moss">📲 تواصل عبر واتساب</a>
            <a href={DEV_TEL_LINK} className="btn btn-outline-dark">📞 اتصال مباشر</a>
          </div>
        </div>

        <div className="about-app-section">
          <p className="about-app-section-title">❓ الأسئلة الشائعة</p>
          <FaqAccordion />
        </div>

        <div className="about-app-section about-app-disclaimer">
          <p className="about-app-section-title" style={{ color: "var(--danger)" }}>⚠️ إخلاء مسؤولية طبية</p>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text)" }}>
            تطبيق CJ FOOD هو أداة رقمية مساعدة لحساب السعرات الحرارية وتنظيم التغذية باستخدام تقنيات
            الذكاء الاصطناعي. المخرجات والاقتراحات الواردة بالتطبيق مخصصة لأغراض التثقيف والتوجيه
            الغذائي العام فقط، ولا تعتبر بديلاً عن الاستشارة الطبية أو التشخيص الصحي أو مراجعة أخصائي
            تغذية معتمد. إذا كنت تعاني من أمراض مزمنة أو اضطرابات صحية، يرجى مراجعة طبيبك المختص قبل
            اتباع أي نظام غذائي.
          </p>
        </div>

        <div className="about-app-section">
          <p className="about-app-section-title">📄 شروط الخدمة والاشتراك</p>
          <ul style={{ margin: 0, paddingInlineStart: 20, fontSize: "0.85rem", color: "var(--text)", display: "flex", flexDirection: "column", gap: 6 }}>
            <li>تفعيل الاشتراكات: يتم تفعيل الاشتراك اليدوي بعد تحويل المبلغ وإرسال الرقم المرجعي، ويستغرق التفعيل من بضع دقائق إلى 24 ساعة كحد أقصى بعد المراجعة.</li>
            <li>سياسة الاسترجاع: نظرًا لطبيعة الخدمات الرقمية والوصول الفوري لمميزات الذكاء الاصطناعي، فإن مبالغ الاشتراكات غير قابلة للاسترجاع بعد تفعيل الحساب، ما لم يكن هناك خطأ تقني مانع للخدمة من طرفنا.</li>
            <li>الاستخدام العادل: الحساب شخصي ويُحظر استخدامه لأغراض تجارية أو إعادة بيع الحسابات دون إذن مسبق.</li>
          </ul>
        </div>

        <div className="about-app-section">
          <p className="about-app-section-title">🔒 سياسة الخصوصية وأمان البيانات</p>
          <ul style={{ margin: 0, paddingInlineStart: 20, fontSize: "0.85rem", color: "var(--text)", display: "flex", flexDirection: "column", gap: 6 }}>
            <li>حفظ البيانات بأمان: نلتزم بحماية بياناتك الشخصية وحفظ سجلات وزنك وسعراتك الحرارية بسرية تامة وتخزينها على خوادم آمنة.</li>
            <li>عدم مشاركة البيانات: نؤكد أن بياناتك الصحية والتغذوية وبيانات التحويل المالي لا يتم مشاركتها أو بيعها لأي أطراف خارجية أو منصات إعلانية.</li>
          </ul>
        </div>

        <p className="about-app-footer">
          جميع الحقوق محفوظة © 2026 لـ CJ FOOD<br />
          تم التصميم والتطوير بواسطة علي البياتي
        </p>
      </div>
    </div>
  );
}
