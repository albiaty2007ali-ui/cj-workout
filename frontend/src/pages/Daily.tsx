import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, type MeResponse } from "../lib/api";
import type { DailyResponse, MealBucket, FoodSearchHit, FoodPortion } from "../lib/progressApi";
import AppShell from "../components/AppShell";
import AdSlot from "../components/AdSlot";
import { AD_SLOTS } from "../lib/adsConfig";
import { useI18n, backArrow, forwardArrow } from "../i18n/I18nContext";
import { MEAL_LABELS } from "../i18n/translations";

const MEAL_ICONS: Record<"breakfast" | "lunch" | "dinner", string> = { breakfast: "🍳", lunch: "🍗", dinner: "🌙" };
const MEAL_KEYS: Array<"breakfast" | "lunch" | "dinner"> = ["breakfast", "lunch", "dinner"];
type MealTypeKey = "breakfast" | "lunch" | "dinner" | "snack";
type LoggedMeal = MealBucket & { status: "LOGGED" };

/** يعتمد كليًا على data.budgets الحقيقية المحسوبة أصلًا (progress-daily.mts -> mealBudget.ts) —
 * "رتبلي باقي اليوم" هو تجميع/عرض لما هو موجود فعلاً، صفر توزيع جديد. */
function FixMyDayPlan({ data }: { data: DailyResponse }) {
  const { t } = useI18n();
  const items = MEAL_KEYS
    .filter((key) => data.meals![key].status !== "LOGGED" && data.budgets?.[key])
    .map((key) => ({ label: MEAL_LABELS[key], icon: MEAL_ICONS[key], kcal: data.budgets![key] }));
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

/** نموذج تعديل يدوي للأرقام الأربعة فقط — صفر إعادة حساب من كمية (MealLog لا يخزن غرام/food_id
 * لكل عنصر بعد التسجيل، راجع توثيق قرار الخطة). */
function EditMealForm({
  meal, busy, onCancel, onSave,
}: {
  meal: LoggedMeal; busy: boolean; onCancel: () => void;
  onSave: (v: { total_calories: number; total_protein: number; total_carbs: number; total_fat: number }) => void;
}) {
  const { t } = useI18n();
  const [calories, setCalories] = useState(String(meal.calories ?? 0));
  const [protein, setProtein] = useState(String(meal.protein ?? 0));
  const [carbs, setCarbs] = useState(String(meal.carbs ?? 0));
  const [fat, setFat] = useState(String(meal.fat ?? 0));

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 90 }}>
          <label>{t("daily.caloriesLabel")}</label>
          <input type="number" min={0} value={calories} onChange={(e) => setCalories(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 90 }}>
          <label>{t("daily.proteinLabel")}</label>
          <input type="number" min={0} step="0.1" value={protein} onChange={(e) => setProtein(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 90 }}>
          <label>{t("daily.carbsLabel")}</label>
          <input type="number" min={0} step="0.1" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 90 }}>
          <label>{t("daily.fatLabel")}</label>
          <input type="number" min={0} step="0.1" value={fat} onChange={(e) => setFat(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          className="btn btn-moss" type="button" disabled={busy}
          onClick={() => onSave({
            total_calories: Number(calories) || 0, total_protein: Number(protein) || 0,
            total_carbs: Number(carbs) || 0, total_fat: Number(fat) || 0,
          })}
        >
          {t("daily.saveButton")}
        </button>
        <button className="btn btn-outline-dark" type="button" disabled={busy} onClick={onCancel}>{t("daily.cancelButton")}</button>
      </div>
    </div>
  );
}

/** نموذج "سعرات يدوية حرة" — لطعام غير موجود بقاعدة foods.sqlite (مطعم/خارج البيت). اسم+سعرات
 * فقط إلزامي، بروتين/كارب/دهون اختياري — يرسل لنفس progress-daily?action=add لكن بدون food_id
 * (orchestrator.ts's logManualCalorieEntry، استثناء موثَّق لقاعدة "الأرقام من DB فقط"). */
function ManualCalorieForm({ mealType, onAdded, onCancel }: { mealType: MealTypeKey; onAdded: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [foodName, setFoodName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const cal = Number(calories);
    if (!foodName.trim() || !cal || cal <= 0) { setError(t("daily.actionError")); return; }
    setBusy(true);
    setError(null);
    const res = await api.post<{ premium_required?: boolean }>("/progress/daily?action=add", {
      meal_type: mealType, food_name: foodName.trim(), calories: cal,
      protein: Number(protein) || 0, carbs: Number(carbs) || 0, fat: Number(fat) || 0,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error?.code === "TRIAL_EXHAUSTED" ? t("daily.trialExhaustedError") : t("daily.actionError"));
      return;
    }
    onAdded();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="field">
        <label>{t("daily.manualFoodNameLabel")}</label>
        <input value={foodName} onChange={(e) => setFoodName(e.target.value)} placeholder={t("daily.manualFoodNamePlaceholder")} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: 1, minWidth: 90 }}>
          <label>{t("daily.caloriesLabel")}</label>
          <input type="number" min={1} value={calories} onChange={(e) => setCalories(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 90 }}>
          <label>{t("daily.proteinLabel")}</label>
          <input type="number" min={0} step="0.1" value={protein} onChange={(e) => setProtein(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 90 }}>
          <label>{t("daily.carbsLabel")}</label>
          <input type="number" min={0} step="0.1" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 90 }}>
          <label>{t("daily.fatLabel")}</label>
          <input type="number" min={0} step="0.1" value={fat} onChange={(e) => setFat(e.target.value)} />
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button className="btn btn-moss" type="button" disabled={busy} onClick={submit}>{t("daily.addButton")}</button>
        <button className="btn btn-outline-dark" type="button" disabled={busy} onClick={onCancel}>{t("daily.cancelButton")}</button>
      </div>
    </div>
  );
}

/** صندوق بحث (Debounce 300ms، نفس نمط RecipesList.tsx) + اختيار حصة/غرام لإضافة وجبة يدويًا
 * من قاعدة الأطعمة الحقيقية — صفر طعام مخترَع، نفس مسار التسجيل الموثوق (orchestrator.ts's
 * logMealManually -> finalizeMeal). زر "سعرات حرة" يبدّل لـManualCalorieForm أعلاه لطعام غير
 * موجود بالقاعدة (مطعم مثلاً) — مسار ثانٍ إضافي، صفر تغيير على هذا المسار الأصلي. */
function AddMealForm({ mealType, onAdded, onCancel }: { mealType: MealTypeKey; onAdded: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"search" | "manual">("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FoodSearchHit | null>(null);
  const [portions, setPortions] = useState<FoodPortion[]>([]);
  const [selectedPortion, setSelectedPortion] = useState<FoodPortion | null>(null);
  const [customGrams, setCustomGrams] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onQueryChange(v: string) {
    setQuery(v);
    setSelected(null);
    setResults([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) return;
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await api.get<{ results: FoodSearchHit[] }>(`/foods-search?q=${encodeURIComponent(v)}`);
      setResults(res.success && res.data ? res.data.results : []);
      setSearching(false);
    }, 300);
  }

  async function selectFood(hit: FoodSearchHit) {
    setSelected(hit);
    setResults([]);
    setQuery(hit.food_name);
    const res = await api.get<{ portions: FoodPortion[] }>(`/foods-search?food_id=${hit.food_id}`);
    setPortions(res.success && res.data ? res.data.portions : []);
    setSelectedPortion(null);
    setCustomGrams("");
  }

  async function submit() {
    if (!selected) return;
    const grams = selectedPortion ? selectedPortion.grams : Number(customGrams);
    if (!grams || grams <= 0) { setError(t("daily.actionError")); return; }
    setBusy(true);
    setError(null);
    const res = await api.post<{ premium_required?: boolean }>("/progress/daily?action=add", {
      meal_type: mealType, food_id: selected.food_id, food_name: selected.food_name, grams,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error?.code === "TRIAL_EXHAUSTED" ? t("daily.trialExhaustedError") : t("daily.actionError"));
      return;
    }
    onAdded();
  }

  return (
    <div className="notice-box" style={{ marginTop: 10 }}>
      <div className="add-meal-mode-toggle">
        <button type="button" className={`add-meal-mode-btn${mode === "search" ? " active" : ""}`} onClick={() => setMode("search")}>
          {t("daily.modeSearch")}
        </button>
        <button type="button" className={`add-meal-mode-btn${mode === "manual" ? " active" : ""}`} onClick={() => setMode("manual")}>
          {t("daily.modeManual")}
        </button>
      </div>

      {mode === "manual" && <ManualCalorieForm mealType={mealType} onAdded={onAdded} onCancel={onCancel} />}

      {mode === "search" && (
        <>
      <div className="field">
        <label>{t("daily.searchFoodPlaceholder")}</label>
        <input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder={t("daily.searchFoodPlaceholder")} autoComplete="off" />
      </div>
      {searching && <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{t("common.loading")}</p>}
      {!selected && !searching && query.trim().length >= 2 && results.length === 0 && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{t("daily.searchNoResults")}</p>
      )}
      {!selected && results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {results.map((r) => (
            <button type="button" key={r.food_id} className="btn btn-outline-dark" style={{ textAlign: "start" }} onClick={() => selectFood(r)}>
              {r.food_name}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <>
          {portions.length > 0 && (
            <div className="field">
              <label>{t("daily.portionLabel")}</label>
              <select
                value={selectedPortion ? selectedPortion.portion_name : ""}
                onChange={(e) => setSelectedPortion(portions.find((p) => p.portion_name === e.target.value) ?? null)}
              >
                <option value="">—</option>
                {portions.map((p) => (
                  <option key={p.portion_name} value={p.portion_name}>{p.portion_name} ({p.grams}غ)</option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>{t("daily.customGramsLabel")}</label>
            <input type="number" min={1} value={customGrams} onChange={(e) => { setCustomGrams(e.target.value); setSelectedPortion(null); }} />
          </div>
          {error && <p className="field-error">{error}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button className="btn btn-moss" type="button" disabled={busy} onClick={submit}>{t("daily.addButton")}</button>
            <button className="btn btn-outline-dark" type="button" disabled={busy} onClick={onCancel}>{t("daily.cancelButton")}</button>
          </div>
        </>
      )}
      {!selected && (
        <button className="btn btn-outline-dark" type="button" style={{ marginTop: 8 }} onClick={onCancel}>{t("daily.cancelButton")}</button>
      )}
        </>
      )}
    </div>
  );
}

/** أزرار تعديل/حذف + نموذج التعديل المضمَّن لوجبة مسجَّلة واحدة — تُستخدم لكل من فتحات
 * breakfast/lunch/dinner وكل عنصر بمصفوفة السناك، صفر تكرار منطق. */
function LoggedMealControls({
  meal, editing, busy, onEdit, onCancelEdit, onSave, onDelete,
}: {
  meal: LoggedMeal; editing: boolean; busy: boolean;
  onEdit: () => void; onCancelEdit: () => void;
  onSave: (v: { total_calories: number; total_protein: number; total_carbs: number; total_fat: number }) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  if (editing) return <EditMealForm meal={meal} busy={busy} onCancel={onCancelEdit} onSave={onSave} />;
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <button type="button" className="btn btn-outline-dark" disabled={busy} onClick={onEdit}>{t("daily.editButton")}</button>
      <button type="button" className="btn btn-outline-dark" disabled={busy} onClick={onDelete}>{t("daily.deleteButton")}</button>
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
  const { t, dir } = useI18n();
  const [params, setParams] = useSearchParams();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [data, setData] = useState<DailyResponse | null>(null);
  const [showFixPlan, setShowFixPlan] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingMealType, setAddingMealType] = useState<MealTypeKey | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const dateParam = params.get("date") ?? "";

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      setMe(res.data);
    });
  }, [navigate]);

  async function reload() {
    const qs = dateParam ? `?date=${dateParam}` : "";
    const res = await api.get<DailyResponse>(`/progress/daily${qs}`);
    if (res.success && res.data) setData(res.data);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam]);

  if (!me) return null;

  function goToDate(iso: string) {
    setParams(iso ? { date: iso } : {});
  }

  async function handleSaveEdit(id: string, values: { total_calories: number; total_protein: number; total_carbs: number; total_fat: number }) {
    setBusyId(id);
    setActionError(null);
    const res = await api.post(`/progress/daily?action=update`, { id, ...values });
    setBusyId(null);
    if (!res.success) {
      if (res.error?.code === "ACCOUNT_BANNED") { navigate("/account-banned", { state: { ban: res.error.details } }); return; }
      setActionError(t("daily.actionError")); return;
    }
    setEditingId(null);
    await reload();
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("daily.deleteConfirm"))) return;
    setBusyId(id);
    setActionError(null);
    const res = await api.post(`/progress/daily?action=delete`, { id });
    setBusyId(null);
    if (!res.success) {
      if (res.error?.code === "ACCOUNT_BANNED") { navigate("/account-banned", { state: { ban: res.error.details } }); return; }
      setActionError(t("daily.actionError")); return;
    }
    await reload();
  }

  async function handleAdded() {
    setAddingMealType(null);
    await reload();
  }

  return (
    <AppShell userName={me!.name || "حسابي"} isAdmin={me!.role === "admin"} photoUrl={me!.photo_url}>
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
                {showFixPlan && <FixMyDayPlan data={data} />}
              </div>
            )}

            {actionError && <p className="field-error" style={{ marginTop: 12 }}>{actionError}</p>}

            <div style={{ marginTop: 24 }}>
              {MEAL_KEYS.map((key) => {
                const meal: MealBucket = data.meals![key];
                const budget = data.budgets?.[key];
                const label = MEAL_LABELS[key];
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
                        {data.is_today && meal.id && (
                          <LoggedMealControls
                            meal={meal as LoggedMeal} editing={editingId === meal.id} busy={busyId === meal.id}
                            onEdit={() => setEditingId(meal.id!)} onCancelEdit={() => setEditingId(null)}
                            onSave={(v) => handleSaveEdit(meal.id!, v)} onDelete={() => handleDelete(meal.id!)}
                          />
                        )}
                      </>
                    ) : (
                      <>
                        <p className="meal-slot-status">⏳ {t("daily.loggedStatus")}</p>
                        {data.is_today && budget ? <p className="meal-slot-budget">{t("daily.suggestedBudget")}{budget} kcal</p> : null}
                        {data.is_today && <Link to="/chat" className="btn btn-outline-dark" style={{ marginTop: 8, display: "inline-block" }}>{t("daily.whatToEatButton")}</Link>}
                      </>
                    )}
                    {data.is_today && (
                      addingMealType === key ? (
                        <AddMealForm mealType={key} onAdded={handleAdded} onCancel={() => setAddingMealType(null)} />
                      ) : (
                        <button type="button" className="btn btn-outline-dark" style={{ marginTop: 8 }} onClick={() => setAddingMealType(key)}>
                          {t("daily.addMealManualButton")}
                        </button>
                      )
                    )}
                  </div>
                );
              })}

              <div className="meal-slot-card">
                <p className="meal-slot-title">{t("daily.snackLabel")}</p>
                {data.meals.snack.length > 0 ? (
                  data.meals.snack.map((s, i) => (
                    <div key={s.id ?? i}>
                      <p className="meal-slot-status logged">✅ {s.calories} kcal{s.foods && s.foods.length > 0 ? ` — ${s.foods.join(" + ")}` : ""}</p>
                      {data.is_today && s.id && (
                        <LoggedMealControls
                          meal={s as LoggedMeal} editing={editingId === s.id} busy={busyId === s.id}
                          onEdit={() => setEditingId(s.id!)} onCancelEdit={() => setEditingId(null)}
                          onSave={(v) => handleSaveEdit(s.id!, v)} onDelete={() => handleDelete(s.id!)}
                        />
                      )}
                    </div>
                  ))
                ) : (
                  <p className="meal-slot-status">⏳ {t("daily.loggedStatus")}</p>
                )}
                {data.is_today && <Link to="/chat" className="btn btn-outline-dark" style={{ marginTop: 8, display: "inline-block" }}>{t("daily.addSnackButton")}</Link>}
                {data.is_today && (
                  addingMealType === "snack" ? (
                    <AddMealForm mealType="snack" onAdded={handleAdded} onCancel={() => setAddingMealType(null)} />
                  ) : (
                    <button type="button" className="btn btn-outline-dark" style={{ marginTop: 8 }} onClick={() => setAddingMealType("snack")}>
                      {t("daily.addMealManualButton")}
                    </button>
                  )
                )}
              </div>
            </div>

            {!me.is_premium && <AdSlot html={AD_SLOTS.dailyBottom} className="ad-slot ad-slot-inline" />}
          </>
        )}
      </main>
    </AppShell>
  );
}
