/**
 * اختبارات تكافؤ لـxpEngine.ts/streaks.ts — القيم المتوقعة مأخوذة من تشغيل حقيقي لـ
 * nutrition_ai/xp_engine.py + nutrition_ai/streaks.py عبر تطبيق Flask+SQLAlchemy حقيقي
 * بالذاكرة (نفس نمط tests/conftest.py)، وليس افتراضًا نظريًا:
 *
 *   award xp1: True award xp2 (dup): False xp now: 10
 *   xp after reverse: 0
 *   day1 snapshot: is_new_day=True, milestones=[{days:1, label:"أول يوم 🔥", xp_reward:5}]
 *   streak_days: 1 longest: 1 xp: 5
 *   day1 again is_new_day: False streak_days: 1
 *   after gap (day1 backdated -2), streak_days: 1 longest: 1
 *   days_absent (active today): 0
 *
 * يستخدم InMemoryRepository (محاكي بالذاكرة) بدل Postgres حقيقي — يطبّق نفس القيود المنطقية.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRepository, DEFAULT_MILESTONES } from "../db/inMemoryRepository.js";
import * as xpEngine from "../xpEngine.js";
import * as streaks from "../streaks.js";
import { makeUser } from "./testHelpers.js";
import type { UserRecord } from "../db/repository.js";

describe("xpEngine — تكافؤ حرفي مع xp_engine.py", () => {
  let repo: InMemoryRepository;
  let user: UserRecord;

  beforeEach(() => {
    repo = new InMemoryRepository();
    user = makeUser();
  });

  it("منح XP بـsource معيّن، تكراره يُتجاهل (Idempotency) — نفس نتيجة Python بالضبط", async () => {
    const r1 = await xpEngine.awardXp(repo, user, 10, "meal_logged", "meal1");
    const r2 = await xpEngine.awardXp(repo, user, 10, "meal_logged", "meal1");
    expect(r1).toBe(true);
    expect(r2).toBe(false);
    expect(user.xp).toBe(10);
  });

  it("reverseXp يرجع XP للصفر بعد المنح", async () => {
    await xpEngine.awardXp(repo, user, 10, "meal_logged", "meal1");
    await xpEngine.reverseXp(repo, user, 10, "meal_logged", "meal1");
    expect(user.xp).toBe(0);
  });

  it("XP لا ينزل تحت الصفر أبدًا (Math.max(0, ...))", async () => {
    await xpEngine.awardXp(repo, user, 5, "x", "s1");
    await xpEngine.awardXp(repo, user, -100, "y", "s2");
    expect(user.xp).toBe(0);
  });
});

describe("streaks — تكافؤ حرفي مع streaks.py", () => {
  let repo: InMemoryRepository;
  let user: UserRecord;
  const day1 = new Date("2026-09-08T10:00:00Z"); // بغداد 13:00 يوم 8

  beforeEach(() => {
    repo = new InMemoryRepository();
    repo.streakMilestones = DEFAULT_MILESTONES;
    user = makeUser();
  });

  it("يوم أول: streak=1, longest=1, milestone 'أول يوم' يُمنح (+5 XP)", async () => {
    const snap = await streaks.recordActiveDay(repo, user, day1);
    expect(snap.is_new_day).toBe(true);
    expect(snap.new_milestones).toEqual([{ days: 1, label: "أول يوم 🔥", xp_reward: 5 }]);
    expect(user.streak_days).toBe(1);
    expect(user.longest_streak).toBe(1);
    expect(user.xp).toBe(5);
  });

  it("نفس اليوم مرة ثانية -> is_new_day=false، صفر تغيير بالستريك", async () => {
    await streaks.recordActiveDay(repo, user, day1);
    const snap2 = await streaks.recordActiveDay(repo, user, day1);
    expect(snap2.is_new_day).toBe(false);
    expect(user.streak_days).toBe(1);
  });

  it("فجوة يوم (تخطي يوم) -> الستريك يرجع لـ1 بدل ما يزيد", async () => {
    await streaks.recordActiveDay(repo, user, day1);
    const dayAfterGap = new Date("2026-09-10T10:00:00Z"); // بغداد يوم 10 (تخطينا يوم 9)
    await streaks.recordActiveDay(repo, user, dayAfterGap);
    expect(user.streak_days).toBe(1);
    expect(user.longest_streak).toBe(1);
  });

  it("يوم متتالي حقيقي (بدون فجوة) -> الستريك يزيد فعليًا", async () => {
    await streaks.recordActiveDay(repo, user, day1);
    const day2 = new Date("2026-09-09T10:00:00Z");
    const snap2 = await streaks.recordActiveDay(repo, user, day2);
    expect(user.streak_days).toBe(2);
    expect(user.longest_streak).toBe(2);
    expect(snap2.new_milestones).toEqual([]); // أول milestone بعد 3 أيام فقط
  });

  it("undoActiveDay يرجّع كل شي لحالته قبل التسجيل", async () => {
    const snap = await streaks.recordActiveDay(repo, user, day1);
    await streaks.undoActiveDay(repo, user, snap);
    expect(user.streak_days).toBe(0);
    expect(user.longest_streak).toBe(0);
    expect(user.last_active_date).toBeNull();
    expect(await repo.findActiveDay(user.id, "2026-09-08")).toBeNull();
  });

  it("daysAbsent: نشط اليوم نفسه -> 0", async () => {
    await streaks.recordActiveDay(repo, user, day1);
    expect(streaks.daysAbsent(user, day1)).toBe(0);
  });

  it("daysAbsent: بدون أي نشاط سابق -> 0", () => {
    expect(streaks.daysAbsent(user, day1)).toBe(0);
  });
});
