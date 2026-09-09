/**
 * اختبار تكافؤ لـlevels.ts — يستخدم نفس جدول Level المزروع فعليًا بـlevels.py
 * (seed_default_levels)، والقيم المتوقعة من تشغيل nutrition_ai.levels.xp_progress() الحقيقي.
 * زائد: مكافآت XP التجميلية (badge_icon/badge_title) — عرض فقط، صفر تأثير على الحساب نفسه.
 */
import { describe, it, expect } from "vitest";
import { xpProgress, type LevelRecord } from "../levels.js";

const SEEDED_LEVELS: LevelRecord[] = [
  { level: 1, required_xp: 0, title: "البداية", reward: null },
  { level: 2, required_xp: 152, title: "مستوى 2", reward: null },
  { level: 3, required_xp: 290, title: "مستوى 3", reward: null },
  { level: 4, required_xp: 459, title: "مستوى 4", reward: null },
  { level: 5, required_xp: 657, title: "ملتزم", reward: { badge_icon: "🥉", badge_title: "شارة الالتزام" } },
];

describe("xpProgress — تكافؤ حرفي مع nutrition_ai/levels.py", () => {
  it("xp=0 -> مستوى 1 (البداية)، يحتاج 152 للمستوى التالي", () => {
    expect(xpProgress(SEEDED_LEVELS, 0)).toEqual({
      level: 1, title: "البداية", xp: 0, current_level_xp: 0, next_level_xp: 152,
      progress_in_level: 0, span: 152, needed_for_next: 152, is_max_level: false,
      badge_icon: null, badge_title: null,
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
      badge_icon: null, badge_title: null,
    });
  });

  it("جدول فاضي -> افتراضي آمن (مستوى 1، صفر اختراع)", () => {
    expect(xpProgress([], 999)).toEqual({ level: 1, title: "البداية", xp: 999, needed_for_next: null });
  });

  it("xp=700 -> مستوى 5 (ملتزم)، شارة تجميلية حقيقية من الجدول", () => {
    const r = xpProgress(SEEDED_LEVELS, 700);
    expect(r.level).toBe(5);
    expect(r.badge_icon).toBe("🥉");
    expect(r.badge_title).toBe("شارة الالتزام");
  });

  it("مستوى بدون reward -> badge_icon/badge_title كلاهما null، صفر اختراع", () => {
    const r = xpProgress(SEEDED_LEVELS, 300);
    expect(r.level).toBe(3);
    expect(r.badge_icon).toBeNull();
    expect(r.badge_title).toBeNull();
  });
});
