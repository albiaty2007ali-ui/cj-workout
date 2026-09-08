"""
بذرة أولية لمكتبة قوالب الإشعارات (NotificationTemplate بقاعدة البيانات) — تُزرع مرة وحدة فقط
إذا الجدول فاضي (نفس نمط tips_seed.py). بعدها الإدارة بالكامل من /admin/notifications بدون
تعديل هذا الملف. كل قالب نص حقيقي متنوع فعليًا (مو نسخ مكرر بتغيير كلمة) — عدد أقل وحقيقي
أفضل من عدد كبير مصطنع، حسب قرار الخطة الموثّق.

الحقول: category, title, body, meal_type (اختياري), goal (اختياري).
"""

NOTIFICATION_TEMPLATES_SEED = [
    # ================= BREAKFAST =================
    {"category": "BREAKFAST", "title": "🍳 صباح الخير كابتن", "body": "شنو ناوي تفطر اليوم؟ خل نرتبها ونحسب سعراتها سوا.", "meal_type": "breakfast"},
    {"category": "BREAKFAST", "title": "☀️ يوم جديد", "body": "أول وجبة باليوم هي الأهم — سجل فطورك وخلي يومك يبدأ صح.", "meal_type": "breakfast"},
    {"category": "BREAKFAST", "title": "🍳 وقت الريوك", "body": "بيض، خبز، لبن... أي شي تريد، خبرني وأحسبلك السعرات بثانية.", "meal_type": "breakfast"},
    {"category": "BREAKFAST", "title": "🌅 صباحك خير", "body": "فطور بروتين خفيف يخليك نشيط لين الظهر. شنو أكلت لحد هسه؟", "meal_type": "breakfast"},
    {"category": "BREAKFAST", "title": "🍞 قبل ما تطلع", "body": "لا تنسى فطورك قبل ما تطلع من البيت — دقيقة وحدة وأسجلها إلك.", "meal_type": "breakfast"},
    {"category": "BREAKFAST", "title": "🥐 صباح النشاط", "body": "جسمك يحتاج وقود يبدأ فيه يومه. شنو الفطور اليوم؟", "meal_type": "breakfast"},
    {"category": "BREAKFAST", "title": "🍳 كابتن CJ وياك", "body": "هلا بيك 👋 جاهز نسجل فطورك ونشوف باقيلك شكد اليوم؟", "meal_type": "breakfast"},
    {"category": "BREAKFAST", "title": "🌤️ صباح الفل", "body": "أكلت شي لحد هسه؟ ولا بعدك؟ گلي وأنا أرتب الباقي.", "meal_type": "breakfast"},

    # ================= LUNCH =================
    {"category": "LUNCH", "title": "🍚 وقت الغدا", "body": "شنو أكلت اليوم بالغداء؟ خل نحسبها سوا قبل لا تنسى.", "meal_type": "lunch"},
    {"category": "LUNCH", "title": "🍗 كابتن، الغدا شنو؟", "body": "أرسللي أكلك وأحسبلك السعرات والبروتين بثانية.", "meal_type": "lunch"},
    {"category": "LUNCH", "title": "🥗 نص اليوم مرّ", "body": "وصلنا نص اليوم — شكد باقيلك سعرات؟ خبرني شنو تغديت.", "meal_type": "lunch"},
    {"category": "LUNCH", "title": "🍛 وقت الأكل الرئيسي", "body": "الغداء أكبر وجبة بيومك عادة — سجلها حتى يضبط حسابك الصح.", "meal_type": "lunch"},
    {"category": "LUNCH", "title": "🍽️ جوعان؟", "body": "قبل لا تطلب أكل، شوف شكد باقيلك سعرات — أقدر أقترحلك شي مناسب.", "meal_type": "lunch"},
    {"category": "LUNCH", "title": "🍚 غداك جاهز؟", "body": "أكلت لو لسا؟ خبرني بس تخلص حتى نحسب سوا.", "meal_type": "lunch"},
    {"category": "LUNCH", "title": "🥙 استراحة الظهر", "body": "خل نستغل استراحتك — شنو تغديت ونحدث حسابك؟", "meal_type": "lunch"},

    # ================= DINNER =================
    {"category": "DINNER", "title": "🌙 وقت العشا", "body": "شنو ناوي تعشي؟ خبرني وأحسبلك على أساس الباقي من سعراتك.", "meal_type": "dinner"},
    {"category": "DINNER", "title": "🍽️ قبل لا تنام", "body": "لا تروح تنام قبل ما تسجل عشاك — دقيقة وحدة وخلص حسابك اليوم.", "meal_type": "dinner"},
    {"category": "DINNER", "title": "🌆 آخر وجبة باليوم", "body": "شكد باقيلك سعرات؟ أقدر أقترحلك عشا خفيف يناسبها.", "meal_type": "dinner"},
    {"category": "DINNER", "title": "🥘 عشاك شنو الليلة؟", "body": "خبرني أكلت شنو وأحدثلك الرقم النهائي لليوم.", "meal_type": "dinner"},
    {"category": "DINNER", "title": "🌙 قربنا نخلص اليوم", "body": "بقالك عشا؟ سجله حتى نشوف ملخص يومك كامل.", "meal_type": "dinner"},
    {"category": "DINNER", "title": "🍲 وجبة أخيرة", "body": "لو تجاوزت هدفك اليوم، عشا خفيف يعدل الأمور. شنو رايك؟", "meal_type": "dinner"},

    # ================= SNACK =================
    {"category": "SNACK", "title": "🥨 سناك؟", "body": "لو اكلت شي بين الوجبات، خبرني حتى أضيفه لحسابك اليومي.", "meal_type": "snack"},
    {"category": "SNACK", "title": "🍏 وجبة خفيفة؟", "body": "الوجبات الخفيفة تنحسب برضو — گلي شنو أكلت.", "meal_type": "snack"},
    {"category": "SNACK", "title": "🥜 شي بين الوجبات", "body": "مكسرات، فواكه، أي شي — أرسله وأحسبه إلك.", "meal_type": "snack"},
    {"category": "SNACK", "title": "🍎 قضمة سريعة", "body": "حتى القضمة الصغيرة تنحسب — خلينا نكون دقيقين اليوم.", "meal_type": "snack"},
    {"category": "SNACK", "title": "🥤 شي خفيف؟", "body": "إذا حسيت جوع بين الوجبات، اسألني عن خيار خفيف يناسب سعراتك.", "meal_type": "snack"},

    # ================= WATER (تذكير تسجيل الماي) =================
    {"category": "WATER", "title": "💧 شربت ماي اليوم؟", "body": "خبرني شكد شربت لين هسه حتى أحدثلك المجموع.", "meal_type": None},
    {"category": "WATER", "title": "🥤 وقت كوب ماي", "body": "شرب كوب ماي هسه وخبرني — بسيطة وتفرق بيومك.", "meal_type": None},
    {"category": "WATER", "title": "💧 تذكير بسيط", "body": "شكد شربت ماي اليوم؟ الهدف قدامك بالبروفايل.", "meal_type": None},
    {"category": "WATER", "title": "🚰 لا تنسى الماي", "body": "بين وجبة ووجبة، لا تنسى تشرب. خبرني شكد شربت.", "meal_type": None},
    {"category": "WATER", "title": "💦 تحديث الماي", "body": "خلينا نحدث رقم الماي اليوم — شكد شربت لحد هسه؟", "meal_type": None},

    # ================= HYDRATION (فائدة/تحفيز مرتبط بالماي، مو مجرد تذكير تسجيل) =================
    {"category": "HYDRATION", "title": "💡 فايدة سريعة", "body": "أحيانًا الجسم يحس جوع وهو فعليًا عطشان. جرب كوب ماي قبل ما تزيد أكل.", "meal_type": None},
    {"category": "HYDRATION", "title": "💧 الماي وطاقتك", "body": "قلة الماي تخليك تحس تعب وخمول أكثر من الطبيعي — راقب شرابك اليوم.", "meal_type": None},
    {"category": "HYDRATION", "title": "🌊 ترطيب أفضل", "body": "شرب الماي قبل الوجبة بشوي يساعد على هضم أفضل وشبع أسرع.", "meal_type": None},
    {"category": "HYDRATION", "title": "💧 عادة صغيرة", "body": "حط كأس ماي جنبك اليوم وشوف كم مرة تشرب منه بدون ما تحس.", "meal_type": None},

    # ================= STREAK (محطات Streak حقيقية) =================
    {"category": "STREAK", "title": "🔥 استمرارية رهيبة", "body": "وصلت محطة جديدة بالـStreak! استمر هيچي، الفرق يبين مع الوقت.", "meal_type": None},
    {"category": "STREAK", "title": "🔥 يوم وراء يوم", "body": "كل يوم تسجل فيه، تبني عادة أقوى. مبروك على المحطة الجديدة.", "meal_type": None},
    {"category": "STREAK", "title": "🏆 محطة جديدة", "body": "وصلت رقم حلو بالـStreak — هذا انضباط حقيقي، مو صدفة.", "meal_type": None},
    {"category": "STREAK", "title": "🔥 لا توقف هسه", "body": "قطعت مشوار حلو بالـStreak. يوم واحد كمان يوصلك محطة أبعد.", "meal_type": None},
    {"category": "STREAK", "title": "💪 ثبات ملحوظ", "body": "الاستمرارية هذي هي اللي تغيّر النتيجة على المدى الطويل. مبروك.", "meal_type": None},

    # ================= XP =================
    {"category": "XP", "title": "⭐ رصيدك زاد", "body": "كل وجبة ونشاط تسجله يضيفلك XP — رصيدك يكبر وياك.", "meal_type": None},
    {"category": "XP", "title": "🎮 تقدم حقيقي", "body": "الـXP يعكس انضباطك الفعلي — شوف كم وصلت هسه من البروفايل.", "meal_type": None},
    {"category": "XP", "title": "⭐ خطوة أقرب", "body": "كل نشاط يقربك لمستوى جديد. استمر بنفس الوتيرة.", "meal_type": None},
    {"category": "XP", "title": "🏅 مستواك يرتفع", "body": "التزامك يترجم أرقام حقيقية — تفقد مستواك الحالي بالبروفايل.", "meal_type": None},

    # ================= MOTIVATION (تحفيز عام، مو مرتبط برقم محدد) =================
    {"category": "MOTIVATION", "title": "💪 كلمة اليوم", "body": "التغيير الحقيقي يصير بخطوات صغيرة يومية، مو بقرار وحدة كبير.", "meal_type": None},
    {"category": "MOTIVATION", "title": "🌱 خطوة بخطوة", "body": "ما يشترط اليوم يكون مثالي — يكفي يكون أفضل من أمس.", "meal_type": None},
    {"category": "MOTIVATION", "title": "💪 أنت بطل قصتك", "body": "كل يوم تحاول فيه، أنت تربح — حتى لو النتيجة مو مثالية.", "meal_type": None},
    {"category": "MOTIVATION", "title": "🔥 استمر", "body": "الطريق يصير أسهل كل ما تكرره. لا توقف هسه.", "meal_type": None},
    {"category": "MOTIVATION", "title": "🌟 تذكير بسيط", "body": "هدفك مو الكمال، هدفك الاستمرار. وأنت مستمر لحد هسه.", "meal_type": None},
    {"category": "MOTIVATION", "title": "💚 خلي بالك عليك", "body": "العناية بجسمك اليوم استثمار براحتك باجر.", "meal_type": None},

    # ================= RECIPE (اقتراح تجربة وصفة حقيقية) =================
    {"category": "RECIPE", "title": "🍳 جرب وصفة اليوم", "body": "عندنا وصفات حقيقية بمكونات وخطوات واضحة — شوفها بصفحة الوصفات.", "meal_type": None},
    {"category": "RECIPE", "title": "👨‍🍳 خلي نطبخ اليوم", "body": "بدل الأكل الجاهز، جرب وصفة سريعة نحسبلك سعراتها بالضبط.", "meal_type": None},
    {"category": "RECIPE", "title": "🍽️ وصفة تناسب هدفك", "body": "عندنا وصفات مرتبة حسب السعرات — تصفحها وشوف شنو يناسبك اليوم.", "meal_type": None},
    {"category": "RECIPE", "title": "🥘 غيّر الروتين", "body": "جرب وصفة جديدة اليوم بدل نفس الأكل المعتاد.", "meal_type": None},

    # ================= PROGRESS (نظرة على التقدم العام) =================
    {"category": "PROGRESS", "title": "📊 شوف تقدمك", "body": "مرّ وقت من أول ما بدأت — شوف كم فرق سويت من صفحة البروفايل.", "meal_type": None},
    {"category": "PROGRESS", "title": "📈 خطوة للخلف نظرة", "body": "قارن وين كنت وين هسه — التقدم أحيانًا ما ينلاحظ إلا لما تشوفه مكتوب.", "meal_type": None},
    {"category": "PROGRESS", "title": "🎯 قريب من هدفك", "body": "كل وجبة مسجلة وكل يوم نشط يقربك أكثر لهدفك.", "meal_type": None},

    # ================= RETURN (عودة بعد غياب — رسالة واحدة لطيفة بدون لوم) =================
    {"category": "RETURN", "title": "❤️ هلا رجعت", "body": "اشتقنالك! جاهز نكمل من وين ما وقفنا؟", "meal_type": None},
    {"category": "RETURN", "title": "👋 وينك؟", "body": "مشتاقين نشوفك ترجع. متى ما تريد نبدأ، أنا جاهز.", "meal_type": None},
    {"category": "RETURN", "title": "🌱 نبدأ من جديد", "body": "ما يهم شكد غبت، المهم إنك رجعت. خلينا نكمل الطريق سوا.", "meal_type": None},

    # ================= MEAL_REMINDER (تذكير عام مو مرتبط بوقت وجبة محدد) =================
    {"category": "MEAL_REMINDER", "title": "🍽️ لسا ما سجلت شي اليوم", "body": "خبرني شنو أكلت اليوم حتى نضبط حسابك ونعرف باقيلك شكد.", "meal_type": None},
    {"category": "MEAL_REMINDER", "title": "📝 تذكير سريع", "body": "لا تنسى تسجل وجباتك أول بأول حتى الأرقام تظل دقيقة.", "meal_type": None},
    {"category": "MEAL_REMINDER", "title": "🍴 حساب اليوم", "body": "كل وجبة تسجلها تخلي صورة يومك أوضح — شنو أكلت لحد هسه؟", "meal_type": None},

    # ================= DAILY_SUMMARY (ملخص نهاية اليوم) =================
    {"category": "DAILY_SUMMARY", "title": "📋 ملخص يومك جاهز", "body": "خلص اليوم — شوف كم سعرة أكلت وشكد ماي شربت وشكد XP جمعت.", "meal_type": None},
    {"category": "DAILY_SUMMARY", "title": "🌙 قبل لا تنام", "body": "لمحة سريعة على يومك: السعرات، الماي، والـStreak — كلشي بمكان وحد.", "meal_type": None},
    {"category": "DAILY_SUMMARY", "title": "📊 كيف كان يومك؟", "body": "شوف ملخص كامل ليومك واعرف وين تكدر تتحسن باجر.", "meal_type": None},

    # ================= CONSISTENCY (تحفيز مرتبط بالانتظام تحديدًا، مو تحفيز عام) =================
    {"category": "CONSISTENCY", "title": "📅 الانتظام أهم من الكمال", "body": "يوم بسيط ومسجل أفضل من يوم مثالي بس منسي.", "meal_type": None},
    {"category": "CONSISTENCY", "title": "🔁 عادة تتبني", "body": "كل تسجيل يومي يقوّي العادة أكثر — الاستمرار هو السر.", "meal_type": None},
    {"category": "CONSISTENCY", "title": "⏳ خطوة صغيرة يومية", "body": "ما نحتاج تغيير جذري — نحتاج نفس الخطوة الصغيرة، كل يوم.", "meal_type": None},
    {"category": "CONSISTENCY", "title": "🧩 قطعة بقطعة", "body": "النتيجة الكبيرة تتبني من عادات صغيرة تتكرر — أنت هسه بهاي المرحلة بالضبط.", "meal_type": None},
    {"category": "CONSISTENCY", "title": "📌 ثبّت العادة", "body": "أسهل وقت تحافظ فيه على عادة هو أول أسبوعين — وأنت جاي منهم زين.", "meal_type": None},
    {"category": "CONSISTENCY", "title": "🗓️ يوم إضافي", "body": "كل يوم تسجل فيه يضيف لبنة بعادتك الجديدة — استمر.", "meal_type": None},

    # ================= إضافات تكميلية (نفس الفلسفة أعلاه، تنويع أكثر بدون تكرار حرفي) =================
    {"category": "BREAKFAST", "title": "🍳 قبل ما تنسى", "body": "فطور اليوم شنو؟ دقيقة وحدة وأسجله ونبدأ الحساب صح من الصبح.", "meal_type": "breakfast"},
    {"category": "LUNCH", "title": "🍛 نص اليوم", "body": "غداك جاهز؟ خبرني حتى أحدثلك الباقي من سعراتك.", "meal_type": "lunch"},
    {"category": "DINNER", "title": "🌃 قبل النوم بشوي", "body": "خلص عشاك؟ سجله ونشوف ملخص يومك كامل.", "meal_type": "dinner"},
    {"category": "SNACK", "title": "🍇 وجبة صغيرة؟", "body": "لو تناولت شي بسيط اليوم، ما يهم صغره — سجله حتى يضبط الحساب.", "meal_type": "snack"},
    {"category": "WATER", "title": "💧 كم كوب لحد هسه؟", "body": "جرب تحسب أكواب الماي اليوم وخبرني بالمجموع.", "meal_type": None},
    {"category": "HYDRATION", "title": "🚰 عادة بسيطة", "body": "كوب ماي أول ما تصحى يفرق بطاقتك طول اليوم.", "meal_type": None},
    {"category": "STREAK", "title": "🔥 كل يوم يحسب", "body": "الاستمرارية مو رقم بس — هي دليل إنك جاد بهدفك.", "meal_type": None},
    {"category": "XP", "title": "⭐ التزام يتحسب", "body": "كل نشاط حقيقي تسويه ينعكس XP فعلي بحسابك — استمر.", "meal_type": None},
    {"category": "MOTIVATION", "title": "🌤️ يوم جديد يوم فرصة", "body": "ما يهم كيف كان أمس، اليوم فرصة جديدة تبدأ فيها من جديد.", "meal_type": None},
    {"category": "MOTIVATION", "title": "🧠 التزام مو مزاج", "body": "الأيام اللي ما تحس فيها بحماس هي أهم أيام تستمر فيها.", "meal_type": None},
    {"category": "RECIPE", "title": "🍲 أكلة بيتية بسعرات معروفة", "body": "بدل ما تخمن سعرات أكل برا، جرب وصفة عندنا بأرقام دقيقة.", "meal_type": None},
    {"category": "RECIPE", "title": "🥗 خيار صحي وسريع", "body": "عندنا وصفات تحضيرها أقل من 15 دقيقة — شوفها بصفحة الوصفات.", "meal_type": None},
    {"category": "PROGRESS", "title": "📉 الفرق يتراكم", "body": "كل قرار صغير صح يضيف لصورة أكبر مع الوقت — استمر تشوف الفرق.", "meal_type": None},
    {"category": "PROGRESS", "title": "🧮 أرقامك تحكي", "body": "شوف مجموع وجباتك وأيامك النشطة من البروفايل — الأرقام تحفّز أكثر من الكلام.", "meal_type": None},
    {"category": "RETURN", "title": "🙌 نكمل من وين وقفنا", "body": "ما راح نبدأ من الصفر — بياناتك كلها محفوظة، بس گلي جاهز.", "meal_type": None},
    {"category": "MEAL_REMINDER", "title": "🍽️ تحديث بسيط", "body": "خبرني شنو أكلت من الصبح حتى أحدثلك الأرقام كاملة.", "meal_type": None},
    {"category": "MEAL_REMINDER", "title": "📝 دقيقة وحدة بس", "body": "تسجيل وجبتك ياخذ ثواني وبيفرق كثير بدقة حسابك.", "meal_type": None},
    {"category": "DAILY_SUMMARY", "title": "🌙 يوم انتهى", "body": "قبل لا تنام، شوف كم سعرة أكلت اليوم وشكد باقيلك للهدف الأسبوعي.", "meal_type": None},
]
