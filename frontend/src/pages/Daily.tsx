import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, type MeResponse } from "../lib/api";
import type { DailyResponse, MealBucket } from "../lib/progressApi";
import AppShell from "../components/AppShell";

const MEAL_META: Array<{ key: "breakfast" | "lunch" | "dinner"; label: string; icon: string }> = [
  { key: "breakfast", label: "الفطور", icon: "🍳" },
  { key: "lunch", label: "الغداء", icon: "🍗" },
  { key: "dinner", label: "العشاء", icon: "🌙" },
];

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function Daily() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [data, setData] = useState<DailyResponse | null>(null);
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
          <Link to="/chat">→ رجوع للشات</Link>
          <Link to="/progress/weight" style={{ color: "var(--text-muted)" }}>⚖️ متابعة الوزن</Link>
        </div>

        <h1 className="font-display">🍽️ يومي الغذائي</h1>

        {data && !data.meals && (
          <div className="notice-box" style={{ marginTop: 24 }}>أكمل بياناتك الأساسية أول مرة حتى نقدر نحسب يومك الغذائي.</div>
        )}

        {data && data.meals && (
          <>
            <div className="day-nav">
              <button onClick={() => goToDate(shiftDate(data.target_date!, -1))}>◀ اليوم السابق</button>
              <strong>{data.target_date}{data.is_today ? " (اليوم)" : ""}</strong>
              {!data.is_today ? (
                <button onClick={() => goToDate(shiftDate(data.target_date!, 1))}>اليوم التالي ▶</button>
              ) : <span />}
            </div>

            <div className="calorie-cards">
              <div className="calorie-card">
                <p className="cc-label">🔥 هدفك اليوم</p>
                <p className="cc-value">{data.target_calories} kcal</p>
              </div>
              <div className="calorie-card">
                <p className="cc-label">🎯 {data.over_target ? "تجاوزت" : "المتبقي"}</p>
                <p className="cc-value">
                  {data.over_target ? `⚠️ +${-data.remaining_calories!} kcal` : `${data.remaining_calories} kcal`}
                </p>
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              {MEAL_META.map(({ key, label, icon }) => {
                const meal: MealBucket = data.meals![key];
                const budget = data.budgets?.[key];
                return (
                  <div className="meal-slot-card" key={key}>
                    <p className="meal-slot-title">{icon} {label}</p>
                    {meal.status === "LOGGED" ? (
                      <>
                        <p className="meal-slot-status logged">✅ {meal.calories} kcal</p>
                        <p className="meal-slot-macros">
                          بروتين {meal.protein?.toFixed(1)}غ · كارب {meal.carbs?.toFixed(1)}غ · دهون {meal.fat?.toFixed(1)}غ
                        </p>
                        {meal.foods && meal.foods.length > 0 && <p className="meal-slot-foods">{meal.foods.join(" + ")}</p>}
                      </>
                    ) : (
                      <>
                        <p className="meal-slot-status">⏳ لم تسجل بعد</p>
                        {data.is_today && budget ? <p className="meal-slot-budget">ميزانية مقترحة: ~{budget} kcal</p> : null}
                        {data.is_today && <Link to="/chat" className="btn btn-outline-dark" style={{ marginTop: 8, display: "inline-block" }}>شنو آكل؟</Link>}
                      </>
                    )}
                  </div>
                );
              })}

              <div className="meal-slot-card">
                <p className="meal-slot-title">🥗 سناك</p>
                {data.meals.snack.length > 0 ? (
                  data.meals.snack.map((s, i) => (
                    <p className="meal-slot-status logged" key={i}>✅ {s.calories} kcal{s.foods && s.foods.length > 0 ? ` — ${s.foods.join(" + ")}` : ""}</p>
                  ))
                ) : (
                  <p className="meal-slot-status">⏳ لم تسجل بعد</p>
                )}
                {data.is_today && <Link to="/chat" className="btn btn-outline-dark" style={{ marginTop: 8, display: "inline-block" }}>إضافة سناك</Link>}
              </div>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
