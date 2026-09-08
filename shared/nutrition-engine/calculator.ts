/**
 * منفذ من nutrition_ai/calculator.py — نقطة الحقيقة الوحيدة للأرقام. الجزء المستقل عن DB
 * (compute_food/totals_for_items/day_utc_range/today_utc_range) + الجزء المعتمد على Repository
 * (today_totals/meals_by_type_for_day/today_water_ml)، بعد اكتمال طبقة db/repository.ts.
 */
import * as foodSearch from "./foodSearch.js";
import * as iraqTime from "./iraqTime.js";
import type { Repository, MealLogRecord } from "./db/repository.js";

export async function computeFood(foodId: number, grams: number) {
  return foodSearch.computeNutrition(foodId, grams);
}

export interface NutritionItem {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function totalsForItems(items: NutritionItem[]) {
  return {
    calories: items.reduce((sum, i) => sum + i.calories, 0),
    protein: items.reduce((sum, i) => sum + i.protein, 0),
    carbs: items.reduce((sum, i) => sum + i.carbs, 0),
    fat: items.reduce((sum, i) => sum + i.fat, 0),
  };
}

/**
 * نفس منطق today_utc_range لكن ليوم بغدادي محدد (بدل اليوم الحالي إجباريًا). يرجّع حدود UTC
 * [بداية، نهاية) مطابقة لتخزين created_at بـUTC ساذج (توافقًا مع نمط التخزين الحالي بايثون).
 */
export function dayUtcRange(targetYear: number, targetMonth: number, targetDay: number): [Date, Date] {
  // بغداد UTC+3 ثابت بدون توقيت صيفي — منتصف ليل بغداد لليوم المطلوب = 21:00 UTC لليوم السابق
  const startUtc = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, -3, 0, 0));
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return [startUtc, endUtc];
}

/** يرجّع حدود UTC لليوم الحالي بتوقيت بغداد. */
export function todayUtcRange(now: Date = new Date()): [Date, Date] {
  const { year, month, day } = iraqTime.nowBaghdad(now);
  return dayUtcRange(year, month, day);
}

export interface DayTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  logs: MealLogRecord[];
}

export async function todayTotals(repo: Repository, userId: string, now: Date = new Date()): Promise<DayTotals> {
  const [start, end] = todayUtcRange(now);
  const logs = await repo.findMealLogsInRange(userId, start, end);
  return {
    calories: logs.reduce((s, l) => s + l.total_calories, 0),
    protein: logs.reduce((s, l) => s + l.total_protein, 0),
    carbs: logs.reduce((s, l) => s + l.total_carbs, 0),
    fat: logs.reduce((s, l) => s + l.total_fat, 0),
    logs,
  };
}

export async function todayWaterMl(repo: Repository, userId: string, now: Date = new Date()): Promise<number> {
  const [start, end] = todayUtcRange(now);
  const rows = await repo.findWaterLogsInRange(userId, start, end);
  return rows.reduce((s, r) => s + r.ml, 0);
}

export type MealBucket =
  | { status: "NOT_STARTED" }
  | {
      status: "LOGGED"; calories: number; protein: number; carbs: number; fat: number;
      foods: string[]; logged_at: Date;
    };

export interface MealsByType {
  breakfast: MealBucket;
  lunch: MealBucket;
  dinner: MealBucket;
  snack: MealBucket[];
}

/**
 * يجمّع وجبات يوم بغدادي محدد حسب نوعها — breakfast/lunch/dinner كل وحدة صف واحد (أو
 * NOT_STARTED لو ماكو)، snack قائمة (يدعم أكثر من سناك بنفس اليوم).
 */
export async function mealsByTypeForDay(
  repo: Repository, userId: string, targetYear: number, targetMonth: number, targetDay: number,
): Promise<MealsByType> {
  const [start, end] = dayUtcRange(targetYear, targetMonth, targetDay);
  const logs = (await repo.findMealLogsInRange(userId, start, end))
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

  const summarize = (log: MealLogRecord): MealBucket => {
    let foods: string[] = [];
    try {
      foods = log.matched_foods_json ? JSON.parse(log.matched_foods_json) : [];
    } catch {
      foods = [];
    }
    return {
      status: "LOGGED", calories: log.total_calories, protein: log.total_protein,
      carbs: log.total_carbs, fat: log.total_fat, foods, logged_at: log.created_at,
    };
  };

  const result: MealsByType = {
    breakfast: { status: "NOT_STARTED" }, lunch: { status: "NOT_STARTED" },
    dinner: { status: "NOT_STARTED" }, snack: [],
  };
  for (const log of logs) {
    if (log.meal_type === "snack") {
      result.snack.push(summarize(log));
    } else if (log.meal_type === "breakfast" || log.meal_type === "lunch" || log.meal_type === "dinner") {
      result[log.meal_type] = summarize(log);
    }
  }
  return result;
}
