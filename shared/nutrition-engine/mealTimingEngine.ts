/**
 * Meal Timing Engine — يوسّع `mealBudget.ts`/`iraqTime.getCurrentPeriod` بنافذة استيقاظ حقيقية
 * للمستخدم (المرحلة 4 من ذكاء Captain CJ) بدل فترات بغداد الثابتة الأربع، **بدون تعديل
 * mealBudget.ts نفسه** — لو المستخدم ما ضبط جدول نوم، السلوك القديم يبقى تمامًا كما هو
 * (Fallback حرفي عبر `iraqTime.getCurrentPeriod`).
 *
 * الفكرة: نحسب أين "الآن" يقع داخل نافذة استيقاظ المستخدم كنسبة (0 = توّه صاحي، 1 = قرب ينام)،
 * ثم نطابقها لنفس أسماء الفترات الأربع اللي mealBudget.ts/notifications يفهمونها أصلاً
 * (morning/noon/evening/late_night) — صفر تغيير على جداول الأوزان أو منطق التوزيع نفسه.
 */
import { getCurrentPeriod, nowBaghdad } from "./iraqTime.js";

export interface SleepSchedule {
  wake_time: string; // "HH:MM" بتوقيت بغداد
  sleep_time: string;
}

function parseHm(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** طول نافذة الاستيقاظ بالدقائق، يتعامل صح مع اللف حول منتصف الليل (نوم بعد الساعة 00:00). */
function wakeWindowMinutes(schedule: SleepSchedule): number {
  const wake = parseHm(schedule.wake_time);
  const sleep = parseHm(schedule.sleep_time);
  return sleep > wake ? sleep - wake : (24 * 60 - wake) + sleep;
}

/** دقائق منذ الاستيقاظ (قد تلف لليوم السابق) — null لو الوقت الحالي فعليًا خارج نافذة الاستيقاظ (نايم). */
function minutesSinceWake(nowMinuteOfDay: number, schedule: SleepSchedule): number | null {
  const wake = parseHm(schedule.wake_time);
  let elapsed = nowMinuteOfDay - wake;
  if (elapsed < 0) elapsed += 24 * 60;
  const windowLen = wakeWindowMinutes(schedule);
  return elapsed < windowLen ? elapsed : null;
}

/** نفس دور iraqTime.getCurrentPeriod لكن نسبيًا لجدول نوم المستخدم — Fallback للفترات الثابتة لو ماكو جدول مضبوط. */
export function currentPeriodForUser(now: Date, schedule: SleepSchedule | null): string {
  if (!schedule) return getCurrentPeriod(now);

  const { hour, minute } = nowBaghdad(now);
  const elapsed = minutesSinceWake(hour * 60 + minute, schedule);
  if (elapsed === null) return "late_night"; // خارج نافذة الاستيقاظ فعليًا = وقت نوم

  const fraction = elapsed / wakeWindowMinutes(schedule);
  if (fraction < 0.2) return "morning";
  if (fraction < 0.55) return "noon";
  if (fraction < 0.9) return "evening";
  return "late_night";
}

export interface MealWindow {
  key: "breakfast" | "lunch" | "dinner";
  startMinuteOfDay: number; // 0-1439 بتوقيت بغداد
  endMinuteOfDay: number;
}

// نفس مواقع الوجبات الثلاث النسبية داخل نافذة الاستيقاظ بكل مستخدم — تُقاس كنسبة من طول النافذة
// نفسها، فتنسحب صح على أي جدول نوم حقيقي (بما فيها أنماط الدوام الليلي).
const MEAL_FRACTIONS: { key: MealWindow["key"]; start: number; end: number }[] = [
  { key: "breakfast", start: 0.05, end: 0.25 },
  { key: "lunch", start: 0.40, end: 0.60 },
  { key: "dinner", start: 0.75, end: 0.95 },
];

/** نوافذ الوجبات الثلاث محسوبة فعليًا من جدول نوم المستخدم — تُستخدم بدل MEAL_WINDOWS الثابتة بـscheduled-reminders.mts. */
export function mealWindowsForSchedule(schedule: SleepSchedule): MealWindow[] {
  const wake = parseHm(schedule.wake_time);
  const windowLen = wakeWindowMinutes(schedule);
  return MEAL_FRACTIONS.map((f) => ({
    key: f.key,
    startMinuteOfDay: Math.round((wake + windowLen * f.start) % (24 * 60)),
    endMinuteOfDay: Math.round((wake + windowLen * f.end) % (24 * 60)),
  }));
}

export interface MinuteRange {
  startMinuteOfDay: number;
  endMinuteOfDay: number;
}

/** نافذة تذكير الماي الكاملة = نافذة الاستيقاظ الحقيقية بالكامل. */
export function waterWindowForSchedule(schedule: SleepSchedule): MinuteRange {
  return { startMinuteOfDay: parseHm(schedule.wake_time), endMinuteOfDay: parseHm(schedule.sleep_time) };
}

/** هل "الآن" (دقيقة من اليوم) داخل نافذة زمنية — يتعامل صح مع اللف حول منتصف الليل. */
export function isWithinMinuteRange(nowMinuteOfDay: number, range: MinuteRange): boolean {
  const { startMinuteOfDay: start, endMinuteOfDay: end } = range;
  if (start === end) return false;
  return start < end ? nowMinuteOfDay >= start && nowMinuteOfDay < end : nowMinuteOfDay >= start || nowMinuteOfDay < end;
}
