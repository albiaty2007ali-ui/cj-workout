/** عميل API رقيق — كل الطلبات مع credentials:"include" حتى تُرفق كوكي الجلسة تلقائيًا. */

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: Record<string, string> | null } | null;
}

/**
 * لا نرمي أبدًا — انقطاع الشبكة، السيرفر غير متوفر (Vite Proxy يرجّع صفحة HTML لا JSON بهذي
 * الحالة)، أو استجابة غير متوقعة كلها تتحول لنفس شكل ApiResponse الفاشل، حتى الصفحات المستدعية
 * تتعامل معها بمسار واحد بسيط (success:false) بدل try/catch متكرر بكل مكان.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`/api${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as ApiResponse<T>;
    } catch {
      return { success: false, data: null, error: { code: "BAD_RESPONSE", message: "استجابة غير صالحة من السيرفر." } };
    }
  } catch {
    return { success: false, data: null, error: { code: "NETWORK_ERROR", message: "تعذّر الاتصال بالسيرفر." } };
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
};

export interface MeResponse {
  id: string;
  role: string;
  name: string;
  username: string | null;
  xp: number;
  streak_days: number;
  longest_streak: number;
  is_premium: boolean;
  free_meals_remaining: number;
  trial_exhausted: boolean;
  onboarding_completed: boolean;
  intro_completed: boolean;
  profile: { calorie_target: number; water_target_ml: number } | null;
}

export interface ChatReply {
  reply: string | null;
  meal_logged: boolean;
  today_calories?: number;
  target_calories?: number;
  remaining?: number;
  xp?: number;
  free_meals_used?: number;
}
