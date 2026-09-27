/**
 * اختبارات pickNextInAppNotification (حزمة تطوير الإشعارات) — صفر تكرار لنفس id، سقف يومي،
 * فاصل زمني أدنى عام بين أي رسالتين.
 */
import { describe, it, expect } from "vitest";
import { pickNextInAppNotification, type InAppNotifEntry, type InAppNotifContext, MAX_PER_DAY, MIN_INTERVAL_MINUTES } from "../inAppNotifications.js";

const BASE_CTX: InAppNotifContext = {
  account_age_days: 10, is_premium: false, streak_days: 0, meals_logged_today: 0,
  water_ml: 0, water_target_ml: 2000, remaining_calories: 500, period: "noon",
};

const CATALOG: InAppNotifEntry[] = [
  { id: "a", category: "welcome", text: "A", condition: () => true },
  { id: "b", category: "xp", text: "B", condition: () => true },
  { id: "c", category: "streak", text: "C", condition: (ctx) => ctx.streak_days >= 5 },
];

describe("pickNextInAppNotification", () => {
  it("يختار أول رسالة مؤهَّلة غير معروضة سابقًا", () => {
    const picked = pickNextInAppNotification(CATALOG, [], BASE_CTX, new Date());
    expect(picked?.id).toBe("a");
  });

  it("لا يكرر id عُرض سابقًا أبدًا (مرة وحدة للأبد)", () => {
    const now = new Date();
    const shown = [{ id: "a", at: new Date(now.getTime() - 10 * 60 * 60 * 1000) }]; // قبل 10 ساعات (أبعد من الفاصل الأدنى)
    const picked = pickNextInAppNotification(CATALOG, shown, BASE_CTX, now);
    expect(picked?.id).toBe("b");
  });

  it("يتخطى رسالة شرطها غير محقَّق", () => {
    const picked = pickNextInAppNotification(CATALOG, [{ id: "a", at: new Date(Date.now() - 10 * 60 * 60 * 1000) }, { id: "b", at: new Date(Date.now() - 9 * 60 * 60 * 1000) }], BASE_CTX, new Date());
    expect(picked).toBeNull(); // c شرطها streak_days>=5 غير محقَّق بـBASE_CTX
  });

  it("السقف اليومي يوقف أي رسالة إضافية بعد الوصول له بنفس اليوم", () => {
    const now = new Date("2026-09-08T12:00:00Z");
    const shown = Array.from({ length: MAX_PER_DAY }, (_, i) => ({
      id: `old-${i}`, at: new Date(now.getTime() - (i + 1) * 5 * 60 * 60 * 1000),
    }));
    const picked = pickNextInAppNotification(CATALOG, shown, BASE_CTX, now);
    expect(picked).toBeNull();
  });

  it("الفاصل الزمني الأدنى يمنع رسالة ثانية قريبة جدًا من آخر رسالة", () => {
    const now = new Date();
    const shown = [{ id: "a", at: new Date(now.getTime() - (MIN_INTERVAL_MINUTES - 5) * 60 * 1000) }];
    const picked = pickNextInAppNotification(CATALOG, shown, BASE_CTX, now);
    expect(picked).toBeNull();
  });

  it("بعد مرور الفاصل الزمني الأدنى -> يسمح برسالة ثانية", () => {
    const now = new Date();
    const shown = [{ id: "a", at: new Date(now.getTime() - (MIN_INTERVAL_MINUTES + 5) * 60 * 1000) }];
    const picked = pickNextInAppNotification(CATALOG, shown, BASE_CTX, now);
    expect(picked?.id).toBe("b");
  });

  it("كل الكتالوج مُشاهَد -> null صريح، صفر اختلاق رسالة", () => {
    const now = new Date();
    const shown = [
      { id: "a", at: new Date(now.getTime() - 10 * 60 * 60 * 1000) },
    ];
    // b معروضة أيضًا بيوم سابق (صفر سقف يومي اليوم)
    const shownAll = [...shown, { id: "b", at: new Date(now.getTime() - 30 * 60 * 60 * 1000) }];
    const picked = pickNextInAppNotification(CATALOG, shownAll, BASE_CTX, now);
    expect(picked).toBeNull(); // c شرطها غير محقَّق أصلًا
  });
});
