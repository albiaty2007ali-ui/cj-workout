/**
 * اختبارات "عندي بطولة" (tournamentMode.ts) — الخصم حسابي بالكود فقط (صفر AI)، بحد أدنى آمن
 * صريح (نفس safety.MIN_SAFE_CALORIES المستخدَم أصلاً لحساب الهدف الأولي)، يرجع تلقائيًا للهدف
 * الأصلي بعد انتهاء المدة عبر context.build() (نقطة تجميع مركزية واحدة، صفر Cron منفصل).
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import * as tournamentMode from "../tournamentMode.js";
import { build } from "../context.js";
import type { NutritionProfileRecord } from "../db/repository.js";

const STANDARD_PROFILE: Omit<NutritionProfileRecord, "user_id"> = {
  age: 25, weight_kg: 80, height_cm: 175, sex: "male", goal: "lose", activity_level: "moderate",
  bmr: 1774, tdee: 2749, calorie_target: 2249, water_target_ml: 2640, goal_weight: null,
};

async function freshUser(repo: InMemoryRepository, id: string, overrides: Partial<NutritionProfileRecord> = {}) {
  const user = makeUser({ id });
  const profile = { user_id: id, ...STANDARD_PROFILE, ...overrides };
  repo.nutritionProfiles.set(id, profile);
  await repo.saveUser(user);
  return profile;
}

describe("tournamentMode.activate", () => {
  it("يخصم 500 سعرة بالضبط عن الهدف الحقيقي (2249 -> 1749)", async () => {
    const repo = new InMemoryRepository();
    const profile = await freshUser(repo, "t1");
    const result = await tournamentMode.activate(repo, profile, 3, new Date("2026-01-01T10:00:00Z"));
    expect(result.ok).toBe(true);
    expect(result.new_target).toBe(1749);
    expect(profile.calorie_target).toBe(1749);
    expect(profile.tournament_original_target).toBe(2249);
  });

  it("يرفض عدد أيام خارج المدى (0 أو 36)", async () => {
    const repo = new InMemoryRepository();
    const profile = await freshUser(repo, "t2");
    expect((await tournamentMode.activate(repo, profile, 0)).ok).toBe(false);
    expect((await tournamentMode.activate(repo, { ...profile, tournament_deficit_until: null }, 36)).ok).toBe(false);
  });

  it("يقبل الحد الأقصى الجديد (35 يوم)", async () => {
    const repo = new InMemoryRepository();
    const profile = await freshUser(repo, "t2b");
    const result = await tournamentMode.activate(repo, profile, 35, new Date("2026-01-01T10:00:00Z"));
    expect(result.ok).toBe(true);
    expect(result.until).toBe("2026-02-05");
  });

  it("حد أدنى آمن صارم — لا ينزل الهدف عن 1200 للذكر مهما كان الهدف الأصلي منخفضًا", async () => {
    const repo = new InMemoryRepository();
    const profile = await freshUser(repo, "t3", { calorie_target: 1600, sex: "male" });
    const result = await tournamentMode.activate(repo, profile, 5);
    // 1600 - 500 = 1100، أقل من 1200 -> يُثبَّت عند 1200 بالضبط
    expect(result.new_target).toBe(1200);
    expect(profile.calorie_target).toBe(1200);
  });

  it("حد أدنى آمن للأنثى (1000) مختلف عن الذكر (1200)", async () => {
    const repo = new InMemoryRepository();
    const profile = await freshUser(repo, "t4", { calorie_target: 1400, sex: "female" });
    const result = await tournamentMode.activate(repo, profile, 5);
    // 1400 - 500 = 900، أقل من 1000 -> يُثبَّت عند 1000 بالضبط
    expect(result.new_target).toBe(1000);
  });

  it("رفض تفعيل ثانٍ وهو مفعّل أصلًا", async () => {
    const repo = new InMemoryRepository();
    const profile = await freshUser(repo, "t5");
    await tournamentMode.activate(repo, profile, 3);
    const second = await tournamentMode.activate(repo, profile, 5);
    expect(second.ok).toBe(false);
    expect(second.error).toBe("ALREADY_ACTIVE");
  });
});

describe("tournamentMode.deactivate", () => {
  it("يرجّع الهدف الأصلي فورًا ويمسح الحقلين", async () => {
    const repo = new InMemoryRepository();
    const profile = await freshUser(repo, "t6");
    await tournamentMode.activate(repo, profile, 3);
    await tournamentMode.deactivate(repo, profile);
    expect(profile.calorie_target).toBe(2249);
    expect(profile.tournament_deficit_until).toBeNull();
    expect(profile.tournament_original_target).toBeNull();
  });
});

describe("checkAndRevertIfExpired — عبر context.build() (النقطة المركزية الوحيدة)", () => {
  it("لسا داخل المدة -> الهدف يبقى مخفَّضًا", async () => {
    const repo = new InMemoryRepository();
    const profile = await freshUser(repo, "t7");
    const activateNow = new Date("2026-01-01T10:00:00Z");
    await tournamentMode.activate(repo, profile, 3, activateNow);

    const stillWithin = new Date("2026-01-02T10:00:00Z"); // يوم واحد بعد، لسا ضمن 3 أيام
    const ctx = await build(repo, "t7", profile, stillWithin);
    expect(ctx.target_calories).toBe(1749);
  });

  it("بعد انتهاء المدة -> يرجّع تلقائيًا للهدف الأصلي بدون أي تدخل يدوي", async () => {
    const repo = new InMemoryRepository();
    const profile = await freshUser(repo, "t8");
    const activateNow = new Date("2026-01-01T10:00:00Z");
    await tournamentMode.activate(repo, profile, 3, activateNow);

    const afterExpiry = new Date("2026-01-05T10:00:00Z"); // بعد 4 أيام، تجاوز مدة 3 أيام
    const ctx = await build(repo, "t8", profile, afterExpiry);
    expect(ctx.target_calories).toBe(2249);
    expect(profile.tournament_deficit_until).toBeNull();

    // تأكد الاسترجاع اتكتب فعليًا بالـRepository، مو بس بالكائن بالذاكرة
    const persisted = repo.nutritionProfiles.get("t8")!;
    expect(persisted.calorie_target).toBe(2249);
  });
});
