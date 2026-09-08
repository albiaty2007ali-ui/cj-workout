/**
 * اختبار تكافؤ لـlevels.ts — يستخدم نفس جدول Level المزروع فعليًا بـlevels.py
 * (seed_default_levels)، والقيم المتوقعة من تشغيل nutrition_ai.levels.xp_progress() الحقيقي.
 */
import { describe, it, expect } from "vitest";
import { xpProgress, type LevelRecord } from "../levels.js";

const SEEDED_LEVELS: LevelRecord[] = [
  { level: 1, required_xp: 0, title: "البداية", reward: null },
  { level: 2, required_xp: 152, title: "مستوى 2", reward: null },
  { level: 3, required_xp: 290, title: "مستوى 3", reward: null },
  { level: 4, required_xp: 459, title: "مستوى 4", reward: null },
  { level: 5, required_xp: 657, title: "ملتزم", reward: null },
];

describe("xpProgress — تكافؤ حرفي مع nutrition_ai/levels.py", () => {
  it("xp=0 -> مستوى 1 (البداية)، يحتاج 152 للمستوى التالي", () => {
    expect(xpProgress(SEEDED_LEVELS, 0)).toEqual({
      level: 1, title: "البداية", xp: 0, current_level_xp: 0, next_level_xp: 152,
      progress_in_level: 0, span: 152, needed_for_next: 152, is_max_level: false,
    });
  });

  it("xp=5 -> لسا مستوى 1، باقي 147", () => {
    const r = xpProgress(SEEDED_LEVELS, 5);
    expect(r.level).toBe(1);
    expect(r.needed_for_next).toBe(147);
  });

  it("xp=500 -> مستوى 4، باقي 157 للمستوى 5", () => {
    expect(xpProgress(SEEDED_LEVELS, 500)).toEqual({
      level: 4, title: "مستوى 4", xp: 500, current_level_xp: 459, next_level_xp: 657,
      progress_in_level: 41, span: 198, needed_for_next: 157, is_max_level: false,
    });
  });

  it("جدول فاضي -> افتراضي آمن (مستوى 1، صفر اختراع)", () => {
    expect(xpProgress([], 999)).toEqual({ level: 1, title: "البداية", xp: 999, needed_for_next: null });
  });
});
