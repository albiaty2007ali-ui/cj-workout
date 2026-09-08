import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../../lib/api";
import AppShell from "../../components/AppShell";

interface AdminRecipe {
  id: string; name: string; active: boolean; calories: number; category_id: string;
  ingredients: unknown[]; steps: unknown[];
}
interface Category { id: string; name: string; icon: string; }

export default function AdminRecipes() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [recipes, setRecipes] = useState<AdminRecipe[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");

  const [catIcon, setCatIcon] = useState("");
  const [catName, setCatName] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [difficulty, setDifficulty] = useState("easy");
  const [servings, setServings] = useState("1");
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      if (res.data.role !== "admin") { navigate("/chat"); return; }
      setMe(res.data);
    });
  }, [navigate]);

  function load() {
    api.get<{ recipes: AdminRecipe[]; categories: Category[] }>("/admin/recipes").then((res) => {
      if (res.success && res.data) { setRecipes(res.data.recipes); setCategories(res.data.categories); }
    });
  }
  useEffect(load, []);

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await api.post("/admin/recipes?action=category-add", { name: catName, icon: catIcon || undefined });
    if (!res.success) { setError(res.error?.message ?? "صار خطأ"); return; }
    setCatIcon(""); setCatName("");
    load();
  }

  async function addRecipe(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await api.post<{ id: string }>("/admin/recipes?action=add", {
      name, description, category_id: categoryId, difficulty, servings: Number(servings),
      prep_time_min: prepTime ? Number(prepTime) : null, cook_time_min: cookTime ? Number(cookTime) : null,
      calories: Number(calories), protein: protein ? Number(protein) : 0, carbs: carbs ? Number(carbs) : 0,
      fat: fat ? Number(fat) : 0, fiber: fiber ? Number(fiber) : null,
    });
    if (!res.success || !res.data) { setError(res.error?.message ?? "صار خطأ"); return; }
    navigate(`/admin/recipes/${res.data.id}`);
  }

  async function toggle(id: string) {
    const res = await api.post(`/admin/recipes?action=toggle&id=${id}`);
    if (!res.success) { alert(res.error?.message ?? "صار خطأ"); }
    load();
  }
  async function del(id: string) { if (!confirm("حذف هذي الوصفة نهائيًا؟")) return; await api.post(`/admin/recipes?action=delete&id=${id}`); load(); }

  if (!me) return null;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin>
      <main className="container" style={{ maxWidth: 900 }}>
        <div className="topbar"><Link to="/admin">→ رجوع للوحة الإدارة</Link></div>
        <h1 className="font-display">إدارة الوصفات</h1>
        <p className="subtitle">{recipes.length} وصفة بقاعدة البيانات — الوصفة تحتاج مكوّن وخطوة واحدة على الأقل قبل التفعيل</p>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>إضافة تصنيف جديد</h3>
          <form onSubmit={addCategory} className="admin-form-row">
            <input placeholder="🍮" maxLength={10} value={catIcon} onChange={(e) => setCatIcon(e.target.value)} style={{ width: 70, textAlign: "center" }} />
            <input placeholder="اسم التصنيف الجديد" required value={catName} onChange={(e) => setCatName(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
            <button type="submit" className="btn btn-moss">إضافة</button>
          </form>
        </div>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>إضافة وصفة جديدة</h3>
          <form onSubmit={addRecipe} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input placeholder="اسم الوصفة" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
            <textarea placeholder="وصف قصير..." rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="admin-form-row">
              <select required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">اختر تصنيف</option>
                {categories.map((c) => <option value={c.id} key={c.id}>{c.icon} {c.name}</option>)}
              </select>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="easy">سهل</option>
                <option value="medium">متوسط</option>
                <option value="hard">صعب</option>
              </select>
              <input type="number" min={1} placeholder="حصص" title="عدد الحصص" value={servings} onChange={(e) => setServings(e.target.value)} style={{ width: 90 }} />
              <input type="number" placeholder="وقت تحضير (د)" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} style={{ width: 150 }} />
              <input type="number" placeholder="وقت طبخ (د)" value={cookTime} onChange={(e) => setCookTime(e.target.value)} style={{ width: 140 }} />
            </div>
            <div className="admin-form-row">
              <input type="number" placeholder="سعرات" required value={calories} onChange={(e) => setCalories(e.target.value)} style={{ width: 110 }} />
              <input type="number" step="0.1" placeholder="بروتين غ" value={protein} onChange={(e) => setProtein(e.target.value)} style={{ width: 120 }} />
              <input type="number" step="0.1" placeholder="كارب غ" value={carbs} onChange={(e) => setCarbs(e.target.value)} style={{ width: 110 }} />
              <input type="number" step="0.1" placeholder="دهون غ" value={fat} onChange={(e) => setFat(e.target.value)} style={{ width: 110 }} />
              <input type="number" step="0.1" placeholder="ألياف غ (اختياري)" value={fiber} onChange={(e) => setFiber(e.target.value)} style={{ width: 150 }} />
            </div>
            {error && <p className="field-error">{error}</p>}
            <button type="submit" className="btn btn-moss" style={{ alignSelf: "flex-start" }}>إضافة الوصفة ومتابعة التفاصيل</button>
          </form>
        </div>

        <div style={{ marginTop: 32 }}>
          {recipes.map((r) => {
            const cat = categories.find((c) => c.id === r.category_id);
            return (
              <div className="admin-list-item" key={r.id}>
                <div>
                  <p style={{ fontWeight: 700, color: "var(--heading)" }}>{cat?.icon ?? "🍽️"} {r.name}{!r.active && " — غير مفعّلة"}</p>
                  <p style={{ fontSize: "0.9rem" }}>{cat?.name ?? "بدون تصنيف"} · {r.calories} kcal · {r.ingredients.length} مكوّن · {r.steps.length} خطوة</p>
                </div>
                <div className="admin-list-actions">
                  <Link to={`/admin/recipes/${r.id}`} className="btn btn-outline-dark">تعديل</Link>
                  <button className="btn btn-moss" onClick={() => toggle(r.id)}>{r.active ? "تعطيل" : "تفعيل"}</button>
                  <button className="btn btn-danger-outline" onClick={() => del(r.id)}>حذف</button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
