/**
 * تشغيل مرة وحدة بعد نشر ميزة "جولة هلا بيك" — يعلّم كل المستخدمين الموجودين مسبقًا
 * intro_completed=true، حتى تظهر الجولة فقط للتسجيلات الجديدة فعليًا (بند الطلب الصريح:
 * "تجربة تظهر للمستخدم عند أول تسجيل دخول فقط" — مستخدم موجود مسبقًا مو "أول تسجيل دخول").
 * بدون هذا، كل مستخدم حالي كان راح يشوف الجولة فجأة بأول زيارة بعد النشر.
 *
 * Firestore ما يدعم "where(field, '==', undefined)" لإيجاد وثائق ناقصة حقل — نجيب كل المستخدمين
 * (مقبول هنا، سكربت لمرة وحدة على جدول صغير) ونفلتر يدويًا.
 */
import "dotenv/config";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp } from "../db/firestoreRepository.js";

const db = getFirestore(getFirebaseApp());

const allUsers = await db.collection("users").get();
const toUpdate = allUsers.docs.filter((d) => d.data().intro_completed === undefined);

console.log(`إجمالي المستخدمين: ${allUsers.size}، بدون intro_completed: ${toUpdate.length}`);

let updated = 0;
const BATCH_SIZE = 400;
for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
  const batch = db.batch();
  for (const doc of toUpdate.slice(i, i + BATCH_SIZE)) {
    batch.update(doc.ref, { intro_completed: true });
    updated++;
  }
  await batch.commit();
}

console.log(`✅ خلص: ${updated} مستخدم انعلّم intro_completed=true.`);
