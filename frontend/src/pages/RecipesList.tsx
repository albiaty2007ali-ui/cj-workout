import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../lib/api";
import type { RecipeCard, RecipeCategory } from "../lib/recipesApi";
import AppShell from "../components/AppShell";
import AdSlot from "../components/AdSlot";
import { AD_SLOTS } from "../lib/adsConfig";

interface ListState {
  categories: RecipeCategory[];
  recipes: RecipeCard[];
  over_target: boolean;
}

export default function RecipesList() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [state, setState] = useState<ListState | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [fitsOnly, setFitsOnly] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      setMe(res.data);
    });
  }, [navigate]);

  function fetchRecipes(q: string, cat: string) {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (cat) params.set("category", cat);
    api.get<ListState>(`/recipes?${params.toString()}`).then((res) => {
      setLoading(false);
      if (!res.success || !res.data) { setError(true); return; }
      setState(res.data);
    });
  }

  useEffect(() => {
    fetchRecipes("", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSearchChange(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchRecipes(v, category), 300);
  }

  function onCategoryClick(catId: string) {
    setCategory(catId);
    fetchRecipes(query, catId);
  }

  if (!me) return null;

  const shown = state ? (fitsOnly ? state.recipes.filter((r) => r.fits_remaining === true) : state.recipes) : [];

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin={me.role === "admin"}>
      <main className="container">
        <div className="topbar"><Link to="/chat">→ رجوع للشات</Link></div>
        <h1 className="font-display">🍳 وصفات دايت</h1>
        <p className="subtitle">وصفات حقيقية بمكونات وخطوات وسعرات دقيقة — تقدر تسوي أي وحدة خطوة بخطوة.</p>

        <div className="recipe-search-bar">
          <input
            type="text" placeholder="دوّر عن وصفة (اسم، مكوّن...)" autoComplete="off"
            value={query} onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {state && (
          <div className="recipe-categories">
            <button className={`recipe-cat-chip ${category === "" ? "active" : ""}`} onClick={() => onCategoryClick("")}>الكل</button>
            {state.categories.map((c) => (
              <button key={c.id} className={`recipe-cat-chip ${category === c.id ? "active" : ""}`} onClick={() => onCategoryClick(c.id)}>
                {c.icon} {c.name}
              </button>
            ))}
            {!state.over_target && (
              <button className={`recipe-cat-chip ${fitsOnly ? "active" : ""}`} onClick={() => setFitsOnly((v) => !v)}>
                🎯 مناسب لسعراتي المتبقية
              </button>
            )}
          </div>
        )}

        {state?.over_target && (
          <p className="calorie-warning">🚫 وصلت لهدف السعرات اليومي — بدء وصفة جديدة معطّل هسه، لكن تقدر تتصفح الكل.</p>
        )}

        {!me.is_premium && <AdSlot html={AD_SLOTS.recipesListTop} className="ad-slot ad-slot-inline" />}

        <div className="recipe-grid">
          {loading && Array.from({ length: 6 }).map((_, i) => (
            <div className="recipe-card" key={i} style={{ pointerEvents: "none", opacity: 0.5 }}>
              <div className="recipe-card-img-placeholder">⏳</div>
            </div>
          ))}
          {!loading && error && (
            <div className="recipe-error"><span className="emoji">⚠️</span>صار خطأ بجلب الوصفات، حاول مرة ثانية.</div>
          )}
          {!loading && !error && shown.length === 0 && (
            <div className="recipe-empty"><span className="emoji">🍽️</span>لا توجد وصفات بهذا التصنيف حاليًا — راح تُضاف وصفات حقيقية قريبًا.</div>
          )}
          {!loading && !error && shown.map((r) => (
            <Link className="recipe-card" to={`/recipes/${encodeURIComponent(r.slug)}`} key={r.slug}>
              <div className="recipe-card-img-placeholder">{r.category_icon ?? "🍽️"}</div>
              <div className="recipe-card-body">
                <p className="recipe-card-name">{r.name}</p>
                <p className="recipe-card-cat">
                  {r.category_icon ?? ""} {r.category ?? ""}
                  {(r.prep_time_min || r.cook_time_min) && " · "}
                  {r.prep_time_min ? `تحضير ${r.prep_time_min}د` : ""}
                  {r.prep_time_min && r.cook_time_min ? " · " : ""}
                  {r.cook_time_min ? `طبخ ${r.cook_time_min}د` : ""}
                </p>
                <p className="recipe-card-macros">
                  {r.calories} kcal · بروتين {r.protein}غ · كارب {r.carbs}غ · دهون {r.fat}غ
                </p>
                {r.fits_remaining === true && <p className="recipe-fits-badge">✅ يناسب سعراتك المتبقية</p>}
                {r.fits_remaining === false && <p className="recipe-over-badge">⚠️ أعلى من سعراتك المتبقية</p>}
                <span className="btn btn-outline-dark recipe-card-btn">شوف الوصفة</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
