/**
 * اختبارات challenges.ts — صعوبة تتكيّف مع Streak الحقيقي، تقدّم يُحسب من behavior_daily
 * الحقيقي فقط (صفر عداد منفصل)، وXP يُمنح مرة وحدة بالضبط عند اكتمال الهدف الحقيقي.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import { listChallenges, startChallenge, evaluateChallenges } from "../challenges.js";

describe("Challenges متكيّفة — تقدّم حقيقي من behavior_daily، XP مرة وحدة عند الاكتمال", () => {
  let repo: InMemoryRepository;
  const now = new Date("2026-01-15T06:00:00Z");

  beforeEach(() => {
    repo = new InMemoryRepository();
  });

  it("مستخدم Streak=0 -> يشوف بس التحديات اللي min_streak_days=0 (Adaptive difficulty)", async () => {
    const user = makeUser({ id: "u1", streak_days: 0 });
    const list = await listChallenges(repo, user, now);
    expect(list.every((c) => c.min_streak_days === 0)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
  });

  it("مستخدم Streak=10 -> يشوف تحديات min_streak_days<=10 بس (protein/water_5day)، مو meals_7day (يحتاج 14)", async () => {
    const user = makeUser({ id: "u1", streak_days: 10 });
    const list = await listChallenges(repo, user, now);
    expect(list.some((c) => c.id === "protein_5day")).toBe(true);
    expect(list.some((c) => c.id === "meals_7day")).toBe(false);
  });

  it("مستخدم Streak=20 -> يشوف كل التحديات (حتى meals_7day اللي يحتاج 14)", async () => {
    const user = makeUser({ id: "u1", streak_days: 20 });
    const list = await listChallenges(repo, user, now);
    expect(list.some((c) => c.id === "meals_7day")).toBe(true);
  });

  it("startChallenge ينجح لتحدٍّ مؤهّل، ويرفض إعادة البدء بنفس التحدي", async () => {
    const user = makeUser({ id: "u1", streak_days: 0 });
    const first = await startChallenge(repo, user, "meals_3day", now);
    const second = await startChallenge(repo, user, "meals_3day", now);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("startChallenge يرفض تحدٍّ فوق مستوى Streak الحالي", async () => {
    const user = makeUser({ id: "u1", streak_days: 2 });
    const started = await startChallenge(repo, user, "protein_5day", now); // يحتاج 7
    expect(started).toBe(false);
  });

  it("تقدّم 3 أيام حقيقية يكمل تحدي meals_3day ويمنح XP مرة وحدة بالضبط", async () => {
    const user = makeUser({ id: "u1", xp: 0, streak_days: 0 });
    await repo.saveUser(user);
    await startChallenge(repo, user, "meals_3day", new Date("2026-01-13T06:00:00Z"));

    for (const date of ["2026-01-13", "2026-01-14", "2026-01-15"]) {
      await repo.upsertBehaviorDaily({
        user_id: "u1", date, meals_logged: 1,
        protein_hit_target: false, water_hit_target: false, logged_before_noon: false,
      });
    }

    await evaluateChallenges(repo, user, now);
    const progress = await repo.findChallengeProgress("u1", "meals_3day");
    expect(progress!.status).toBe("completed");
    expect(user.xp).toBe(20);

    // استدعاء ثانٍ (مثلاً فتح صفحة الذكاء مرة ثانية) -> صفر منح XP إضافي
    await evaluateChallenges(repo, user, now);
    expect(user.xp).toBe(20);
  });

  it("يومين بس من 3 -> التحدي يبقى active بتقدّم 2، صفر XP لسا", async () => {
    const user = makeUser({ id: "u1", xp: 0, streak_days: 0 });
    await repo.saveUser(user);
    await startChallenge(repo, user, "meals_3day", new Date("2026-01-14T06:00:00Z"));
    for (const date of ["2026-01-14", "2026-01-15"]) {
      await repo.upsertBehaviorDaily({
        user_id: "u1", date, meals_logged: 1,
        protein_hit_target: false, water_hit_target: false, logged_before_noon: false,
      });
    }
    const list = await listChallenges(repo, user, now);
    const c = list.find((x) => x.id === "meals_3day")!;
    expect(c.status).toBe("active");
    expect(c.progress_days).toBe(2);
    expect(user.xp).toBe(0);
  });
});
