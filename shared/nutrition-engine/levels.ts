/**
 * منفذ من nutrition_ai/levels.py — يحوّل XP إلى مستوى/تقدّم اعتمادًا على جدول Level بقاعدة
 * البيانات. seed_default_levels غير منفَّذ هنا (بذر بيانات لمرة واحدة، ليس منطق أعمال).
 */

export interface LevelRecord {
  level: number;
  required_xp: number;
  title: string;
  reward: string | null;
}

export interface XpProgress {
  level: number;
  title: string;
  xp: number;
  current_level_xp?: number;
  next_level_xp?: number | null;
  progress_in_level?: number;
  span?: number | null;
  needed_for_next: number | null;
  is_max_level?: boolean;
}

export function xpProgress(levels: LevelRecord[], xp: number): XpProgress {
  if (levels.length === 0) {
    return { level: 1, title: "البداية", xp, needed_for_next: null };
  }

  const sorted = [...levels].sort((a, b) => a.level - b.level);
  let current = sorted[0];
  let nextLevel: LevelRecord | null = null;

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].required_xp <= xp) {
      current = sorted[i];
      nextLevel = i + 1 < sorted.length ? sorted[i + 1] : null;
    } else {
      break;
    }
  }

  const neededForNext = nextLevel ? nextLevel.required_xp - xp : null;
  const span = nextLevel ? nextLevel.required_xp - current.required_xp : null;
  const progressInLevel = xp - current.required_xp;

  return {
    level: current.level, title: current.title, xp,
    current_level_xp: current.required_xp,
    next_level_xp: nextLevel ? nextLevel.required_xp : null,
    progress_in_level: progressInLevel, span,
    needed_for_next: neededForNext, is_max_level: nextLevel === null,
  };
}
