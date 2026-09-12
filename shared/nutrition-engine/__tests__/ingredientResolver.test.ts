/**
 * اختبارات ingredientResolver.ts — تعمل ضد foods.sqlite الحقيقي (نفس القاعدة المستخدمة
 * بمحرك تسجيل الوجبات بالشات)، صفر بيانات وهمية. القيم المتوقعة (food_id لكل مثال) تأكدت
 * فعليًا عبر استعلام مباشر لقاعدة data/database/foods.sqlite قبل كتابة هذا الملف:
 *   - "رز"/"تمن"/"الرز" -> نفس food_id=8
 *   - "طماطة"/"طماطم"/"بندورة" -> نفس food_id=42
 *   - "دجاج" (نيء/عام) -> food_id=20، "دجاج مشوي" -> food_id=19 منفصل
 *   - "كرفس"/"فروج" -> غير موجودين إطلاقًا بالقاعدة (صفر alias)
 *
 * ملاحظة: "باذنجان" كانت هنا سابقًا كمثال "غير موجود" — أصبحت موجودة فعليًا (food_id حقيقي،
 * خضار خام) بعد إضافة "تبسي باذنجان" (اكتشاف حقيقي: بدون الخضار الخام نفسها، "باذنجان" المجرد
 * كان يتطابق ضبابيًا مع اسم الطبق المطبوخ بدل صفر تطابق — أُصلح بإضافة الخضار الخام كإدخال منفصل،
 * راجع foods_seed.py). استُبدلت بـ"كرفس" (لسا غير موجود فعليًا) لتبقى نية الاختبار نفسها.
 */
import { describe, it, expect } from "vitest";
import { resolveIngredientName } from "../ingredientResolver.js";

describe("resolveIngredientName — تطابق حرفي (Tier 1)", () => {
  it("'رز' و'تمن' يحلّان لنفس food_id الحقيقي (aliases حقيقية لنفس الطعام)", async () => {
    const rice = await resolveIngredientName("رز");
    const tamn = await resolveIngredientName("تمن");
    expect(rice).not.toBeNull();
    expect(tamn).not.toBeNull();
    expect(rice!.food_id).toBe(tamn!.food_id);
    expect(rice!.tier).toBe("exact");
  });

  it("'طماطة' و'طماطم' يحلّان لنفس food_id الحقيقي", async () => {
    const a = await resolveIngredientName("طماطة");
    const b = await resolveIngredientName("طماطم");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.food_id).toBe(b!.food_id);
  });

  it("مكوّن وصفي طويل يحتوي alias حقيقي كسلسلة فرعية -> يتطابق (نفس نمط substringMatch)", async () => {
    const r = await resolveIngredientName("دجاج مشوي مع صلصة الليمون");
    expect(r).not.toBeNull();
    expect(r!.tier).toBe("exact");
  });

  it("'دجاج' (عام) و'دجاج مشوي' (محدد) -> food_id مختلف فعليًا (القاعدة تفرّق حسب التحضير)", async () => {
    const generic = await resolveIngredientName("دجاج");
    const grilled = await resolveIngredientName("دجاج مشوي");
    expect(generic).not.toBeNull();
    expect(grilled).not.toBeNull();
    expect(generic!.food_id).not.toBe(grilled!.food_id);
  });
});

describe("resolveIngredientName — صفر افتراض لما القاعدة ما تحتوي الطعام", () => {
  it("'كرفس' غير موجود بالقاعدة إطلاقًا -> null صريح، صفر alias مخترع", async () => {
    const r = await resolveIngredientName("كرفس");
    expect(r).toBeNull();
  });

  it("'باذنجان' أصبح موجودًا فعليًا (خضار خام حقيقي، food_id منفصل عن طبق 'تبسي باذنجان')", async () => {
    const eggplant = await resolveIngredientName("باذنجان");
    const dish = await resolveIngredientName("تبسي باذنجان");
    expect(eggplant).not.toBeNull();
    expect(dish).not.toBeNull();
    expect(eggplant!.tier).toBe("exact");
    expect(eggplant!.food_id).not.toBe(dish!.food_id);
  });

  it("'فروج' غير موجود بالقاعدة إطلاقًا -> null صريح", async () => {
    const r = await resolveIngredientName("فروج");
    expect(r).toBeNull();
  });

  it("مكوّن أجنبي غير موجود بقاعدة عراقية محلية صغيرة (44 food) -> null، صفر تخمين", async () => {
    const r = await resolveIngredientName("خليط بسكويت جاهز للفطيرة");
    expect(r).toBeNull();
  });

  it("نص فاضي -> null فورًا بدون استعلام", async () => {
    const r = await resolveIngredientName("   ");
    expect(r).toBeNull();
  });
});

describe("resolveIngredientName — صفر False Positive بين مكونات مختلفة فعليًا", () => {
  it("'دجاج' و'رز' يحلّان لـfood_id مختلفَين تمامًا، صفر دمج خاطئ", async () => {
    const chicken = await resolveIngredientName("دجاج");
    const rice = await resolveIngredientName("رز");
    expect(chicken).not.toBeNull();
    expect(rice).not.toBeNull();
    expect(chicken!.food_id).not.toBe(rice!.food_id);
  });
});
