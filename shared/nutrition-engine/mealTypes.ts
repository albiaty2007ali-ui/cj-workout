/**
 * أنواع الوجبة قيد الإنشاء (PendingMeal/PendingItem) — كانت مُعرَّفة داخل corrections.ts، نُقلت
 * هنا عند حذف محرك الشات القديم (corrections.ts كان منطق تصحيح نصي محلي، حُذف بالكامل) لأن
 * directLog.ts وorchestrator.ts (finalizeMeal وما يشاركها — يخدمان أيضًا "+ إضافة وجبة يدويًا"
 * بـDaily.tsx وميزات غير-شات ثانية) يحتاجان هذي الأنواع، وهما يبقيان بعد إزالة الشات القديم.
 */
export interface PendingItem {
  food_id: number;
  food_name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  quantity?: number;
  unit_grams?: number;
  portion_name?: string;
}

export interface PendingMeal {
  meal_type: string;
  raw_text: string;
  items: PendingItem[];
  pending_clarifications: unknown[];
  state?: string;
}
