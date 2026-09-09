/**
 * محاكي Repository بالذاكرة — لأغراض الاختبار فقط، نفس فلسفة tests/conftest.py بايثون
 * (SQLite بالذاكرة بدل Postgres حقيقي). يطبّق نفس قيود الفريدة (Unique) اللي بـdb/schema.sql
 * (مثلاً uq_active_day) حتى يطابق سلوك القيد الحقيقي، لا يقبل بصمت إدخالًا مكررًا.
 */
import type {
  Repository, XpTransactionInput, ActiveDayRecord, StreakMilestoneRecord,
  NutritionProfileRecord, WeightHistoryInput, WeightHistoryRecord,
  MealLogInput, MealLogRecord, WaterLogInput, WaterLogRecord,
  MealStatusRecord, NutritionTipRecord, UserRecord, RecipeRecord, BehaviorDailyRecord,
} from "./repository.js";

function genId(): string {
  return Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32);
}

export class InMemoryRepository implements Repository {
  /**
   * ساعة قابلة للتثبيت للاختبارات — لو اختبار مرّر `now` ثابتة تاريخية لـhandleMessage() (حتى
   * تتحكم بحساب "اليوم"/بغداد بشكل حتمي)، لازم يحطها هنا كمان قبل أي insert*، وإلا الصفوف
   * تنختم بـnew Date() الحقيقية (تاريخ اليوم الفعلي) وتوقع خارج مدى "اليوم" المحسوب بالاختبار —
   * هذا بالضبط سبب فشل صامت لاختبارات "امجموع اليوم"/"today_calories" أول ما يتغيّر تاريخ النظام
   * الحقيقي عن التاريخ الثابت المستخدم بالاختبار.
   */
  now: Date | null = null;
  private clockNow(): Date {
    return this.now ?? new Date();
  }

  users = new Map<string, UserRecord>();

  async findUser(userId: string): Promise<UserRecord | null> {
    const u = this.users.get(userId);
    return u ? { ...u } : null;
  }

  async saveUser(user: UserRecord): Promise<void> {
    this.users.set(user.id, { ...user });
  }

  private xpTransactions: (XpTransactionInput & { id: string })[] = [];
  private activeDays: ActiveDayRecord[] = [];
  streakMilestones: StreakMilestoneRecord[] = [];

  async findXpTransactionBySource(userId: string, source: string): Promise<boolean> {
    return this.xpTransactions.some((t) => t.user_id === userId && t.source === source);
  }

  async insertXpTransaction(tx: XpTransactionInput): Promise<void> {
    this.xpTransactions.push({ ...tx, id: genId() });
  }

  async findActiveDay(userId: string, date: string): Promise<ActiveDayRecord | null> {
    return this.activeDays.find((d) => d.user_id === userId && d.date === date) ?? null;
  }

  async insertActiveDay(userId: string, date: string): Promise<ActiveDayRecord> {
    if (await this.findActiveDay(userId, date)) {
      throw new Error(`uq_active_day violation: (${userId}, ${date}) already exists`);
    }
    const row: ActiveDayRecord = { id: genId(), user_id: userId, date };
    this.activeDays.push(row);
    return row;
  }

  async deleteActiveDay(id: string): Promise<void> {
    this.activeDays = this.activeDays.filter((d) => d.id !== id);
  }

  async findActiveDayById(id: string): Promise<ActiveDayRecord | null> {
    return this.activeDays.find((d) => d.id === id) ?? null;
  }

  async findActiveDaysInRange(userId: string, startIso: string, endIso: string): Promise<string[]> {
    return this.activeDays
      .filter((d) => d.user_id === userId && d.date >= startIso && d.date <= endIso)
      .map((d) => d.date);
  }

  async listActiveStreakMilestonesUpTo(days: number): Promise<StreakMilestoneRecord[]> {
    return this.streakMilestones.filter((m) => m.active && m.days <= days);
  }

  nutritionProfiles = new Map<string, NutritionProfileRecord>();
  private weightHistory: WeightHistoryRecord[] = [];

  async findNutritionProfile(userId: string): Promise<NutritionProfileRecord | null> {
    return this.nutritionProfiles.get(userId) ?? null;
  }

  async updateNutritionProfile(userId: string, patch: Partial<NutritionProfileRecord>): Promise<void> {
    const existing = this.nutritionProfiles.get(userId);
    if (!existing) throw new Error(`no NutritionProfile for user ${userId}`);
    this.nutritionProfiles.set(userId, { ...existing, ...patch });
  }

  async insertWeightHistory(row: WeightHistoryInput): Promise<WeightHistoryRecord> {
    const record: WeightHistoryRecord = { id: genId(), recorded_at: this.clockNow(), ...row };
    this.weightHistory.push(record);
    return record;
  }

  async findWeightHistory(userId: string, sinceDate?: Date): Promise<WeightHistoryRecord[]> {
    return this.weightHistory
      .filter((w) => w.user_id === userId && (!sinceDate || w.recorded_at >= sinceDate))
      .sort((a, b) => a.recorded_at.getTime() - b.recorded_at.getTime());
  }

  async findWeightHistoryById(id: string): Promise<WeightHistoryRecord | null> {
    return this.weightHistory.find((w) => w.id === id) ?? null;
  }

  async deleteWeightHistory(id: string): Promise<void> {
    this.weightHistory = this.weightHistory.filter((w) => w.id !== id);
  }

  private mealLogs: MealLogRecord[] = [];
  private waterLogs: WaterLogRecord[] = [];
  private mealStatuses: MealStatusRecord[] = [];
  nutritionTips: NutritionTipRecord[] = [];
  private shownTips: { user_id: string; tip_id: string; shown_at: Date }[] = [];

  async countMealLogsForUser(userId: string): Promise<number> {
    return this.mealLogs.filter((m) => m.user_id === userId).length;
  }

  async countWaterLogsForUser(userId: string): Promise<number> {
    return this.waterLogs.filter((w) => w.user_id === userId).length;
  }

  levels: { level: number; required_xp: number; title: string; reward: string | null }[] = [];

  async listLevels(): Promise<{ level: number; required_xp: number; title: string; reward: string | null }[]> {
    return [...this.levels].sort((a, b) => a.level - b.level);
  }

  async insertMealLog(row: MealLogInput): Promise<MealLogRecord> {
    const record: MealLogRecord = { id: genId(), created_at: this.clockNow(), ...row };
    this.mealLogs.push(record);
    return record;
  }

  async findMealLog(id: string): Promise<MealLogRecord | null> {
    return this.mealLogs.find((m) => m.id === id) ?? null;
  }

  async deleteMealLog(id: string): Promise<void> {
    this.mealLogs = this.mealLogs.filter((m) => m.id !== id);
  }

  async findMealLogsInRange(userId: string, startUtc: Date, endUtc: Date): Promise<MealLogRecord[]> {
    return this.mealLogs.filter(
      (m) => m.user_id === userId && m.created_at >= startUtc && m.created_at < endUtc,
    );
  }

  async insertWaterLog(row: WaterLogInput): Promise<WaterLogRecord> {
    const record: WaterLogRecord = { id: genId(), created_at: this.clockNow(), ...row };
    this.waterLogs.push(record);
    return record;
  }

  async findWaterLog(id: string): Promise<WaterLogRecord | null> {
    return this.waterLogs.find((w) => w.id === id) ?? null;
  }

  async deleteWaterLog(id: string): Promise<void> {
    this.waterLogs = this.waterLogs.filter((w) => w.id !== id);
  }

  async findWaterLogsInRange(userId: string, startUtc: Date, endUtc: Date): Promise<WaterLogRecord[]> {
    return this.waterLogs.filter(
      (w) => w.user_id === userId && w.created_at >= startUtc && w.created_at < endUtc,
    );
  }

  async findMealStatus(userId: string, dateIso: string, mealType: string): Promise<MealStatusRecord | null> {
    return this.mealStatuses.find(
      (s) => s.user_id === userId && s.date === dateIso && s.meal_type === mealType,
    ) ?? null;
  }

  async upsertMealStatus(userId: string, dateIso: string, mealType: string, status: string): Promise<void> {
    const existing = await this.findMealStatus(userId, dateIso, mealType);
    if (existing) {
      existing.status = status;
    } else {
      this.mealStatuses.push({ user_id: userId, date: dateIso, meal_type: mealType, status });
    }
  }

  async findNutritionTipsByCategory(category: string): Promise<NutritionTipRecord[]> {
    return this.nutritionTips.filter((t) => t.category === category && t.active);
  }

  async findRecentShownTipIds(userId: string, limit: number): Promise<string[]> {
    return this.shownTips
      .filter((s) => s.user_id === userId)
      .sort((a, b) => b.shown_at.getTime() - a.shown_at.getTime())
      .slice(0, limit)
      .map((s) => s.tip_id);
  }

  async insertShownTip(userId: string, tipId: string): Promise<void> {
    this.shownTips.push({ user_id: userId, tip_id: tipId, shown_at: this.clockNow() });
  }

  recipes: RecipeRecord[] = [];

  async findActiveRecipes(categoryId?: string | null): Promise<RecipeRecord[]> {
    return this.recipes
      .filter((r) => r.active && (!categoryId || r.category_id === categoryId))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findRecipeById(id: string): Promise<RecipeRecord | null> {
    return this.recipes.find((r) => r.id === id) ?? null;
  }

  async findRecipeBySlug(slug: string): Promise<RecipeRecord | null> {
    return this.recipes.find((r) => r.slug === slug && r.active) ?? null;
  }

  recipeCategories: { id: string; name: string; icon: string; order_index: number }[] = [];

  async findRecipeCategoryByName(name: string): Promise<{ id: string; name: string } | null> {
    return this.recipeCategories.find((c) => c.name === name) ?? null;
  }

  async listRecipeCategories(): Promise<{ id: string; name: string; icon: string; order_index: number }[]> {
    return [...this.recipeCategories].sort((a, b) => a.order_index - b.order_index);
  }

  private behaviorDaily: BehaviorDailyRecord[] = [];

  async findBehaviorDaily(userId: string, date: string): Promise<BehaviorDailyRecord | null> {
    return this.behaviorDaily.find((b) => b.user_id === userId && b.date === date) ?? null;
  }

  async upsertBehaviorDaily(row: BehaviorDailyRecord): Promise<void> {
    const idx = this.behaviorDaily.findIndex((b) => b.user_id === row.user_id && b.date === row.date);
    if (idx >= 0) this.behaviorDaily[idx] = { ...row };
    else this.behaviorDaily.push({ ...row });
  }

  async findBehaviorDailyInRange(userId: string, startIso: string, endIso: string): Promise<BehaviorDailyRecord[]> {
    return this.behaviorDaily
      .filter((b) => b.user_id === userId && b.date >= startIso && b.date <= endIso)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async incrementFreeMealsUsedIfBelowCap(userId: string, cap: number): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user || user.free_meals_used >= cap) return false;
    user.free_meals_used += 1;
    return true;
  }
}

/** نفس DEFAULT_MILESTONES بـstreaks.py بالضبط — تُستخدم لتعبئة محاكي الاختبار بنفس بيانات الإنتاج. */
export const DEFAULT_MILESTONES: StreakMilestoneRecord[] = [
  { days: 1, xp_reward: 5, label: "أول يوم 🔥", active: true },
  { days: 3, xp_reward: 10, label: "3 أيام متتالية", active: true },
  { days: 7, xp_reward: 20, label: "أسبوع كامل 🔥", active: true },
  { days: 14, xp_reward: 35, label: "أسبوعين", active: true },
  { days: 30, xp_reward: 75, label: "شهر كامل 💪", active: true },
  { days: 60, xp_reward: 120, label: "شهرين", active: true },
  { days: 100, xp_reward: 200, label: "100 يوم 🏆", active: true },
  { days: 365, xp_reward: 500, label: "سنة كاملة 🏆", active: true },
];
