import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type MeResponse, type ChatReply } from "../lib/api";
import type { RecipeDetailResponse } from "../lib/recipesApi";
import AppShell from "../components/AppShell";

const DIFFICULTY_LABELS: Record<string, string> = { easy: "سهل", medium: "متوسط", hard: "صعب" };

export default function RecipeDetail() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [data, setData] = useState<RecipeDetailResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [servings, setServings] = useState<number | null>(null);
  const [scaling, setScaling] = useState(false);

  const [mode, setMode] = useState<"view" | "blocked" | "tutorial">("view");
  const [blockedMessage, setBlockedMessage] = useState("");
  const [starting, setStarting] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [eatenPrompt, setEatenPrompt] = useState("...");
  const [eatenAnswered, setEatenAnswered] = useState(false);
  const [eatenResult, setEatenResult] = useState("");

  const storageKey = `cj_recipe_step_${slug}`;

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      setMe(res.data);
    });
  }, [navigate]);

  useEffect(() => {
    api.get<RecipeDetailResponse>(`/recipes/detail?slug=${encodeURIComponent(slug)}`).then((res) => {
      if (!res.success || !res.data) { setNotFound(true); return; }
      setData(res.data);
      setServings(res.data.original_servings);
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved !== null) {
          setStepIdx(parseInt(saved, 10));
          setMode("tutorial");
        }
      } catch { /* ignore */ }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const steps = data?.recipe.steps ?? [];

  useEffect(() => {
    if (mode === "tutorial" && steps.length > 0 && stepIdx >= steps.length && !done && !eatenAnswered) {
      setDone(true);
      try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ }
      api.post<{ ok: boolean; reply?: string }>(`/recipes/action?slug=${encodeURIComponent(slug)}&action=complete`).then((res) => {
        setEatenPrompt(res.success && res.data?.reply ? res.data.reply : "سويتها 😋 أكلتها لو بعدك؟");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, stepIdx, steps.length]);

  async function changeServings(next: number) {
    if (next < 1 || scaling) return;
    setScaling(true);
    const res = await api.get<RecipeDetailResponse>(`/recipes/detail?slug=${encodeURIComponent(slug)}&servings=${next}`);
    setScaling(false);
    if (res.success && res.data) {
      setData(res.data);
      setServings(next);
    }
  }

  function saveStep(idx: number) {
    setStepIdx(idx);
    try { sessionStorage.setItem(storageKey, String(idx)); } catch { /* ignore */ }
  }

  async function startCooking() {
    setStarting(true);
    const res = await api.post<{ ok: boolean; message?: string }>(`/recipes/action?slug=${encodeURIComponent(slug)}&action=start`);
    setStarting(false);
    if (!res.success || !res.data?.ok) {
      setBlockedMessage(res.data?.message ?? "ما تقدر تبدأ هذي الوصفة هسه.");
      setMode("blocked");
      return;
    }
    setDone(false);
    setEatenAnswered(false);
    saveStep(0);
    setMode("tutorial");
  }

  async function answerEaten(answer: string) {
    setEatenAnswered(true);
    const res = await api.post<ChatReply>("/chat", { message: answer });
    setEatenResult(res.success && res.data?.reply ? res.data.reply : "تمام.");
  }

  if (!me) return null;
  if (notFound) return (
    <AppShell userName={me.name || "حسابي"} isAdmin={me.role === "admin"}>
      <main className="container"><p className="calorie-warning">الوصفة غير موجودة.</p></main>
    </AppShell>
  );
  if (!data) return null;

  const { recipe, over_target: overTarget, remaining_calories: remainingCalories } = data;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin={me.role === "admin"}>
      <main className="container" style={{ maxWidth: 760 }}>
        <div className="topbar"><Link to="/recipes">→ رجوع للوصفات</Link></div>

        {mode === "view" && (
          <div>
            <div className="recipe-hero-placeholder">🍽️</div>
            <h1 className="font-display" style={{ marginTop: 20 }}>{recipe.name}</h1>
            {recipe.description && <p className="subtitle">{recipe.description}</p>}

            <div className="recipe-meta-row">
              {recipe.prep_time_min && <span>⏱️ تحضير {recipe.prep_time_min} د</span>}
              {recipe.cook_time_min && <span>🔥 طبخ {recipe.cook_time_min} د</span>}
              <span className="recipe-servings-stepper">
                🍽️
                <button type="button" onClick={() => changeServings((servings ?? recipe.servings) - 1)} disabled={scaling || (servings ?? recipe.servings) <= 1} aria-label="تقليل الحصص">−</button>
                <span>{servings ?? recipe.servings} حصة</span>
                <button type="button" onClick={() => changeServings((servings ?? recipe.servings) + 1)} disabled={scaling} aria-label="زيادة الحصص">+</button>
              </span>
              <span>📊 {DIFFICULTY_LABELS[recipe.difficulty] ?? recipe.difficulty}</span>
            </div>

            <div className="recipe-macro-grid">
              <div className="recipe-macro-box"><p className="val">{recipe.calories}</p><p className="lbl">kcal</p></div>
              <div className="recipe-macro-box"><p className="val">{recipe.protein}غ</p><p className="lbl">بروتين</p></div>
              <div className="recipe-macro-box"><p className="val">{recipe.carbs}غ</p><p className="lbl">كارب</p></div>
              <div className="recipe-macro-box"><p className="val">{recipe.fat}غ</p><p className="lbl">دهون</p></div>
              {recipe.fiber != null && <div className="recipe-macro-box"><p className="val">{recipe.fiber}غ</p><p className="lbl">ألياف</p></div>}
            </div>

            {!overTarget && recipe.calories > remainingCalories && (
              <p className="calorie-warning">⚠️ هذه الوجبة ({recipe.calories} kcal) أعلى من سعراتك المتبقية اليوم ({remainingCalories} kcal).</p>
            )}

            <h3 className="font-display" style={{ marginTop: 32 }}>🥘 المكونات</h3>
            <ul className="ingredient-list">
              {recipe.ingredients.map((i, idx) => (
                <li key={idx}>
                  <span>{i.name}</span>
                  {(i.quantity || i.unit) && <span className="ingredient-qty">{i.quantity ?? ""} {i.unit ?? ""}</span>}
                </li>
              ))}
            </ul>

            {recipe.substitutions.length > 0 && (
              <>
                <h3 className="font-display" style={{ marginTop: 28 }}>🔄 بدائل مسجّلة</h3>
                <div className="sub-list">
                  {recipe.substitutions.map((s, idx) => (
                    <div className="sub-item" key={idx}><strong>{s.ingredient_name}:</strong> {s.replacement}</div>
                  ))}
                </div>
              </>
            )}

            {steps.length > 0 && (
              <>
                {overTarget && <p className="calorie-warning">🚫 وصلت لهدف السعرات اليومي — بدء وصفة جديدة معطّل هسه.</p>}
                <button className="btn btn-moss btn-block" style={{ marginTop: 16 }} disabled={starting} onClick={startCooking}>
                  ▶️ ابدأ الطبخ
                </button>
              </>
            )}
          </div>
        )}

        {mode === "blocked" && (
          <div className="tutorial-step-card" style={{ textAlign: "center" }}>
            <p style={{ fontSize: "1.05rem", marginBottom: 20 }}>{blockedMessage}</p>
            <Link to="/recipes" className="btn btn-moss">رجوع للوصفات</Link>
          </div>
        )}

        {mode === "tutorial" && !done && steps[stepIdx] && (
          <div>
            <div className="tutorial-progress-bar">
              <div className="tutorial-progress-fill" style={{ width: `${Math.round(((stepIdx + 1) / steps.length) * 100)}%` }} />
            </div>
            <p className="tutorial-progress-label">الخطوة {stepIdx + 1} / {steps.length}</p>

            <div className="tutorial-step-card">
              <p className="tutorial-step-number">الخطوة {stepIdx + 1}</p>
              <p className="tutorial-step-text">{steps[stepIdx].instruction}</p>
              {(steps[stepIdx].duration || steps[stepIdx].temperature) && (
                <p className="tutorial-step-extra">
                  {[steps[stepIdx].duration && `⏱️ ${steps[stepIdx].duration}`, steps[stepIdx].temperature && `🌡️ ${steps[stepIdx].temperature}`].filter(Boolean).join(" · ")}
                </p>
              )}
              {steps[stepIdx].tip && <p className="tutorial-step-extra">💡 {steps[stepIdx].tip}</p>}
              {steps[stepIdx].warning && <p className="tutorial-step-extra">⚠️ {steps[stepIdx].warning}</p>}
            </div>

            <div className="tutorial-nav">
              <button className="btn btn-outline-dark" disabled={stepIdx === 0} onClick={() => saveStep(Math.max(0, stepIdx - 1))}>← السابق</button>
              <button className="btn btn-moss" onClick={() => saveStep(stepIdx + 1)}>
                {stepIdx === steps.length - 1 ? "إنهاء الوصفة ✓" : "التالي →"}
              </button>
            </div>
          </div>
        )}

        {mode === "tutorial" && done && (
          <div className="tutorial-done">
            <span className="emoji">🍽️</span>
            {!eatenAnswered && (
              <>
                <p className="tutorial-step-text" style={{ whiteSpace: "pre-line" }}>{eatenPrompt}</p>
                <div className="tutorial-eaten-actions">
                  <button className="btn btn-moss" onClick={() => answerEaten("أكلتها")}>🍽️ إي، أكلتها</button>
                  <button className="btn btn-outline-dark" onClick={() => answerEaten("بعدني")}>⏳ بعدني</button>
                  <button className="btn btn-danger-outline" onClick={() => answerEaten("لا")}>❌ لا</button>
                </div>
              </>
            )}
            {eatenAnswered && (
              <>
                <p className="tutorial-step-text" style={{ whiteSpace: "pre-line" }}>{eatenResult || "..."}</p>
                <Link to="/recipes" className="btn btn-moss" style={{ marginTop: 16 }}>رجوع للوصفات</Link>
              </>
            )}
          </div>
        )}
      </main>
    </AppShell>
  );
}
