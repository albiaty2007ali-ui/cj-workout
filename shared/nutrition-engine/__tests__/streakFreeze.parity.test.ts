/**
 * اختبارات streakFreeze.ts — الحماية تعتمد على active_days الحقيقية فقط (صفر عداد منفصل)،
 * الرصيد يُكتسَب حصرًا من محطات Streak حقيقية (تكامل مع streaks.ts)، وله حد أقصى موثَّق.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRepository, DEFAULT_MILESTONES } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import { useStreakFreeze, MAX_STREAK_FREEZE_BALANCE } from "../streakFreeze.js";
import { recordActiveDay } from "../streaks.js";

describe("useStreakFreeze — حماية حقيقية عبر active_days، صفر تفعيل تلقائي", () => {
  let repo: InMemoryRepository;

  beforeEach(() => {
    repo = new InMemoryRepository();
  });

  it("رصيد صفر -> رفض صريح NO_FREEZE_BALANCE، صفر تغيير بالستريك", async () => {
    const user = makeUser({ id: "u1", streak_freeze_balance: 0, streak_days: 5 });
    const result = await useStreakFreeze(repo, user, new Date("2026-01-15T06:00:00Z"));
    expect(result.ok).toBe(false);
    expect(user.streak_days).toBe(5);
  });

  it("أمس أصلاً نشط -> رفض YESTERDAY_ALREADY_ACTIVE (ماكو داعي فعليًا)", async () => {
    const user = makeUser({ id: "u1", streak_freeze_balance: 1 });
    await repo.insertActiveDay("u1", "2026-01-14");
    const result = await useStreakFreeze(repo, user, new Date("2026-01-15T06:00:00Z"));
    expect(result.ok).toBe(false);
  });

  it("استخدام ناجح: يحمي أمس، ينقص الرصيد، ويعيد حساب الستريك من السلسلة الحقيقية", async () => {
    const user = makeUser({ id: "u1", streak_freeze_balance: 1, streak_days: 1 });
    await repo.insertActiveDay("u1", "2026-01-13"); // قبل الفجوة
    await repo.insertActiveDay("u1", "2026-01-15"); // اليوم (الفجوة كانت 14)

    const result = await useStreakFreeze(repo, user, new Date("2026-01-15T06:00:00Z"));
    expect(result.ok).toBe(true);
    expect(user.streak_freeze_balance).toBe(0);
    // بعد ما نحمي 14، السلسلة تصير 13-14-15 متصلة = 3 أيام حقيقية
    expect(user.streak_days).toBe(3);

    expect(repo.streakFreezeUsage).toHaveLength(1);
    expect(repo.streakFreezeUsage[0].date_covered).toBe("2026-01-14");
  });

  it("تكامل مع streaks.ts: محطة Streak حقيقية (يوم 1) تمنح رصيد Freeze فعليًا", async () => {
    repo.streakMilestones = DEFAULT_MILESTONES;
    const user = makeUser({ id: "u1", streak_freeze_balance: 0 });
    await repo.saveUser(user);
    await recordActiveDay(repo, user, new Date("2026-01-15T06:00:00Z"));
    expect(user.streak_freeze_balance).toBe(1);
  });

  it("الرصيد لا يتجاوز الحد الأقصى حتى لو تحققت عدة محطات متتالية", async () => {
    repo.streakMilestones = DEFAULT_MILESTONES;
    const user = makeUser({ id: "u1", streak_freeze_balance: 0 });
    await repo.saveUser(user);
    // نبني سلسلة 7 أيام متتالية حقيقية -> يمر بمحطات 1، 3، 7 (3 محطات) لكن الحد الأقصى 2
    for (let d = 9; d <= 15; d++) {
      const date = new Date(`2026-01-${String(d).padStart(2, "0")}T06:00:00Z`);
      await recordActiveDay(repo, user, date);
    }
    expect(user.streak_freeze_balance).toBe(MAX_STREAK_FREEZE_BALANCE);
  });
});
