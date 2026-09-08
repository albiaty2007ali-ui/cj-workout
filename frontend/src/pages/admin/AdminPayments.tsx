import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../../lib/api";
import AppShell from "../../components/AppShell";

interface Payment {
  id: string; amount: number; currency: string; user_id: string; user_name: string;
  transfer_reference: string; user_note: string | null;
}

export default function AdminPayments() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      if (res.data.role !== "admin") { navigate("/chat"); return; }
      setMe(res.data);
    });
  }, [navigate]);

  function load() {
    api.get<{ payments: Payment[] }>("/admin/payments").then((res) => {
      if (res.success && res.data) setPayments(res.data.payments);
    });
  }
  useEffect(load, []);

  async function verify(id: string) { await api.post(`/admin/payments?action=verify&id=${id}`); load(); }
  async function reject(id: string) { await api.post(`/admin/payments?action=reject&id=${id}`, { reason: reasons[id] || "" }); load(); }

  if (!me) return null;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin>
      <main className="container" style={{ maxWidth: 760 }}>
        <div className="topbar"><Link to="/admin">→ رجوع للوحة الإدارة</Link></div>
        <h1 className="font-display">مراجعة المدفوعات</h1>
        <p className="subtitle">{payments.length} عملية دفع بانتظار المراجعة</p>

        <div style={{ marginTop: 32 }}>
          {payments.length === 0 && <div className="notice-box">لا توجد عمليات دفع بانتظار المراجعة حاليًا 🎉</div>}
          {payments.map((p) => (
            <div className="admin-list-item" key={p.id}>
              <div>
                <p style={{ fontWeight: 700, color: "var(--heading)" }}>{p.amount.toLocaleString("en-US")} {p.currency}</p>
                <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>مستخدم: {p.user_name}</p>
                <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>رقم مرجعي: <span dir="ltr">{p.transfer_reference}</span></p>
                {p.user_note && <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>ملاحظة: {p.user_note}</p>}
              </div>
              <div className="admin-list-actions">
                <button className="btn btn-moss" onClick={() => verify(p.id)}>تأكيد وتفعيل الاشتراك</button>
                <input
                  type="text" placeholder="سبب الرفض (اختياري)" value={reasons[p.id] ?? ""}
                  onChange={(e) => setReasons((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  style={{ border: "1px solid var(--border-input)", borderRadius: 999, padding: "0 14px" }}
                />
                <button className="btn btn-danger-outline" onClick={() => reject(p.id)}>رفض</button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
