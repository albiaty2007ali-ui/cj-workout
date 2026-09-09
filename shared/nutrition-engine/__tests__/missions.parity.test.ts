/**
 * اختبارات missions.ts — كل فحص شرط مهمة يعتمد على behavior_daily الحقيقي فقط، وXP لا يُمنح
 * مرتين لنفس المهمة بنفس اليوم (idempotency عبر xp_transactions source المُتحقَّق أصلًا).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import { listMissionsForToday, claimMission } from "../missions.js";

describe("Missions اليومية — فحص حقيقي من behavior_daily، صفر ثقة بالفرونت إند", () => {
  let repo: InMemoryRepository;
  const now = new Date("2026-01-15T06:00:00Z");

  beforeEach(() => {
    repo = new InMemoryRepository();
  });

  it("بدون أي نشاط اليوم -> كل المهام غير مكتملة وغير مستلَمة", async () => {
    const list = await listMissionsForToday(repo, "u1", now);
    expect(list.every((m) => !m.completed && !m.claimed)).toBe(true);
  });

  it("يوم فيه وجبتين + بروتين وماي محقّقين -> كل المهام تصير مكتملة", async () => {
    await repo.upsertBehaviorDaily({
      user_id: "u1", date: "2026-01-15", meals_logged: 2,
      protein_hit_target: true, water_hit_target: true, logged_before_noon: true,
    });
    const list = await listMissionsForToday(repo, "u1", now);
    expect(list.every((m) => m.completed)).toBe(true);
    expect(list.every((m) => !m.claimed)).toBe(true);
  });

  it("claimMission تمنح XP فعليًا لو الشرط محقّق حقًا (مو بس يدّعيه الطلب)", async () => {
    const user = makeUser({ id: "u1", xp: 0 });
    await repo.saveUser(user);
    await repo.upsertBehaviorDaily({
      user_id: "u1", date: "2026-01-15", meals_logged: 1,
      protein_hit_target: false, water_hit_target: false, logged_before_noon: false,
    });
    const result = await claimMission(repo, user, "log_first_meal", now);
    expect(result.ok).toBe(true);
    expect(result.xp_awarded).toBe(5);
    expect(user.xp).toBe(5);
  });

  it("claimMission ترفض لو الشرط غير محقّق فعليًا (صفر ثقة بالفرونت إند)", async () => {
    const user = makeUser({ id: "u1", xp: 0 });
    await repo.saveUser(user);
    const result = await claimMission(repo, user, "hit_protein_target", now);
    expect(result.ok).toBe(false);
    expect(result.xp_awarded).toBe(0);
    expect(user.xp).toBe(0);
  });

  it("claimMission مرتين لنفس المهمة بنفس اليوم -> XP مرة وحدة بس (idempotent)", async () => {
    const user = makeUser({ id: "u1", xp: 0 });
    await repo.saveUser(user);
    await repo.upsertBehaviorDaily({
      user_id: "u1", date: "2026-01-15", meals_logged: 1,
      protein_hit_target: false, water_hit_target: false, logged_before_noon: false,
    });
    const first = await claimMission(repo, user, "log_first_meal", now);
    const second = await claimMission(repo, user, "log_first_meal", now);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false); // مستلَمة مسبقًا
    expect(user.xp).toBe(5); // مو 10
  });

  it("mission_id غير موجود -> رفض صريح", async () => {
    const user = makeUser({ id: "u1", xp: 0 });
    await repo.saveUser(user);
    const result = await claimMission(repo, user, "ghost_mission", now);
    expect(result.ok).toBe(false);
  });
});
