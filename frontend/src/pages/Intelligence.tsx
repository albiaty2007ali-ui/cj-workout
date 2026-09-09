import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../lib/api";
import type { DailySummaryResponse, MissionStatus, ChallengeStatus, LeaderboardResponse } from "../lib/intelligenceApi";
import AppShell from "../components/AppShell";
import { useI18n } from "../i18n/I18nContext";

export default function Intelligence() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [summary, setSummary] = useState<DailySummaryResponse | null>(null);
  const [missions, setMissions] = useState<MissionStatus[] | null>(null);
  const [challenges, setChallenges] = useState<ChallengeStatus[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [freezeError, setFreezeError] = useState("");

  function loadIntelligence() {
    api.get<DailySummaryResponse>("/intelligence?action=daily-summary").then((res) => {
      if (res.success && res.data) setSummary(res.data);
    });
    api.get<{ missions: MissionStatus[] }>("/intelligence?action=missions").then((res) => {
      if (res.success && res.data) setMissions(res.data.missions);
    });
    api.get<{ challenges: ChallengeStatus[] }>("/intelligence?action=challenges").then((res) => {
      if (res.success && res.data) setChallenges(res.data.challenges);
    });
    api.get<LeaderboardResponse>("/intelligence?action=leaderboard").then((res) => {
      if (res.success && res.data) setLeaderboard(res.data);
    });
  }

  async function useFreeze() {
    setFreezeError("");
    setBusyId("__freeze__");
    const res = await api.post("/intelligence?action=streak-freeze");
    setBusyId(null);
    if (!res.success) {
      setFreezeError(res.error?.message ?? "صار خطأ");
      return;
    }
    loadIntelligence();
  }

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) {
        navigate("/login");
        return;
      }
      setMe(res.data);
    });
    loadIntelligence();
  }, [navigate]);

  async function claimMission(missionId: string) {
    setBusyId(missionId);
    const res = await api.post("/intelligence?action=missions", { mission_id: missionId });
    setBusyId(null);
    if (res.success) loadIntelligence();
  }

  async function startChallenge(challengeId: string) {
    setBusyId(challengeId);
    const res = await api.post("/intelligence?action=challenges", { challenge_id: challengeId });
    setBusyId(null);
    if (res.success) loadIntelligence();
  }

  if (!me) return null;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin={me.role === "admin"}>
      <main className="page-container">
        <h1 className="font-display">{t("intelligence.pageTitle")}</h1>

        {summary && (
          <div className="notice-box">
            <h3 style={{ marginTop: 0 }}>{t("intelligence.scoreLabel")}</h3>
            <p style={{ fontSize: "2rem", fontWeight: 700, margin: "4px 0" }}>{summary.score}/100</p>
            <div className="tutorial-progress-bar">
              <div className="tutorial-progress-fill" style={{ width: `${summary.score}%` }} />
            </div>
            <p style={{ color: "var(--text-muted)" }}>{summary.insight}</p>
            {summary.breakdown.map((b, i) => (
              <p key={i} style={{ fontSize: "0.85rem", margin: "4px 0" }}>
                +{b.delta} — {b.label}{" "}
                <span style={{ color: "var(--text-muted)" }}>({b.reason})</span>
              </p>
            ))}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <span>{t("intelligence.freezeBalance")}: {summary.freeze_balance}</span>
              {summary.freeze_balance > 0 && (
                <button className="btn btn-outline-dark" disabled={busyId === "__freeze__"} onClick={useFreeze}>
                  {t("intelligence.useFreeze")}
                </button>
              )}
            </div>
            {freezeError && <p className="field-error">{freezeError}</p>}
          </div>
        )}

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>{t("intelligence.missionsTitle")}</h3>
          {missions && missions.length === 0 && <p>{t("intelligence.noMissionsToday")}</p>}
          {missions?.map((m) => (
            <div key={m.id} className="admin-list-item" style={{ padding: 14 }}>
              <div>
                <strong>{m.title}</strong>
                <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  {m.description} — {m.xp_reward} XP
                </p>
              </div>
              {m.claimed ? (
                <span style={{ color: "var(--moss)", fontWeight: 700 }}>{t("intelligence.claimed")}</span>
              ) : m.completed ? (
                <button className="btn btn-moss" disabled={busyId === m.id} onClick={() => claimMission(m.id)}>
                  {t("intelligence.claimXp")}
                </button>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>{t("intelligence.notYet")}</span>
              )}
            </div>
          ))}
        </div>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>{t("intelligence.challengesTitle")}</h3>
          {challenges && challenges.length === 0 && <p>{t("intelligence.noChallengesAvailable")}</p>}
          {challenges?.map((c) => (
            <div key={c.id} className="admin-list-item" style={{ display: "block" }}>
              <strong>{c.title}</strong>
              <p style={{ margin: "4px 0", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                {c.description} — {c.xp_reward} XP
              </p>
              {c.status !== "not_started" && (
                <>
                  <div className="tutorial-progress-bar">
                    <div className="tutorial-progress-fill" style={{ width: `${Math.min(100, (c.progress_days / c.target_days) * 100)}%` }} />
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {c.progress_days} / {c.target_days} {t("intelligence.daysProgress")}
                  </p>
                </>
              )}
              {c.status === "not_started" && (
                <button className="btn btn-outline-dark" disabled={busyId === c.id} onClick={() => startChallenge(c.id)}>
                  {t("intelligence.startChallenge")}
                </button>
              )}
              {c.status === "completed" && <span style={{ color: "var(--moss)", fontWeight: 700 }}>{t("intelligence.challengeCompleted")}</span>}
            </div>
          ))}
        </div>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>{t("intelligence.leaderboardTitle")}</h3>
          {leaderboard && leaderboard.leaderboard.length === 0 && <p>{t("intelligence.noLeaderboardYet")}</p>}
          {leaderboard && leaderboard.leaderboard.length > 0 && (
            <ul className="weight-history-list">
              {leaderboard.leaderboard.map((entry) => (
                <li key={entry.rank}>
                  <span>#{entry.rank} — {entry.name}</span>
                  <span>🔥 {entry.streak_days}</span>
                </li>
              ))}
            </ul>
          )}
          {leaderboard && leaderboard.my_rank !== null && leaderboard.my_rank > leaderboard.leaderboard.length && (
            <p style={{ marginTop: 10, color: "var(--text-muted)" }}>
              {t("intelligence.myRank")}: #{leaderboard.my_rank}
            </p>
          )}
        </div>
      </main>
    </AppShell>
  );
}
