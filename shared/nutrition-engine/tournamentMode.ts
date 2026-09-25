/**
 * "عندي بطولة" (Tournament Deficit Mode) — عجز سريع مؤقت للتحضير قبل بطولة رياضية. يخصم 1000
 * سعرة من الهدف الحقيقي المحسوب أصلًا، بحد أدنى آمن غير قابل للتجاوز (safety.MIN_SAFE_CALORIES
 * — نفس الثابت المستخدَم لحساب الهدف الأصلي، صفر رقم أمان جديد مخترَع). يرجع تلقائيًا للهدف
 * الأصلي بعد انتهاء عدد الأيام المحدَّد — checkAndRevertIfExpired هي النقطة الوحيدة اللي تفحص
 * هذا، مستدعاة من context.build() (راجع توثيقها هناك) فتشتغل تلقائيًا بأي قراءة سياق يومي،
 * صفر Cron/جدولة منفصلة مطلوبة.
 */
import * as safety from "./safety.js";
import { todayBaghdadIso } from "./iraqTime.js";
import type { Repository, NutritionProfileRecord } from "./db/repository.js";

export const DEFICIT_KCAL = 1000;
export const MIN_DAYS = 1;
export const MAX_DAYS = 14;

export interface ActivateResult {
  ok: boolean;
  error?: "INVALID_DAYS" | "ALREADY_ACTIVE";
  new_target?: number;
  until?: string;
}

/** يفعّل وضع البطولة لعدد أيام محدَّد — الخصم حسابي بالكود فقط، بحد أدنى آمن صريح. */
export async function activate(
  repo: Repository, profile: NutritionProfileRecord, days: number, now: Date = new Date(),
): Promise<ActivateResult> {
  if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS) return { ok: false, error: "INVALID_DAYS" };
  if (profile.tournament_deficit_until) return { ok: false, error: "ALREADY_ACTIVE" };

  const floor = safety.MIN_SAFE_CALORIES[profile.sex] ?? safety.MIN_SAFE_CALORIES.female;
  const originalTarget = profile.calorie_target; // يُلتقَط قبل أي تعديل — منبع بگ حقيقي مُكتشَف
  // هنا: استخدام profile.calorie_target كـfallback بعد تعديله مباشرة كان يعيد كتابة الهدف
  // الأصلي بالهدف المخفَّض نفسه (قيمة تعدّلت أصلاً بنفس السطور قبل استخدامها كـfallback).
  const newTarget = Math.max(originalTarget - DEFICIT_KCAL, floor);

  const until = addDaysToIso(todayBaghdadIso(now), days);
  await repo.updateNutritionProfile(profile.user_id, {
    calorie_target: newTarget,
    tournament_original_target: originalTarget,
    tournament_deficit_until: until,
  });
  profile.calorie_target = newTarget;
  profile.tournament_original_target = originalTarget;
  profile.tournament_deficit_until = until;

  return { ok: true, new_target: newTarget, until };
}

/** يلغي وضع البطولة يدويًا قبل انتهاء المدة، يرجّع الهدف الأصلي فورًا. */
export async function deactivate(repo: Repository, profile: NutritionProfileRecord): Promise<void> {
  const original = profile.tournament_original_target ?? profile.calorie_target;
  await repo.updateNutritionProfile(profile.user_id, {
    calorie_target: original, tournament_original_target: null, tournament_deficit_until: null,
  });
  profile.calorie_target = original;
  profile.tournament_original_target = null;
  profile.tournament_deficit_until = null;
}

/**
 * يُستدعى من context.build() بكل قراءة سياق يومي — لو نافذة البطولة انتهت (اليوم بعد
 * tournament_deficit_until)، يرجّع الهدف الأصلي تلقائيًا ويمسح الحقلين، صفر تدخل يدوي مطلوب.
 * يرجّع نفس profile (مُعدَّل مباشرة لو صار استرجاع) حتى المستدعي يشوف الرقم الصحيح فورًا.
 */
export async function checkAndRevertIfExpired(
  repo: Repository, profile: NutritionProfileRecord, now: Date = new Date(),
): Promise<NutritionProfileRecord> {
  if (!profile.tournament_deficit_until) return profile;
  const today = todayBaghdadIso(now);
  if (today <= profile.tournament_deficit_until) return profile;
  await deactivate(repo, profile);
  return profile;
}

function addDaysToIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
