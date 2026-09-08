import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../lib/api";
import AppShell from "../components/AppShell";

interface SubscribeInfo {
  card_number: string;
  card_network: string;
  price: number;
  whatsapp_link: string;
}

export default function Subscribe() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [info, setInfo] = useState<SubscribeInfo | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState<{ whatsapp_link: string } | null>(null);

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      setMe(res.data);
    });
    api.get<SubscribeInfo>("/subscribe").then((res) => {
      if (res.success && res.data) setInfo(res.data);
    });
  }, [navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (reference.trim().length < 3) { setError("أدخل رقمًا مرجعيًا صحيحًا لعملية التحويل"); return; }
    setLoading(true);
    try {
      const res = await api.post<{ submitted: boolean; whatsapp_link: string }>("/subscribe", { reference, note });
      if (!res.success || !res.data) { setError(res.error?.message ?? "صار خطأ"); return; }
      setSubmitted({ whatsapp_link: res.data.whatsapp_link });
    } finally {
      setLoading(false);
    }
  }

  if (!me) return null;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin={me.role === "admin"}>
      <main className="container" style={{ maxWidth: 560 }}>
        {submitted ? (
          <div className="notice-box">
            <p className="font-display" style={{ fontSize: "1.4rem", fontWeight: 700 }}>تم استلام طلبك ✅</p>
            <p style={{ marginTop: 14, color: "var(--text-muted)" }}>
              وصلنا طلب دفعك وراح تتم مراجعته يدويًا خلال وقت قصير. بعد التأكيد راح يتفعل اشتراكك تلقائيًا وتوصلك رسالة تأكيد.
            </p>
            {submitted.whatsapp_link && (
              <>
                <p style={{ marginTop: 20, color: "var(--text-muted)" }}>حتى تسرّع المراجعة، أرسل صورة إثبات التحويل مباشرة عبر واتساب:</p>
                <a href={submitted.whatsapp_link} target="_blank" rel="noopener noreferrer" className="btn btn-moss" style={{ marginTop: 12, display: "inline-block" }}>
                  📲 أرسل الإثبات عبر واتساب
                </a>
              </>
            )}
          </div>
        ) : (
          <>
            <h1 className="font-display">إتمام الاشتراك</h1>
            <p className="subtitle">CJ WORKOUT Monthly — {info ? info.price.toLocaleString("en-US") : "..."} د.ع / شهر</p>

            <div className="notice-box">
              <p style={{ fontWeight: 600 }}>خطوات الدفع اليدوي</p>
              <ol>
                <li>١. حوّل المبلغ إلى رقم الكارد أدناه.</li>
                <li>٢. احتفظ برقم العملية أو التحويل (Reference).</li>
                <li>٣. أدخل الرقم أدناه.</li>
                <li>٤. سيقوم فريقنا بمراجعة وتفعيل اشتراكك خلال وقت قصير.</li>
              </ol>
              <div style={{ background: "var(--surface)", borderRadius: 14, padding: 14, marginTop: 12 }}>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>رقم الكارد ({info?.card_network || "..."})</p>
                <p style={{ fontSize: "1.3rem", fontWeight: 700, margin: "4px 0 0" }}>{info?.card_number || "..."}</p>
              </div>
            </div>

            {info?.whatsapp_link && (
              <div style={{ textAlign: "center", margin: "24px 0" }}>
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>تفضّل ترسل الإثبات مباشرة؟</p>
                <a href={info.whatsapp_link} target="_blank" rel="noopener noreferrer" className="btn btn-moss" style={{ marginTop: 8, display: "inline-block" }}>
                  📲 تواصل عبر واتساب
                </a>
              </div>
            )}

            <form onSubmit={onSubmit}>
              <div className="field">
                <label htmlFor="reference">الرقم المرجعي لعملية التحويل</label>
                <input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="مثال: 128933 أو آخر 4 أرقام العملية" />
              </div>
              <div className="field">
                <label htmlFor="note">ملاحظة (اختياري)</label>
                <textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {error && <p className="field-error">{error}</p>}
              <button type="submit" className="btn btn-gold btn-block" disabled={loading}>{loading ? "..." : "إرسال طلب التفعيل"}</button>
            </form>
          </>
        )}
        <p style={{ marginTop: 24 }}><Link to="/chat">→ رجوع للشات</Link></p>
      </main>
    </AppShell>
  );
}
