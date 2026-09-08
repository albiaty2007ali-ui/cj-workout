"""
بذرة أولية لنظام الوصفات — هجرة الـ4 وصفات الحقيقية اللي كانت بـrecipes_data.py (بياناتها
الغذائية متحقق منها سابقًا) لشكل منظّم (تصنيف/مكونات مفصولة/خطوات بتفاصيل). لا وصفات مختلقة —
تصنيفات "حلويات"/"مشروبات حارة" تُزرع فاضية عمدًا لين تضاف وصفات حقيقية من لوحة الأدمن.
"""

CATEGORIES_SEED = [
    {"name": "فطور", "icon": "🍳", "order_index": 1},
    {"name": "غداء", "icon": "🍗", "order_index": 2},
    {"name": "عشاء", "icon": "🌙", "order_index": 3},
    {"name": "سناك", "icon": "🥗", "order_index": 4},
    {"name": "حلويات", "icon": "🍰", "order_index": 5},
    {"name": "مشروبات حارة", "icon": "☕", "order_index": 6},
    {"name": "مشروبات باردة", "icon": "🧊", "order_index": 7},
]

RECIPES_SEED = [
    {
        "name": "بيض بالطماطة", "slug": "eggs-tomato", "category": "فطور",
        "description": "فطور عراقي بسيط وسريع، غني بالبروتين.",
        "prep_time_min": 5, "cook_time_min": 10, "servings": 1, "difficulty": "easy",
        "calories": 320, "protein": 18, "carbs": 12, "fat": 22,
        "match_keywords": ["بيض بالطماطة", "بيض وطماطة"],
        "ingredients": [
            {"name": "بيضة", "quantity": "2", "unit": "حبة"},
            {"name": "طماطة", "quantity": "1", "unit": "حبة متوسطة"},
            {"name": "بصل", "quantity": "نص", "unit": "حبة"},
            {"name": "زيت زيتون", "quantity": "1", "unit": "ملعقة"},
            {"name": "ملح وبهار", "quantity": None, "unit": "حسب الرغبة"},
        ],
        "steps": [
            {"instruction": "قطّع الطماطة والبصل لقطع صغيرة.", "duration": None, "temperature": None, "tip": None, "warning": None},
            {"instruction": "حط ملعقة الزيت بمقلاة على نار متوسطة وقلّب البصل لين يذبل.", "duration": "3 دقايق", "temperature": "نار متوسطة", "tip": None, "warning": None},
            {"instruction": "زيد الطماطة وخليها تنطبخ لين تطري.", "duration": "4-5 دقايق", "temperature": None, "tip": None, "warning": None},
            {"instruction": "اكسر البيضتين فوگ الخليط وحرّك بهدوء لين تستوي.", "duration": None, "temperature": None, "tip": "لا تحرّك بقوة حتى تظل البيضة طرية.", "warning": None},
            {"instruction": "رشّ الملح والبهار، وقدّمها ساخنة مع خبز أو صمون.", "duration": None, "temperature": None, "tip": None, "warning": None},
        ],
        "substitutions": {
            "زيت زيتون": "تقدر تستخدم أي زيت طبخ عادي بدله، الفرق البسيط بالسعرات مو مهم.",
            "بصل": "إذا ما عندك بصل، احذفه، الطعم يختلف شوي بس الوصفة تنجح برضو.",
        },
    },
    {
        "name": "دجاج مشوي مع سلطة", "slug": "grilled-chicken-salad", "category": "غداء",
        "description": "وجبة غداء عالية البروتين ومنخفضة الدهون.",
        "prep_time_min": 10, "cook_time_min": 15, "servings": 1, "difficulty": "medium",
        "calories": 380, "protein": 40, "carbs": 10, "fat": 18,
        "match_keywords": ["دجاج مشوي", "دجاج بالخضار", "سلطة دجاج"],
        "ingredients": [
            {"name": "صدر دجاج", "quantity": "1", "unit": "قطعة"},
            {"name": "خس وخيار وطماطة", "quantity": None, "unit": "للسلطة"},
            {"name": "زيت زيتون", "quantity": "1", "unit": "ملعقة"},
            {"name": "ليمون", "quantity": None, "unit": "حسب الرغبة"},
            {"name": "ملح وبهار", "quantity": None, "unit": "حسب الرغبة"},
        ],
        "steps": [
            {"instruction": "تبّل الدجاج بالملح والبهار والليمون واتركه يرتاح.", "duration": "10 دقايق", "temperature": None, "tip": None, "warning": None},
            {"instruction": "اشوي الدجاج على نار متوسطة كل وجه لين يستوي زين.", "duration": "6-7 دقايق لكل وجه", "temperature": "نار متوسطة", "tip": None, "warning": "تأكد الدجاج مستوي بالكامل بالنص قبل ما تقطعه."},
            {"instruction": "قطّع الخضار وحضّر السلطة بملعقة زيت زيتون وليمون.", "duration": None, "temperature": None, "tip": None, "warning": None},
            {"instruction": "قطّع الدجاج المشوي وحطه فوگ السلطة، قدّمها فورًا.", "duration": None, "temperature": None, "tip": None, "warning": None},
        ],
        "substitutions": {
            "ليمون": "إذا ما عندك ليمون، تكدر تستخدم خل أبيض بكمية أقل.",
        },
    },
    {
        "name": "شوربة عدس", "slug": "lentil-soup", "category": "عشاء",
        "description": "عشاء خفيف ودافئ، غني بالألياف.",
        "prep_time_min": 10, "cook_time_min": 25, "servings": 2, "difficulty": "easy",
        "calories": 220, "protein": 12, "carbs": 32, "fat": 5,
        "match_keywords": ["عدس", "شوربة عدس"],
        "ingredients": [
            {"name": "عدس أصفر", "quantity": "1", "unit": "كوب"},
            {"name": "بصل", "quantity": "1", "unit": "حبة"},
            {"name": "جزر", "quantity": "1", "unit": "حبة"},
            {"name": "زيت", "quantity": "1", "unit": "ملعقة"},
            {"name": "ملح وكمون", "quantity": None, "unit": "حسب الرغبة"},
        ],
        "steps": [
            {"instruction": "اغسل العدس زين وصفّيه.", "duration": None, "temperature": None, "tip": None, "warning": None},
            {"instruction": "قلّب البصل والجزر المفروم بالزيت لين يطري.", "duration": "5 دقايق", "temperature": None, "tip": None, "warning": None},
            {"instruction": "زيد العدس و4 أكواب مي واتركه يغلي لين ينضج.", "duration": "20 دقيقة تقريبًا", "temperature": None, "tip": None, "warning": None},
            {"instruction": "اخفقه بالخلاط أو اتركه كثيف حسب الرغبة، رشّ الملح والكمون.", "duration": None, "temperature": None, "tip": "الخفق يخليها أنعم، بس تنجح الوصفة بدونه برضو.", "warning": None},
        ],
        "substitutions": {
            "جزر": "تقدر تسويها بدون جزر، الطعم يتغير بسيط بس تظل شوربة زينة.",
        },
    },
    {
        "name": "مشروب بارد بالليمون", "slug": "cold-lemon-drink", "category": "مشروبات باردة",
        "description": "مشروب منعش وقليل السعرات بديل عن المشروبات الغازية.",
        "prep_time_min": 5, "cook_time_min": 0, "servings": 1, "difficulty": "easy",
        "calories": 60, "protein": 1, "carbs": 14, "fat": 0,
        "match_keywords": ["مشروب بارد", "شاي مثلج", "ليمون بارد"],
        "ingredients": [
            {"name": "ماي بارد أو شاي مثلج بدون سكر", "quantity": "1", "unit": "كوب"},
            {"name": "ليمون", "quantity": "نص", "unit": "حبة"},
        ],
        "steps": [
            {"instruction": "اعصر الليمون بالماي البارد أو الشاي المثلج.", "duration": None, "temperature": None, "tip": "بدون سكر يخليه سعرات قليلة جدًا.", "warning": None},
            {"instruction": "قدّمه بارد فورًا.", "duration": None, "temperature": None, "tip": None, "warning": None},
        ],
        "substitutions": {},
    },
]
