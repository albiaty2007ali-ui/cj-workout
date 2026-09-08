import "dotenv/config";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp } from "../db/firestoreRepository.js";

const email = process.argv[2];
if (!email) {
  console.error("usage: vite-node makeAdmin.ts <email>");
  process.exit(1);
}

const db = getFirestore(getFirebaseApp());
const snap = await db.collection("users").where("email", "==", email).limit(1).get();
if (snap.empty) {
  console.error(`ماكو مستخدم بهذا الإيميل: ${email}`);
  process.exit(1);
}
await snap.docs[0]!.ref.update({ role: "admin" });
console.log(`✅ ${email} صار admin.`);
