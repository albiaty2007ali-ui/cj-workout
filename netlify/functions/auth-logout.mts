/** POST /api/auth/logout — يمسح كوكي الجلسة. لا Server-side session store لمسحه (JWT عديم الحالة). */
import type { Context, Config } from "@netlify/functions";
import { buildLogoutCookie } from "../../shared/nutrition-engine/auth.js";
import { jsonOk } from "../../shared/nutrition-engine/httpResponse.js";

export default async (_req: Request, _context: Context): Promise<Response> => {
  return jsonOk({ ok: true }, { headers: { "Set-Cookie": buildLogoutCookie() } });
};

export const config: Config = { path: "/.netlify/functions/auth-logout" };
