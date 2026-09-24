import { useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import AssistantMenu from "./AssistantMenu";
import ConsultModal from "./ConsultModal";
import type { AssistantAction } from "../lib/assistantActions";

interface AppShellProps {
  userName: string;
  isAdmin: boolean;
  photoUrl?: string | null;
  /** Chat.tsx فقط تمرّرها (dispatchMessage) — تُستخدَم لما Action من مساعد CJ من نوع "chat"
   * يُضغَط والمستخدم أصلاً بصفحة /chat، فيرسل مباشرة بدل تنقّل+؟send= غير ضروري. */
  onQuickPrompt?: (prompt: string) => void;
  children: ReactNode;
}

/** يعادل app-shell بـchat.html — قائمة جانبية ثابتة بسطح المكتب، منسدلة بالموبايل. يملك أيضًا
 * حالة "مساعد CJ"/"استشارة مختص" (تفتح من أي صفحة عبر Sidebar) — مركزية هنا لأنها متاحة من
 * كل التطبيق، لا تخص صفحة الشات وحدها. */
export default function AppShell({ userName, isAdmin, photoUrl, onQuickPrompt, children }: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showAssistant, setShowAssistant] = useState(false);
  const [showConsult, setShowConsult] = useState(false);

  function handleAssistantAction(action: AssistantAction) {
    if (action.kind === "navigate" && action.to) {
      navigate(action.to);
      return;
    }
    if (action.kind === "chat" && action.prompt) {
      if (location.pathname === "/chat" && onQuickPrompt) onQuickPrompt(action.prompt);
      else navigate(`/chat?send=${encodeURIComponent(action.prompt)}`);
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        userName={userName} isAdmin={isAdmin} photoUrl={photoUrl}
        onOpenAssistant={() => setShowAssistant(true)} onOpenConsult={() => setShowConsult(true)}
      />
      <div className="app-main">{children}</div>
      {showAssistant && <AssistantMenu onAction={handleAssistantAction} onClose={() => setShowAssistant(false)} />}
      {showConsult && <ConsultModal onClose={() => setShowConsult(false)} />}
    </div>
  );
}
