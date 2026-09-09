/**
 * Best/Worst Day — تجميع behavior_daily الحقيقي حسب يوم الأسبوع (نافذة 30 يوم، من نفس
 * behaviorAggregator) لمعرفة أي يوم عادة يكون فيه التزام أعلى/أقل. لغة العرض (بالفرونت إند/الرد)
 * لازم تبقى غير حكمية دائمًا — هذا الملف يرجّع أرقام وتسميات أيام فقط، صفر نص جاهز هنا عمدًا حتى
 * تبقى صياغة الرسالة مسؤولية طبقة العرض (نفس فصل المسؤوليات المستخدم بكل الملفات المشابهة).
 *
 * يرفض إعطاء نتيجة (available=false) لو البيانات قليلة جدًا أو الفرق بين الأيام ضئيل — أفضل من
 * استنتاج مضلِّل من عينة صغيرة.
 */
import type { Repository, BehaviorDailyRecord } from "./db/repository.js";
import * as behaviorAggregator from "./behaviorAggregator.js";

const WINDOW_DAYS = 30;
const MIN_TOTAL_DAYS = 14;
const MIN_SAMPLES_PER_WEEKDAY = 2;

const WEEKDAY_LABELS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export interface WeekdayStat {
  weekday: number; // 0=الأحد … 6=السبت
  label: string;
  avg_score: number; // 0-4
  sample_size: number;
}

export interface BestWorstDayResult {
  available: boolean;
  reason: string | null;
  best: WeekdayStat | null;
  worst: WeekdayStat | null;
}

/** درجة يوم بسيطة 0-4: تسجيل وجبة (1) + وجبتين فأكثر (1) + هدف بروتين (1) + هدف ماي (1). */
function dayScore(r: BehaviorDailyRecord): number {
  let s = 0;
  if (r.meals_logged >= 1) s += 1;
  if (r.meals_logged >= 2) s += 1;
  if (r.protein_hit_target) s += 1;
  if (r.water_hit_target) s += 1;
  return s;
}

export async function analyzeBestWorstDay(repo: Repository, userId: string, now: Date = new Date()): Promise<BestWorstDayResult> {
  const records = await behaviorAggregator.recentBehavior(repo, userId, WINDOW_DAYS, now);

  if (records.length < MIN_TOTAL_DAYS) {
    return {
      available: false,
      reason: `نحتاج بيانات ${MIN_TOTAL_DAYS} يوم على الأقل حتى نقارن الأيام بثقة (عدنا ${records.length} يوم بس حاليًا).`,
      best: null, worst: null,
    };
  }

  const byWeekday = new Map<number, number[]>();
  for (const r of records) {
    const weekday = new Date(`${r.date}T00:00:00Z`).getUTCDay();
    const arr = byWeekday.get(weekday) ?? [];
    arr.push(dayScore(r));
    byWeekday.set(weekday, arr);
  }

  const stats: WeekdayStat[] = [...byWeekday.entries()]
    .filter(([, scores]) => scores.length >= MIN_SAMPLES_PER_WEEKDAY)
    .map(([weekday, scores]) => ({
      weekday, label: WEEKDAY_LABELS_AR[weekday],
      avg_score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
      sample_size: scores.length,
    }));

  if (stats.length < 2) {
    return { available: false, reason: "نحتاج توزيع أوسع عبر أيام الأسبوع المختلفة حتى نقدر نقارن.", best: null, worst: null };
  }

  const sorted = [...stats].sort((a, b) => b.avg_score - a.avg_score);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  if (best.avg_score === worst.avg_score) {
    return { available: false, reason: "التزامك متقارب جدًا بكل أيام الأسبوع — ماكو فرق واضح نذكره.", best: null, worst: null };
  }

  return { available: true, reason: null, best, worst };
}
