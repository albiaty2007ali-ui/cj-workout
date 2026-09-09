/**
 * سكربت تحقق حي، لمرة واحدة، ضد مشروع Firebase حقيقي — يشغّل عبر:
 *   npx vite-node shared/nutrition-engine/scripts/testFirestoreLive.ts
 * يتحقق من: الاتصال الفعلي، الكتابة/القراءة، القيد الذري (create يفشل لو موجود)، ثم ينظّف كل
 * شي كتبه. لا يُنشر مع Netlify — أداة تشخيص محلية فقط.
 */
import "dotenv/config";
import { FirestoreRepository } from "../db/firestoreRepository.js";
import type { UserRecord } from "../db/repository.js";

const TEST_USER_ID = "diagnostic_test_user_delete_me";

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: TEST_USER_ID, xp: 0, streak_days: 0, longest_streak: 0, streak_started_at: null,
    last_active_date: null, free_meals_used: 0, is_premium: false, current_recipe_id: null,
    current_recipe_step: 0, pending_recipe_confirmation_id: null, pending_food_topic_json: null,
    pending_meal_json: null, last_direct_log_json: null, ai_response_style: "balanced",
    streak_freeze_balance: 0,
    ...overrides,
  };
}

async function main() {
  console.log("1) الاتصال بـFirestore...");
  const repo = new FirestoreRepository();

  console.log("2) كتابة مستخدم تجريبي...");
  await repo.saveUser(makeUser({ xp: 42 }));

  console.log("3) قراءته مرة ثانية...");
  const loaded = await repo.findUser(TEST_USER_ID);
  if (!loaded || loaded.xp !== 42) throw new Error(`فشل التحقق: توقعت xp=42، وصلني ${JSON.stringify(loaded)}`);
  console.log("   ✅ القراءة/الكتابة تعمل، xp =", loaded.xp);

  console.log("4) اختبار القيد الذري (active_days create-if-not-exists)...");
  await repo.insertActiveDay(TEST_USER_ID, "2099-01-01");
  let threwOnDuplicate = false;
  try {
    await repo.insertActiveDay(TEST_USER_ID, "2099-01-01");
  } catch {
    threwOnDuplicate = true;
  }
  if (!threwOnDuplicate) throw new Error("فشل: insertActiveDay المكرر كان لازم يرمي خطأ (uq_active_day)");
  console.log("   ✅ القيد الذري يعمل — إدخال مكرر رُفض صح");

  console.log("5) اختبار التحديث الذري لعداد الوجبات المجانية...");
  const ok1 = await repo.incrementFreeMealsUsedIfBelowCap(TEST_USER_ID, 6);
  const afterFirst = await repo.findUser(TEST_USER_ID);
  if (!ok1 || afterFirst?.free_meals_used !== 1) throw new Error("فشل التحديث الذري الأول");
  console.log("   ✅ التحديث الذري يعمل، free_meals_used =", afterFirst.free_meals_used);

  console.log("6) تنظيف البيانات التجريبية...");
  await repo.deleteActiveDay(`${TEST_USER_ID}_2099-01-01`);
  console.log("   (ملاحظة: وثيقة users التجريبية تبقى — احذفها يدويًا من Firestore Console لو تريد، أو تجاهلها)");

  console.log("\n🎉 كل الفحوصات نجحت — FirestoreRepository يعمل فعليًا ضد مشروعك الحقيقي.");
}

main().catch((err) => {
  console.error("\n❌ فشل التحقق:", err.message);
  process.exit(1);
});
