/**
 * /api/admin/users — لوحة إدارة المستخدمين الشاملة (طلب جديد، لا مقابل بايثون قديم). نفس نمط
 * باقي admin-*.mts (isAdminClaims + admin_logs)، لكنها أول Function تجمع بيانات من أكثر من
 * مصدر (users + subscriptions + nutrition_profiles + meal_logs + feedback) لعرض واحد شامل.
 *
 * GET  (بدون action أو action=list): قائمة المستخدمين + بطاقات إحصائية علوية، مع بحث/فلترة
 *   اختياريين (?q=<نص>&sub=free|paid|tournament) — الفلترة نفسها JS بعد جلب المجموعات كاملة
 *   (نفس أسلوب admin-feedback.mts، لا فهرسة نصية بـFirestore أصلاً)، لكن بطاقات الإحصاء دائمًا
 *   تُحسب على القائمة الكاملة غير المُصفّاة (رقم صحيح للتطبيق كله، مو للنتيجة المصفّاة).
 * GET  action=detail&id=<userId>: تفصيل مستخدم واحد (بيانات شخصية+أهداف، سجل أكل 7 أيام،
 *   التزام/streak، سجل ملاحظات).
 * POST action=update-targets&id=: body {calorie_target, goal?} — يعدّل NutritionProfile ويرجّع
 *   الماكروز المُعاد حسابها فورًا (macros.ts تحسبها حيًا دائمًا، صفر حقل مخزَّن منفصل — تعديل
 *   السعرات/الهدف هو التعديل الحقيقي، الماكروز نتيجة تلقائية له، نفس مبدأ باقي التطبيق).
 * POST action=grant-subscription&id=: body {lifetime:true} أو {days:<عدد>} — يكتب سجل
 *   subscriptions فعّال جديد، نفس شكل admin-payments.mts's verify بالضبط.
 */
import type { Context } from "@netlify/functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { FirestoreRepository, getFirebaseApp, genId, getUserDisplayFields } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest, isAdminClaims } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import * as calculator from "../../shared/nutrition-engine/calculator.js";
import { todayBaghdadIso, addDaysIso } from "../../shared/nutrition-engine/iraqTime.js";
import { calculateTargets } from "../../shared/nutrition-engine/macros.js";
import { xpProgress } from "../../shared/nutrition-engine/levels.js";

function toDateSafe(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** تصنيف نوع الاشتراك للفلترة/العرض — "بطولة" له الأولوية بصريًا لأنه الحالة الأكثر تحديدًا
 *  حاليًا (مستقل عن الاشتراك المدفوع فعليًا — مستخدم مجاني أو مدفوع كلاهما يقدر يفعّلها). */
function categoryOf(isPremium: boolean, tournamentActive: boolean): "free" | "paid" | "tournament" {
  if (tournamentActive) return "tournament";
  if (isPremium) return "paid";
  return "free";
}

async function handleList(req: Request, db: FirebaseFirestore.Firestore): Promise<Response> {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const subFilter = url.searchParams.get("sub"); // "free" | "paid" | "tournament" | null

  const now = new Date();
  const todayIso = todayBaghdadIso(now);
  const [dayStart, dayEnd] = calculator.todayUtcRange(now);

  const [usersSnap, activeSubsSnap, profilesSnap, mealsTodayCountSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("subscriptions").where("status", "==", "active").get(),
    db.collection("nutrition_profiles").get(),
    db.collection("meal_logs").where("created_at", ">=", dayStart).where("created_at", "<", dayEnd).count().get(),
  ]);

  // أحدث end_date فعّال لكل مستخدم (قد يكون عنده أكثر من سجل subscriptions تاريخيًا)
  const latestActiveEndByUser = new Map<string, Date>();
  for (const doc of activeSubsSnap.docs) {
    const d = doc.data();
    const end = toDateSafe(d.end_date);
    if (!end) continue;
    const prev = latestActiveEndByUser.get(d.user_id);
    if (!prev || end.getTime() > prev.getTime()) latestActiveEndByUser.set(d.user_id, end);
  }

  const profileByUser = new Map<string, FirebaseFirestore.DocumentData>();
  for (const doc of profilesSnap.docs) profileByUser.set(doc.id, doc.data());

  let totalSubscribers = 0;
  let activeToday = 0;
  const allUsers = usersSnap.docs.map((doc) => {
    const d = doc.data();
    const subEnd = latestActiveEndByUser.get(doc.id) ?? null;
    const isPremium = !!subEnd && subEnd.getTime() > now.getTime();
    if (isPremium) totalSubscribers += 1;
    if (d.last_active_date === todayIso) activeToday += 1;

    const profile = profileByUser.get(doc.id);
    const tournamentActive = !!profile?.tournament_deficit_until && profile.tournament_deficit_until >= todayIso;

    return {
      id: doc.id, name: d.name ?? "", email: d.email ?? "", role: d.role ?? "user",
      disabled: d.disabled ?? false, email_verified: d.email_verified === true,
      created_at: toDateSafe(d.created_at),
      xp: d.xp ?? 0, streak_days: d.streak_days ?? 0, free_meals_used: d.free_meals_used ?? 0,
      is_premium: isPremium, subscription_end_date: subEnd,
      tournament_active: tournamentActive,
      calorie_target: profile?.calorie_target ?? null,
      category: categoryOf(isPremium, tournamentActive),
    };
  });

  const filtered = allUsers.filter((u) => {
    if (subFilter && subFilter !== "all" && u.category !== subFilter) return false;
    if (q && !(u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))) return false;
    return true;
  });
  filtered.sort((a, b) => (b.created_at?.getTime() ?? 0) - (a.created_at?.getTime() ?? 0));

  return jsonOk({
    users: filtered,
    stats: {
      total_users: allUsers.length,
      total_subscribers: totalSubscribers,
      active_today: activeToday,
      meals_logged_today: mealsTodayCountSnap.data().count,
    },
  });
}

async function handleDetail(id: string, db: FirebaseFirestore.Firestore): Promise<Response> {
  const repo = new FirestoreRepository(db);
  const [display, user, profile, levels] = await Promise.all([
    getUserDisplayFields(db, id),
    repo.findUser(id),
    repo.findNutritionProfile(id),
    repo.listLevels(),
  ]);
  if (!display || !user) return jsonError(404, "NOT_FOUND", "المستخدم غير موجود.");

  const now = new Date();
  const todayIso = todayBaghdadIso(now);
  const weekStartIso = addDaysIso(todayIso, -6);
  const [y, m, d] = weekStartIso.split("-").map(Number);
  const [weekStart] = calculator.dayUtcRange(y, m, d);
  const [, todayEnd] = calculator.todayUtcRange(now);
  const weekLogs = await repo.findMealLogsInRange(id, weekStart, todayEnd);

  // تجميع سجل الأكل بحسب يوم بغدادي — لكل يوم إجمالي سعرات + قائمة الوجبات، لعرض "اليوم + آخر 7 أيام"
  const byDay = new Map<string, { calories: number; protein: number; carbs: number; fat: number; meals: typeof weekLogs }>();
  for (const log of weekLogs) {
    const dayIso = todayBaghdadIso(log.created_at);
    if (!byDay.has(dayIso)) byDay.set(dayIso, { calories: 0, protein: 0, carbs: 0, fat: 0, meals: [] });
    const bucket = byDay.get(dayIso)!;
    bucket.calories += log.total_calories; bucket.protein += log.total_protein;
    bucket.carbs += log.total_carbs; bucket.fat += log.total_fat;
    bucket.meals.push(log);
  }
  const calorieTarget = profile?.calorie_target ?? 0;
  const dailyHistory = Array.from({ length: 7 }, (_, i) => {
    const dayIso = addDaysIso(todayIso, -6 + i);
    const bucket = byDay.get(dayIso);
    const calories = bucket?.calories ?? 0;
    return {
      date: dayIso, calories, protein: bucket?.protein ?? 0, carbs: bucket?.carbs ?? 0, fat: bucket?.fat ?? 0,
      meal_count: bucket?.meals.length ?? 0,
      adherence_pct: calorieTarget > 0 ? Math.round((calories / calorieTarget) * 100) : null,
    };
  });
  const todayBucket = byDay.get(todayIso);
  const todayMeals = (todayBucket?.meals ?? []).map((log) => ({
    id: log.id, meal_type: log.meal_type, calories: log.total_calories,
    foods: log.matched_foods_json ? JSON.parse(log.matched_foods_json) : [],
    created_at: log.created_at,
  }));

  const macros = profile ? calculateTargets(profile.calorie_target, profile.weight_kg, profile.goal) : null;
  const tournamentActive = !!profile?.tournament_deficit_until && profile.tournament_deficit_until >= todayIso;

  const subsSnap = await db.collection("subscriptions").where("user_id", "==", id).get();
  const subs = subsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data(), end_date: toDateSafe(doc.data().end_date), start_date: toDateSafe(doc.data().start_date) }))
    .sort((a: any, b: any) => (b.end_date?.getTime() ?? 0) - (a.end_date?.getTime() ?? 0));
  const activeSub = subs.find((s: any) => s.status === "active" && s.end_date && s.end_date.getTime() > now.getTime()) ?? null;

  const [feedbackSnap, rawUserDoc] = await Promise.all([
    db.collection("feedback").where("user_id", "==", id).get(),
    db.collection("users").doc(id).get(),
  ]);
  const feedback = feedbackSnap.docs.map((doc) => {
    const fd = doc.data();
    return { id: doc.id, type: fd.type, message: fd.message, status: fd.status, created_at: toDateSafe(fd.created_at) };
  }).sort((a, b) => (b.created_at?.getTime() ?? 0) - (a.created_at?.getTime() ?? 0));
  const rawUser = rawUserDoc.data();

  return jsonOk({
    profile_info: {
      id, name: display.name, email: display.email, username: display.username, photo_url: display.photo_url,
      role: display.role, disabled: rawUser?.disabled ?? false,
      email_verified: rawUser?.email_verified === true,
    },
    goals: profile ? {
      age: profile.age, weight_kg: profile.weight_kg, height_cm: profile.height_cm, sex: profile.sex,
      goal: profile.goal, activity_level: profile.activity_level, bmr: profile.bmr, tdee: profile.tdee,
      calorie_target: profile.calorie_target, water_target_ml: profile.water_target_ml,
      goal_weight: profile.goal_weight, macros,
      mode: tournamentActive ? "tournament" : "normal",
      tournament_deficit_until: profile.tournament_deficit_until ?? null,
    } : null,
    progress: {
      xp: user.xp, streak_days: user.streak_days, longest_streak: user.longest_streak,
      free_meals_used: user.free_meals_used, is_premium: user.is_premium,
      level: xpProgress(levels, user.xp),
      daily_history: dailyHistory,
    },
    today_meals: todayMeals,
    subscription: activeSub,
    subscription_history: subs,
    feedback,
  });
}

async function handleUpdateTargets(req: Request, id: string, db: FirebaseFirestore.Firestore): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const calorieTarget = typeof body.calorie_target === "number" ? body.calorie_target : NaN;
  if (!(calorieTarget > 0)) return jsonError(400, "VALIDATION_ERROR", "سعرات هدف غير صالحة.");
  const goal = typeof body.goal === "string" && ["lose", "maintain", "gain"].includes(body.goal) ? body.goal : undefined;

  const repo = new FirestoreRepository(db);
  const profile = await repo.findNutritionProfile(id);
  if (!profile) return jsonError(404, "NOT_FOUND", "المستخدم ماعنده بروفايل غذائي بعد.");

  const patch: { calorie_target: number; goal?: string } = { calorie_target: calorieTarget };
  if (goal) patch.goal = goal;
  await repo.updateNutritionProfile(id, patch);

  const macros = calculateTargets(calorieTarget, profile.weight_kg, goal ?? profile.goal);
  return jsonOk({ calorie_target: calorieTarget, goal: goal ?? profile.goal, macros });
}

async function handleGrantSubscription(req: Request, id: string, db: FirebaseFirestore.Firestore, adminId: string): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const lifetime = body.lifetime === true;
  const days = typeof body.days === "number" && body.days > 0 ? body.days : null;
  if (!lifetime && !days) return jsonError(400, "VALIDATION_ERROR", "حدد lifetime أو days.");

  const now = new Date();
  const endDate = lifetime ? new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000) : new Date(now.getTime() + days! * 24 * 60 * 60 * 1000);

  const subId = genId();
  await db.collection("subscriptions").doc(subId).set({
    user_id: id, plan_code: lifetime ? "admin_lifetime" : "admin_grant", status: "active",
    start_date: now, end_date: endDate, created_at: now, last_payment_id: null, granted_by: adminId,
  });
  await db.collection("admin_logs").doc(genId()).set({
    admin_id: adminId, action: "subscription_granted", target_id: id,
    details: lifetime ? "lifetime" : `${days} يوم`, timestamp: now,
  });
  return jsonOk({ ok: true, end_date: endDate });
}

export default async (req: Request, _context: Context): Promise<Response> => {
  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");
  if (!isAdminClaims(claims)) return jsonError(403, "FORBIDDEN", "هذي الصفحة للإدارة فقط.");

  const db = getFirestore(getFirebaseApp());
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const id = url.searchParams.get("id") ?? "";

  try {
    if (req.method === "GET") {
      if (action === "detail") {
        if (!id) return jsonError(400, "VALIDATION_ERROR", "id مطلوب.");
        return await handleDetail(id, db);
      }
      return await handleList(req, db);
    }

    if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET أو POST.");
    if (!id) return jsonError(400, "VALIDATION_ERROR", "id مطلوب.");

    if (action === "update-targets") return await handleUpdateTargets(req, id, db);
    if (action === "grant-subscription") return await handleGrantSubscription(req, id, db, claims.sub);

    return jsonError(400, "VALIDATION_ERROR", "action غير معروف.");
  } catch (err) {
    console.error("admin-users error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
