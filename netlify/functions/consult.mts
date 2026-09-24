/**
 * GET /api/consult — رابط "استشارة مختص" (منقول من templates/chat.html's مودال WhatsApp
 * الثابت بالـFlask القديم، غير موجود سابقًا بالـReact/Netlify). يعيد استخدام نفس
 * SUPPORT_WHATSAPP_NUMBER ونمط buildWhatsappLink المستخدمين أصلاً بـsubscribe.mts.
 */
import type { Context } from "@netlify/functions";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { buildWhatsappLink } from "../../shared/nutrition-engine/whatsapp.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const link = buildWhatsappLink(process.env.SUPPORT_WHATSAPP_NUMBER, "هلا، أحتاج استشارة غذائية من CJ FOOD.");
  return jsonOk({ whatsapp_link: link });
};
