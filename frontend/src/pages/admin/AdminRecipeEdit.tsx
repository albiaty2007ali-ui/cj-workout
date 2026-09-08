import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type MeResponse } from "../../lib/api";
import AppShell from "../../components/AppShell";

interface Ingredient { name: string; quantity: string | null; unit: string | null; }
interface Step { step_number: number; instruction: string; duration: string | null; temperature: string | null; tip: string | null; warning: string | null; }
interface Substitution { ingredient_name: string; replacement: string; }

interface AdminRecipeFull {
  id: string; name: string; description: string | null; category_id: string; active: boolean;
  calories: number; protein: number; carbs: number; fat: number; fiber: number | null;
  prep_time_min: number | null; cook_time_min: number | null; servings: number; difficulty: string;
  ingredients: Ingredient[]; steps: Step[]; substitutions: Substitution[];
}
interface Category { id: string; name: string; icon: string; }

export default function AdminRecipeEdit() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [recipe, setRecipe] = useState<AdminRecipeFull | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");

  const [form, setForm] = useState<Record<string, string>>({});
  const [ingName, setIngName] = useState(""); const [ingQty, setIngQty] = useState(""); const [ingUnit, setIngUnit] = useState("");
  const [stepText, setStepText] = useState(""); const [stepDuration, setStepDuration] = useState("");
  const [stepTemp, setStepTemp] = useState(""); const [stepTip, setStepTip] = useState(""); const [stepWarning, setStepWarning] = useState("");
  const [subName, setSubName] = useState(""); const [subReplacement, setSubReplacement] = useState("");

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      if (res.data.role !== "admin") { navigate("/chat"); return; }
      setMe(res.data);
    });
  }, [navigate]);

  function load() {
    api.get<{ recipes: AdminRecipeFull[]; categories: Category[] }>("/admin/recipes").then((res) => {
      if (!res.success || !res.data) return;
      setCategories(res.data.categories);
      const r = res.data.recipes.find((x) => x.id === id);
      if (r) {
        setRecipe(r);
        setForm({
          name: r.name, description: r.description ?? "", category_id: r.category_id, difficulty: r.difficulty,
          servings: String(r.servings), prep_time_min: r.prep_time_min != null ? String(r.prep_time_min) : "",
          cook_time_min: r.cook_time_min != null ? String(r.cook_time_min) : "", calories: String(r.calories),
          protein: String(r.protein), carbs: String(r.carbs), fat: String(r.fat), fiber: r.fiber != null ? String(r.fiber) : "",
        });
      }
    });
  }
  useEffect(load, [id]);

  async function saveBase(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await api.post(`/admin/recipes?action=update&id=${id}`, {
      name: form.name, description: form.description, category_id: form.category_id, difficulty: form.difficulty,
      servings: Number(form.servings), prep_time_min: form.prep_time_min ? Number(form.prep_time_min) : null,
      cook_time_min: form.cook_time_min ? Number(form.cook_time_min) : null, calories: Number(form.calories),
      protein: Number(form.protein), carbs: Number(form.carbs), fat: Number(form.fat), fiber: form.fiber ? Number(form.fiber) : null,
    });
    if (!res.success) { setError(res.error?.message ?? "صار خطأ"); return; }
    load();
  }

  async function addIngredient(e: FormEvent) {
    e.preventDefault();
    await api.post(`/admin/recipes?action=ingredient-add&id=${id}`, { name: ingName, quantity: ingQty || null, unit: ingUnit || null });
    setIngName(""); setIngQty(""); setIngUnit("");
    load();
  }
  async function deleteIngredient(idx: number) { await api.post(`/admin/recipes?action=ingredient-delete&id=${id}&index=${idx}`); load(); }

  async function addStep(e: FormEvent) {
    e.preventDefault();
    await api.post(`/admin/recipes?action=step-add&id=${id}`, { instruction: stepText, duration: stepDuration || null, temperature: stepTemp || null, tip: stepTip || null, warning: stepWarning || null });
    setStepText(""); setStepDuration(""); setStepTemp(""); setStepTip(""); setStepWarning("");
    load();
  }
  async function deleteStep(idx: number) { await api.post(`/admin/recipes?action=step-delete&id=${id}&index=${idx}`); load(); }

  async function addSubstitution(e: FormEvent) {
    e.preventDefault();
    await api.post(`/admin/recipes?action=substitution-add&id=${id}`, { ingredient_name: subName, replacement: subReplacement });
    setSubName(""); setSubReplacement("");
    load();
  }
  async function deleteSubstitution(idx: number) { await api.post(`/admin/recipes?action=substitution-delete&id=${id}&index=${idx}`); load(); }

  if (!me || !recipe) return null;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin>
      <main className="container" style={{ maxWidth: 900 }}>
        <div className="topbar"><Link to="/admin/recipes">→ رجوع لكل الوصفات</Link></div>
        <h1 className="font-display">{recipe.name}</h1>
        <p className="subtitle">{recipe.active ? "مفعّلة ✅" : "غير مفعّلة — أكمل المكونات والخطوات ثم فعّلها من قائمة الوصفات"}</p>

        <div className="notice-box" style={{ textAlign: "right" }}>
          <h3 style={{ marginTop: 0 }}>صورة الوصفة</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>رفع الصور غير مفعّل بهذا المسار بعد — الوصفة تعرض أيقونة بديلة بدون صورة.</p>
        </div>

        <div className="notice-box" style={{ textAlign: "right" }}>
          <h3 style={{ marginTop: 0 }}>البيانات الأساسية</h3>
          <form onSubmit={saveBase} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input required minLength={2} value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <textarea rows={2} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="admin-form-row">
              <select required value={form.category_id ?? ""} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                {categories.map((c) => <option value={c.id} key={c.id}>{c.icon} {c.name}</option>)}
              </select>
              <select value={form.difficulty ?? "easy"} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                <option value="easy">سهل</option>
                <option value="medium">متوسط</option>
                <option value="hard">صعب</option>
              </select>
              <input type="number" min={1} value={form.servings ?? "1"} onChange={(e) => setForm({ ...form, servings: e.target.value })} style={{ width: 90 }} />
              <input type="number" placeholder="تحضير (د)" value={form.prep_time_min ?? ""} onChange={(e) => setForm({ ...form, prep_time_min: e.target.value })} style={{ width: 140 }} />
              <input type="number" placeholder="طبخ (د)" value={form.cook_time_min ?? ""} onChange={(e) => setForm({ ...form, cook_time_min: e.target.value })} style={{ width: 130 }} />
            </div>
            <div className="admin-form-row">
              <input type="number" required value={form.calories ?? ""} onChange={(e) => setForm({ ...form, calories: e.target.value })} style={{ width: 110 }} />
              <input type="number" step="0.1" value={form.protein ?? ""} onChange={(e) => setForm({ ...form, protein: e.target.value })} style={{ width: 120 }} />
              <input type="number" step="0.1" value={form.carbs ?? ""} onChange={(e) => setForm({ ...form, carbs: e.target.value })} style={{ width: 110 }} />
              <input type="number" step="0.1" value={form.fat ?? ""} onChange={(e) => setForm({ ...form, fat: e.target.value })} style={{ width: 110 }} />
              <input type="number" step="0.1" placeholder="ألياف (اختياري)" value={form.fiber ?? ""} onChange={(e) => setForm({ ...form, fiber: e.target.value })} style={{ width: 150 }} />
            </div>
            {error && <p className="field-error">{error}</p>}
            <button type="submit" className="btn btn-moss" style={{ alignSelf: "flex-start" }}>حفظ البيانات الأساسية</button>
          </form>
        </div>

        <div className="notice-box" style={{ textAlign: "right" }}>
          <h3 style={{ marginTop: 0 }}>🥘 المكونات ({recipe.ingredients.length})</h3>
          {recipe.ingredients.map((i, idx) => (
            <div className="admin-list-item" key={idx}>
              <div>{i.name} {(i.quantity || i.unit) && `— ${i.quantity ?? ""} ${i.unit ?? ""}`}</div>
              <button className="btn btn-danger-outline" onClick={() => deleteIngredient(idx)}>حذف</button>
            </div>
          ))}
          <form onSubmit={addIngredient} className="admin-form-row" style={{ marginTop: 12 }}>
            <input placeholder="اسم المكوّن" required value={ingName} onChange={(e) => setIngName(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            <input placeholder="الكمية" value={ingQty} onChange={(e) => setIngQty(e.target.value)} style={{ width: 90 }} />
            <input placeholder="الوحدة" value={ingUnit} onChange={(e) => setIngUnit(e.target.value)} style={{ width: 110 }} />
            <button type="submit" className="btn btn-moss">إضافة</button>
          </form>
        </div>

        <div className="notice-box" style={{ textAlign: "right" }}>
          <h3 style={{ marginTop: 0 }}>👨‍🍳 خطوات الطبخ ({recipe.steps.length})</h3>
          {recipe.steps.map((s, idx) => (
            <div className="admin-list-item" key={idx}>
              <div>
                <p style={{ fontWeight: 700 }}>الخطوة {s.step_number}</p>
                <p style={{ fontSize: "0.9rem" }}>{s.instruction}</p>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {[s.duration && `⏱️ ${s.duration}`, s.temperature && `🌡️ ${s.temperature}`, s.tip && `💡 ${s.tip}`, s.warning && `⚠️ ${s.warning}`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <button className="btn btn-danger-outline" onClick={() => deleteStep(idx)}>حذف</button>
            </div>
          ))}
          <form onSubmit={addStep} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            <textarea placeholder="نص الخطوة..." required rows={2} value={stepText} onChange={(e) => setStepText(e.target.value)} />
            <div className="admin-form-row">
              <input placeholder="المدة (اختياري)" value={stepDuration} onChange={(e) => setStepDuration(e.target.value)} />
              <input placeholder="درجة الحرارة (اختياري)" value={stepTemp} onChange={(e) => setStepTemp(e.target.value)} />
              <input placeholder="نصيحة (اختياري)" value={stepTip} onChange={(e) => setStepTip(e.target.value)} />
              <input placeholder="تحذير (اختياري)" value={stepWarning} onChange={(e) => setStepWarning(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-moss" style={{ alignSelf: "flex-start" }}>إضافة خطوة</button>
          </form>
        </div>

        <div className="notice-box" style={{ textAlign: "right" }}>
          <h3 style={{ marginTop: 0 }}>🔄 بدائل المكونات ({recipe.substitutions.length})</h3>
          {recipe.substitutions.map((s, idx) => (
            <div className="admin-list-item" key={idx}>
              <div><strong>{s.ingredient_name}:</strong> {s.replacement}</div>
              <button className="btn btn-danger-outline" onClick={() => deleteSubstitution(idx)}>حذف</button>
            </div>
          ))}
          <form onSubmit={addSubstitution} className="admin-form-row" style={{ marginTop: 12 }}>
            <input placeholder="اسم المكوّن" required value={subName} onChange={(e) => setSubName(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            <input placeholder="البديل المقترح" required value={subReplacement} onChange={(e) => setSubReplacement(e.target.value)} style={{ flex: 2, minWidth: 200 }} />
            <button type="submit" className="btn btn-moss">إضافة</button>
          </form>
        </div>
      </main>
    </AppShell>
  );
}
