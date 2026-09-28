import { useEffect, useState } from "react";
import { api, type ReferralStats } from "../lib/api";
import { useI18n } from "../i18n/I18nContext";

const REGISTER_BASE_URL = "https://cjworkout.netlify.app/register";

/**
 * لوحة "دعوة صديق" (حزمة الإحالة) — تُبنى فوگ نظام الإحالة الحقيقي الموجود أصلًا
 * (referral.ts's grantReferralXp، 30 XP/إحالة، سقف 20) عبر /api/referral-stats الجديد.
 * صفر منطق منح XP هنا — قراءة/عرض فقط. لا تعرض أي بيانات شخصية عن الأصدقاء (source بالسجل
 * الحقيقي لا يحتوي إلا معرّف تقني، فالعرض دائمًا "صديق جديد" + تاريخ فقط).
 */
export default function ReferralPanel() {
  const { t } = useI18n();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<ReferralStats>("/referral-stats").then((res) => {
      if (res.success && res.data) setStats(res.data);
      else setError(true);
    });
  }, []);

  if (error) return <p className="field-error">{t("referral.loadError")}</p>;
  if (!stats) return <div className="skeleton" style={{ height: 120, borderRadius: "var(--radius-md)" }} />;

  const referralUrl = `${REGISTER_BASE_URL}?ref=${encodeURIComponent(stats.referral_code)}`;
  const shareText = "جرب تطبيق CJ FOOD لحساب السعرات وتنظيم التغذية بالذكاء الاصطناعي!";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // نسخ يدوي غير متاح (صلاحية متصفح مثلًا) — صفر إزعاج بخطأ، الرابط ظاهر أصلًا بالحقل
    }
  }

  async function shareLink() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "CJ FOOD", text: shareText, url: referralUrl });
      } catch {
        // المستخدم ألغى نافذة المشاركة — تجاهل بأمان
      }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText} ${referralUrl}`)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>{t("referral.description")}</p>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input type="text" readOnly value={referralUrl} onClick={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 0 }} />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn-outline-dark" onClick={copyLink}>
          {copied ? t("referral.copied") : `📋 ${t("referral.copyLink")}`}
        </button>
        <button type="button" className="btn btn-moss" onClick={shareLink}>📤 {t("referral.shareLink")}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginTop: 16 }}>
        <div className="card" style={{ padding: 14, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>{t("referral.friendsInvited")}</p>
          <p style={{ margin: "4px 0 0", fontSize: "1.4rem", fontWeight: 700 }}>{stats.referred_count}</p>
        </div>
        <div className="card" style={{ padding: 14, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>{t("referral.xpEarned")}</p>
          <p style={{ margin: "4px 0 0", fontSize: "1.4rem", fontWeight: 700 }}>{stats.referral_xp_total} XP</p>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="progress-track" style={{ height: 8, borderRadius: "var(--radius-pill)", background: "var(--surface)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: "var(--radius-pill)", background: "var(--moss)",
            width: `${Math.min(100, (stats.xp_grants_used / stats.xp_grants_cap) * 100)}%`,
          }} />
        </div>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 6 }}>
          {stats.xp_grants_used} / {stats.xp_grants_cap} إحالة مؤهلة لـXP
        </p>
      </div>

      <div style={{ marginTop: 14 }}>
        <h4 style={{ margin: "0 0 8px", fontSize: "0.92rem" }}>{t("referral.historyTitle")}</h4>
        {stats.history.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{t("referral.historyEmpty")}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {stats.history.map((h, i) => (
              <li key={i} style={{
                display: "flex", justifyContent: "space-between", background: "var(--surface)",
                border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "8px 12px", fontSize: "0.85rem",
              }}>
                <span>🎉 {t("referral.historyFriend")}</span>
                <span style={{ color: "var(--text-muted)" }}>{h.date.slice(0, 10)} · +{h.xp} XP</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
