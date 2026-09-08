/**
 * /api/profile — يعادل profile_bp.py's my_profile()+edit_profile() (GET بيانات + إحصائيات،
 * POST تعديل الاسم/اليوزرنيم/البايو). رفع الصور غير منفَّذ هنا بعد (يحتاج StorageService —
 * راجع NETLIFY_MIGRATION_AUDIT.md، خارج نطاق هذي الدفعة).
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import {
  FirestoreRepository, getFirebaseApp, getUserDisplayFields,
  findUserIdByUsername, updateUserDisplayFields,
} from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { xpProgress } from "../../shared/nutrition-engine/levels.js";
import { recentActiveDates, daysAbsent } from "../../shared/nutrition-engine/streaks.js";
import { todayBaghdadIso, addDaysIso } from "../../shared/nutrition-engine/iraqTime.js";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export default async (req: Request, _context: Context): Promise<Response> => {
  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  try {
    const db = getFirestore(getFirebaseApp());
    const repo = new FirestoreRepository();

    if (req.method === "GET") {
      const user = await repo.findUser(claims.sub);
      if (!user) return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");
      const display = await getUserDisplayFields(db, claims.sub);

      const [levels, mealsLogged, waterLogs, activeDates] = await Promise.all([
        repo.listLevels(),
        repo.countMealLogsForUser(claims.sub),
        repo.countWaterLogsForUser(claims.sub),
        recentActiveDates(repo, user, 30),
      ]);

      const today = todayBaghdadIso();
      const calendar = Array.from({ length: 30 }, (_, i) => {
        const offset = 29 - i;
        const date = addDaysIso(today, -offset);
        return { date, active: activeDates.has(date), is_today: offset === 0 };
      });

      return jsonOk({
        name: display?.name, username: display?.username, bio: display?.bio,
        photo_url: display?.photo_url, profile_visibility: display?.profile_visibility,
        xp: user.xp, streak_days: user.streak_days, longest_streak: user.longest_streak,
        days_absent: daysAbsent(user), progress: xpProgress(levels, user.xp),
        stats: { meals_logged: mealsLogged, water_logs: waterLogs, calendar },
      });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      const bio = typeof body.bio === "string" ? body.bio.trim() : "";

      const errors: Record<string, string> = {};
      if (name.length < 2) errors.name = "الاسم قصير جدًا";
      if (username && !USERNAME_RE.test(username)) {
        errors.username = "يوزرنيم صحيح: حروف/أرقام إنكليزية و_ فقط، 3-20 حرف";
      }
      if (username && !errors.username) {
        const existingId = await findUserIdByUsername(db, username);
        if (existingId && existingId !== claims.sub) errors.username = "اليوزرنيم هذا مستخدم من قبل";
      }
      if (bio.length > 300) errors.bio = "البايو طويل جدًا (حد أقصى 300 حرف)";

      if (Object.keys(errors).length > 0) {
        return jsonError(400, "VALIDATION_ERROR", "تحقق من الحقول.", errors);
      }

      // Firestore يرفض قيمة undefined صراحة (بعكس null) — null يمسح الحقل فعليًا، مطابق
      // لسلوك profile_bp.py الأصلي (username or None) بدل تجاهل الحقل الفاضي بصمت.
      await updateUserDisplayFields(db, claims.sub, { name, username: username || null, bio: bio || null });
      return jsonOk({ name, username: username || null, bio: bio || null });
    }

    return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET أو POST.");
  } catch (err) {
    console.error("profile error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
