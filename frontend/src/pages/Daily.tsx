import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, type MeResponse } from "../lib/api";
import type { DailyResponse, MealBucket } from "../lib/progressApi";
import AppShell from "../components/AppShell";
import AdSlot from "../components/AdSlot";
import { AD_SLOTS } from "../lib/adsConfig";
import { useI18n, backArrow, forwardArrow } from "../i18n/I18nContext";
import { MEAL_LABELS } from "../i18n/translations";

const MEAL_ICONS: Record<"breakfast" | "lunch" | "dinner", string> = { breakfast: "🍳", lunch: "🍗", dinner: "🌙" };
const MEAL_KEYS: Array<"breakfast" | "lunch" | "dinner"> = ["breakfast", "lunch", "dinner"];

/** يعتمد كليًا على data.budgets الحقيقية المحسوبة أصلًا (progress-daily.mts -> mealBudget.ts) —
 * "رتبلي باقي اليوم" هو تجميع/عرض لما هو موجود فعلاً، صفر توزيع جديد. */
function FixMyDayPlan({ data, language }: { data: DailyResponse; language: "ar" | "en" }) {
  const { t } = useI18n();
  const items = MEAL_KEYS
    .filter((key) => data.meals![key].status !== "LOGGED" && data.budgets?.[key])
    .map((key) => ({ label: MEAL_LABELS[language][key], icon: MEAL_ICONS[key], kcal: data.budgets![key] }));
  if (items.length === 0) return null;
  return (
    <div className="notice-box" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>{t("daily.fixMyDayTitle")}</h3>
      {items.map((it) => (
        <p key={it.label} style={{ margin: "6px 0" }}>{it.icon} {it.label}: <strong>~{it.kcal} kcal</strong></p>
      ))}
      <p style={{ marginTop: 10, color: "var(--text-muted)", fontSize: "0.85rem" }}>
        {t("daily.fixMyDayNote")}
      </p>
    </div>
  );
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function Daily() {
  const navigate = useNavigate();
  const { t, dir, language } = useI18n();
  const [params, setParams] = useSearchParams();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [data, setData] = useState<DailyResponse | null>(null);
  const [showFixPlan, setShowFixPlan] = useState(false);
  const dateParam = params.get("date") ?? "";

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      setMe(res.data);
    });
  }, [navigate]);

  useEffect(() => {
    const qs = dateParam ? `?date=${dateParam}` : "";
    api.get<DailyResponse>(`/progress/daily${qs}`).then((res) => {
      if (res.success && res.data) setData(res.data);
    });
  }, [dateParam]);

  if (!me) return null;

  function goToDate(iso: string) {
    setParams(iso ? { date: iso } : {});
  }

  return (
    <AppShell userName={me!.name || "حسابي"} isAdmin={me!.role === "admin"}>
      <main className="container" style={{ maxWidth: 720 }}>
        <div className="topbar">
          <Link to="/chat">{backArrow(dir)} {t("daily.backToChat")}</Link>
          <Link to="/progress/weight" style={{ color: "var(--text-muted)" }}>{t("daily.weightTracking")}</Link>
        </div>

        <h1 className="font-display">{t("daily.pageTitle")}</h1>

        {data && !data.meals && (
          <div className="notice-box" style={{ marginTop: 24 }}>{t("daily.needsProfile")}</div>
        )}

        {data && data.meals && (
          <>
            <div className="day-nav">
              <button onClick={() => goToDate(shiftDate(data.target_date!, -1))}>{backArrow(dir)} {t("daily.previousDay")}</button>
              <strong>{data.target_date}{data.is_today ? ` ${t("daily.todayTag")}` : ""}</strong>
              {!data.is_today ? (
                <button onClick={() => goToDate(shiftDate(data.target_date!, 1))}>{t("daily.nextDay")} {forwardArrow(dir)}</button>
              ) : <span />}
            </div>

            <div className="calorie-cards">
              <div className="calorie-card">
                <p className="cc-label">{t("daily.targetLabel")}</p>
                <p className="cc-value">{data.target_calories} kcal</p>
              </div>
              <div className="calorie-card">
                <p className="cc-label">{data.over_target ? t("daily.overTargetLabel") : t("daily.remainingLabel")}</p>
                <p className="cc-value">
                  {data.over_target ? `⚠️ +${-data.remaining_calories!} kcal` : `${data.remaining_calories} kcal`}
                </p>
              </div>
            </div>

            {data.is_today && !data.over_target && MEAL_KEYS.some((key) => data.meals![key].status !== "LOGGED" && data.budgets?.[key]) && (
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-moss" onClick={() => setShowFixPlan((v) => !v)}>
                  {t("daily.fixMyDayButton")}
                </button>
                {showFixPlan && <FixMyDayPlan data={data} language={language} />}
              </div>
            )}

            <div style={{ marginTop: 24 }}>
              {MEAL_KEYS.map((key) => {
                const meal: MealBucket = data.meals![key];
                const budget = data.budgets?.[key];
                const label = MEAL_LABELS[language][key];
                const icon = MEAL_ICONS[key];
                return (
                  <div className="meal-slot-card" key={key}>
                    <p className="meal-slot-title">{icon} {label}</p>
                    {meal.status === "LOGGED" ? (
                      <>
                        <p className="meal-slot-status logged">✅ {meal.calories} kcal</p>
                        <p className="meal-slot-macros">
                          {t("daily.proteinLabel")} {meal.protein?.toFixed(1)}غ · {t("daily.carbsLabel")} {meal.carbs?.toFixed(1)}غ · {t("daily.fatLabel")} {meal.fat?.toFixed(1)}غ
                        </p>
                        {meal.foods && meal.foods.length > 0 && <p className="meal-slot-foods">{meal.foods.join(" + ")}</p>}
                      </>
                    ) : (
                      <>
                        <p className="meal-slot-status">⏳ {t("daily.loggedStatus")}</p>
                        {data.is_today && budget ? <p className="meal-slot-budget">{t("daily.suggestedBudget")}{budget} kcal</p> : null}
                        {data.is_today && <Link to="/chat" className="btn btn-outline-dark" style={{ marginTop: 8, display: "inline-block" }}>{t("daily.whatToEatButton")}</Link>}
                      </>
                    )}
                  </div>
                );
              })}

              <div className="meal-slot-card">
                <p className="meal-slot-title">{t("daily.snackLabel")}</p>
                {data.meals.snack.length > 0 ? (
                  data.meals.snack.map((s, i) => (
                    <p className="meal-slot-status logged" key={i}>✅ {s.calories} kcal{s.foods && s.foods.length > 0 ? ` — ${s.foods.join(" + ")}` : ""}</p>
                  ))
                ) : (
                  <p className="meal-slot-status">⏳ {t("daily.loggedStatus")}</p>
                )}
                {data.is_today && <Link to="/chat" className="btn btn-outline-dark" style={{ marginTop: 8, display: "inline-block" }}>{t("daily.addSnackButton")}</Link>}
              </div>
            </div>

            {!me.is_premium && <AdSlot html={AD_SLOTS.dailyBottom} className="ad-slot ad-slot-inline" />}
          </>
        )}
      </main>
    </AppShell>
  );
}
