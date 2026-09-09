/**
 * تطبيق حقيقي لـRepository فوق Firestore (القرار: Firebase بدل Neon/Postgres، راجع
 * NETLIFY_MIGRATION_AUDIT.md). صفر تغيير على أي منطق أعمال (orchestrator.ts وكل
 * الباقي) — هذا بالضبط الهدف من نمط Repository: يتكلمون مع الواجهة فقط.
 *
 * تصميم المجموعات (Collections) — Firestore بدون علاقات/JOIN، فبعض القيود المطبَّقة بـPostgres
 * عبر UNIQUE CONSTRAINT تتحول هنا لمعرّفات وثيقة (Document ID) حتمية بدل قيد قاعدة بيانات:
 *   - active_days: معرّف الوثيقة = `${userId}_${date}` (كان uq_active_day)
 *   - meal_status: معرّف الوثيقة = `${userId}_${date}_${mealType}` (كان uq_meal_status_day)
 *   - xp_transactions: لو فيه source، معرّف الوثيقة = `${userId}_src_${source}` (Idempotency
 *     عبر "أنشئ لو ما موجود" بدل فحص ثم كتابة منفصلين — نفس الضمان الذري)
 * الوصفات (ingredients/steps/substitutions) مُدمجة كمصفوفات داخل وثيقة الوصفة نفسها (Denormalized
 * — تصميم طبيعي بـFirestore لبيانات تُقرأ دائمًا سوا وما تُستعلَم عنها بمعزل).
 *
 * ملاحظة صادقة: لا يوجد مشروع Firebase حي بهذه البيئة للاختبار المباشر ضده. أول تشغيل حقيقي
 * غالبًا يطلب منك Firestore رابط إنشاء Composite Index تلقائيًا (لاستعلامات مثل is_premium
 * التي تجمع أكثر من شرط) — هذا سلوك طبيعي متوقع، مو خطأ بالكود، اتّبع الرابط من الخطأ نفسه.
 */
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue, type Firestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import type {
  Repository, UserRecord, XpTransactionInput, ActiveDayRecord, StreakMilestoneRecord,
  NutritionProfileRecord, WeightHistoryInput, WeightHistoryRecord,
  MealLogInput, MealLogRecord, WaterLogInput, WaterLogRecord,
  MealStatusRecord, NutritionTipRecord, RecipeRecord, BehaviorDailyRecord, ChallengeProgressRecord,
  StreakFreezeUsageRecord, RecoveryDayRecord,
} from "./repository.js";

export function genId(): string {
  return randomUUID().replace(/-/g, "");
}

let app: App | null = null;

/** يبني (أو يرجّع من الكاش) تطبيق Firebase Admin — بيانات اعتماد Service Account من متغير بيئة JSON. */
export function getFirebaseApp(): App {
  if (getApps().length > 0) return getApps()[0]!;
  if (app) return app;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON غير مضبوط بالبيئة");
  const serviceAccount = JSON.parse(raw);
  app = initializeApp({ credential: cert(serviceAccount) });
  return app;
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value as string);
}

export class FirestoreRepository implements Repository {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestore(getFirebaseApp());
  }

  // ---- Users ----
  async findUser(userId: string): Promise<UserRecord | null> {
    const doc = await this.db.collection("users").doc(userId).get();
    if (!doc.exists) return null;
    const d = doc.data()!;

    const activeSubs = await this.db.collection("subscriptions")
      .where("user_id", "==", userId)
      .where("status", "==", "active")
      .get();
    const now = Date.now();
    const isPremium = activeSubs.docs.some((s) => toDate(s.data().end_date).getTime() > now);

    return {
      id: userId, xp: d.xp ?? 0, streak_days: d.streak_days ?? 0, longest_streak: d.longest_streak ?? 0,
      streak_started_at: d.streak_started_at ?? null, last_active_date: d.last_active_date ?? null,
      free_meals_used: d.free_meals_used ?? 0, is_premium: isPremium,
      current_recipe_id: d.current_recipe_id ?? null, current_recipe_step: d.current_recipe_step ?? 0,
      pending_recipe_confirmation_id: d.pending_recipe_confirmation_id ?? null,
      pending_food_topic_json: d.pending_food_topic_json ?? null,
      pending_meal_json: d.pending_meal_json ?? null, last_direct_log_json: d.last_direct_log_json ?? null,
      ai_response_style: d.ai_response_style ?? "balanced",
      streak_freeze_balance: d.streak_freeze_balance ?? 0,
    };
  }

  async saveUser(user: UserRecord): Promise<void> {
    await this.db.collection("users").doc(user.id).set({
      xp: user.xp, streak_days: user.streak_days, longest_streak: user.longest_streak,
      streak_started_at: user.streak_started_at, last_active_date: user.last_active_date,
      free_meals_used: user.free_meals_used, current_recipe_id: user.current_recipe_id,
      current_recipe_step: user.current_recipe_step,
      pending_recipe_confirmation_id: user.pending_recipe_confirmation_id,
      pending_food_topic_json: user.pending_food_topic_json, pending_meal_json: user.pending_meal_json,
      last_direct_log_json: user.last_direct_log_json, ai_response_style: user.ai_response_style,
      streak_freeze_balance: user.streak_freeze_balance,
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  // ---- XP Ledger ----
  private xpSourceDocId(userId: string, source: string): string {
    return `${userId}_src_${source}`;
  }

  async findXpTransactionBySource(userId: string, source: string): Promise<boolean> {
    const doc = await this.db.collection("xp_transactions").doc(this.xpSourceDocId(userId, source)).get();
    return doc.exists;
  }

  async insertXpTransaction(tx: XpTransactionInput): Promise<void> {
    const data = {
      user_id: tx.user_id, amount: tx.amount, reason: tx.reason, source: tx.source,
      metadata_json: tx.metadata_json, created_at: FieldValue.serverTimestamp(),
    };
    if (tx.source) {
      // معرّف حتمي = نفس ضمان Idempotency تبع Postgres (source فريد لكل مستخدم) — set بدون
      // merge على معرّف موجود مسبقًا يستبدل المحتوى، لكن findXpTransactionBySource يُفحص أولًا
      // بـxpEngine.ts قبل الوصول هنا أصلًا، فهذا الاستبدال لا يحصل عمليًا بالمسار الطبيعي.
      await this.db.collection("xp_transactions").doc(this.xpSourceDocId(tx.user_id, tx.source)).set(data);
    } else {
      await this.db.collection("xp_transactions").doc(genId()).set(data);
    }
  }

  // ---- Active Days / Streaks ----
  private activeDayDocId(userId: string, date: string): string {
    return `${userId}_${date}`;
  }

  async findActiveDay(userId: string, date: string): Promise<ActiveDayRecord | null> {
    const id = this.activeDayDocId(userId, date);
    const doc = await this.db.collection("active_days").doc(id).get();
    return doc.exists ? { id, user_id: userId, date } : null;
  }

  async insertActiveDay(userId: string, date: string): Promise<ActiveDayRecord> {
    const id = this.activeDayDocId(userId, date);
    // create() يفشل لو الوثيقة موجودة مسبقًا — نفس ضمان uq_active_day الذري تمامًا (بعكس
    // set() اللي كانت راح تصمت وتستبدل بصمت لو صار Race Condition نادر).
    await this.db.collection("active_days").doc(id).create({ user_id: userId, date });
    return { id, user_id: userId, date };
  }

  async deleteActiveDay(id: string): Promise<void> {
    await this.db.collection("active_days").doc(id).delete();
  }

  async findActiveDayById(id: string): Promise<ActiveDayRecord | null> {
    const doc = await this.db.collection("active_days").doc(id).get();
    if (!doc.exists) return null;
    const d = doc.data()!;
    return { id, user_id: d.user_id, date: d.date };
  }

  async findActiveDaysInRange(userId: string, startIso: string, endIso: string): Promise<string[]> {
    const snap = await this.db.collection("active_days")
      .where("user_id", "==", userId)
      .where("date", ">=", startIso)
      .where("date", "<=", endIso)
      .get();
    return snap.docs.map((d) => d.data().date as string);
  }

  async listActiveStreakMilestonesUpTo(days: number): Promise<StreakMilestoneRecord[]> {
    const snap = await this.db.collection("streak_milestones")
      .where("active", "==", true)
      .where("days", "<=", days)
      .get();
    return snap.docs.map((d) => d.data() as StreakMilestoneRecord);
  }

  // ---- Behavior Aggregator ----
  private behaviorDailyDocId(userId: string, date: string): string {
    return `${userId}_${date}`;
  }

  async findBehaviorDaily(userId: string, date: string): Promise<BehaviorDailyRecord | null> {
    const doc = await this.db.collection("behavior_daily").doc(this.behaviorDailyDocId(userId, date)).get();
    return doc.exists ? (doc.data() as BehaviorDailyRecord) : null;
  }

  async upsertBehaviorDaily(row: BehaviorDailyRecord): Promise<void> {
    // set() بدون merge عمدًا — كل استدعاء يعيد حساب اليوم بالكامل من meal_logs/water_logs
    // الحقيقية (راجع behaviorAggregator.ts)، فالكتابة الكاملة أضمن من دمج جزئي قد ينحرف.
    await this.db.collection("behavior_daily").doc(this.behaviorDailyDocId(row.user_id, row.date)).set(row);
  }

  async findBehaviorDailyInRange(userId: string, startIso: string, endIso: string): Promise<BehaviorDailyRecord[]> {
    const snap = await this.db.collection("behavior_daily")
      .where("user_id", "==", userId)
      .where("date", ">=", startIso)
      .where("date", "<=", endIso)
      .orderBy("date", "asc")
      .get();
    return snap.docs.map((d) => d.data() as BehaviorDailyRecord);
  }

  // ---- Challenges ----
  private challengeProgressDocId(userId: string, challengeId: string): string {
    return `${userId}_${challengeId}`;
  }

  async findChallengeProgress(userId: string, challengeId: string): Promise<ChallengeProgressRecord | null> {
    const doc = await this.db.collection("challenge_progress").doc(this.challengeProgressDocId(userId, challengeId)).get();
    return doc.exists ? (doc.data() as ChallengeProgressRecord) : null;
  }

  async insertChallengeProgress(row: ChallengeProgressRecord): Promise<void> {
    // create() يفشل لو موجودة مسبقًا — نفس ضمان "محاولة واحدة فقط" تبع active_days بالضبط.
    await this.db.collection("challenge_progress").doc(this.challengeProgressDocId(row.user_id, row.challenge_id)).create(row);
  }

  async updateChallengeProgress(userId: string, challengeId: string, patch: Partial<ChallengeProgressRecord>): Promise<void> {
    await this.db.collection("challenge_progress").doc(this.challengeProgressDocId(userId, challengeId)).set(patch, { merge: true });
  }

  // ---- Streak Freeze ----
  async insertStreakFreezeUsage(row: StreakFreezeUsageRecord): Promise<void> {
    await this.db.collection("streak_freeze_usage").doc(genId()).set(row);
  }

  // ---- Recovery Day ----
  private recoveryDayDocId(userId: string, date: string): string {
    return `${userId}_${date}`;
  }

  async findRecoveryDay(userId: string, date: string): Promise<RecoveryDayRecord | null> {
    const doc = await this.db.collection("recovery_days").doc(this.recoveryDayDocId(userId, date)).get();
    return doc.exists ? (doc.data() as RecoveryDayRecord) : null;
  }

  async setRecoveryDay(row: RecoveryDayRecord): Promise<void> {
    await this.db.collection("recovery_days").doc(this.recoveryDayDocId(row.user_id, row.date)).set(row);
  }

  async clearRecoveryDay(userId: string, date: string): Promise<void> {
    await this.db.collection("recovery_days").doc(this.recoveryDayDocId(userId, date)).delete();
  }

  // ---- Nutrition Profile / Weight ----
  async findNutritionProfile(userId: string): Promise<NutritionProfileRecord | null> {
    const doc = await this.db.collection("nutrition_profiles").doc(userId).get();
    if (!doc.exists) return null;
    return { user_id: userId, ...(doc.data() as Omit<NutritionProfileRecord, "user_id">) };
  }

  async updateNutritionProfile(userId: string, patch: Partial<NutritionProfileRecord>): Promise<void> {
    const { user_id: _omit, ...rest } = patch;
    await this.db.collection("nutrition_profiles").doc(userId).set(
      { ...rest, updated_at: FieldValue.serverTimestamp() }, { merge: true },
    );
  }

  async insertWeightHistory(row: WeightHistoryInput): Promise<WeightHistoryRecord> {
    const id = genId();
    const recordedAt = row.recorded_at ?? new Date();
    await this.db.collection("weight_history").doc(id).set({ ...row, recorded_at: recordedAt });
    return { id, ...row, recorded_at: recordedAt };
  }

  async findWeightHistory(userId: string, sinceDate?: Date): Promise<WeightHistoryRecord[]> {
    let q = this.db.collection("weight_history").where("user_id", "==", userId) as FirebaseFirestore.Query;
    if (sinceDate) q = q.where("recorded_at", ">=", sinceDate);
    const snap = await q.orderBy("recorded_at", "asc").get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WeightHistoryRecord, "id" | "recorded_at">), recorded_at: toDate(d.data().recorded_at) }));
  }

  async findWeightHistoryById(id: string): Promise<WeightHistoryRecord | null> {
    const doc = await this.db.collection("weight_history").doc(id).get();
    if (!doc.exists) return null;
    const d = doc.data()!;
    return { id, ...(d as Omit<WeightHistoryRecord, "id" | "recorded_at">), recorded_at: toDate(d.recorded_at) };
  }

  async deleteWeightHistory(id: string): Promise<void> {
    await this.db.collection("weight_history").doc(id).delete();
  }

  // ---- Meal Logs / Water Logs ----
  async countMealLogsForUser(userId: string): Promise<number> {
    const snap = await this.db.collection("meal_logs").where("user_id", "==", userId).count().get();
    return snap.data().count;
  }

  async countWaterLogsForUser(userId: string): Promise<number> {
    const snap = await this.db.collection("water_logs").where("user_id", "==", userId).count().get();
    return snap.data().count;
  }

  async listLevels(): Promise<{ level: number; required_xp: number; title: string; reward: string | null }[]> {
    const snap = await this.db.collection("levels").orderBy("level").get();
    return snap.docs.map((d) => d.data() as { level: number; required_xp: number; title: string; reward: string | null });
  }

  async insertMealLog(row: MealLogInput): Promise<MealLogRecord> {
    const id = genId();
    const createdAt = new Date();
    await this.db.collection("meal_logs").doc(id).set({ ...row, created_at: createdAt });
    return { id, ...row, created_at: createdAt };
  }

  async findMealLog(id: string): Promise<MealLogRecord | null> {
    const doc = await this.db.collection("meal_logs").doc(id).get();
    if (!doc.exists) return null;
    const d = doc.data()!;
    return { id, ...(d as Omit<MealLogRecord, "id" | "created_at">), created_at: toDate(d.created_at) };
  }

  async deleteMealLog(id: string): Promise<void> {
    await this.db.collection("meal_logs").doc(id).delete();
  }

  async findMealLogsInRange(userId: string, startUtc: Date, endUtc: Date): Promise<MealLogRecord[]> {
    const snap = await this.db.collection("meal_logs")
      .where("user_id", "==", userId)
      .where("created_at", ">=", startUtc)
      .where("created_at", "<", endUtc)
      .orderBy("created_at", "asc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MealLogRecord, "id" | "created_at">), created_at: toDate(d.data().created_at) }));
  }

  async insertWaterLog(row: WaterLogInput): Promise<WaterLogRecord> {
    const id = genId();
    const createdAt = new Date();
    await this.db.collection("water_logs").doc(id).set({ ...row, created_at: createdAt });
    return { id, ...row, created_at: createdAt };
  }

  async findWaterLog(id: string): Promise<WaterLogRecord | null> {
    const doc = await this.db.collection("water_logs").doc(id).get();
    if (!doc.exists) return null;
    const d = doc.data()!;
    return { id, ...(d as Omit<WaterLogRecord, "id" | "created_at">), created_at: toDate(d.created_at) };
  }

  async deleteWaterLog(id: string): Promise<void> {
    await this.db.collection("water_logs").doc(id).delete();
  }

  async findWaterLogsInRange(userId: string, startUtc: Date, endUtc: Date): Promise<WaterLogRecord[]> {
    const snap = await this.db.collection("water_logs")
      .where("user_id", "==", userId)
      .where("created_at", ">=", startUtc)
      .where("created_at", "<", endUtc)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WaterLogRecord, "id" | "created_at">), created_at: toDate(d.data().created_at) }));
  }

  // ---- Meal Status ----
  private mealStatusDocId(userId: string, dateIso: string, mealType: string): string {
    return `${userId}_${dateIso}_${mealType}`;
  }

  async findMealStatus(userId: string, dateIso: string, mealType: string): Promise<MealStatusRecord | null> {
    const doc = await this.db.collection("meal_status").doc(this.mealStatusDocId(userId, dateIso, mealType)).get();
    if (!doc.exists) return null;
    return doc.data() as MealStatusRecord;
  }

  async upsertMealStatus(userId: string, dateIso: string, mealType: string, status: string): Promise<void> {
    await this.db.collection("meal_status").doc(this.mealStatusDocId(userId, dateIso, mealType)).set({
      user_id: userId, date: dateIso, meal_type: mealType, status, updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  // ---- Tips ----
  async findNutritionTipsByCategory(category: string): Promise<NutritionTipRecord[]> {
    const snap = await this.db.collection("nutrition_tips")
      .where("category", "==", category).where("active", "==", true).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NutritionTipRecord, "id">) }));
  }

  async findRecentShownTipIds(userId: string, limit: number): Promise<string[]> {
    const snap = await this.db.collection("shown_tips")
      .where("user_id", "==", userId).orderBy("shown_at", "desc").limit(limit).get();
    return snap.docs.map((d) => d.data().tip_id as string);
  }

  async insertShownTip(userId: string, tipId: string): Promise<void> {
    await this.db.collection("shown_tips").doc(genId()).set({
      user_id: userId, tip_id: tipId, shown_at: FieldValue.serverTimestamp(),
    });
  }

  // ---- Recipes (ingredients/steps/substitutions مُدمجة بالوثيقة نفسها) ----
  async findActiveRecipes(categoryId?: string | null): Promise<RecipeRecord[]> {
    let q = this.db.collection("recipes").where("active", "==", true) as FirebaseFirestore.Query;
    if (categoryId) q = q.where("category_id", "==", categoryId);
    const snap = await q.orderBy("name").get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RecipeRecord, "id">) }));
  }

  async findRecipeById(id: string): Promise<RecipeRecord | null> {
    const doc = await this.db.collection("recipes").doc(id).get();
    if (!doc.exists) return null;
    return { id, ...(doc.data() as Omit<RecipeRecord, "id">) };
  }

  async findRecipeBySlug(slug: string): Promise<RecipeRecord | null> {
    const snap = await this.db.collection("recipes").where("slug", "==", slug).where("active", "==", true).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0]!;
    return { id: doc.id, ...(doc.data() as Omit<RecipeRecord, "id">) };
  }

  async findRecipeCategoryByName(name: string): Promise<{ id: string; name: string } | null> {
    const snap = await this.db.collection("recipe_categories").where("name", "==", name).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0]!;
    return { id: doc.id, name: doc.data().name };
  }

  async listRecipeCategories(): Promise<{ id: string; name: string; icon: string; order_index: number }[]> {
    const snap = await this.db.collection("recipe_categories").orderBy("order_index").get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as { name: string; icon: string; order_index: number }) }));
  }

  /**
   * تحديث ذري عبر Firestore Transaction — نفس ضمان `UPDATE ... WHERE free_meals_used < cap`
   * بايثون بالضبط: يقرأ القيمة الحالية ويكتب الزيادة بمعاملة واحدة، فلا يفوّت نافذة تزامن.
   */
  async incrementFreeMealsUsedIfBelowCap(userId: string, cap: number): Promise<boolean> {
    const ref = this.db.collection("users").doc(userId);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const current = (doc.data()?.free_meals_used as number) ?? 0;
      if (current >= cap) return false;
      tx.update(ref, { free_meals_used: current + 1 });
      return true;
    });
  }
}

// ---- حقول عرض فقط (name/username/bio/photo_url) — خارج UserRecord/Repository عمدًا، لأنها
// لا تخص منطق الأعمال بـorchestrator.ts أبدًا، فقط صفحات الواجهة (البروفايل، القائمة الجانبية).

export interface UserDisplayFields {
  name: string;
  email: string;
  username: string | null;
  bio: string | null;
  photo_url: string | null;
  profile_visibility: string;
  role: string;
  /** جولة "هلا بيك" التعريفية (Onboarding التسويقي) — منفصلة تمامًا عن onboarding_completed
   * بـme.mts (ذاك يعني "أكمل بروفايله الغذائي"، هذا يعني "شاف جولة تعريف الميزات"). */
  intro_completed: boolean;
  /** تفضيل لغة الواجهة — "ar" افتراضي. الردود الفعلية بالشات (Gemini/القوالب) لسا عربي فقط
   * بغض النظر عن هذا الحقل، هذا يخص واجهة React فقط بالمرحلة الحالية. */
  language: "ar" | "en";
}

export async function getUserDisplayFields(db: Firestore, userId: string): Promise<UserDisplayFields | null> {
  const doc = await db.collection("users").doc(userId).get();
  if (!doc.exists) return null;
  const d = doc.data()!;
  return {
    name: d.name ?? "", email: d.email ?? "", username: d.username ?? null,
    bio: d.bio ?? null, photo_url: d.photo_url ?? null,
    profile_visibility: d.profile_visibility ?? "public", role: d.role ?? "user",
    intro_completed: d.intro_completed ?? false,
    language: d.language === "en" ? "en" : "ar",
  };
}

// ---- Leaderboard (المرحلة 3 من ذكاء Captain CJ) — خارج Repository عمدًا لنفس سبب
// UserDisplayFields أعلاه: قراءة عرض فقط عبر عدة مستخدمين، مو منطق أعمال لمستخدم واحد.

export interface LeaderboardEntry {
  rank: number;
  name: string;
  username: string | null;
  photo_url: string | null;
  streak_days: number;
}

const LEADERBOARD_MIN_STREAK = 10;
const LEADERBOARD_LIMIT = 10;

/**
 * Top 10 حسب Streak فقط (≥10 يوم) — صفر بيانات حساسة (بريد/سعرات/وزن/أهداف)، يستثني البروفايلات
 * الخاصة. نجيب دفعة أكبر (30) ونفلتر profile_visibility بالكود بدل فهرس مركّب إضافي — Top 10
 * حقيقي بعد الفلترة، مو أول 10 قبلها.
 */
export async function getStreakLeaderboard(db: Firestore): Promise<LeaderboardEntry[]> {
  const snap = await db.collection("users")
    .where("streak_days", ">=", LEADERBOARD_MIN_STREAK)
    .orderBy("streak_days", "desc")
    .limit(30)
    .get();

  const out: LeaderboardEntry[] = [];
  for (const doc of snap.docs) {
    if (out.length >= LEADERBOARD_LIMIT) break;
    const d = doc.data();
    if ((d.profile_visibility ?? "public") !== "public") continue;
    out.push({
      rank: out.length + 1, name: d.name ?? "مستخدم", username: d.username ?? null,
      photo_url: d.photo_url ?? null, streak_days: d.streak_days ?? 0,
    });
  }
  return out;
}

/** ترتيب المستخدم الحقيقي حتى لو خارج Top 10 (لعرض "ترتيبك الحالي: #37") — null لو تحت حد 10 أيام. */
export async function getUserStreakRank(db: Firestore, userId: string): Promise<number | null> {
  const userDoc = await db.collection("users").doc(userId).get();
  const streakDays = (userDoc.data()?.streak_days as number | undefined) ?? 0;
  if (streakDays < LEADERBOARD_MIN_STREAK) return null;
  const higher = await db.collection("users").where("streak_days", ">", streakDays).count().get();
  return higher.data().count + 1; // تقريبي عند تعادل Streak (Tie) — كافٍ لعرض إعلامي بس
}

export async function findUserIdByUsername(db: Firestore, username: string): Promise<string | null> {
  const snap = await db.collection("users").where("username", "==", username).limit(1).get();
  return snap.empty ? null : snap.docs[0]!.id;
}

export async function updateUserDisplayFields(
  db: Firestore, userId: string, patch: Partial<Pick<UserDisplayFields, "name" | "username" | "bio">>,
): Promise<void> {
  await db.collection("users").doc(userId).set(patch, { merge: true });
}
