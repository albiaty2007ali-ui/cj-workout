/**
 * يحدّث حقل reward (شارة تجميلية بحتة) لمستويات SPECIAL_REWARDS المحددة بـseedFirestoreData.ts —
 * مطلوب لأن levels مزروعة أصلاً بالبيئة الحقيقية (seedIfEmpty ما يعيد الزرع)، فهذا سكربت تصحيح
 * صغير Idempotent (يكتب نفس القيمة بأي عدد تشغيلات) بدل حذف/إعادة زرع الجدول كامل.
 * شغّله بـ: npx vite-node shared/nutrition-engine/scripts/patchLevelRewards.ts
 */
import "dotenv/config";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp } from "../db/firestoreRepository.js";

const SPECIAL_REWARDS: Record<number, { badge_icon: string; badge_title: string }> = {
  5: { badge_icon: "🥉", badge_title: "شارة الالتزام" },
  10: { badge_icon: "🥈", badge_title: "شارة الاستمرارية" },
  20: { badge_icon: "🥇", badge_title: "شارة الانضباط" },
  30: { badge_icon: "🏆", badge_title: "شارة الاحتراف" },
};

const db = getFirestore(getFirebaseApp());

let updated = 0;
for (const [levelStr, reward] of Object.entries(SPECIAL_REWARDS)) {
  const ref = db.collection("levels").doc(levelStr);
  const doc = await ref.get();
  if (!doc.exists) {
    console.warn(`  ⚠️ مستوى ${levelStr} غير موجود بالجدول، تخطّي.`);
    continue;
  }
  await ref.update({ reward });
  updated++;
  console.log(`  ✅ مستوى ${levelStr}: ${reward.badge_icon} ${reward.badge_title}`);
}

console.log(`\nخلص: ${updated} مستوى انحدّث بمكافأة تجميلية.`);
