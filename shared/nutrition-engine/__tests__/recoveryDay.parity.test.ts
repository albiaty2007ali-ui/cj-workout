/**
 * اختبارات Recovery/Flexible Day — طبقة تخزين بسيطة (Repository CRUD) بالتصميم، بدون أي منطق
 * منفصل يمكن أن يكسر. الشرط الجوهري المطلوب اختباره: التفعيل لا يمس XP ولا Streak ولا يحذف
 * بيانات سابقة — وهذا مضمون هنا ببساطة لأن التفعيل لا يستدعي أي دالة XP/Streak إطلاقًا.
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import type { RecoveryDayRecord } from "../db/repository.js";

describe("Recovery Day — تخزين، وصفر تأثير على XP/Streak/التاريخ", () => {
  it("تفعيل يوم مرن -> findRecoveryDay يرجّعه فعليًا", async () => {
    const repo = new InMemoryRepository();
    const row: RecoveryDayRecord = { user_id: "u1", date: "2026-01-15", mode: "FLEXIBLE_DAY", activated_at: new Date().toISOString() };
    await repo.setRecoveryDay(row);
    const found = await repo.findRecoveryDay("u1", "2026-01-15");
    expect(found).not.toBeNull();
    expect(found!.mode).toBe("FLEXIBLE_DAY");
  });

  it("إلغاء التفعيل -> findRecoveryDay يرجّع null بعدها", async () => {
    const repo = new InMemoryRepository();
    await repo.setRecoveryDay({ user_id: "u1", date: "2026-01-15", mode: "FLEXIBLE_DAY", activated_at: new Date().toISOString() });
    await repo.clearRecoveryDay("u1", "2026-01-15");
    expect(await repo.findRecoveryDay("u1", "2026-01-15")).toBeNull();
  });

  it("يومين مختلفين لنفس المستخدم لا يتداخلان", async () => {
    const repo = new InMemoryRepository();
    await repo.setRecoveryDay({ user_id: "u1", date: "2026-01-14", mode: "BUSY_DAY", activated_at: "x" });
    await repo.setRecoveryDay({ user_id: "u1", date: "2026-01-15", mode: "TRAVEL_DAY", activated_at: "y" });
    expect((await repo.findRecoveryDay("u1", "2026-01-14"))!.mode).toBe("BUSY_DAY");
    expect((await repo.findRecoveryDay("u1", "2026-01-15"))!.mode).toBe("TRAVEL_DAY");
  });

  it("تفعيل يوم مرن لا يمس XP ولا Streak ولا وجبات مسجّلة سابقًا (صفر استدعاء لأي من تلك الأنظمة)", async () => {
    const repo = new InMemoryRepository();
    const user = makeUser({ id: "u1", xp: 42, streak_days: 7 });
    await repo.saveUser(user);
    await repo.insertMealLog({
      user_id: "u1", meal_type: "breakfast", raw_text: "بيض", matched_foods_json: "[]",
      total_calories: 150, total_protein: 12, total_carbs: 1, total_fat: 10, is_free_meal: false,
    });

    await repo.setRecoveryDay({ user_id: "u1", date: "2026-01-15", mode: "FLEXIBLE_DAY", activated_at: new Date().toISOString() });

    const reloaded = await repo.findUser("u1");
    expect(reloaded!.xp).toBe(42);
    expect(reloaded!.streak_days).toBe(7);
    expect(await repo.countMealLogsForUser("u1")).toBe(1);
  });
});
