/**
 * سجل اختبارات موسّع (بند 19-21 من طلب "Gemini كـNLU Hybrid") — يغطي تصنيف النية محليًا
 * (detectIntent، سريع وحتمي وبدون قاعدة بيانات) عبر فئات: تسجيل أكل، كميات، سعرات، تخطيط وجبات،
 * اشتهاء، توصيات، أسئلة، تصحيحات، ماي، وزن، وصفات، محادثة عامة، وأهم شي: حالات سلبية حرجة (نية
 * سؤال بريء يجب أبدًا ما تتحول تسجيل وجبة).
 *
 * ملاحظة صادقة: هذا سجل حقيقي مركّز (~60 حالة)، مو "100+" حرفيًا بالحشو — نفس القرار الموثّق
 * سابقًا بمشروع (templates_seed.py: "تنويع حقيقي أفضل من نسخ شبه متطابقة"). كل حالة هنا قيمة
 * فعلية تغطي تنويع لغوي/إملائي حقيقي، مو تكرار لنفس الجملة بصياغة مختلفة شكليًا بس.
 */
import { describe, it, expect } from "vitest";
import { normalize } from "../arabicNormalize.js";
import { detectIntent } from "../intents.js";

const d = (t: string) => detectIntent(normalize(t), {});

describe("سجل محادثات عراقية موسّع — تصنيف النية المحلي", () => {
  describe("تسجيل أكل حقيقي (LOG_MEAL) — صيغ وأخطاء إملائية متعددة", () => {
    it.each([
      ["اكلت بيضة", "LOG_MEAL"],
      ["اكلت بيضتين", "LOG_MEAL"],
      ["اكلت 3 بيضات", "LOG_MEAL"],
      ["اكلت صمونة وبيضتين", "LOG_MEAL"],
      ["تغديت دولمة", "LOG_MEAL"],
      ["تغذيت دولمة", "LOG_MEAL"],
      ["فطرت خبز وجبن", "LOG_MEAL"],
      ["تعشيت شوربة عدس", "LOG_MEAL"],
      ["اكلت كباب وتمن", "LOG_MEAL"],
      ["هلا اكلت بيضتين وصمونة", "LOG_MEAL"],
    ])("'%s' -> %s", (msg, expected) => {
      expect(d(msg)).toBe(expected);
    });
  });

  describe("كميات وتصحيحات (CORRECTION/CHANGE_QUANTITY/ADD_FOOD/REMOVE_FOOD)", () => {
    it("'لا مو بيضتين، 3' مع has_undoable_log -> CORRECTION", () => {
      expect(detectIntent(normalize("لا مو بيضتين، 3"), { has_undoable_log: true })).toBe("CORRECTION");
    });
    it("'شيلها' مع has_undoable_log -> CANCEL (تراجع مباشر)", () => {
      expect(detectIntent(normalize("شيلها"), { has_undoable_log: true })).toBe("CANCEL");
    });
    it("'زيدلي خبز' مع has_pending -> ADD_FOOD", () => {
      expect(detectIntent(normalize("زيدلي خبز"), { has_pending: true })).toBe("ADD_FOOD");
    });
    it("'شيل الجبن' مع has_pending -> REMOVE_FOOD", () => {
      expect(detectIntent(normalize("شيل الجبن"), { has_pending: true })).toBe("REMOVE_FOOD");
    });
  });

  describe("أسئلة كمية/سعرات/حجم/وحدة (ASK_PORTION_FOR_FOOD/ASK_CALORIES/ASK_FOOD_SIZE/ASK_UNIT)", () => {
    it.each([
      ["شكد آكل من الدولمة؟", "ASK_PORTION_FOR_FOOD"],
      ["شكد لازم آكل تمن؟", "ASK_PORTION_FOR_FOOD"],
      ["قديش آكل بيتزا؟", "ASK_PORTION_FOR_FOOD"],
      ["شكد سعرات البيتزا؟", "ASK_CALORIES"],
      ["كم سعرة الدولمة؟", "ASK_CALORIES"],
      ["شكد حجم البيتزا؟", "ASK_FOOD_SIZE"],
      ["شنو حجم الحصة؟", "ASK_FOOD_SIZE"],
      ["شكد يعني صحن؟", "ASK_UNIT"],
      ["شكد يعني حبة؟", "ASK_UNIT"],
      ["شكد يعني خاشوقة؟", "ASK_UNIT"],
      ["شكد يعني استكان؟", "ASK_UNIT"],
    ])("'%s' -> %s", (msg, expected) => {
      expect(d(msg)).toBe(expected);
    });
  });

  describe("ملاءمة/بدائل (ASK_FOOD_FIT/ASK_SUBSTITUTION)", () => {
    it.each([
      ["هل البيتزا تناسب سعراتي؟", "ASK_FOOD_FIT"],
      ["الدولمة تعدي سعراتي؟", "ASK_FOOD_FIT"],
      ["أريد بديل أخف", "ASK_SUBSTITUTION"],
      ["شنو البديل الصحي للبيتزا؟", "ASK_SUBSTITUTION"],
    ])("'%s' -> %s", (msg, expected) => {
      expect(d(msg)).toBe(expected);
    });
  });

  describe("تخطيط/ميزانية وجبة (ASK_CALORIE_TARGET_MEAL)", () => {
    it.each([
      ["اريد وجبة 500 سعرة", "ASK_CALORIE_TARGET_MEAL"],
      ["سويلي الغداء 600 سعرة", "ASK_CALORIE_TARGET_MEAL"],
      ["خليلي العشاء 400 سعرة", "ASK_CALORIE_TARGET_MEAL"],
      ["وجبة بحدود 300 سعرة", "ASK_CALORIE_TARGET_MEAL"],
    ])("'%s' -> %s", (msg, expected) => {
      expect(d(msg)).toBe(expected);
    });
  });

  describe("اشتهاء/نية مستقبلية (EXPRESS_CRAVING/PLAN_TO_EAT) — لا تسجّل أبدًا", () => {
    it.each([
      ["مشتهي دولمة", "EXPRESS_CRAVING"],
      ["مشتهية بيتزا", "EXPRESS_CRAVING"],
      ["نفسي بكباب", "EXPRESS_CRAVING"],
      ["راح آكل تمن", "PLAN_TO_EAT"],
      ["راح اكل بيتزا", "PLAN_TO_EAT"],
      ["ناوي آكل دولمة", "PLAN_TO_EAT"],
    ])("'%s' -> %s", (msg, expected) => {
      expect(d(msg)).toBe(expected);
    });
  });

  describe("توصيات (ASK_RECOMMENDATION/ASK_REMAINING)", () => {
    it.each([
      ["شنو آكل هسه؟", "ASK_RECOMMENDATION"],
      ["اقترحلي أكلة", "ASK_RECOMMENDATION"],
      ["شكد باقيلي؟", "ASK_REMAINING"],
      ["كم باقي سعرات؟", "ASK_REMAINING"],
    ])("'%s' -> %s", (msg, expected) => {
      expect(d(msg)).toBe(expected);
    });
  });

  describe("ماي ووزن (WATER_LOG/WEIGHT_UPDATE)", () => {
    it.each([
      ["شربت نص لتر", "WATER_LOG"],
      ["شربت كوب ماي", "WATER_LOG"],
      ["وزني هسه 80", "WEIGHT_UPDATE"],
      ["نزل وزني", "WEIGHT_UPDATE"],
    ])("'%s' -> %s", (msg, expected) => {
      expect(d(msg)).toBe(expected);
    });
  });

  describe("وصفات (ASK_RECIPE)", () => {
    it.each([
      ["وصفة دجاج", "ASK_RECIPE"],
      ["خلينا نطبخ", "ASK_RECIPE"],
      ["أريد حلو دايت", "ASK_RECIPE"],
    ])("'%s' -> %s", (msg, expected) => {
      expect(d(msg)).toBe(expected);
    });
  });

  describe("محادثة عامة (GREETING/FAREWELL/THANKS/END_DAY)", () => {
    it.each([
      ["هلا", "GREETING"],
      ["شلونك", "GREETING"],
      ["صباح الخير", "GREETING"],
      ["مع السلامة", "FAREWELL"],
      ["شكرا", "THANKS"],
      ["تسلم", "THANKS"],
      ["راح انام", "END_DAY"],
    ])("'%s' -> %s", (msg, expected) => {
      expect(d(msg)).toBe(expected);
    });
  });

  describe("خارج الموضوع/طبي (OFFTOPIC/MEDICAL)", () => {
    it("'اكتبلي برنامج بايثون' -> OFFTOPIC", () => {
      expect(d("اكتبلي برنامج بايثون")).toBe("OFFTOPIC");
    });
    it("'أعاني من وجع مزمن، شنو أسوي؟' -> MEDICAL", () => {
      expect(d("أعاني من وجع مزمن، شنو أسوي؟")).toBe("MEDICAL");
    });
  });

  describe("حالات سلبية حرجة — سؤال بريء يذكر طعام يتطابق بثقة كاملة، يجب أبدًا ما يتحول LOG_MEAL", () => {
    it.each([
      "شكد سعرات البيتزا؟",
      "شكد حجم البيتزا؟",
      "شنو حجم الحصة؟",
      "شكد يعني صحن؟",
      "شكد يعني حبة؟",
      "شكد آكل؟",
      "شنو آكل؟",
      "مشتهي بيتزا",
      "أريد بيتزا",
      "راح آكل بيتزا",
      "هل البيتزا تناسب سعراتي؟",
      "أريد بديل أخف",
      "سويلي غداء 600 سعرة",
      "ليش البيضة غالية هسه؟",
      "شنو رايك ببيتزا اليوم؟",
    ])("'%s' -> أي شي إلا LOG_MEAL", (msg) => {
      expect(d(msg)).not.toBe("LOG_MEAL");
    });
  });

  describe("رسائل مركّبة (Multi-Intent) — أولوية السؤال/الكمية فوق الاشتهاء", () => {
    it("'مشتهي دولمه شكد لازم اكل' -> ASK_PORTION_FOR_FOOD (مو EXPRESS_CRAVING بس)", () => {
      expect(d("مشتهي دولمه شكد لازم اكل")).toBe("ASK_PORTION_FOR_FOOD");
    });
    it("'اكلت بيضتين، شكد سعراتها؟' -> ASK_CALORIES (سؤال محدد يسبق LOG_MEAL بالأولوية)", () => {
      expect(d("اكلت بيضتين، شكد سعراتها؟")).toBe("ASK_CALORIES");
    });
  });
});
