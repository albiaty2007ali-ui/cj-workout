/**
 * اختبارات تكافؤ لـfoodSearch.ts (منفذ TS لـfood_search.py) — تشغّل ضد نفس ملف
 * data/database/foods.sqlite الحقيقي عبر sql.js، والتوقعات مأخوذة من تشغيل food_search.py
 * الحقيقي مباشرة (python3) لنفس الرسائل — مو افتراض نظري.
 */
import { describe, it, expect } from "vitest";
import { matchMessage, computeNutrition } from "../foodSearch.js";

describe("matchMessage — تكافؤ حرفي مع food_search.py (قيم حقيقية من قاعدة foods.sqlite الفعلية)", () => {
  it("'اكلت بيضتين' -> بيضة، 100 غرام (مضاعف مثنى = 2 × 50غ)", async () => {
    const r = await matchMessage("اكلت بيضتين");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ food_id: 1, food_name: "بيضة", resolved: true, grams: 100 });
  });

  it("'اكلت 3 بيض' -> بيضة، 150 غرام (عدد صريح × وحدة قياس افتراضية 50غ)", async () => {
    const r = await matchMessage("اكلت 3 بيض");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ food_id: 1, food_name: "بيضة", resolved: true, grams: 150, quantity: 3 });
  });

  it("'اكلت بيضة' -> بيضة، 50 غرام (مفرد)", async () => {
    const r = await matchMessage("اكلت بيضة");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ food_id: 1, food_name: "بيضة", resolved: true, grams: 50 });
  });

  it("'اكلت 200 غرام جبن' -> جبن، 200 غرام (وزن صريح، يتجاوز أي Portion)", async () => {
    const r = await matchMessage("اكلت 200 غرام جبن");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ food_id: 2, food_name: "جبن", resolved: true, grams: 200 });
  });

  it("'اكلت كوب حليب' -> حليب، 240 غرام (Portion معرّف 'كوب')", async () => {
    const r = await matchMessage("اكلت كوب حليب");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ food_id: 4, food_name: "حليب", resolved: true, grams: 240, portion_name: "كوب" });
  });

  it("'اكلت ملعقتين قيمر' -> قيمر، 30 غرام (اسم Portion نفسه يحمل المثنى)", async () => {
    const r = await matchMessage("اكلت ملعقتين قيمر");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ food_id: 5, food_name: "قيمر", resolved: true, grams: 30, portion_name: "ملعقتين" });
  });
});

describe("computeNutrition — تكافؤ حرفي (قيم حقيقية للبيضة، food_id=1)", () => {
  it("100 غرام -> نفس أرقام Python حرفيًا", async () => {
    const n = await computeNutrition(1, 100);
    expect(n).toEqual({ calories: 155, protein: 13.0, carbs: 1.1, fat: 11.0, fiber: 0.0 });
  });

  it("150 غرام -> نفس أرقام Python حرفيًا", async () => {
    const n = await computeNutrition(1, 150);
    expect(n).toEqual({ calories: 232, protein: 19.5, carbs: 1.7, fat: 16.5, fiber: 0.0 });
  });
});
