"""
بيانات البذرة الأولية لقاعدة CJ WORKOUT المحلية.
كل القيم تقديرات واقعية شائعة (CJ_WORKOUT source) لحين استيراد ملف USDA الرسمي.
is_bulk=True يعني: هذا الطعام لا يُفترض له كمية أبدًا — لازم portion أو غرامات صريحة بالرسالة،
وإلا يُطلب من المستخدم التوضيح (مطابق لقاعدة "لا تفترض الكمية").
"""

FOODS_SEED = [
    # ---------------- بيض وألبان (Discrete — المفرد/المثنى يحدد العدد لغويًا) ----------------
    {
        "name": "بيضة", "category": "بيض وألبان", "is_bulk": False,
        "nutrients_per_100g": {"calories": 155, "protein": 13, "carbs": 1.1, "fat": 11, "fiber": 0},
        "aliases": [
            {"text": "بيضة", "multiplier": 1}, {"text": "بيضه", "multiplier": 1},
            {"text": "بيضتين", "multiplier": 2}, {"text": "بيضتان", "multiplier": 2},
            {"text": "بيض", "multiplier": 1},
            {"text": "بيضات", "multiplier": 1, "is_plural_unspecified": True},
            {"text": "egg", "multiplier": 1}, {"text": "eggs", "multiplier": 1},
        ],
        "portions": [{"name": "حبة", "grams": 50}],
    },
    {
        "name": "جبن", "category": "بيض وألبان", "is_bulk": False,
        "nutrients_per_100g": {"calories": 280, "protein": 20, "carbs": 3, "fat": 21, "fiber": 0},
        "aliases": [{"text": "جبن", "multiplier": 1}, {"text": "جبنة", "multiplier": 1}, {"text": "قطعة جبن", "multiplier": 1}],
        "portions": [{"name": "شريحة", "grams": 30}],
    },
    {
        "name": "لبن", "category": "بيض وألبان", "is_bulk": False,
        "nutrients_per_100g": {"calories": 60, "protein": 3.5, "carbs": 4.7, "fat": 3.3, "fiber": 0},
        "aliases": [{"text": "لبن", "multiplier": 1}, {"text": "زبادي", "multiplier": 1}, {"text": "روب", "multiplier": 1}],
        "portions": [{"name": "كوب", "grams": 200}],
    },
    {
        "name": "حليب", "category": "بيض وألبان", "is_bulk": False,
        "nutrients_per_100g": {"calories": 60, "protein": 3.2, "carbs": 4.8, "fat": 3.2, "fiber": 0},
        "aliases": [{"text": "حليب", "multiplier": 1}],
        "portions": [{"name": "كوب", "grams": 240}],
    },
    {
        "name": "قيمر", "category": "بيض وألبان", "is_bulk": False,
        "nutrients_per_100g": {"calories": 350, "protein": 3, "carbs": 3, "fat": 36, "fiber": 0},
        "aliases": [{"text": "قيمر", "multiplier": 1}, {"text": "كيمر", "multiplier": 1}],
        "portions": [{"name": "ملعقتين", "grams": 30}],
    },

    # ---------------- خبز ونشويات ----------------
    {
        "name": "صمون", "category": "خبز", "is_bulk": False,
        "nutrients_per_100g": {"calories": 275, "protein": 9, "carbs": 53, "fat": 2.5, "fiber": 2},
        "aliases": [
            {"text": "صمون", "multiplier": 1}, {"text": "صمونة", "multiplier": 1}, {"text": "خبز صمون", "multiplier": 1},
            {"text": "رغيف صمون", "multiplier": 1}, {"text": "صمونتين", "multiplier": 2},
        ],
        "portions": [{"name": "رغيف", "grams": 65}],
    },
    {
        "name": "خبز عربي", "category": "خبز", "is_bulk": False,
        "nutrients_per_100g": {"calories": 270, "protein": 9, "carbs": 55, "fat": 1.5, "fiber": 2.4},
        "aliases": [
            {"text": "خبز عربي", "multiplier": 1}, {"text": "خبز", "multiplier": 1},
            {"text": "خبز تنور", "multiplier": 1}, {"text": "رغيف خبز", "multiplier": 1},
        ],
        "portions": [{"name": "رغيف", "grams": 90}],
    },
    {
        "name": "تمن (رز)", "category": "نشويات", "is_bulk": True,
        "nutrients_per_100g": {"calories": 130, "protein": 2.4, "carbs": 28, "fat": 0.3, "fiber": 0.4},
        "aliases": [
            {"text": "تمن", "multiplier": 1}, {"text": "رز", "multiplier": 1},
            {"text": "الرز", "multiplier": 1}, {"text": "تمن ابيض", "multiplier": 1},
        ],
        "portions": [
            {"name": "خاشوقة", "grams": 15}, {"name": "صحن صغير", "grams": 150},
            {"name": "صحن متوسط", "grams": 250}, {"name": "صحن كبير", "grams": 350},
            {"name": "كوب مطبوخ", "grams": 180},
        ],
    },
    {
        "name": "معكرونة", "category": "نشويات", "is_bulk": True,
        "nutrients_per_100g": {"calories": 158, "protein": 5.8, "carbs": 31, "fat": 0.9, "fiber": 1.8},
        "aliases": [{"text": "معكرونة", "multiplier": 1}, {"text": "مكرونة", "multiplier": 1}, {"text": "باستا", "multiplier": 1}],
        "portions": [{"name": "صحن صغير", "grams": 150}, {"name": "صحن متوسط", "grams": 220}],
    },
    {
        "name": "بطاطا مقلية", "category": "نشويات", "is_bulk": True,
        "nutrients_per_100g": {"calories": 312, "protein": 3.4, "carbs": 41, "fat": 15, "fiber": 3.8},
        "aliases": [{"text": "بطاطا مقلية", "multiplier": 1}, {"text": "چبس", "multiplier": 1}, {"text": "بطاطة مقلية", "multiplier": 1}],
        "portions": [{"name": "حصة صغيرة", "grams": 80}, {"name": "حصة متوسطة", "grams": 150}],
    },
    {
        "name": "بطاطا مسلوقة", "category": "نشويات", "is_bulk": False,
        "nutrients_per_100g": {"calories": 87, "protein": 1.9, "carbs": 20, "fat": 0.1, "fiber": 1.8},
        "aliases": [{"text": "بطاطا مسلوقة", "multiplier": 1}, {"text": "بطاطة مسلوقة", "multiplier": 1}],
        "portions": [{"name": "حبة متوسطة", "grams": 170}],
    },

    # ---------------- أكلات عراقية رئيسية (Bulk — تحتاج توضيح كمية) ----------------
    {
        "name": "دولمة", "category": "أكلات عراقية", "is_bulk": True,
        "nutrients_per_100g": {"calories": 145, "protein": 4, "carbs": 17, "fat": 6.5, "fiber": 2},
        "aliases": [{"text": "دولمة", "multiplier": 1}, {"text": "دولما", "multiplier": 1}, {"text": "دولمه", "multiplier": 1}],
        "portions": [{"name": "حبة", "grams": 60}],
    },
    {
        "name": "تشريب", "category": "أكلات عراقية", "is_bulk": True,
        "nutrients_per_100g": {"calories": 140, "protein": 8, "carbs": 12, "fat": 6, "fiber": 1},
        "aliases": [{"text": "تشريب", "multiplier": 1}],
        "portions": [{"name": "صحن صغير", "grams": 300}, {"name": "صحن متوسط", "grams": 400}],
    },
    {
        "name": "برياني", "category": "أكلات عراقية", "is_bulk": True,
        "nutrients_per_100g": {"calories": 165, "protein": 7, "carbs": 20, "fat": 6, "fiber": 1},
        "aliases": [{"text": "برياني", "multiplier": 1}],
        "portions": [{"name": "صحن صغير", "grams": 300}, {"name": "صحن متوسط", "grams": 400}],
    },
    {
        "name": "مرق", "category": "أكلات عراقية", "is_bulk": True,
        "nutrients_per_100g": {"calories": 90, "protein": 6, "carbs": 5, "fat": 5, "fiber": 1.5},
        "aliases": [{"text": "مرق", "multiplier": 1}, {"text": "مرگة", "multiplier": 1}, {"text": "مرقة", "multiplier": 1}],
        "portions": [{"name": "صحن صغير", "grams": 250}, {"name": "صحن متوسط", "grams": 350}],
    },
    {
        "name": "قوزي", "category": "أكلات عراقية", "is_bulk": True,
        "nutrients_per_100g": {"calories": 200, "protein": 10, "carbs": 18, "fat": 10, "fiber": 1},
        "aliases": [{"text": "قوزي", "multiplier": 1}, {"text": "كوزي", "multiplier": 1}],
        "portions": [{"name": "صحن صغير", "grams": 300}, {"name": "صحن متوسط", "grams": 400}],
    },
    {
        "name": "كبة", "category": "أكلات عراقية", "is_bulk": True,
        "nutrients_per_100g": {"calories": 250, "protein": 9, "carbs": 28, "fat": 11, "fiber": 1.5},
        "aliases": [{"text": "كبة", "multiplier": 1}],
        "portions": [{"name": "حبة", "grams": 120}],
    },
    {
        "name": "باجة", "category": "أكلات عراقية", "is_bulk": True,
        "nutrients_per_100g": {"calories": 190, "protein": 15, "carbs": 6, "fat": 12, "fiber": 0},
        "aliases": [{"text": "باجة", "multiplier": 1}, {"text": "پاچة", "multiplier": 1}],
        "portions": [{"name": "صحن", "grams": 300}],
    },

    # ---------------- لحوم ودجاج (Bulk) ----------------
    {
        "name": "دجاج مشوي", "category": "لحوم", "is_bulk": True,
        "nutrients_per_100g": {"calories": 165, "protein": 31, "carbs": 0, "fat": 3.6, "fiber": 0},
        "aliases": [{"text": "دجاج مشوي", "multiplier": 1}, {"text": "فرخة مشوية", "multiplier": 1}],
        "portions": [{"name": "قطعة صغيرة", "grams": 100}, {"name": "قطعة متوسطة", "grams": 150}, {"name": "قطعة كبيرة", "grams": 200}],
    },
    {
        "name": "دجاج مقلي", "category": "لحوم", "is_bulk": True,
        "nutrients_per_100g": {"calories": 245, "protein": 24, "carbs": 8, "fat": 13, "fiber": 0},
        "aliases": [{"text": "دجاج مقلي", "multiplier": 1}, {"text": "دجاج", "multiplier": 1}, {"text": "فرخة", "multiplier": 1}],
        "portions": [{"name": "قطعة صغيرة", "grams": 100}, {"name": "قطعة متوسطة", "grams": 150}, {"name": "قطعة كبيرة", "grams": 200}],
    },
    {
        "name": "لحم مشوي", "category": "لحوم", "is_bulk": True,
        "nutrients_per_100g": {"calories": 250, "protein": 26, "carbs": 0, "fat": 16, "fiber": 0},
        "aliases": [{"text": "لحم مشوي", "multiplier": 1}, {"text": "لحم", "multiplier": 1}],
        "portions": [{"name": "قطعة صغيرة", "grams": 100}, {"name": "قطعة متوسطة", "grams": 150}],
    },
    {
        "name": "كباب", "category": "لحوم", "is_bulk": True,
        "nutrients_per_100g": {"calories": 215, "protein": 18, "carbs": 3, "fat": 15, "fiber": 0},
        "aliases": [{"text": "كباب", "multiplier": 1}],
        "portions": [{"name": "سيخ", "grams": 80}],
    },
    {
        "name": "تكة", "category": "لحوم", "is_bulk": True,
        "nutrients_per_100g": {"calories": 220, "protein": 25, "carbs": 1, "fat": 13, "fiber": 0},
        "aliases": [{"text": "تكة", "multiplier": 1}],
        "portions": [{"name": "سيخ", "grams": 100}],
    },
    {
        "name": "مسكوف", "category": "أسماك", "is_bulk": True,
        "nutrients_per_100g": {"calories": 190, "protein": 22, "carbs": 0, "fat": 11, "fiber": 0},
        "aliases": [{"text": "مسكوف", "multiplier": 1}, {"text": "سمك مسكوف", "multiplier": 1}],
        "portions": [{"name": "حصة", "grams": 250}],
    },
    {
        "name": "سمك مقلي", "category": "أسماك", "is_bulk": True,
        "nutrients_per_100g": {"calories": 210, "protein": 20, "carbs": 6, "fat": 12, "fiber": 0},
        "aliases": [{"text": "سمك مقلي", "multiplier": 1}, {"text": "سمج مقلي", "multiplier": 1}, {"text": "سمك", "multiplier": 1}],
        "portions": [{"name": "حصة", "grams": 200}],
    },

    # ---------------- شوربات وسلطات (Bulk) ----------------
    {
        "name": "شوربة عدس", "category": "شوربات", "is_bulk": True,
        "nutrients_per_100g": {"calories": 60, "protein": 3.5, "carbs": 9, "fat": 1, "fiber": 2.5},
        "aliases": [{"text": "شوربة عدس", "multiplier": 1}, {"text": "شوربه عدس", "multiplier": 1}, {"text": "عدس", "multiplier": 1}],
        "portions": [{"name": "كوب", "grams": 250}],
    },
    {
        "name": "شوربة خضار", "category": "شوربات", "is_bulk": True,
        "nutrients_per_100g": {"calories": 35, "protein": 1.2, "carbs": 6, "fat": 0.8, "fiber": 1.5},
        "aliases": [{"text": "شوربة خضار", "multiplier": 1}, {"text": "شوربه خضار", "multiplier": 1}],
        "portions": [{"name": "كوب", "grams": 250}],
    },
    {
        "name": "سلطة", "category": "سلطات", "is_bulk": True,
        "nutrients_per_100g": {"calories": 25, "protein": 1, "carbs": 4, "fat": 0.5, "fiber": 1.5},
        "aliases": [{"text": "سلطة", "multiplier": 1}, {"text": "زلاطة", "multiplier": 1}, {"text": "سلاطة", "multiplier": 1}],
        "portions": [{"name": "صحن صغير", "grams": 150}, {"name": "صحن متوسط", "grams": 250}],
    },

    # ---------------- وجبات سريعة (Discrete — تُطلب كوحدة عادة) ----------------
    {
        "name": "شاورما", "category": "وجبات سريعة", "is_bulk": False,
        "nutrients_per_100g": {"calories": 250, "protein": 12, "carbs": 22, "fat": 12, "fiber": 1.5},
        "aliases": [{"text": "شاورما", "multiplier": 1}],
        "portions": [{"name": "لفة", "grams": 220}],
    },
    {
        "name": "فلافل", "category": "وجبات سريعة", "is_bulk": False,
        "nutrients_per_100g": {"calories": 330, "protein": 13, "carbs": 32, "fat": 18, "fiber": 5},
        "aliases": [{"text": "فلافل", "multiplier": 1}],
        "portions": [{"name": "5 حبات", "grams": 100}],
    },
    {
        "name": "برجر", "category": "وجبات سريعة", "is_bulk": False,
        "nutrients_per_100g": {"calories": 260, "protein": 13, "carbs": 22, "fat": 14, "fiber": 1},
        "aliases": [{"text": "برجر", "multiplier": 1}, {"text": "همبرغر", "multiplier": 1}, {"text": "همبركر", "multiplier": 1}],
        "portions": [{"name": "حبة", "grams": 220}],
    },
    {
        "name": "بيتزا", "category": "وجبات سريعة", "is_bulk": False,
        "nutrients_per_100g": {"calories": 266, "protein": 11, "carbs": 33, "fat": 10, "fiber": 2},
        "aliases": [{"text": "بيتزا", "multiplier": 1}, {"text": "قطعة بيتزا", "multiplier": 1}],
        "portions": [{"name": "قطعة", "grams": 110}],
    },

    # ---------------- مشروبات (Discrete) ----------------
    {
        "name": "بيبسي", "category": "مشروبات", "is_bulk": False,
        "nutrients_per_100g": {"calories": 41, "protein": 0, "carbs": 10.6, "fat": 0, "fiber": 0},
        "aliases": [{"text": "بيبسي", "multiplier": 1}, {"text": "كولا", "multiplier": 1}, {"text": "سفن اب", "multiplier": 1}, {"text": "مشروب غازي", "multiplier": 1}],
        "portions": [{"name": "علبة", "grams": 355}],
    },
    {
        "name": "بيبسي دايت", "category": "مشروبات", "is_bulk": False,
        "nutrients_per_100g": {"calories": 0.4, "protein": 0, "carbs": 0.1, "fat": 0, "fiber": 0},
        "aliases": [{"text": "بيبسي دايت", "multiplier": 1}, {"text": "ببسي دايت", "multiplier": 1}, {"text": "كولا دايت", "multiplier": 1}, {"text": "دايت كولا", "multiplier": 1}],
        "portions": [{"name": "علبة", "grams": 355}],
    },
    {
        "name": "عصير", "category": "مشروبات", "is_bulk": False,
        "nutrients_per_100g": {"calories": 45, "protein": 0.3, "carbs": 11, "fat": 0.1, "fiber": 0.2},
        "aliases": [{"text": "عصير", "multiplier": 1}, {"text": "جوس", "multiplier": 1}],
        "portions": [{"name": "كوب", "grams": 250}],
    },
    {
        "name": "چاي", "category": "مشروبات", "is_bulk": False,
        "nutrients_per_100g": {"calories": 20, "protein": 0, "carbs": 5, "fat": 0, "fiber": 0},
        "aliases": [{"text": "چاي", "multiplier": 1}, {"text": "شاي", "multiplier": 1}],
        "portions": [{"name": "استكان", "grams": 150}],
    },

    # ---------------- فواكه وخضار (Discrete) ----------------
    {
        "name": "تفاحة", "category": "فواكه", "is_bulk": False,
        "nutrients_per_100g": {"calories": 52, "protein": 0.3, "carbs": 14, "fat": 0.2, "fiber": 2.4},
        "aliases": [{"text": "تفاحة", "multiplier": 1}, {"text": "تفاح", "multiplier": 1}, {"text": "تفاحتين", "multiplier": 2}],
        "portions": [{"name": "حبة", "grams": 180}],
    },
    {
        "name": "موزة", "category": "فواكه", "is_bulk": False,
        "nutrients_per_100g": {"calories": 89, "protein": 1.1, "carbs": 23, "fat": 0.3, "fiber": 2.6},
        "aliases": [{"text": "موزة", "multiplier": 1}, {"text": "موز", "multiplier": 1}, {"text": "موزتين", "multiplier": 2}],
        "portions": [{"name": "حبة", "grams": 120}],
    },
    {
        "name": "برتقالة", "category": "فواكه", "is_bulk": False,
        "nutrients_per_100g": {"calories": 47, "protein": 0.9, "carbs": 12, "fat": 0.1, "fiber": 2.4},
        "aliases": [{"text": "برتقالة", "multiplier": 1}, {"text": "برتقال", "multiplier": 1}],
        "portions": [{"name": "حبة", "grams": 150}],
    },
    {
        "name": "تمرة", "category": "فواكه", "is_bulk": False,
        "nutrients_per_100g": {"calories": 282, "protein": 2.5, "carbs": 75, "fat": 0.4, "fiber": 8},
        "aliases": [
            {"text": "تمرة", "multiplier": 1}, {"text": "تمرتين", "multiplier": 2},
            {"text": "تمر", "multiplier": 1, "is_plural_unspecified": True},
            {"text": "تمرات", "multiplier": 1, "is_plural_unspecified": True},
        ],
        "portions": [{"name": "حبة", "grams": 8}],
    },
    {
        "name": "خيارة", "category": "خضار", "is_bulk": False,
        "nutrients_per_100g": {"calories": 15, "protein": 0.7, "carbs": 3.6, "fat": 0.1, "fiber": 0.5},
        "aliases": [{"text": "خيارة", "multiplier": 1}, {"text": "خيار", "multiplier": 1}],
        "portions": [{"name": "حبة", "grams": 100}],
    },
    {
        "name": "طماطة", "category": "خضار", "is_bulk": False,
        "nutrients_per_100g": {"calories": 18, "protein": 0.9, "carbs": 3.9, "fat": 0.2, "fiber": 1.2},
        "aliases": [{"text": "طماطة", "multiplier": 1}, {"text": "طماطم", "multiplier": 1}, {"text": "بندورة", "multiplier": 1}],
        "portions": [{"name": "حبة", "grams": 120}],
    },

    # ---------------- حلويات (Discrete) ----------------
    {
        "name": "بقلاوة", "category": "حلويات", "is_bulk": False,
        "nutrients_per_100g": {"calories": 430, "protein": 6, "carbs": 45, "fat": 26, "fiber": 2},
        "aliases": [{"text": "بقلاوة", "multiplier": 1}, {"text": "بكلاوة", "multiplier": 1}],
        "portions": [{"name": "قطعة", "grams": 60}],
    },
    {
        "name": "شوكولاتة", "category": "حلويات", "is_bulk": False,
        "nutrients_per_100g": {"calories": 546, "protein": 5, "carbs": 60, "fat": 31, "fiber": 3.4},
        "aliases": [{"text": "شوكولاتة", "multiplier": 1}, {"text": "شوكلاته", "multiplier": 1}],
        "portions": [{"name": "قطعة متوسطة", "grams": 40}],
    },
]
