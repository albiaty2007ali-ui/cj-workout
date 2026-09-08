/**
 * شكل استجابة API موحّد — نفس التصميم الموثّق بـNETLIFY_MIGRATION_AUDIT.md (قسم API MIGRATION
 * PLAN): {success, data, error}. Errors لا تكشف Stack Trace أبدًا للمستخدم.
 */

export function jsonOk(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify({ success: true, data, error: null }), {
    status: 200,
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export function jsonError(
  status: number, code: string, message: string,
  details?: Record<string, string>, init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify({ success: false, data: null, error: { code, message, details: details ?? null } }), {
    status,
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}
