/**
 * اختبارات recipeDuplicateDetection.ts — يختبر الخوارزمية بأمثلة Synthetic (مو بيانات إنتاج
 * حقيقية، هذا اختبار منطق تشابه نص/مجموعات بحت) بالإضافة لمثال الطلب الحرفي
 * ("Chicken Bowl" مقابل "Chicken Bowl Healthy").
 */
import { describe, it, expect } from "vitest";
import { findSimilarRecipes } from "../recipeDuplicateDetection.js";

describe("findSimilarRecipes — اسم شبه مطابق كافٍ وحده", () => {
  it("'Chicken Bowl' و'Chicken Bowl Healthy' (مثال الطلب نفسه) -> يُكتشَف كتكرار مرشّح", () => {
    const result = findSimilarRecipes(
      { slug: "chicken-bowl-healthy", name: "Chicken Bowl Healthy", ingredients: [{ name: "chicken" }, { name: "rice" }] },
      [{ slug: "chicken-bowl", name: "Chicken Bowl", ingredients: [{ name: "chicken" }, { name: "rice" }] }],
    );
    expect(result.length).toBe(1);
    expect(result[0].slug).toBe("chicken-bowl");
  });

  it("اسم مطابق تمامًا -> نسبة تشابه 1.0", () => {
    const result = findSimilarRecipes(
      { slug: "new-slug", name: "شوربة عدس", ingredients: [] },
      [{ slug: "lentil-soup", name: "شوربة عدس", ingredients: [] }],
    );
    expect(result.length).toBe(1);
    expect(result[0].name_similarity).toBe(1);
  });
});

describe("findSimilarRecipes — صفر False Positive لوصفتين مختلفتين فعليًا", () => {
  it("اسمين مختلفين تمامًا يشتركان بمكوّن شائع فقط -> صفر تكرار مكتشَف", () => {
    const result = findSimilarRecipes(
      { slug: "grilled-fish", name: "سمك مشوي بالليمون", ingredients: [{ name: "دجاج" }, { name: "ثوم" }] },
      [{ slug: "chicken-stir-fry", name: "دجاج ستيرفراي بالخضار", ingredients: [{ name: "دجاج" }, { name: "فلفل" }] }],
    );
    expect(result.length).toBe(0);
  });

  it("Regression حقيقي: 'سالسا الفاصوليا السوداء' و'كساديا الفاصوليا السوداء' يشتركان بعبارة مكوّن طويلة بس طبقين مختلفين فعليًا -> صفر تكرار كاذب", () => {
    // اكتُشف فعليًا وقت استيراد دفعة حقيقية ضد Firestore الحقيقي — نسبة الاسم وصلت 89% رغم
    // إنهما وصفتان مختلفتان تمامًا (سالسا مقابل كساديا)، لأن عتبة 0.85 القديمة كانت تكفي وحدها.
    const result = findSimilarRecipes(
      { slug: "black-bean-salsa", name: "سالسا الفاصوليا السوداء", ingredients: [{ name: "فاصوليا سوداء قليلة الصوديوم معلبة مصفاة ومغسولة" }, { name: "طماطة مقطعة قليلة الصوديوم معلبة مصفاة" }, { name: "فلفل أخضر مقطع مكعبات" }, { name: "بصل مقطع مكعبات" }, { name: "ثوم مفروم" }, { name: "كمون مطحون" }, { name: "كزبرة مجففة" }, { name: "خل الرز" }] },
      [{ slug: "black-bean-quesadillas", name: "كساديا الفاصوليا السوداء", ingredients: [{ name: "صلصة سالسا" }, { name: "فاصوليا سوداء قليلة الصوديوم معلبة" }, { name: "جبنة مبروشة قليلة الدسم" }, { name: "كزبرة طازجة مفرومة" }, { name: "تورتيلا (20 سم)" }, { name: "زيت زيتون" }] }],
    );
    expect(result.length).toBe(0);
  });

  it("نفس الاسم بالضبط بوصفة نفسها (نفس slug) -> يُستبعَد من المقارنة (مو تكرار ضد نفسه)", () => {
    const result = findSimilarRecipes(
      { slug: "same-slug", name: "وصفة", ingredients: [] },
      [{ slug: "same-slug", name: "وصفة", ingredients: [] }],
    );
    expect(result.length).toBe(0);
  });
});

describe("findSimilarRecipes — اسم متقارب + مكونات متطابقة بشكل كبير معًا", () => {
  it("اسم متقارب معقول (مو شبه مطابق) + food_id متطابقة بالكامل -> يُكتشَف عبر البند الثاني", () => {
    const result = findSimilarRecipes(
      { slug: "b", name: "دجاج بالفرن مع خضار", ingredients: [{ name: "دجاج", food_id: 20 }, { name: "رز", food_id: 8 }, { name: "طماطة", food_id: 42 }] },
      [{ slug: "a", name: "دجاج مطبوخ بالفرن وخضار", ingredients: [{ name: "دجاج", food_id: 20 }, { name: "رز", food_id: 8 }, { name: "طماطة", food_id: 42 }] }],
    );
    expect(result.length).toBe(1);
    expect(result[0].ingredient_similarity).toBe(1);
  });

  it("اسم متباعد فعليًا حتى لو المكونات متطابقة بالكامل -> صفر تكرار (اسم لوحده مو كافٍ لو بعيد)", () => {
    const result = findSimilarRecipes(
      { slug: "b", name: "سلطة صيفية باردة", ingredients: [{ name: "دجاج", food_id: 20 }, { name: "رز", food_id: 8 }] },
      [{ slug: "a", name: "طبخة دجاج حارة بالتنور", ingredients: [{ name: "دجاج", food_id: 20 }, { name: "رز", food_id: 8 }] }],
    );
    expect(result.length).toBe(0);
  });
});
