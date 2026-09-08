/**
 * اختبارات تكافؤ لـcorrections.ts — القيم المتوقعة من تشغيل nutrition_ai/corrections.py الحقيقي
 * مباشرة (python3) لنفس السيناريوهات، ضد بيانات foods.sqlite الحقيقية (بيضة id=1، جبن id=2).
 */
import { describe, it, expect } from "vitest";
import { changeLastQuantity, removeFood, swapFood, type PendingMeal } from "../corrections.js";
import { computeFood } from "../calculator.js";

describe("changeLastQuantity — تكافؤ حرفي", () => {
  it("'لا خليها 3' بعد بيضة واحدة (50غ) -> 150غ، 232 سعرة", async () => {
    const n = await computeFood(1, 50);
    const pending: PendingMeal = {
      meal_type: "lunch", raw_text: "x", pending_clarifications: [],
      items: [{ food_id: 1, food_name: "بيضة", grams: 50, ...n, unit_grams: 50, quantity: 1 }],
    };
    const [ok, msg] = await changeLastQuantity(pending, "لا خليها 3");
    expect(ok).toBe(true);
    expect(msg).toBe("تمام، خليتها بيضة: 232 سعرة.");
    expect(pending.items[0]).toMatchObject({ grams: 150, calories: 232, protein: 19.5, carbs: 1.7, fat: 16.5, quantity: 3 });
  });
});

describe("removeFood — تكافؤ حرفي", () => {
  it("'شيل الجبن' يحذف الجبن فقط، يبقي البيضة", async () => {
    const pending: PendingMeal = {
      meal_type: "lunch", raw_text: "x", pending_clarifications: [],
      items: [
        { food_id: 1, food_name: "بيضة", grams: 50, calories: 78, protein: 6.5, carbs: 0.55, fat: 5.5 },
        { food_id: 2, food_name: "جبن", grams: 30, calories: 90, protein: 6, carbs: 1, fat: 7 },
      ],
    };
    const [ok, msg] = await removeFood(pending, "شيل الجبن");
    expect(ok).toBe(true);
    expect(msg).toBe("تمام، شلت جبن من الوجبة.");
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0].food_id).toBe(1);
  });
});

describe("swapFood — تكافؤ حرفي", () => {
  it("'بدل البيضة بجبن' -> يستبدل بيضة بجبن (84 kcal، فرق +6)", async () => {
    const pending: PendingMeal = {
      meal_type: "lunch", raw_text: "x", pending_clarifications: [],
      items: [{ food_id: 1, food_name: "بيضة", grams: 50, calories: 78, protein: 6.5, carbs: 0.55, fat: 5.5 }],
    };
    const [ok, item, msg] = await swapFood(pending, "بدل البيضة بجبن");
    expect(ok).toBe(true);
    expect(item).toMatchObject({ food_id: 2, food_name: "جبن", grams: 30, calories: 84, protein: 6.0, carbs: 0.9, fat: 6.3 });
    expect(msg).toBe("قبل: بيضة = 78 kcal\nبعد: جبن = 84 kcal\nالفرق: +6 kcal\n\nأثبت التغيير؟");
  });
});
