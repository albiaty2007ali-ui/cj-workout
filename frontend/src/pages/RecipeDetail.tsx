import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type MeResponse, type ChatReply } from "../lib/api";
import type { RecipeDetailResponse } from "../lib/recipesApi";
import AppShell from "../components/AppShell";
import { useI18n, backArrow, forwardArrow } from "../i18n/I18nContext";
import { DIFFICULTY_LABELS } from "../i18n/translations";

export default function RecipeDetail() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { t, dir, language } = useI18n();
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

  // ملاحظة مهمة: النص المُرسَل هنا لازم يبقى بالعبارة العربية اللي يتعرّف عليها الـBackend
  // (intents.RECIPE_EATEN_PHRASES) بغض النظر عن لغة الواجهة — محرك NLU/الشات عربي فقط بالكامل
  // (قيد معماري موثَّق بـtranslations.ts). نص الزر المعروض يُترجَم، الرسالة الفعلية المُرسَلة لا.
  async function answerEaten(answer: string) {
    setEatenAnswered(true);
    const res = await api.post<ChatReply>("/chat", { message: answer });
    setEatenResult(res.success && res.data?.reply ? res.data.reply : "تمام.");
  }

  if (!me) return null;
  if (notFound) return (
    <AppShell userName={me.name || "حسابي"} isAdmin={me.role === "admin"}>
      <main className="container"><p className="calorie-warning">{t("recipe.notFound")}</p></main>
    </AppShell>
  );
  if (!data) return null;

  const { recipe, over_target: overTarget, remaining_calories: remainingCalories } = data;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin={me.role === "admin"}>
      <main className="container" style={{ maxWidth: 760 }}>
        <div className="topbar"><Link to="/recipes">{backArrow(dir)} {t("recipe.backToRecipes")}</Link></div>

        {mode === "view" && (
          <div>
            <div className="recipe-hero-placeholder">🍽️</div>
            <h1 className="font-display" style={{ marginTop: 20 }}>{recipe.name}</h1>
            {recipe.description && <p className="subtitle">{recipe.description}</p>}

            <div className="recipe-meta-row">
              {recipe.prep_time_min && <span>⏱️ {t("recipe.prepLabel")} {recipe.prep_time_min} {t("recipe.minutesUnit")}</span>}
              {recipe.cook_time_min && <span>🔥 {t("recipe.cookLabel")} {recipe.cook_time_min} {t("recipe.minutesUnit")}</span>}
              <span className="recipe-servings-stepper">
                🍽️
                <button type="button" onClick={() => changeServings((servings ?? recipe.servings) - 1)} disabled={scaling || (servings ?? recipe.servings) <= 1} aria-label={t("recipe.decreaseServings")}>−</button>
                <span>{servings ?? recipe.servings} {t("recipe.servingsUnit")}</span>
                <button type="button" onClick={() => changeServings((servings ?? recipe.servings) + 1)} disabled={scaling} aria-label={t("recipe.increaseServings")}>+</button>
              </span>
              <span>📊 {DIFFICULTY_LABELS[language][recipe.difficulty as "easy" | "medium" | "hard"] ?? recipe.difficulty}</span>
            </div>

            <div className="recipe-macro-grid">
              <div className="recipe-macro-box"><p className="val">{recipe.calories}</p><p className="lbl">{t("recipe.caloriesUnit")}</p></div>
              <div className="recipe-macro-box"><p className="val">{recipe.protein}غ</p><p className="lbl">{t("recipe.proteinLabel")}</p></div>
              <div className="recipe-macro-box"><p className="val">{recipe.carbs}غ</p><p className="lbl">{t("recipe.carbsLabel")}</p></div>
              <div className="recipe-macro-box"><p className="val">{recipe.fat}غ</p><p className="lbl">{t("recipe.fatLabel")}</p></div>
              {recipe.fiber != null && <div className="recipe-macro-box"><p className="val">{recipe.fiber}غ</p><p className="lbl">{t("recipe.fiberLabel")}</p></div>}
            </div>

            {!overTarget && recipe.calories > remainingCalories && (
              <p className="calorie-warning">⚠️ {recipe.name} ({recipe.calories} kcal) {t("recipe.overBudgetWarning")} ({remainingCalories} kcal).</p>
            )}

            <h3 className="font-display" style={{ marginTop: 32 }}>{t("recipe.ingredientsTitle")}</h3>
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
                <h3 className="font-display" style={{ marginTop: 28 }}>{t("recipe.substitutionsTitle")}</h3>
                <div className="sub-list">
                  {recipe.substitutions.map((s, idx) => (
                    <div className="sub-item" key={idx}><strong>{s.ingredient_name}:</strong> {s.replacement}</div>
                  ))}
                </div>
              </>
            )}

            {steps.length > 0 && (
              <>
                {overTarget && <p className="calorie-warning">{t("recipe.overTargetBlock")}</p>}
                <button className="btn btn-moss btn-block" style={{ marginTop: 16 }} disabled={starting} onClick={startCooking}>
                  {t("recipe.startCookingButton")}
                </button>
              </>
            )}
          </div>
        )}

        {mode === "blocked" && (
          <div className="tutorial-step-card" style={{ textAlign: "center" }}>
            <p style={{ fontSize: "1.05rem", marginBottom: 20 }}>{blockedMessage}</p>
            <Link to="/recipes" className="btn btn-moss">{t("recipe.backToRecipes")}</Link>
          </div>
        )}

        {mode === "tutorial" && !done && steps[stepIdx] && (
          <div>
            <div className="tutorial-progress-bar">
              <div className="tutorial-progress-fill" style={{ width: `${Math.round(((stepIdx + 1) / steps.length) * 100)}%` }} />
            </div>
            <p className="tutorial-progress-label">{t("recipe.stepLabel")} {stepIdx + 1} / {steps.length}</p>

            <div className="tutorial-step-card">
              <p className="tutorial-step-number">{t("recipe.stepLabel")} {stepIdx + 1}</p>
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
              <button className="btn btn-outline-dark" disabled={stepIdx === 0} onClick={() => saveStep(Math.max(0, stepIdx - 1))}>{backArrow(dir)} {t("recipe.previousButton")}</button>
              <button className="btn btn-moss" onClick={() => saveStep(stepIdx + 1)}>
                {stepIdx === steps.length - 1 ? t("recipe.finishRecipeButton") : `${t("recipe.nextButton")} ${forwardArrow(dir)}`}
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
                  <button className="btn btn-moss" onClick={() => answerEaten("أكلتها")}>{t("recipe.ateItButton")}</button>
                  <button className="btn btn-outline-dark" onClick={() => answerEaten("بعدني")}>{t("recipe.stillCookingButton")}</button>
                  <button className="btn btn-danger-outline" onClick={() => answerEaten("لا")}>{t("recipe.noButton")}</button>
                </div>
              </>
            )}
            {eatenAnswered && (
              <>
                <p className="tutorial-step-text" style={{ whiteSpace: "pre-line" }}>{eatenResult || "..."}</p>
                <Link to="/recipes" className="btn btn-moss" style={{ marginTop: 16 }}>{t("recipe.backToRecipes")}</Link>
              </>
            )}
          </div>
        )}
      </main>
    </AppShell>
  );
}
