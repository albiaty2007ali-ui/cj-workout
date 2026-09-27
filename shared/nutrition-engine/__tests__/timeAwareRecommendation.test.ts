/**
 * اختبارات وعي الوقت بمسار ASK_RECOMMENDATION/EXPRESS_DESIRE (حزمة تطوير الوقت/السياق) —
 * الشرط الحرج: طلب صريح لنوع وجبة مختلف عن توقع الوقت لا يُرفَض أبدًا (findMealType يعطي
 * الأولوية للذكر الصريح). بغداد UTC+3 ثابت، نفس منهجية iraqTime.parity.test.ts.
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

async function freshUser(repo: InMemoryRepository, id: string): Promise<ReturnType<typeof makeUser>> {
  const user = makeUser({ id });
  repo.nutritionProfiles.set(id, { user_id: id, ...STANDARD_PROFILE });
  await repo.saveUser(user);
  return user;
}

// بغداد 22:00 (night) -> UTC 19:00
const LATE_NIGHT_UTC = new Date("2026-09-08T19:00:00Z");
// بغداد 07:00 (morning) -> UTC 04:00
const MORNING_UTC = new Date("2026-09-08T04:00:00Z");

describe("طلب صريح لوجبة لا يُرفَض بسبب الوقت", () => {
  it("'أريد غداء' الساعة 10 مساءً بغداد -> لا يُرفَض، الرد يذكر الغداء لا العشاء", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u1");
    const r = await handleMessage(repo, user, "أريد غداء", LATE_NIGHT_UTC);
    expect(r.meal_logged).toBe(false);
    expect(r.reply).not.toContain("ما فهمتك");
  });

  it("'شنو آكل هسه؟' الساعة 7 صباحًا بغداد -> بادئة وقت الصباح + ذكر الفطور بالرد", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u2");
    const r = await handleMessage(repo, user, "شنو آكل هسه؟", MORNING_UTC);
    expect(r.reply).toContain("الفطور");
  });

  it("'شنو آكل هسه؟' الساعة 10 مساءً بغداد -> بادئة الوقت المتأخر، صفر رفض", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u3");
    const r = await handleMessage(repo, user, "شنو آكل هسه؟", LATE_NIGHT_UTC);
    expect(r.meal_logged).toBe(false);
    expect(r.reply.length).toBeGreaterThan(0);
  });
});
