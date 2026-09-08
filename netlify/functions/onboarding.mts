/** POST /api/onboarding — يعادل chat.py's onboarding() (فرع الإنشاء فقط، الواجهة تُبنى بـReact). */
import type { Context } from "@netlify/functions";
import { FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { calculate, ACTIVITY_FACTORS } from "../../shared/nutrition-engine/calorieCalc.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم POST فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const body = await req.json().catch(() => ({}));
  const age = Number(body.age);
  const weight = Number(body.weight);
  const height = Number(body.height);
  const sex = typeof body.sex === "string" ? body.sex : "";
  const goal = typeof body.goal === "string" ? body.goal : "";
  const activity = typeof body.activity === "string" ? body.activity : "";

  const errors: Record<string, string> = {};
  if (!(Number.isFinite(age) && age >= 10 && age <= 100)) errors.age = "أدخل عمر صحيح (10-100)";
  if (!(Number.isFinite(weight) && weight >= 30 && weight <= 300)) errors.weight = "أدخل وزن صحيح بالكيلوغرام";
  if (!(Number.isFinite(height) && height >= 100 && height <= 250)) errors.height = "أدخل طول صحيح بالسنتيمتر";
  if (sex !== "male" && sex !== "female") errors.sex = "اختر الجنس";
  if (goal !== "lose" && goal !== "maintain" && goal !== "gain") errors.goal = "اختر هدفك";
  if (!(activity in ACTIVITY_FACTORS)) errors.activity = "اختر مستوى نشاطك";

  if (Object.keys(errors).length > 0) {
    return jsonError(400, "VALIDATION_ERROR", "فيه أخطاء بالنموذج.", errors);
  }

  try {
    const repo = new FirestoreRepository();
    const result = calculate(age, weight, height, sex, goal, activity);

    await repo.updateNutritionProfile(claims.sub, {
      age, weight_kg: weight, height_cm: height, sex, goal, activity_level: activity,
      bmr: result.bmr, tdee: result.tdee, calorie_target: result.calorie_target,
      water_target_ml: result.water_target_ml, goal_weight: null,
    });

    await repo.insertWeightHistory({
      user_id: claims.sub, weight_kg: weight,
      bmr: result.bmr, tdee: result.tdee, calorie_target: result.calorie_target,
    });

    return jsonOk({ ok: true, ...result });
  } catch (err) {
    console.error("onboarding error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
