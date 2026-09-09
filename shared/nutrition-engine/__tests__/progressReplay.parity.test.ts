/**
 * اختبارات progressReplay.ts — خط زمني من أحداث حقيقية فقط (meal_logs/xp_transactions/
 * challenge_progress)، صفر حدث مُخترع.
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { buildProgressReplay } from "../progressReplay.js";
import type { UserRecord } from "../db/repository.js";

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "u1", xp: 0, streak_days: 0, longest_streak: 0, streak_started_at: null, last_active_date: null,
    free_meals_used: 0, is_premium: false, current_recipe_id: null, current_recipe_step: 0,
    pending_recipe_confirmation_id: null, pending_food_topic_json: null, pending_meal_json: null,
    last_direct_log_json: null, ai_response_style: "default", streak_freeze_balance: 0,
    ...overrides,
  };
}

describe("buildProgressReplay", () => {
  it("ماكو أي وجبة مسجّلة أبدًا -> available=false، صفر حدث", async () => {
    const repo = new InMemoryRepository();
    const result = await buildProgressReplay(repo, makeUser(), new Date("2026-01-15T06:00:00Z"));
    expect(result.available).toBe(false);
    expect(result.events).toEqual([]);
  });

  it("أول وجبة قديمة (أكثر من 7 أيام) -> حدث first_meal حقيقي بالتاريخ الصحيح", async () => {
    const repo = new InMemoryRepository();
    repo.now = new Date("2026-01-01T06:00:00Z");
    await repo.insertMealLog({
      user_id: "u1", meal_type: "breakfast", raw_text: "بيض", matched_foods_json: null,
      total_calories: 150, total_protein: 12, total_carbs: 1, total_fat: 10, is_free_meal: false,
    });
    const result = await buildProgressReplay(repo, makeUser(), new Date("2026-01-15T06:00:00Z"));
    expect(result.available).toBe(true);
    expect(result.events[0]).toEqual({ type: "first_meal", date: "2026-01-01", label: "أول وجبة سجّلتها" });
  });

  it("محطة Streak حقيقية من xp_transactions -> حدث streak_milestone بالأيام الصحيحة", async () => {
    const repo = new InMemoryRepository();
    repo.now = new Date("2026-01-01T06:00:00Z");
    await repo.insertMealLog({
      user_id: "u1", meal_type: "breakfast", raw_text: "بيض", matched_foods_json: null,
      total_calories: 150, total_protein: 12, total_carbs: 1, total_fat: 10, is_free_meal: false,
    });
    repo.now = new Date("2026-01-08T06:00:00Z");
    await repo.insertXpTransaction({ user_id: "u1", amount: 20, reason: "streak_milestone", source: "streak_milestone_7", metadata_json: null });
    const result = await buildProgressReplay(repo, makeUser(), new Date("2026-01-15T06:00:00Z"));
    const milestone = result.events.find((e) => e.type === "streak_milestone");
    expect(milestone).toEqual({ type: "streak_milestone", date: "2026-01-08", label: "وصلت لـ7 يوم Streak متواصل" });
  });

  it("تحدٍّ مكتمل حقيقي -> حدث challenge_completed بعنوان حقيقي من CHALLENGE_DEFS", async () => {
    const repo = new InMemoryRepository();
    repo.now = new Date("2026-01-01T06:00:00Z");
    await repo.insertMealLog({
      user_id: "u1", meal_type: "breakfast", raw_text: "بيض", matched_foods_json: null,
      total_calories: 150, total_protein: 12, total_carbs: 1, total_fat: 10, is_free_meal: false,
    });
    await repo.insertChallengeProgress({ user_id: "u1", challenge_id: "meals_3day", start_date: "2026-01-01", status: "completed", completed_at: "2026-01-04" });
    const result = await buildProgressReplay(repo, makeUser(), new Date("2026-01-15T06:00:00Z"));
    const challengeEvent = result.events.find((e) => e.type === "challenge_completed");
    expect(challengeEvent?.date).toBe("2026-01-04");
    expect(challengeEvent?.label).toContain("3 أيام التزام");
  });

  it("الأحداث مرتبة تصاعديًا بالتاريخ", async () => {
    const repo = new InMemoryRepository();
    repo.now = new Date("2026-01-01T06:00:00Z");
    await repo.insertMealLog({
      user_id: "u1", meal_type: "breakfast", raw_text: "بيض", matched_foods_json: null,
      total_calories: 150, total_protein: 12, total_carbs: 1, total_fat: 10, is_free_meal: false,
    });
    await repo.insertChallengeProgress({ user_id: "u1", challenge_id: "meals_3day", start_date: "2026-01-01", status: "completed", completed_at: "2026-01-03" });
    repo.now = new Date("2026-01-02T06:00:00Z");
    await repo.insertXpTransaction({ user_id: "u1", amount: 5, reason: "streak_milestone", source: "streak_milestone_1", metadata_json: null });
    const result = await buildProgressReplay(repo, makeUser(), new Date("2026-01-15T06:00:00Z"));
    const dates = result.events.map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
  });
});
