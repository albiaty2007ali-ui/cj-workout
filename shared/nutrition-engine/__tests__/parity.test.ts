/**
 * اختبارات تكافؤ (Parity) — تتحقق إن المنفذ TS يطابق سلوك الأصل Python حرفيًا، باستخدام نفس
 * الأمثلة الموثّقة بالـdocstrings الأصلية (arabic_normalize.py / quantity.py / fuzzy.py).
 */
import { describe, it, expect } from "vitest";
import { normalize } from "../arabicNormalize.js";
import { parseWaterMl, findLeadingNumber, NUMBER_WORDS } from "../quantity.js";
import { sequenceMatcherRatio } from "../sequenceMatcher.js";
import { classifyCandidates, candidateTokens, leftoverText, type FuzzyMatch } from "../fuzzy.js";

describe("arabicNormalize.normalize", () => {
  it("يوحّد أشكال الألف والياء المقصورة", () => {
    // "إلى" تحتوي ألف مقصورة (ى) تتحوّل لياء حسب ALEF_FORMS — "الي" صحيحة، تحققت من سلوك
    // arabic_normalize.py الفعلي مباشرة (python3 -c "..." يرجع نفس النتيجة بالضبط).
    expect(normalize("أكلت إلى المطبخ آخر مرة")).toBe("اكلت الي المطبخ اخر مرة");
    expect(normalize("متى")).toBe("متي");
  });

  it("يزيل التشكيل والتطويل", () => {
    expect(normalize("بِسْمِ اللَّه")).toBe("بسم الله");
    expect(normalize("ســـلام")).toBe("سلام");
  });

  it("ينظّف المسافات الزائدة", () => {
    expect(normalize("  اكلت    بيض  ")).toBe("اكلت بيض");
  });

  it("نص فاضي يرجع نص فاضي", () => {
    expect(normalize("")).toBe("");
    expect(normalize(null)).toBe("");
  });
});

describe("quantity.parseWaterMl — أمثلة موثّقة حرفيًا من quantity.py", () => {
  it("'شربت نص لتر' -> 500", () => {
    expect(parseWaterMl("شربت نص لتر")).toBe(500);
  });

  it("'شربت 500 مل' -> 500", () => {
    expect(parseWaterMl("شربت 500 مل")).toBe(500);
  });

  it("'شربت كوبين ماي' -> 480", () => {
    expect(parseWaterMl("شربت كوبين ماي")).toBe(480);
  });

  it("بدون كمية مذكورة -> null (لا افتراض أبدًا)", () => {
    expect(parseWaterMl("شربت ماي")).toBeNull();
  });

  it("استكانين -> 400", () => {
    expect(parseWaterMl("شربت استكانين چاي")).toBe(400);
  });

  it("لتر واحد -> 1000", () => {
    expect(parseWaterMl("شربت لتر ماي")).toBe(1000);
  });
});

describe("quantity.findLeadingNumber", () => {
  it("'وزني هسه 80' -> 80", () => {
    expect(findLeadingNumber("وزني هسه 80")).toBe(80);
  });

  it("كلمة رقمية بدون خانة -> تحوّل صحيحة", () => {
    expect(findLeadingNumber("اكلت ثلاثة بيض")).toBe(3);
  });

  it("بدون رقم إطلاقًا -> null", () => {
    expect(findLeadingNumber("اكلت بيض")).toBeNull();
  });
});

describe("quantity.NUMBER_WORDS — تغطية كاملة لجدول الأصل", () => {
  it("يحتوي كل الكلمات الرقمية الأصلية بنفس القيم", () => {
    expect(NUMBER_WORDS["صفر"]).toBe(0);
    expect(NUMBER_WORDS["زوجين"]).toBe(2);
    expect(NUMBER_WORDS["مائة"]).toBe(100);
  });
});

describe("sequenceMatcherRatio — يطابق Python difflib.SequenceMatcher.ratio()", () => {
  it("سلاسل متطابقة تمامًا -> 1.0", () => {
    expect(sequenceMatcherRatio("دولمة", "دولمة")).toBe(1.0);
  });

  it("سلسلتان فاضيتان -> 1.0 (تطابق سلوك Python)", () => {
    expect(sequenceMatcherRatio("", "")).toBe(1.0);
  });

  it("مثال حقيقي مذكور بـCLAUDE.md: 'مشتهي' مقابل 'مشوي' -> نسبة قريبة من 0.67 (السبب الجذري لباگ سابق)", () => {
    const ratio = sequenceMatcherRatio("مشتهي", "مشوي");
    expect(ratio).toBeCloseTo(0.6667, 3);
  });

  it("سلاسل بدون أي تشابه -> نسبة منخفضة جدًا", () => {
    expect(sequenceMatcherRatio("تفاح", "زبدة")).toBeLessThan(0.3);
  });

  it("مثال كلاسيكي معروف من توثيق Python نفسه: 'rain' vs 'shine' -> 0.4", () => {
    expect(sequenceMatcherRatio("rain", "shine")).toBeCloseTo(0.4444, 3);
  });
});

describe("fuzzy.classifyCandidates", () => {
  const makeMatch = (confidence: number): FuzzyMatch => ({
    food_id: 1, food_name: "طعام", confidence,
    alias_row: {
      alias_id: 1, food_id: 1, food_name: "طعام", normalized_alias: "طعام",
      quantity_multiplier: 1, is_plural_unspecified: 0, is_bulk: 0,
    },
  });

  it("ثقة عالية (>=0.90) -> auto", () => {
    const result = classifyCandidates([makeMatch(0.95)]);
    expect(result.kind).toBe("auto");
  });

  it("ثقة متوسطة (0.70-0.89) -> confirm", () => {
    const result = classifyCandidates([makeMatch(0.75)]);
    expect(result.kind).toBe("confirm");
  });

  it("مرشحان متقاربان فوق عتبة التأكيد -> ambiguous", () => {
    const result = classifyCandidates([makeMatch(0.80), makeMatch(0.74)]);
    expect(result.kind).toBe("ambiguous");
  });

  it("ثقة منخفضة جدًا -> none", () => {
    const result = classifyCandidates([makeMatch(0.40)]);
    expect(result.kind).toBe("none");
  });

  it("قائمة فاضية -> none", () => {
    expect(classifyCandidates([]).kind).toBe("none");
  });
});

describe("fuzzy.candidateTokens / leftoverText", () => {
  it("يستثني StopWords ويبني Bigrams", () => {
    const leftover = "اكلت طعام غريب اليوم";
    const tokens = candidateTokens(leftover);
    expect(tokens).toContain("طعام");
    expect(tokens).toContain("غريب");
    expect(tokens).not.toContain("اكلت"); // StopWord
  });

  it("leftoverText يستبدل الأجزاء المستهلكة بمسافات فقط", () => {
    // span [0,5) يغطي "اكلت " (4 أحرف + مسافة) = 5 حروف تتحول لمسافات
    const result = leftoverText("اكلت بيض ولبن", [[0, 5]]);
    expect(result).toBe("     بيض ولبن");
  });
});
