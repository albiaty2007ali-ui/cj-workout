import type { ReactNode } from "react";
import Sidebar from "./Sidebar";

interface AppShellProps {
  userName: string;
  isAdmin: boolean;
  onQuickPrompt?: (prompt: string) => void;
  children: ReactNode;
}

/** يعادل app-shell بـchat.html — قائمة جانبية ثابتة بسطح المكتب، منسدلة بالموبايل. */
export default function AppShell({ userName, isAdmin, onQuickPrompt, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar userName={userName} isAdmin={isAdmin} onQuickPrompt={onQuickPrompt} />
      <div className="app-main">{children}</div>
    </div>
  );
}
