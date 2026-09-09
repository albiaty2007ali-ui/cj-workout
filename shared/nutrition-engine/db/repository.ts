/**
 * واجهة الوصول لقاعدة بيانات التطبيق (App DB — users/meal_logs/xp_transactions/active_days...)
 * — منفصلة تمامًا عن db/foodDb.ts (قاعدة الأكل، sql.js، Read-Only). التطبيق الحقيقي (Netlify
 * Functions) يستخدم db/firestoreRepository.ts (Firebase Firestore)؛ الاختبارات تستخدم
 * db/inMemoryRepository.ts — نفس فلسفة tests/conftest.py بايثون (SQLite بالذاكرة بدل DB حقيقية).
 *
 * كل توابع منطق الأعمال (xpEngine.ts, streaks.ts, ...) تأخذ Repository كوسيط (Dependency
 * Injection) بدل استيراد عميل DB مباشرة — هذا ما يخليها قابلة للاختبار بمعزل تام عن أي بنية
 * تحتية حقيقية، ونفس الكود يعمل بالضبط سواء بـFirestore الحقيقي أو بالمحاكي بالذاكرة.
 */

export interface UserRecord {
  id: string;
  xp: number;
  streak_days: number;
  longest_streak: number;
  streak_started_at: string | null; // "YYYY-MM-DD" أو null
  last_active_date: string | null;
  free_meals_used: number;
  is_premium: boolean;
  current_recipe_id: string | null;
  current_recipe_step: number;
  pending_recipe_confirmation_id: string | null;
  pending_food_topic_json: string | null;
  pending_meal_json: string | null;
  last_direct_log_json: string | null;
  ai_response_style: string;
  /** رصيد Streak Freeze الحالي (المرحلة 3 من ذكاء Captain CJ) — يُكتسَب من محطات Streak حقيقية
   *  (streaks.ts)، يُستهلَك صراحة عبر streakFreeze.ts، أبدًا تلقائيًا. حد أقصى موثَّق (راجع
   *  streakFreeze.MAX_STREAK_FREEZE_BALANCE) — صفر تراكم لا نهائي. */
  streak_freeze_balance: number;
}

export interface XpTransactionInput {
  user_id: string;
  amount: number;
  reason: string;
  source: string | null;
  metadata_json: string | null;
}

export interface ActiveDayRecord {
  id: string;
  user_id: string;
  date: string; // "YYYY-MM-DD"
}

export interface StreakMilestoneRecord {
  days: number;
  xp_reward: number;
  label: string;
  active: boolean;
}

/**
 * لقطة سلوك يومية حقيقية (Behavior Aggregator، أساس Personal Score/Anomaly Detection لاحقًا) —
 * تُعاد كتابتها بالكامل (مو دمج تدريجي) في كل مرة تُسجَّل وجبة/ماء، حتى تبقى مطابقة تمامًا
 * لمحتوى meal_logs/water_logs الحقيقي لنفس اليوم — صفر احتمال Drift من دمج جزئي.
 */
export interface BehaviorDailyRecord {
  user_id: string;
  date: string; // "YYYY-MM-DD" بتوقيت بغداد
  meals_logged: number;
  protein_hit_target: boolean;
  water_hit_target: boolean;
  logged_before_noon: boolean;
}

export interface NutritionProfileRecord {
  user_id: string;
  age: number;
  weight_kg: number;
  height_cm: number;
  sex: string;
  goal: string;
  activity_level: string;
  bmr: number;
  tdee: number;
  calorie_target: number;
  water_target_ml: number;
  goal_weight: number | null;
}

export interface WeightHistoryInput {
  user_id: string;
  weight_kg: number;
  bmr: number;
  tdee: number;
  calorie_target: number;
  recorded_at?: Date;
}

export interface WeightHistoryRecord extends WeightHistoryInput {
  id: string;
  recorded_at: Date;
}

export interface Repository {
  // ---- Users ----
  findUser(userId: string): Promise<UserRecord | null>;
  saveUser(user: UserRecord): Promise<void>;

  // ---- XP Ledger ----
  findXpTransactionBySource(userId: string, source: string): Promise<boolean>;
  insertXpTransaction(tx: XpTransactionInput): Promise<void>;
  // مرتبة تصاعديًا بالتاريخ — لأغراض عرض فقط (مثلاً Progress Replay)، صفر استخدام بمنطق منح XP.
  listXpTransactionsByReason(userId: string, reason: string): Promise<{ amount: number; source: string | null; created_at: Date }[]>;

  // ---- Active Days / Streaks ----
  findActiveDay(userId: string, date: string): Promise<ActiveDayRecord | null>;
  insertActiveDay(userId: string, date: string): Promise<ActiveDayRecord>;
  deleteActiveDay(id: string): Promise<void>;
  findActiveDayById(id: string): Promise<ActiveDayRecord | null>;
  findActiveDaysInRange(userId: string, startIso: string, endIso: string): Promise<string[]>;
  listActiveStreakMilestonesUpTo(days: number): Promise<StreakMilestoneRecord[]>;

  // ---- Nutrition Profile / Weight ----
  findNutritionProfile(userId: string): Promise<NutritionProfileRecord | null>;
  updateNutritionProfile(userId: string, patch: Partial<NutritionProfileRecord>): Promise<void>;
  insertWeightHistory(row: WeightHistoryInput): Promise<WeightHistoryRecord>;
  findWeightHistory(userId: string, sinceDate?: Date): Promise<WeightHistoryRecord[]>; // مرتبة تصاعديًا بـrecorded_at
  findWeightHistoryById(id: string): Promise<WeightHistoryRecord | null>;
  deleteWeightHistory(id: string): Promise<void>;

  // ---- Meal Logs / Water Logs ----
  countMealLogsForUser(userId: string): Promise<number>;
  countWaterLogsForUser(userId: string): Promise<number>;
  findFirstMealLogForUser(userId: string): Promise<MealLogRecord | null>;
  insertMealLog(row: MealLogInput): Promise<MealLogRecord>;
  findMealLog(id: string): Promise<MealLogRecord | null>;
  deleteMealLog(id: string): Promise<void>;
  findMealLogsInRange(userId: string, startUtc: Date, endUtc: Date): Promise<MealLogRecord[]>;
  insertWaterLog(row: WaterLogInput): Promise<WaterLogRecord>;
  findWaterLog(id: string): Promise<WaterLogRecord | null>;
  deleteWaterLog(id: string): Promise<void>;
  findWaterLogsInRange(userId: string, startUtc: Date, endUtc: Date): Promise<WaterLogRecord[]>;

  // ---- Meal Status ----
  findMealStatus(userId: string, dateIso: string, mealType: string): Promise<MealStatusRecord | null>;
  upsertMealStatus(userId: string, dateIso: string, mealType: string, status: string): Promise<void>;

  // ---- Tips ----
  findNutritionTipsByCategory(category: string): Promise<NutritionTipRecord[]>;
  findRecentShownTipIds(userId: string, limit: number): Promise<string[]>;
  insertShownTip(userId: string, tipId: string): Promise<void>;

  // ---- Levels ----
  // reward: مكافأة تجميلية بحتة (شارة/لقب) تُعرَض عند وصول المستخدم للمستوى — صفر تأثير على أي حساب.
  listLevels(): Promise<{ level: number; required_xp: number; title: string; reward: { badge_icon: string; badge_title: string } | null }[]>;

  // ---- Recipes ----
  findActiveRecipes(categoryId?: string | null): Promise<RecipeRecord[]>; // مرتبة بالاسم
  findRecipeById(id: string): Promise<RecipeRecord | null>;
  findRecipeBySlug(slug: string): Promise<RecipeRecord | null>;
  findRecipeCategoryByName(name: string): Promise<{ id: string; name: string } | null>;
  listRecipeCategories(): Promise<{ id: string; name: string; icon: string; order_index: number }[]>; // مرتبة بـorder_index

  // ---- Behavior Aggregator ----
  findBehaviorDaily(userId: string, date: string): Promise<BehaviorDailyRecord | null>;
  upsertBehaviorDaily(row: BehaviorDailyRecord): Promise<void>;
  findBehaviorDailyInRange(userId: string, startIso: string, endIso: string): Promise<BehaviorDailyRecord[]>; // مرتبة تصاعديًا بالتاريخ

  // ---- Challenges ----
  findChallengeProgress(userId: string, challengeId: string): Promise<ChallengeProgressRecord | null>;
  insertChallengeProgress(row: ChallengeProgressRecord): Promise<void>; // يفشل لو موجودة مسبقًا (محاولة واحدة فقط)
  updateChallengeProgress(userId: string, challengeId: string, patch: Partial<ChallengeProgressRecord>): Promise<void>;

  // ---- Streak Freeze ----
  insertStreakFreezeUsage(row: StreakFreezeUsageRecord): Promise<void>;

  // ---- Recovery Day ----
  findRecoveryDay(userId: string, date: string): Promise<RecoveryDayRecord | null>;
  setRecoveryDay(row: RecoveryDayRecord): Promise<void>; // Upsert — تفعيل أو تغيير النمط لنفس اليوم
  clearRecoveryDay(userId: string, date: string): Promise<void>; // إلغاء التفعيل

  // ---- Insights (Smart Anomaly Detection) ----
  findInsightShown(userId: string, type: string, date: string): Promise<boolean>;
  recordInsightShown(row: InsightShownRecord): Promise<void>; // Best-effort — لا يرمي أبدًا حتى لو صار Race نادر

  /**
   * تحديث ذري لعداد الوجبات المجانية — يطابق `UPDATE users SET free_meals_used =
   * free_meals_used + 1 WHERE id=:uid AND free_meals_used < :cap` بايثون (منع تجاوز الحد تحت
   * تزامن حقيقي). يرجّع true لو التحديث نجح (تحت الحد)، false لو الحد وصل مسبقًا.
   */
  incrementFreeMealsUsedIfBelowCap(userId: string, cap: number): Promise<boolean>;
}

export interface RecipeIngredientRecord {
  name: string;
  quantity: string | null;
  unit: string | null;
  /** food_id حقيقي من foods.sqlite (ingredientResolver.ts) — null/undefined لو المكوّن لم
   *  يتحلّل بثقة كافية (القاعدة صغيرة، 44 food فقط — هذا متوقع لكثير من المكونات). صفر تخمين.
   *  اختياري (مو إجباري) حتى ما تنكسر الوثائق/الاختبارات الحالية اللي انكتبت قبل هذا الحقل —
   *  أي قارئ يعامل undefined كـnull. */
  food_id?: number | null;
  /** true افتراضيًا لكل مكوّن (صفر تخمين) — false فقط لو النص الأصلي يحتوي كلمة "اختياري"
   *  فعليًا. اختياري لنفس سبب food_id أعلاه — أي قارئ يعامل undefined كـtrue. */
  required?: boolean;
}

export interface RecipeStepRecord {
  step_number: number;
  instruction: string;
  duration: string | null;
  temperature: string | null;
  tip: string | null;
  warning: string | null;
}

export interface RecipeSubstitutionRecord {
  ingredient_name: string;
  replacement: string;
}

export interface RecipeRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category_id: string;
  active: boolean;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
  servings: number;
  difficulty: string;
  match_keywords: string | null;
  /** مصدر خارجي حقيقي (مثلاً رابط USDA MyPlate Kitchen) — null لو غير موثَّق. */
  source: string | null;
  /** كلمات تصنيف خفيفة للبحث/الترشيح (مثلاً "عالي البروتين"، "سريع") — مصفوفة فاضية افتراضيًا. */
  tags: string[];
  ingredients: RecipeIngredientRecord[];
  steps: RecipeStepRecord[];
  substitutions: RecipeSubstitutionRecord[];
}

export interface MealLogInput {
  user_id: string;
  meal_type: string;
  raw_text: string;
  matched_foods_json: string | null;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  is_free_meal: boolean;
}

export interface MealLogRecord extends MealLogInput {
  id: string;
  created_at: Date;
}

export interface WaterLogInput {
  user_id: string;
  ml: number;
}

export interface WaterLogRecord extends WaterLogInput {
  id: string;
  created_at: Date;
}

export interface MealStatusRecord {
  user_id: string;
  date: string;
  meal_type: string;
  status: string;
}

export interface NutritionTipRecord {
  id: string;
  text: string;
  category: string;
  active: boolean;
  priority: number;
}

/**
 * تقدّم تحدٍّ متعدد الأيام (Challenges، المرحلة 2 من ذكاء Captain CJ) — محاولة واحدة نشطة لكل
 * (مستخدم، تحدٍّ) بأي وقت (معرّف الوثيقة `${userId}_${challengeId}`)، التقدم الفعلي يُحسب من
 * behavior_daily الحقيقي بين start_date واليوم، صفر عداد منفصل يمكن أن ينحرف.
 */
export interface ChallengeProgressRecord {
  user_id: string;
  challenge_id: string;
  start_date: string; // "YYYY-MM-DD" بتوقيت بغداد — بداية نافذة الحساب
  status: "active" | "completed";
  completed_at: string | null;
}

/** سجل تدقيق فقط لاستخدام Streak Freeze — منطق الحماية الفعلي بـstreakFreeze.ts يعتمد على active_days الحقيقية، هذا للتاريخ/الشفافية فقط. */
export interface StreakFreezeUsageRecord {
  user_id: string;
  date_covered: string; // اليوم اللي انحمى (عادة "أمس")
  used_at: string; // اليوم اللي استُخدم فيه الـFreeze فعليًا
}

/**
 * يوم مرن/استثنائي (Recovery/Flexible Day، المرحلة 4) — فعل مستخدم صريح ليوم واحد محدد، لا يمس
 * أبدًا XP/Streak/السجل التاريخي/حدود Trial (صفر استدعاء لأي من تلك الأنظمة من مسار هذا الملف
 * أصلاً — هذا وحده الضمان، بدون حارس إضافي). التأثير الفعلي الحالي: يوقف تذكيرات وقت الوجبات
 * المجدولة لنفس اليوم (scheduled-reminders.mts) بدل الضغط بجدول ثابت على يوم استثنائي.
 */
export interface RecoveryDayRecord {
  user_id: string;
  date: string; // "YYYY-MM-DD" بتوقيت بغداد
  mode: "FLEXIBLE_DAY" | "BUSY_DAY" | "TRAVEL_DAY";
  activated_at: string; // ISO timestamp
}

/** علامة "هذا النوع من Insight انعرض لهذا المستخدم هذا اليوم" — Cooldown بسيط يمنع تكرار نفس الملاحظة بنفس اليوم (المرحلة 5). */
export interface InsightShownRecord {
  user_id: string;
  type: string;
  date: string; // "YYYY-MM-DD" بتوقيت بغداد
}
