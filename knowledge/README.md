# knowledge/

بيانات Seed حقيقية بصيغة JSONL — سطر واحد = مثال محادثة واحد، بالشكل الموصوف بـ
`nutrition_ai/dataset_tools/schema.py`. راجع `DATASET_GUIDE.md` بجذر المشروع لشرح كامل
عن كيفية إضافة/استيراد/التحقق من البيانات.

## الملفات الحالية (161 مثال، كلها مكتوبة يدويًا — ماكو Pipeline يولّدها)

| الملف | التركيز |
|---|---|
| `conversations/greetings_smalltalk.jsonl` | GREETING, FAREWELL, THANKS, ACKNOWLEDGEMENT, CONFIRM, CANCEL, UNKNOWN |
| `foods/meal_logging.jsonl` | LOG_MEAL, ADD_FOOD, REMOVE_FOOD, CHANGE_QUANTITY, SWAP_FOOD, CORRECTION |
| `foods/quantities_home_food.jsonl` | كميات + أكل بيت عراقي + WATER_LOG + WEIGHT_UPDATE + SWAP_FOOD |
| `nutrition/general_and_tips.jsonl` | GENERAL_NUTRITION, ASK_TIP, ASK_REMAINING, ASK_RECOMMENDATION, ASK_CALORIE_TARGET_MEAL, END_DAY |
| `recipes/recipes_and_cooking.jsonl` | ASK_RECIPE, COOKING_STEP |
| `iraqi/dialect_and_ambiguity.jsonl` | EXPRESS_DESIRE, NOT_YET + تنوع لهجي/غموض عبر عدة Intents |
| `safety/medical_offtopic.jsonl` | MEDICAL, OFFTOPIC |
| `faq/streak_xp_profile_proposed.jsonl` | **PROPOSED_INTENTS فقط** (`implemented: false`) — راجع التنويه بالأسفل |

## تنويه مهم عن `faq/streak_xp_profile_proposed.jsonl`

الأمثلة بهذا الملف تستخدم Intents **مقترحة** (`STREAK_QUERY`, `XP_QUERY`, `LEVEL_QUERY`,
`PROFILE_QUERY`, `SETTINGS_QUERY`) — **ماكو Intent حقيقي إلها بـ`nutrition_ai/intents.py` اليوم**.
كل سؤال مباشر عن الستريك/XP/المستوى/البروفايل/الإعدادات حاليًا يرد عليه الشات كـ`GENERAL_NUTRITION`
أو `UNKNOWN` (الأرقام نفسها تظهر بصفحة `/profile` أو ضمن ملخص `END_DAY`، بس مو كسؤال مباشر
بالشات). هذا الملف موجود لتوثيق الفجوة والتحضير لتغطيتها مستقبلاً — كل سجل فيه يحمل
`metadata.implemented = false` صراحة، والـValidator (`schema.py`) يرفض أي سجل يستخدم
Intent مقترح بدون هذا التنويه، حتى ما ينخلط بالبيانات الحقيقية بالغلط.

## التغطية

كل الـ27 Intent الحقيقية بـ`intents.py` + كل الـ5 Intents المقترحة موجودة بمثالين على الأقل —
مؤكَّد آليًا عبر `tests/dataset_tools/test_seed_dataset.py` (يفشل الاختبار لو انحذف Intent
بالغلط أو نزل عدد أمثلته لصفر مستقبلاً).

## الحجم الحالي مقارنة بالخطة

الخطة الأصلية استهدفت ~350 مثال؛ الحجم الفعلي المكتوب يدويًا بهالمرحلة 161 — أُوقفت العملية هنا
بعد التأكد من تغطية كل Intent بمثالين على الأقل بجودة حقيقية، بدل الاستمرار لحشو العدد بأمثلة
أقل تميّزًا (نفس المبدأ الصريح المطلوب: "الجودة والتنوع مو رقم كبير فارغ"). التوسعة لاحقًا
سهلة تمامًا عبر نفس النمط — أضف ملف/أسطر JSONL جديدة وشغّل `scripts/dataset_cli.py validate`
ثم `import`.
