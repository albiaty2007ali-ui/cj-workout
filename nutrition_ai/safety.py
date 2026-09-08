"""
Nutrition Safety Engine — كل رقم "حرج" (حد أدنى آمن للسعرات، تحديد عجز غير مناسب) يجي من هنا
كـConstants صريحة، وليس من تخمين أي طبقة ذكاء اصطناعي (ما فيه LLM أصلاً بهذا النظام).
calorie_calc.py يستخدم enforce_safe_target() كمصدر وحيد للحد الأدنى الآمن.
"""

# حد أدنى آمن لا يُسمح للنظام يهبط تحته أبدًا، بغض النظر عن اختيار المستخدم
MIN_SAFE_CALORIES = {"male": 1200, "female": 1000}

# أقصى عجز/فائض يومي عن TDEE نعتبره "مناسب بدون مراجعة مختص" (Fast Cut/Competition Mode مستقبلاً
# يمر من هنا قبل أي شيء آخر — لا يقرر بنفسه عجزًا أقسى من هذا)
MAX_SAFE_DEFICIT_KCAL = 750
MAX_SAFE_SURPLUS_KCAL = 700

SAFETY_WARNING_FLOOR = (
    "هدف السعرات المحسوب كان منخفض جدًا حسب بياناتك، فرفعناه للحد الآمن الأدنى. "
    "إذا تحتاج نزول أسرع، استشر مختص تغذية بدل تقليل السعرات بشكل كبير."
)
SAFETY_WARNING_DEFICIT_TOO_HIGH = (
    "الفرق بين هدفك وسعراتك اليومية كبير أكثر من اللازم لعجز آمن. عدّلناه لحد أكثر استدامة. "
    "عجز سريع جدًا يأثر على طاقتك وعضلك على المدى المتوسط."
)


def enforce_safe_target(target: float, tdee: float, sex: str, goal: str) -> tuple[int, str | None]:
    """يرجع (target_آمن, تحذير_أو_None). لا يسمح بتجاوز حدود السلامة مهما كان اختيار المستخدم."""
    floor = MIN_SAFE_CALORIES.get(sex, 1200)
    warning = None

    if target < floor:
        target = floor
        warning = SAFETY_WARNING_FLOOR
    elif goal == "lose" and (tdee - target) > MAX_SAFE_DEFICIT_KCAL:
        target = tdee - MAX_SAFE_DEFICIT_KCAL
        warning = SAFETY_WARNING_DEFICIT_TOO_HIGH
    elif goal == "gain" and (target - tdee) > MAX_SAFE_SURPLUS_KCAL:
        target = tdee + MAX_SAFE_SURPLUS_KCAL

    return round(target), warning


def is_recommendation_calorie_safe(candidate_kcal: int, remaining_kcal: int) -> bool:
    """يمنع اقتراح وجبة تدفع اليوم لعجز غير آمن حتى لو تقنيًا 'ضمن الباقي'."""
    return candidate_kcal <= max(remaining_kcal, 0) or remaining_kcal > -MAX_SAFE_DEFICIT_KCAL
