import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type ChatReply, type MeResponse } from "../lib/api";

interface Message {
  role: "user" | "bot";
  text: string;
}

export default function Chat() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) {
        navigate("/login");
        return;
      }
      setMe(res.data);
      if (res.data.profile) setRemaining(res.data.profile.calorie_target);
    });
  }, [navigate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setSending(true);

    try {
      const res = await api.post<ChatReply>("/chat", { message: text });
      if (!res.success) {
        const message =
          res.error?.code === "TRIAL_EXHAUSTED"
            ? "خلصت وجباتك المجانية 🌱 تحتاج اشتراك للمتابعة."
            : res.error?.message ?? "صار خطأ، جرب مرة ثانية.";
        setMessages((prev) => [...prev, { role: "bot", text: message }]);
        return;
      }
      const reply = res.data?.reply ?? "...";
      setMessages((prev) => [...prev, { role: "bot", text: reply }]);
      if (typeof res.data?.remaining === "number") setRemaining(res.data.remaining);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-page">
      <div className="chat-header">
        <strong>🥗 CJ WORKOUT</strong>
        {me && (
          <span className="stats">
            ⭐ {me.xp} XP · 🔥 {me.streak_days} يوم{remaining !== null ? ` · باقي ${remaining} kcal` : ""}
          </span>
        )}
      </div>

      <div className="chat-messages">
        {messages.length === 0 && <p style={{ color: "#888", textAlign: "center" }}>ابدأ بكتابة شنو أكلت اليوم 🌱</p>}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>{m.text}</div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input" onSubmit={sendMessage}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="اكتب رسالتك... (مثلاً: اكلت بيضتين)"
          disabled={sending}
        />
        <button type="submit" disabled={sending}>إرسال</button>
      </form>
    </div>
  );
}
