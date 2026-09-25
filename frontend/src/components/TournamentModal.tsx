import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../i18n/I18nContext";

interface TournamentStatus {
  active: boolean;
  until: string | null;
  original_target: number | null;
  current_target: number;
}

/** "عندي بطولة" — عجز -1000 سعرة مؤقت، محسوب بالكامل بالكود (shared/nutrition-engine/
 * tournamentMode.ts) بحد أدنى آمن، يرجع تلقائيًا للهدف الأصلي بعد المدة — صفر تدخل AI بهذا
 * القرار، صفر رقم مخترَع (الخصم حسابي بسيط، الحد الأدنى ثابت أمان موجود أصلًا بالمشروع). */
export default function TournamentModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<TournamentStatus | null>(null);
  const [days, setDays] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<TournamentStatus>("/tournament-mode").then((res) => {
      if (res.success && res.data) setStatus(res.data);
    });
  }
  useEffect(load, []);

  async function activate() {
    setError(null);
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 14) { setError("اختر عدد أيام بين 1 و14."); return; }
    setBusy(true);
    const res = await api.post<{ ok: boolean }>("/tournament-mode?action=activate", { days: n });
    setBusy(false);
    if (!res.success) { setError(res.error?.message ?? "صار خطأ"); return; }
    load();
  }

  async function deactivate() {
    setBusy(true);
    await api.post("/tournament-mode?action=deactivate");
    setBusy(false);
    load();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" aria-label={t("common.close")} onClick={onClose}>✕</button>
        <p className="font-display" style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: 0 }}>🏆 عندي بطولة</p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>
          هذا النظام مخصص للرياضيين للتحضير السريع قبل البطولات، حيث يتم خصم 1000 سعرة حرارية من
          هدفك اليومي لخلق عجز قوي وسريع. يرجى استخدامه بحذر — الخصم محسوب دائمًا بحد أدنى آمن
          ثابت (1200 سعرة للذكر / 1000 للأنثى)، ما ينزل تحته إطلاقًا مهما كان هدفك الأصلي.
        </p>

        {status?.active ? (
          <div className="notice-box" style={{ marginTop: 4 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>مفعّل حاليًا 🔥</p>
            <p style={{ margin: "6px 0", fontSize: "0.85rem" }}>
              هدفك الحالي: {status.current_target} kcal (بدل {status.original_target} kcal الأصلي) — يرجع تلقائيًا يوم {status.until}.
            </p>
            <button type="button" className="btn btn-outline-dark" disabled={busy} onClick={deactivate}>إلغاء الآن وإرجاع الهدف الأصلي</button>
          </div>
        ) : (
          <div style={{ marginTop: 4 }}>
            <div className="field">
              <label>عدد الأيام (1-14)</label>
              <input type="number" min={1} max={14} value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
            {error && <p className="field-error">{error}</p>}
            <button type="button" className="btn btn-moss" disabled={busy} onClick={activate} style={{ marginTop: 8 }}>
              {busy ? "..." : "تفعيل وضع البطولة"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
