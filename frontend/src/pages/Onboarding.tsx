import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ACTIVITY_LABELS } from "../lib/onboardingApi";

const TOTAL_STEPS = 6;

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [sex, setSex] = useState("");
  const [goal, setGoal] = useState("");
  const [activity, setActivity] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function canAdvance(): boolean {
    if (step === 1) return age.trim() !== "";
    if (step === 2) return weight.trim() !== "";
    if (step === 3) return height.trim() !== "";
    if (step === 4) return sex !== "";
    if (step === 5) return goal !== "";
    return true;
  }

  function next() {
    if (!canAdvance()) return;
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }

  function back() {
    setStep((s) => Math.max(1, s - 1));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activity) return;
    setErrors({});
    setLoading(true);
    try {
      const res = await api.post<{ calorie_target: number }>("/onboarding", {
        age: Number(age), weight: Number(weight), height: Number(height), sex, goal, activity,
      });
      if (!res.success) {
        setErrors(res.error?.details ?? { _: res.error?.message ?? "صار خطأ، جرب مرة ثانية" });
        return;
      }
      navigate("/chat?welcome=1");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="font-display">خلينا نتعرف عليك 👋</h1>
        <p className="subtitle">بس أسئلة بسيطة حتى نبني خطتك الشخصية</p>
        <div className="onboarding-progress"><span>{step} / {TOTAL_STEPS}</span></div>

        <form onSubmit={onSubmit} style={{ marginTop: 20 }}>
          {step === 1 && (
            <div className="ob-step">
              <label className="ob-question">شكد عمرك؟</label>
              <input type="number" min={10} max={100} className="ob-input" value={age} onChange={(e) => setAge(e.target.value)} autoFocus />
              {errors.age && <p className="field-error">{errors.age}</p>}
            </div>
          )}
          {step === 2 && (
            <div className="ob-step">
              <label className="ob-question">شكد وزنك الحالي؟ (بالكيلوغرام)</label>
              <input type="number" step="0.1" min={30} max={300} className="ob-input" value={weight} onChange={(e) => setWeight(e.target.value)} autoFocus />
              {errors.weight && <p className="field-error">{errors.weight}</p>}
            </div>
          )}
          {step === 3 && (
            <div className="ob-step">
              <label className="ob-question">شكد طولك؟ (بالسنتيمتر)</label>
              <input type="number" step="0.1" min={100} max={250} className="ob-input" value={height} onChange={(e) => setHeight(e.target.value)} autoFocus />
              {errors.height && <p className="field-error">{errors.height}</p>}
            </div>
          )}
          {step === 4 && (
            <div className="ob-step">
              <label className="ob-question">الجنس؟ (يستخدم فقط لحساب السعرات بدقة)</label>
              <div className="ob-options">
                <label className="ob-radio"><input type="radio" name="sex" value="male" checked={sex === "male"} onChange={() => setSex("male")} /> ذكر</label>
                <label className="ob-radio"><input type="radio" name="sex" value="female" checked={sex === "female"} onChange={() => setSex("female")} /> أنثى</label>
              </div>
              {errors.sex && <p className="field-error">{errors.sex}</p>}
            </div>
          )}
          {step === 5 && (
            <div className="ob-step">
              <label className="ob-question">شنو هدفك؟</label>
              <div className="ob-options">
                <label className="ob-radio"><input type="radio" name="goal" value="lose" checked={goal === "lose"} onChange={() => setGoal("lose")} /> تنزيل وزن</label>
                <label className="ob-radio"><input type="radio" name="goal" value="gain" checked={goal === "gain"} onChange={() => setGoal("gain")} /> تضخيم / صعود وزن</label>
                <label className="ob-radio"><input type="radio" name="goal" value="maintain" checked={goal === "maintain"} onChange={() => setGoal("maintain")} /> تثبيت الوزن</label>
              </div>
              {errors.goal && <p className="field-error">{errors.goal}</p>}
            </div>
          )}
          {step === 6 && (
            <div className="ob-step">
              <label className="ob-question">شكد تتمرن بالأسبوع؟</label>
              <div className="ob-options">
                {Object.entries(ACTIVITY_LABELS).map(([key, label]) => (
                  <label className="ob-radio" key={key}>
                    <input type="radio" name="activity" value={key} checked={activity === key} onChange={() => setActivity(key)} /> {label}
                  </label>
                ))}
              </div>
              {errors.activity && <p className="field-error">{errors.activity}</p>}
            </div>
          )}
          {errors._ && <p className="field-error">{errors._}</p>}

          <div className="ob-nav">
            {step > 1 && <button type="button" className="btn btn-outline-dark" onClick={back}>السابق</button>}
            {step < TOTAL_STEPS && <button type="button" className="btn btn-moss" onClick={next} disabled={!canAdvance()}>التالي</button>}
            {step === TOTAL_STEPS && <button type="submit" className="btn btn-gold" disabled={!activity || loading}>{loading ? "..." : "احسب خطتي 🔥"}</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
