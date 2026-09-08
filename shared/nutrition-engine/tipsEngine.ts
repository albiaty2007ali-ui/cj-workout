/**
 * منفذ حرفي من nutrition_ai/tips_engine.py — بنك نصائح قابل للتوسّع من لوحة الأدمن، مع اختيار
 * سياقي (وقت + هدف + بروتين اليوم + الماي + آخر وجبة) بدل عشوائي بالكامل، ومنع تكرار عبر
 * ShownTip. seed_default_tips (بايثون) غير منفَّذ هنا — عملية بذر بيانات لمرة واحدة عند الإقلاع،
 * تخص طبقة الـPostgres الحقيقية فقط، لا منطق أعمال يُختبر بمعزل.
 */
import type { Repository } from "./db/repository.js";
import type { NutritionContext } from "./context.js";

export function chooseCategoryForContext(ctx: NutritionContext, mealType: string | null = null): string {
  if (ctx.over_target) return "high_calorie_meal";

  const target = ctx.target_calories || 0;
  const remaining = ctx.remaining_calories || 0;
  if (target && remaining <= target * 0.15) return "daily_target";

  const proteinTarget = ctx.macro_targets?.protein_g;
  if (proteinTarget && (ctx.consumed_protein ?? 0) < proteinTarget * 0.5) return "protein";

  const waterTarget = ctx.water_target_ml || 2000;
  if ((ctx.water_ml ?? 0) < waterTarget * 0.4) return "hydration";

  if (ctx.goal === "lose") return "weight_loss";
  if (ctx.goal === "gain") return "weight_gain";

  if (mealType === "breakfast" || mealType === "lunch" || mealType === "dinner") return mealType;
  return "balance";
}

export async function pickTip(
  repo: Repository,
  userId: string,
  category: string,
  recentLimit = 5,
): Promise<string | null> {
  let candidates = await repo.findNutritionTipsByCategory(category);
  if (candidates.length === 0) {
    candidates = await repo.findNutritionTipsByCategory("balance");
  }
  if (candidates.length === 0) return null;

  const recentIds = new Set(await repo.findRecentShownTipIds(userId, recentLimit));
  const fresh = candidates.filter((t) => !recentIds.has(t.id));
  const pool = fresh.length > 0 ? fresh : candidates;

  const maxPriority = Math.max(...pool.map((t) => t.priority));
  const topPool = pool.filter((t) => t.priority === maxPriority);
  const finalPool = topPool.length > 0 ? topPool : pool;
  const chosen = finalPool[Math.floor(Math.random() * finalPool.length)];

  await repo.insertShownTip(userId, chosen.id);
  return chosen.text;
}
