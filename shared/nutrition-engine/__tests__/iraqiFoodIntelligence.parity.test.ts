/**
 * اختبارات تكافؤ لإضافات "ذكاء الأكل العراقي" بـfoods_seed.py (استجابة للطلب: توسيع قاعدة
 * الأطعمة بأرقام حقيقية بدل خلي Gemini يخمّن كمية/سعرات غير مذكورة صراحة — راجع قرار المستخدم
 * الصريح). كل الأرقام هنا حقيقية من data/database/foods.sqlite الفعلية بعد إعادة البناء
 * (scripts/import_foods.py --reset --seed)، صفر افتراض نظري.
 */
import { describe, it, expect } from "vitest";
import { matchMessage } from "../foodSearch.js";

describe("matchMessage — أطعمة/أسماء عراقية جديدة أو aliases مضافة", () => {
  it("'اكلت صحن صغير قيمة' -> قيمة (طعام جديد، food_id=59)، صحن صغير 250غ", async () => {
    const r = await matchMessage("اكلت صحن صغير قيمة");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ food_id: 59, food_name: "قيمة", resolved: true, grams: 250 });
  });

  it("'اكلت صمون حجري' -> صمون (alias جديد لطعام موجود، food_id=6 كما هو)", async () => {
    const r = await matchMessage("اكلت صمون حجري");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ food_id: 6, food_name: "صمون", resolved: true });
  });

  it("'اكلت سمج مسقوف' -> مسكوف (alias إملائي جديد، food_id=24 كما هو)", async () => {
    const r = await matchMessage("اكلت سمج مسقوف");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ food_id: 24, food_name: "مسكوف" });
  });

  it("'اكلت قص دجاج جامبو' -> دجاج مشوي (alias+portion جديدين، food_id=19 كما هو)، 280غ", async () => {
    const r = await matchMessage("اكلت قص دجاج جامبو");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ food_id: 19, food_name: "دجاج مشوي", resolved: true, grams: 280 });
  });

  it("'اكلت شيش كباب' -> كباب (alias جديد، food_id=22 كما هو)", async () => {
    const r = await matchMessage("اكلت شيش كباب");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ food_id: 22, food_name: "كباب" });
  });
});
