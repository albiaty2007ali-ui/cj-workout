/**
 * منفذ حرفي من iraq_time.py — يحدد فترة اليوم من توقيت بغداد الفعلي (مو وقت السيرفر). Node's
 * Intl يحمل بيانات IANA tz كاملة داخليًا (ICU) — بعكس بايثون على Windows اللي احتاجت حزمة
 * tzdata خارجية بهذا المشروع فعليًا (لوحظ أثناء الهجرة) — صفر تبعية خارجية هنا للمقابل.
 */

export const BAGHDAD_TZ = "Asia/Baghdad";

// كل فترة: [ساعة البداية شاملة, ساعة النهاية شاملة]
export const PERIOD_BOUNDARIES: Record<string, [number, number]> = {
  morning: [5, 10], // 05:00–10:59
  noon: [11, 16], // 11:00–16:59
  evening: [17, 23], // 17:00–23:59
  late_night: [0, 4], // 00:00–04:59
};

export const PERIOD_TO_MEAL: Record<string, string> = {
  morning: "breakfast",
  noon: "lunch",
  evening: "dinner",
  late_night: "dinner", // نفترض العشاء لسا الميعاد المناسب للسؤال عنه، بأسلوب مختلف
};

export interface BaghdadParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
}

function baghdadParts(date: Date = new Date()): BaghdadParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: BAGHDAD_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const hour24 = Number(get("hour")) % 24; // بعض محركات Intl ترجع "24" لمنتصف الليل بدل "00"
  return {
    year: Number(get("year")), month: Number(get("month")), day: Number(get("day")),
    hour: hour24, minute: Number(get("minute")), second: Number(get("second")),
  };
}

/** يرجّع مكوّنات الوقت الحالي بتوقيت بغداد (بديل عن datetime بايثون، المستهلكون هنا يحتاجون الحقول فقط). */
export function nowBaghdad(date: Date = new Date()): BaghdadParts {
  return baghdadParts(date);
}

export function getCurrentPeriod(date: Date = new Date()): string {
  const { hour } = baghdadParts(date);
  for (const [period, [start, end]] of Object.entries(PERIOD_BOUNDARIES)) {
    if (start <= end) {
      if (hour >= start && hour <= end) return period;
    } else if (hour >= start || hour <= end) {
      return period; // نطاق يلف منتصف الليل (غير مستخدم حاليًا لكن جاهز)
    }
  }
  return "evening";
}

export function relevantMealForPeriod(period: string): string {
  return PERIOD_TO_MEAL[period] ?? "dinner";
}

/** تاريخ اليوم البغدادي كسلسلة "YYYY-MM-DD" — يطابق تخزين عمود Date بايثون (date().isoformat()). */
export function todayBaghdadIso(date: Date = new Date()): string {
  const { year, month, day } = baghdadParts(date);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** يضيف/يطرح أيام من تاريخ ISO "YYYY-MM-DD" بدون أي التباس منطقة زمنية (حساب تقويمي بحت). */
export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${String(dt.getUTCFullYear()).padStart(4, "0")}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** فرق الأيام (a - b) بين تاريخين ISO "YYYY-MM-DD". */
export function diffDaysIso(isoA: string, isoB: string): number {
  const [ay, am, ad] = isoA.split("-").map(Number);
  const [by, bm, bd] = isoB.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((a - b) / (24 * 60 * 60 * 1000));
}
