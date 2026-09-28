export type AchievementKind = "level" | "streak" | "longestStreak" | "meals" | "challenges";
export type CardFormat = "square" | "story";

export interface AchievementCardData {
  kind: AchievementKind;
  value: number;
  displayName: string;
  level: number;
  xp: number;
  dateLabel: string;
}

const HEADLINES: Record<AchievementKind, (v: number) => string> = {
  streak: (v) => `${v} DAY STREAK`,
  longestStreak: (v) => `${v} DAY STREAK`,
  level: (v) => `LEVEL ${v}`,
  meals: (v) => `${v} MEALS LOGGED`,
  challenges: (v) => `${v} CHALLENGES DONE`,
};
const ICONS: Record<AchievementKind, string> = {
  streak: "🔥", longestStreak: "🏔️", level: "⭐", meals: "🍽️", challenges: "🏆",
};

function themeColor(varName: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

/**
 * يرسم بطاقة إنجاز قابلة للمشاركة داخل canvas مُمرَّر — صفر مكتبة صور بالسيرفر (لا يوجد شي
 * مشابه بكل المشروع، راجع imageResize.ts للنمط الوحيد المتّبع: Canvas بالمتصفح بالكامل).
 * الألوان تُقرأ حيًا من الجذر المُثيَّم فعليًا (getComputedStyle) — يطابق ثيم المستخدم الحالي
 * تلقائيًا (فاتح/غامق/أي ثيم Premium) بدون خريطة ألوان JS مكرَّرة يلزم صيانتها مع styles.css.
 */
export function renderAchievementCard(canvas: HTMLCanvasElement, data: AchievementCardData, format: CardFormat): void {
  const w = 1080;
  const h = format === "story" ? 1920 : 1080;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const bg = themeColor("--bg", "#15140f");
  const surface = themeColor("--surface-solid", "#1b1a14");
  const heading = themeColor("--heading", "#f2ede2");
  const text = themeColor("--text", "#f2ede2");
  const textMuted = themeColor("--text-muted", "rgba(242,237,226,0.65)");
  const moss = themeColor("--moss", "#4c7a5e");
  const gold = themeColor("--gold", "#b98d4a");

  // خلفية بتدرّج بسيط
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, bg);
  grad.addColorStop(1, surface);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // عناصر زخرفية خفيفة جدًا (دوائر شفافة) — بدون ازدحام
  ctx.beginPath();
  ctx.arc(w * 0.88, h * 0.1, w * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = `${moss}20`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.08, h * 0.92, w * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = `${gold}18`;
  ctx.fill();

  const cx = w / 2;
  let y = h * (format === "story" ? 0.14 : 0.12);

  // شعار CJ WORKOUT
  ctx.textAlign = "center";
  ctx.fillStyle = textMuted;
  ctx.font = "600 34px system-ui, sans-serif";
  ctx.fillText("🥗 CJ WORKOUT", cx, y);

  // الأيقونة الكبيرة
  y += h * 0.14;
  ctx.font = `${Math.round(w * 0.18)}px system-ui, sans-serif`;
  ctx.fillText(ICONS[data.kind], cx, y);

  // العنوان الرئيسي (إنجليزي مقصود — نمط "ستيكر" مطابق لمثال الطلب نفسه)
  y += h * 0.11;
  ctx.fillStyle = heading;
  ctx.font = "800 68px system-ui, sans-serif";
  ctx.fillText(HEADLINES[data.kind](data.value), cx, y);

  // الاسم الظاهر (عربي، RTL) — صفر بريد/id، اسم ظاهر فقط
  y += h * 0.09;
  ctx.direction = "rtl";
  ctx.fillStyle = text;
  ctx.font = "700 48px system-ui, sans-serif";
  ctx.fillText(`"${data.displayName}"`, cx, y);

  // Level + XP
  y += h * 0.06;
  ctx.fillStyle = gold;
  ctx.font = "600 36px system-ui, sans-serif";
  ctx.direction = "rtl";
  ctx.fillText(`Level ${data.level} · ${data.xp.toLocaleString("en-US")} XP`, cx, y);

  // الشعار السفلي + التاريخ
  ctx.direction = "ltr";
  ctx.fillStyle = textMuted;
  ctx.font = "italic 500 32px system-ui, sans-serif";
  ctx.fillText("Keep going.", cx, h * 0.92);
  ctx.font = "400 24px system-ui, sans-serif";
  ctx.fillText(data.dateLabel, cx, h * 0.96);
}
