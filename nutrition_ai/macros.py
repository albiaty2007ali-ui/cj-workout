"""
Macro Engine — يحسب أهداف البروتين/الكارب/الدهون من نفس مخرجات calorie_calc.py.
مستقل تمامًا — لا AI يحسب هذي الأرقام، فقط صيغ ثابتة معروفة.
"""

# غرام بروتين لكل كيلوغرام وزن جسم، حسب الهدف (نطاقات شائعة في تغذية رياضية عامة)
PROTEIN_G_PER_KG = {"lose": 2.0, "maintain": 1.6, "gain": 1.8}
FAT_PERCENT_OF_CALORIES = 0.25
KCAL_PER_G_PROTEIN = 4
KCAL_PER_G_CARB = 4
KCAL_PER_G_FAT = 9


def calculate_targets(calorie_target: int, weight_kg: float, goal: str) -> dict:
    protein_g = round(PROTEIN_G_PER_KG.get(goal, 1.6) * weight_kg)
    protein_kcal = protein_g * KCAL_PER_G_PROTEIN

    fat_kcal = calorie_target * FAT_PERCENT_OF_CALORIES
    fat_g = round(fat_kcal / KCAL_PER_G_FAT)

    remaining_kcal = max(0, calorie_target - protein_kcal - fat_g * KCAL_PER_G_FAT)
    carbs_g = round(remaining_kcal / KCAL_PER_G_CARB)

    return {"protein_g": protein_g, "carbs_g": carbs_g, "fat_g": fat_g}


def protein_progress_ratio(consumed_protein: float, target_protein_g: int) -> float:
    if not target_protein_g:
        return 1.0
    return consumed_protein / target_protein_g
