/**
 * اختبار دخان لعبارات "مساعد CJ" المطلوبة صراحة بقسم 14 من طلب إعادة تصميم القائمة — يتحقق فقط
 * إن handleMessage() (المسار المحلي الافتراضي، mode=OFF) لا يرمي استثناء ويرجّع reply غير فارغ
 * لكل عبارة، صفر تحقق لدقة "جودة" الرد (غير ممكن آليًا لعبارات تعتمد على فهم طبيعي/Gemini) —
 * نفس فلسفة generalConversation.test.ts لكن على المسار المحلي بدل ACTIVE المحاكى.
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import { handleMessage } from "../orchestrator.js";
import type { NutritionProfileRecord } from "../db/repository.js";

const STANDARD_PROFILE: Omit<NutritionProfileRecord, "user_id"> = {
  age: 25, weight_kg: 80, height_cm: 175, sex: "male", goal: "lose", activity_level: "moderate",
  bmr: 1774, tdee: 2749, calorie_target: 2249, water_target_ml: 2640, goal_weight: null,
};

// noon بغداد — يمنع تداخل under_target (مساء/ليل فقط) مع هذا الدخان غير المتعلق أصلاً بالميزة
const NOON = new Date("2026-01-01T09:00:00Z");

// عبارات قسم 14 بالضبط، زائد صيغ "أكل بيتنا"/"بديل أخف" المستخدَمة فعليًا بأزرار مساعد CJ
const PHRASES = [
  "شنو آكل؟", "شنو آكل هسه؟", "مشتهي شي", "شكد باقيلي؟", "أريد وجبة خفيفة",
  "أريد غداء", "أريد عشاء", "أريد أكل بيتنا", "أريد بديل أخف",
];

describe("عبارات مساعد CJ — دخان على المسار المحلي (mode=OFF)", () => {
  it.each(PHRASES)("'%s' لا ترمي استثناء وترجّع reply غير فارغ", async (msg) => {
    const repo = new InMemoryRepository();
    const id = `qa-${Math.random().toString(16).slice(2)}`;
    const user = makeUser({ id });
    repo.nutritionProfiles.set(id, { user_id: id, ...STANDARD_PROFILE });
    await repo.saveUser(user);

    const r = await handleMessage(repo, user, msg, NOON);
    expect(typeof r.reply).toBe("string");
    expect(r.reply!.length).toBeGreaterThan(0);
  });
});
