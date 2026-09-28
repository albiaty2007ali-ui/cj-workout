import { useI18n } from "../i18n/I18nContext";

/**
 * جدول مقارنة مجاني/Premium (حزمة الإحالة/Premium) — كل صف هنا مطابق لبوابة حقيقية موجودة
 * بالكود فعلًا (راجع vivid-sprouting-gadget.md's جدول الأدلة): 6 ثيمات premium
 * (settings.mts:79-82)، اليوم المرن ووضع السفر (intelligence.mts:136-139,154-155)، الإعلانات
 * (Daily/RecipesList/WeightProgress.tsx)، 6 وجبات مجانية (userStatus.ts's FREE_MEALS_CAP).
 * البطولة/الوصفات/التحديات/مساعد CJ تُعرَض ✓✓ صراحة لأنها فعلًا بلا قفل — صدق، مو حذف.
 */
interface Row { labelKey: Parameters<ReturnType<typeof useI18n>["t"]>[0]; free: boolean | string; premium: boolean | string; }

function Check({ value }: { value: boolean | string }) {
  if (typeof value === "string") return <span>{value}</span>;
  return value ? <span style={{ color: "var(--moss)" }}>✓</span> : <span style={{ color: "var(--text-muted)" }}>—</span>;
}

export default function PremiumComparisonTable() {
  const { t } = useI18n();

  const rows: Row[] = [
    { labelKey: "premiumCompare.rowChat", free: true, premium: true },
    { labelKey: "premiumCompare.rowRecipes", free: true, premium: true },
    { labelKey: "premiumCompare.rowChallenges", free: true, premium: true },
    { labelKey: "premiumCompare.rowTournament", free: true, premium: true },
    { labelKey: "premiumCompare.rowMeals", free: t("premiumCompare.rowMealsFree"), premium: t("premiumCompare.rowMealsPremium") },
    { labelKey: "premiumCompare.rowThemes", free: false, premium: true },
    { labelKey: "premiumCompare.rowRecoveryDay", free: false, premium: true },
    { labelKey: "premiumCompare.rowTravelMode", free: false, premium: true },
    { labelKey: "premiumCompare.rowAds", free: false, premium: true },
  ];

  return (
    <div className="premium-compare-card">
      <p className="premium-compare-crown" aria-hidden="true">👑</p>
      <p className="font-display" style={{ fontSize: "1.2rem", fontWeight: 700, textAlign: "center", margin: "4px 0 2px" }}>
        {t("premiumCompare.title")}
      </p>
      <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 0 }}>
        {t("premiumCompare.subtitle")}
      </p>
      <div className="premium-compare-table-wrap">
        <table className="premium-compare-table">
          <thead>
            <tr>
              <th>{t("premiumCompare.featureCol")}</th>
              <th>{t("premiumCompare.freeCol")}</th>
              <th>👑 {t("premiumCompare.premiumCol")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.labelKey}>
                <td>{t(row.labelKey)}</td>
                <td><Check value={row.free} /></td>
                <td><Check value={row.premium} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
