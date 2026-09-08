/**
 * منفذ حرفي من nutrition_ai/corrections.py — Corrections & Food Swap. يفهم "لا خليها 3"،
 * "شيل الجبن"، "بدل البيبسي بببسي دايت" ويحدّث الوجبة الحالية (pending) بدل إنشاء وجبة جديدة.
 * لا يخترع كمية أو سعرات — كل رقم يمر من computeFood/quantity فقط.
 */
import * as calculator from "./calculator.js";
import * as foodSearch from "./foodSearch.js";
import { extractFoodEntities } from "./entities.js";
import { findLeadingNumber } from "./quantity.js";

export interface PendingItem {
  food_id: number;
  food_name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  quantity?: number;
  unit_grams?: number;
  portion_name?: string;
}

export interface PendingMeal {
  meal_type: string;
  raw_text: string;
  items: PendingItem[];
  pending_clarifications: unknown[];
  state?: string;
}

async function recomputeItemNutrition(item: PendingItem): Promise<void> {
  const n = await calculator.computeFood(item.food_id, item.grams);
  item.calories = n.calories;
  item.protein = n.protein;
  item.carbs = n.carbs;
  item.fat = n.fat;
}

/** "لا خليها 3" — يغيّر كمية آخر عنصر مضاف بالوجبة الحالية. */
export async function changeLastQuantity(pending: PendingMeal, textNorm: string): Promise<[boolean, string]> {
  if (!pending?.items?.length) {
    return [false, "ما عندي أكل بهذي الوجبة أعدل كميته هسه."];
  }

  const number = findLeadingNumber(textNorm);
  if (number === null) {
    return [false, "شكد تريد تخليها بالضبط؟ اكتبلي رقم."];
  }

  const item = pending.items[pending.items.length - 1];
  if (item.unit_grams) {
    item.grams = item.unit_grams * number;
    item.quantity = number;
  } else {
    item.grams = number >= 10 ? number : item.grams;
  }

  await recomputeItemNutrition(item);
  return [true, `تمام، خليتها ${item.food_name}: ${item.calories} سعرة.`];
}

/** "شيل الجبن" — يحذف عنصر من الوجبة الحالية إذا انذكر اسمه بالرسالة. */
export async function removeFood(pending: PendingMeal, textNorm: string): Promise<[boolean, string]> {
  if (!pending?.items?.length) {
    return [false, "ما عندي أكل بهذي الوجبة أشيل منه شي."];
  }

  const { results: mentioned } = await foodSearch.matchMessageWithMeta(textNorm);
  const mentionedIds = new Set(mentioned.map((m) => m.food_id));

  const removed = pending.items.filter((i) => mentionedIds.has(i.food_id));
  if (removed.length === 0) {
    return [false, "ما لقيت هذا الأكل بالوجبة الحالية حتى أشيله."];
  }

  pending.items = pending.items.filter((i) => !mentionedIds.has(i.food_id));
  const names = removed.map((r) => r.food_name).join("، ");
  return [true, `تمام، شلت ${names} من الوجبة.`];
}

/**
 * "بدل البيبسي بببسي دايت" — يستبدل عنصر موجود بالوجبة بأكلة ثانية مذكورة بنفس الرسالة،
 * وياخذ نفس كمية العنصر القديم (نفس مبدأ "نفس الحصة، أكلة مختلفة") بدون افتراض رقم جديد.
 */
export async function swapFood(
  pending: PendingMeal,
  textNorm: string,
): Promise<[boolean, PendingItem | null, string]> {
  if (!pending?.items?.length) {
    return [false, null, "ما عندي وجبة أبدّل بيها أكل هسه."];
  }

  const { resolved: mentioned } = await extractFoodEntities(textNorm);
  const existingIds = new Set(pending.items.map((i) => i.food_id));

  const oldMatch = mentioned.find((m) => existingIds.has(m.food_id));
  const newMatch = mentioned.find((m) => !existingIds.has(m.food_id));

  if (!oldMatch) {
    return [false, null, 'ما فهمت شنو تريد تبدل بالضبط. جرب: "بدل X بـ Y".'];
  }
  const oldItemForPrompt = pending.items.find((i) => i.food_id === oldMatch.food_id)!;
  if (!newMatch) {
    return [false, null, `تريد تبدل ${oldItemForPrompt.food_name} بشنو بالضبط؟`];
  }

  const oldItem = pending.items.find((i) => i.food_id === oldMatch.food_id)!;
  const beforeCalories = oldItem.calories;

  const newGrams = newMatch.grams ?? oldItem.grams;
  const n = await calculator.computeFood(newMatch.food_id, newGrams);

  const oldName = oldItem.food_name;
  oldItem.food_id = newMatch.food_id;
  oldItem.food_name = newMatch.food_name;
  oldItem.grams = newGrams;
  oldItem.calories = n.calories;
  oldItem.protein = n.protein;
  oldItem.carbs = n.carbs;
  oldItem.fat = n.fat;
  delete oldItem.unit_grams;
  delete oldItem.quantity;

  const diff = n.calories - beforeCalories;
  const sign = diff >= 0 ? "+" : "";
  const message =
    `قبل: ${oldName} = ${beforeCalories} kcal\n` +
    `بعد: ${newMatch.food_name} = ${n.calories} kcal\n` +
    `الفرق: ${sign}${diff} kcal\n\nأثبت التغيير؟`;

  return [true, oldItem, message];
}
