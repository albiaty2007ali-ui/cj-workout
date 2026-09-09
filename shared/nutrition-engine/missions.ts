/**
 * Missions — مهام يومية بسيطة (المرحلة 2 من ذكاء Captain CJ). عمدًا صفر مجموعة Firestore جديدة
 * لتتبّع التقدّم: كل مهمة تُفحَص مباشرة من `behavior_daily` الحقيقي (Phase 1) — نفس مصدر
 * الحقيقة، صفر عداد منفصل يمكن أن ينحرف عنه. الاستثناء الوحيد المخزَّن هو "استُلمت XP لهذي
 * المهمة اليوم؟"، وهذا أصلاً موجود جاهز عبر xp_transactions (findXpTransactionBySource) — صفر
 * بنية بيانات إضافية حتى لهذا.
 */
import type { Repository, UserRecord, BehaviorDailyRecord } from "./db/repository.js";
import * as xpEngine from "./xpEngine.js";
import { todayBaghdadIso } from "./iraqTime.js";

export interface MissionDef {
  id: string;
  title: string;
  description: string;
  xp_reward: number;
}

export interface MissionStatus extends MissionDef {
  completed: boolean;
  claimed: boolean;
}

export const MISSION_DEFS: MissionDef[] = [
  { id: "log_first_meal", title: "سجّل أول وجبة", description: "سجّل أي وجبة أكلتها اليوم", xp_reward: 5 },
  { id: "log_two_meals", title: "أكمل وجبتين", description: "سجّل وجبتين أو أكثر اليوم", xp_reward: 8 },
  { id: "hit_protein_target", title: "حقق هدف البروتين", description: "وصّل مجموع بروتين اليوم لهدفك", xp_reward: 10 },
  { id: "hit_water_target", title: "أكمل هدف الماي", description: "اشرب كمية الماي المستهدفة اليوم", xp_reward: 5 },
];

function checkMission(id: string, behavior: BehaviorDailyRecord | null): boolean {
  if (!behavior) return false;
  switch (id) {
    case "log_first_meal": return behavior.meals_logged >= 1;
    case "log_two_meals": return behavior.meals_logged >= 2;
    case "hit_protein_target": return behavior.protein_hit_target;
    case "hit_water_target": return behavior.water_hit_target;
    default: return false;
  }
}

function missionSource(userId: string, missionId: string, today: string): string {
  return `mission_completed_${userId}_${missionId}_${today}`;
}

export async function listMissionsForToday(repo: Repository, userId: string, now: Date = new Date()): Promise<MissionStatus[]> {
  const today = todayBaghdadIso(now);
  const behavior = await repo.findBehaviorDaily(userId, today);
  const out: MissionStatus[] = [];
  for (const def of MISSION_DEFS) {
    const completed = checkMission(def.id, behavior);
    const claimed = await repo.findXpTransactionBySource(userId, missionSource(userId, def.id, today));
    out.push({ ...def, completed, claimed });
  }
  return out;
}

/** يعيد فحص الشرط فعليًا بالباك اند قبل المنح — صفر ثقة بأي "completed" يرسله الفرونت إند. */
export async function claimMission(
  repo: Repository, user: UserRecord, missionId: string, now: Date = new Date(),
): Promise<{ ok: boolean; xp_awarded: number }> {
  const def = MISSION_DEFS.find((m) => m.id === missionId);
  if (!def) return { ok: false, xp_awarded: 0 };

  const today = todayBaghdadIso(now);
  const behavior = await repo.findBehaviorDaily(user.id, today);
  if (!checkMission(missionId, behavior)) return { ok: false, xp_awarded: 0 };

  const source = missionSource(user.id, missionId, today);
  const granted = await xpEngine.awardXp(repo, user, def.xp_reward, "mission_completed", source);
  if (granted) await repo.saveUser(user);
  return { ok: granted, xp_awarded: granted ? def.xp_reward : 0 };
}
