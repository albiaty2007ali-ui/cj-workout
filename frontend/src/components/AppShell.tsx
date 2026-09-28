import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import AssistantMenu from "./AssistantMenu";
import ConsultModal from "./ConsultModal";
import TournamentModal from "./TournamentModal";
import NotificationPromptModal from "./NotificationPromptModal";
import SmartNotificationModal from "./SmartNotificationModal";
import FeatureIntroModal from "./FeatureIntroModal";
import type { AssistantAction } from "../lib/assistantActions";
import { api, type MeResponse } from "../lib/api";
import { FEATURE_INTROS, isFeatureSeen, type FeatureIntroDef } from "../lib/featureIntros";
import { isAnyModalOpen } from "../lib/modalCoordinator";

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
 * كل التطبيق، لا تخص صفحة الشات وحدها.
 *
 * Feature Discovery (حزمة تعريف الميزات + نقاط التنبيه) مركزية هنا أيضًا لنفس السبب: AppShell
 * الوحيد اللي يشوف كل صفحة (عبر location.pathname، مستخدَم أصلاً بمنطق nudge-navigation) وكل
 * زر مودال (onOpenAssistant/onOpenTournament/onOpenConsult) — فصفر تعديل مطلوب على أي صفحة
 * (Daily/RecipesList/WeightProgress/Intelligence/Subscribe/Profile) للحصول على هذا السلوك.
 * seen_features تُجلَب مرة وحدة لكل mount لـAppShell (يعني مرة لكل تنقّل صفحة، مو لكل زر) عبر
 * نفس /api/me الموجود أصلًا — راجع vivid-sprouting-gadget.md. */
export default function AppShell({ userName, isAdmin, photoUrl, onQuickPrompt, children }: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showAssistant, setShowAssistant] = useState(false);
  const [showConsult, setShowConsult] = useState(false);
  const [showTournament, setShowTournament] = useState(false);

  const [seenFeatures, setSeenFeatures] = useState<Record<string, number>>({});
  // seenFeatures يبدأ {} قبل وصول /me الحقيقي — بدون هذا العلَم، effect المسار تحت يشوف "{}"
  // (كل شي غير مُشاهَد) لحظيًا ويعرض المودال خطأً حتى لو الميزة مُشاهَدة فعلًا، وبما إن
  // pendingIntro صار غير null، الـeffect يتوقف عن إعادة الفحص لأبد (راجع الحارس "if
  // (pendingIntro) return" تحت) — بگ حقيقي اكتُشف حيًا، مصلَّح بتأجيل أي فحص لحين تحميل حقيقي.
  const [seenFeaturesLoaded, setSeenFeaturesLoaded] = useState(false);
  const [pendingIntro, setPendingIntro] = useState<FeatureIntroDef | null>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (res.success && res.data) setSeenFeatures(res.data.seen_features ?? {});
      setSeenFeaturesLoaded(true);
    });
  }, []);

  // أول زيارة فعلية لصفحة تطابق ميزة مُعرَّفة بـroute — يعرض المودال فوگ محتوى الصفحة نفسها
  // (الصفحة تُرسَم عادي بالخلفية، المودال مجرد طبقة شرح فوگها). لو محجوب بمودال ثاني بهذي
  // اللحظة بالضبط، لا نعتبره "شوهد" — يُعاد تلقائيًا بزيارة تالية طبيعية (صفر queue).
  useEffect(() => {
    if (pendingIntro || !seenFeaturesLoaded) return;
    const def = FEATURE_INTROS.find((d) => d.route === location.pathname);
    if (def && !isFeatureSeen(seenFeatures, def) && !isAnyModalOpen()) {
      setPendingIntro(def);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, seenFeatures, seenFeaturesLoaded]);

  function markSeen(def: FeatureIntroDef) {
    setSeenFeatures((prev) => ({ ...prev, [def.key]: def.version }));
    api.post("/settings?action=mark-feature-seen", { feature_key: def.key, version: def.version });
  }

  function closeFeatureIntro() {
    if (pendingIntro) markSeen(pendingIntro);
    setPendingIntro(null);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) action();
  }

  /** يغلّف فتح مودال (مساعد CJ/البطولة/استشارة مختص) — لو الميزة غير مُشاهَدة، يعرض شرحها أولًا
   * ويفتح المودال الحقيقي فور الإغلاق (المستخدم لا يخسر وصول الميزة، بس أول ضغطة تمرّ بشرح
   * صغير قبلها). لو مُشاهَدة أصلًا أو محجوبة بمودال آخر هذي اللحظة، تفتح مباشرة كالمعتاد. */
  function openWithIntro(trigger: FeatureIntroDef["trigger"], openReal: () => void) {
    const def = FEATURE_INTROS.find((d) => d.trigger === trigger);
    if (def && !isFeatureSeen(seenFeatures, def) && !isAnyModalOpen()) {
      pendingActionRef.current = openReal;
      setPendingIntro(def);
      return;
    }
    openReal();
  }

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
        seenFeatures={seenFeatures}
        onOpenAssistant={() => openWithIntro("assistant", () => setShowAssistant(true))}
        onOpenConsult={() => openWithIntro("consult", () => setShowConsult(true))}
        onOpenTournament={() => openWithIntro("tournament", () => setShowTournament(true))}
      />
      <div className="app-main">{children}</div>
      {showAssistant && <AssistantMenu onAction={handleAssistantAction} onClose={() => setShowAssistant(false)} />}
      {showConsult && <ConsultModal onClose={() => setShowConsult(false)} />}
      {showTournament && <TournamentModal onClose={() => setShowTournament(false)} />}
      {pendingIntro && <FeatureIntroModal def={pendingIntro} onClose={closeFeatureIntro} />}
      <NotificationPromptModal />
      <SmartNotificationModal />
    </div>
  );
}
