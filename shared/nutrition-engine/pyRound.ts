/**
 * تقريب متوافق مع round() الحقيقية بايثون (Round-Half-To-Even) — مستخرج كوحدة مشتركة لأن كل
 * حساب سعرات/ماكروز/BMR/TDEE بهذا المشروع يمر من round() بايثون أصلًا، والسعرات هي أقدس رقم هنا
 * (CLAUDE.md: "لا تُخترع، لا تُقرَّب اعتباطيًا").
 *
 * محاولة أولى بضرب/قسمة عائم مباشر (value*factor ثم مقارنة بتفاوت `1e-9`) فشلت فعليًا باختبار
 * Parity حقيقي: 1.1×1.5 تساوي بالضبط 1.6500000000000001 (IEEE-754، ليست 1.65 تمامًا) — بايثون
 * تقرّبها لـ1.7 (ليست Tie أصلًا)، لكن الضرب الإضافي بـ10 كان يراكم ضجيج عائم يجعلها *تبدو*
 * كـTie زائف فينحرف القرار لـ1.6 الخطأ. الحل: نعمل على التمثيل العشري الدقيق للقيمة الأصلية
 * مباشرة (toFixed(20) — كل عدد IEEE-754 double له امتداد عشري منتهٍ بالضبط) عبر BigInt، بدون
 * أي ضرب عائم إضافي يُدخل خطأ جديد. تحقّق: يعطي 1.7 لـ(1.1×1.5) و1.6 لـround(1.65,1) الحرفية —
 * يطابق Python تمامًا بكلا الحالتين (راجع __tests__/foodSearch.parity.test.ts).
 */
/**
 * يحاكي str(float) بايثون — Python يعرض float صحيح القيمة بلاحقة ".0" دائمًا ("78" -> "78.0"،
 * بعكس JS اللي ما يميّز بين 78 و78.0 كعدد واحد). ضروري لأي رقم مصدره عمود REAL/عملية float()
 * صريحة بالأصل بايثون (وزن مُدخَل عبر find_leading_number، أو أعمدة recipes.protein/carbs/fat)
 * قبل حقنه بنص رد — فرق حقيقي لوحظ أثناء اختبار Parity ضد orchestrator.py الفعلي، مو تجميل.
 */
export function pyFloatStr(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

export function pyRound(value: number, ndigits = 0): number {
  if (!Number.isFinite(value) || value === 0) return value;
  const negative = value < 0;
  const abs = Math.abs(value);

  const precise = abs.toFixed(20);
  const [intPart, fracPartRaw = ""] = precise.split(".");
  const keepDigits = fracPartRaw.slice(0, ndigits);
  const nextDigit = Number(fracPartRaw[ndigits] ?? "0");
  const hasMoreAfter = /[1-9]/.test(fracPartRaw.slice(ndigits + 1));

  let roundedInt = BigInt(intPart + keepDigits || "0");
  let roundUp: boolean;
  if (nextDigit > 5 || (nextDigit === 5 && hasMoreAfter)) {
    roundUp = true;
  } else if (nextDigit < 5) {
    roundUp = false;
  } else {
    roundUp = roundedInt % 2n !== 0n; // Tie حقيقي فقط هنا -> Round-Half-To-Even
  }
  if (roundUp) roundedInt += 1n;

  const divisor = 10 ** ndigits;
  const result = Number(roundedInt) / divisor;
  return negative ? -result : result;
}
