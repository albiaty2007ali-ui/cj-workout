/**
 * منفذ حرفي من nutrition_ai/intents.py — Intent Detector بقواعد/كلمات مفتاحية عراقية (لا LLM هنا).
 * نفس ترتيب الأولوية بالضبط، نفس القوائم، نفس التعليقات التوثيقية للقرارات غير البديهية.
 */

export const LOG_MEAL = "LOG_MEAL";
export const ADD_FOOD = "ADD_FOOD";
export const REMOVE_FOOD = "REMOVE_FOOD";
export const CHANGE_QUANTITY = "CHANGE_QUANTITY";
export const SWAP_FOOD = "SWAP_FOOD";
export const ASK_REMAINING = "ASK_REMAINING";
export const ASK_RECOMMENDATION = "ASK_RECOMMENDATION";
export const ASK_CALORIE_TARGET_MEAL = "ASK_CALORIE_TARGET_MEAL";
export const ASK_RECIPE = "ASK_RECIPE";
export const COOKING_STEP = "COOKING_STEP";
export const WATER_LOG = "WATER_LOG";
export const WEIGHT_UPDATE = "WEIGHT_UPDATE";
export const END_DAY = "END_DAY";
export const ASK_TIP = "ASK_TIP";
export const GENERAL_NUTRITION = "GENERAL_NUTRITION";
export const CONFIRM = "CONFIRM";
export const CANCEL = "CANCEL";
export const CORRECTION = "CORRECTION";
export const OFFTOPIC = "OFFTOPIC";
export const MEDICAL = "MEDICAL";
export const NOT_YET = "NOT_YET";
export const EXPRESS_DESIRE = "EXPRESS_DESIRE";
export const EXPRESS_CRAVING = "EXPRESS_CRAVING";
export const PLAN_TO_EAT = "PLAN_TO_EAT";
export const ASK_PORTION_FOR_FOOD = "ASK_PORTION_FOR_FOOD";
export const ASK_CALORIES = "ASK_CALORIES";
export const ASK_FOOD_SIZE = "ASK_FOOD_SIZE";
export const ASK_UNIT = "ASK_UNIT";
export const ASK_FOOD_FIT = "ASK_FOOD_FIT";
export const ASK_SUBSTITUTION = "ASK_SUBSTITUTION";
// What If Simulator — محاكاة سعرات فرضية ("إذا أكلت برگر هسه؟") بدون تسجيل وجبة أبدًا. أضيفت
// بعد اكتشاف Bug حقيقي حي: "إذا أكلت برگر هسه؟" كانت تُسجَّل كوجبة فعلية لأن "أكلت" موجودة
// كسلسلة فرعية جوا "إذا أكلت" فيتفعّل hasConsumptionHint وتسقط الرسالة لـLOG_MEAL الافتراضي
// (نفس فئة باگ "شكد حجم البيتزا؟" بالضبط). راجع WHAT_IF_PARTICLES/detectIntent أسفل.
export const WHAT_IF = "WHAT_IF";
// حارس أمان عام (راجع detectIntent أسفل) — أي سؤال عن أكل ما طابق نية محددة، يرجع هذا بدل
// LOG_MEAL الافتراضي حتى ما ينسجل بالغلط كوجبة حقيقية (Bug حقيقي انكشف: "شكد حجم البيتزا؟"
// كانت تتسجل كوجبة أكل فعلية لأن "بيتزا" تتطابق بثقة كاملة وماكو حارس يفرّق سؤال عن استهلاك).
export const ASK_GENERAL_FOOD_INFO = "ASK_GENERAL_FOOD_INFO";
export const GREETING = "GREETING";
export const FAREWELL = "FAREWELL";
export const THANKS = "THANKS";
export const ACKNOWLEDGEMENT = "ACKNOWLEDGEMENT";
export const UNKNOWN = "UNKNOWN";

// ---------------- قوائم الكلمات المفتاحية (عراقي/لهجة) ----------------

export const OFFTOPIC_KEYWORDS = ["كود", "برمجة", "python", "javascript", "اكتبلي برنامج", "سكربت"];
export const MEDICAL_KEYWORDS = ["دواء", "مرض", "تشخيص", "أعاني من", "وجع", "الم مزمن", "دكتور شنو"];

export const END_DAY_PHRASES = ["راح أنام", "راح انام", "خلص يومي", "بنام", "أنام هسه", "انام هسه"];
export const REMAINING_QUERY_PHRASES = ["باقيلي", "شكد باقي", "كم باقي", "شكد متبقي", "الباقي شكد"];
export const SUGGEST_QUERY_PHRASES = [
  "شنو آكل", "شنو اكل", "اقترح", "شنو أطبخ", "شنو اطبخ", "رتبلي",
  "تقترح", "تنصحني", "تنصح", "شنو مناسب الي", "شنو مناسب إلي", "اقترحلي",
  "اختارلي شي آكله", "اختارلي شي اكله", "عندك اقتراح", "شنو تنصحني",
];
export const CALORIE_TARGET_MEAL_PHRASES = ["اريد وجبة", "أريد وجبة", "وجبة بحدود", "وجبة تكون"];
// صيغ أوسع لنفس النية ("سويلي الغداء 600 سعرة") — فعل تحضير/رغبة + كلمة وجبة + رقم + "سعرة"
// بدل الاعتماد على عبارات ثابتة بس (تُفحص كـAND مركّب بـdetectIntent، مو substring مباشر هنا).
export const MEAL_BUDGET_VERB_MARKERS = ["سوي", "سوّي", "سويلي", "خلي", "خلّي", "خليلي", "اريد", "أريد", "ابغى", "أبغى"];
export const MEAL_TYPE_WORDS = ["وجبة", "غداء", "فطور", "عشاء", "سناك", "أكلة", "اكلة", "الغدا", "غدا", "عشا"];
export const COOKING_START_PHRASES = ["هسه شنو أسوي", "هسه شنو اسوي", "وين أبدأ", "خلينا نطبخ", "علمني أسويها", "علمني اسويها", "ابدأ الطبخ"];
export const COOKING_NEXT_PHRASES = ["بعد شنو", "شنو بعدين", "الخطوة الجاية", "وبعدين"];
export const MISSING_INGREDIENT_TRIGGERS = ["ما عندي", "ماعندي", "ماكو عندي"];
export const RECIPE_TRIGGERS = ["خلي نطبخ", "وصفة", "خلينا نطبخ"];
// طلب تصنيف وصفات محدد — عبارات مركّبة عمدًا (مو كلمات مفردة متل "شاي"/"قهوة") حتى ما تتصادم
// مع تسجيل وجبة فعلي بنفس الكلمة (مثلاً "اكلت شاي" لازم تبقى LOG_MEAL، مو طلب وصفة)
export const RECIPE_CATEGORY_PHRASES = [
  "حلو دايت", "حلويات دايت", "أريد حلو", "اريد حلو", "ابي حلو", "أبي حلو",
  "أريد مشروب بارد", "اريد مشروب بارد", "أريد مشروب حار", "اريد مشروب حار",
  "أريد قهوة دايت", "اريد قهوة دايت", "أريد شاي دايت", "اريد شاي دايت",
  "وصفة حلويات", "وصفة مشروب بارد", "وصفة مشروب حار", "وصفة قهوة", "وصفة شاي",
];
export const NOT_YET_PHRASES = ["بعدني", "لسا", "بعد ما اكلت", "لا بعد", "مو هسه"];

// جواب "أكلت الوصفة فعلًا؟" — تُفحص فقط لما فيه pending_recipe_confirmation (has_pending_recipe بالـctx)،
// ما تصير مرادف عام لـCONFIRM بأي سياق ثاني حتى ما تتصادم مع أي معنى آخر لـ"أكلتها"
export const RECIPE_EATEN_PHRASES = ["اكلتها", "أكلتها", "اي اكلتها", "إي اكلتها", "اي، أكلتها", "إي، أكلتها", "اي أكلتها"];

export const CONFIRM_PHRASES = ["اي", "ايه", "اوك", "اوكي", "تمام", "نعم", "ثبتها", "ثبت", "اثبتها", "صح", "أكد"];
export const CANCEL_PHRASES = ["لا", "الغي", "الغيها", "مو صحيح", "خطأ بالكل", "cancel", "ماريد", "ما اريد", "ما أريد"];
// عبارات تراجع عن آخر تسجيل مباشر (DIRECT_LOG) — أوسع من CANCEL_PHRASES ومطابقة تامة فقط
// (حتى "شيل الصمونة" ما ينحسب تراجع كامل، يبقى REMOVE_FOOD على الوجبة المُعاد فتحها)
export const UNDO_PHRASES = [...CANCEL_PHRASES, "الغيه", "شيلها", "نسيتها", "ما أكلتها", "ما اكلتها"];

export const ADD_FOOD_PHRASES = ["زيدلي", "زيد", "ضيفلي", "ضيف", "اضيف", "أضيف", "كمان اكلت", "نسيت أضيف", "نسيت اضيف"];
export const REMOVE_FOOD_PHRASES = ["شيل", "احذف", "إحذف", "شيلها", "الغي منها"];
export const CHANGE_QUANTITY_PHRASES = ["خليها", "خله", "غيّر العدد", "غير العدد", "خلي الكمية"];
export const SWAP_FOOD_PHRASES = ["بدل ", "بدّل ", "استبدل", "غيّر لـ", "غير ل"];
export const CORRECTION_PHRASES = ["لا مو", "لا، مو", "غلط", "خطأ", "مو هيچي", "مو هيك"];

export const PROTEIN_WORDS = ["بروتين"];
export const CARB_WORDS = ["كارب", "كاربوهيدرات", "نشويات", "نشا"];
export const FAT_WORDS = ["دهون", "دهن"];
export const FIBER_WORDS = ["ألياف", "الياف"];

// سؤال معلوماتي عام عن التغذية ("شنو فايدة البروتين؟"، "الكارب مضر؟") — يفرق جوهري عن سؤال
// "شكد باقيلي" (ASK_REMAINING، مفحوص قبل هذا) أو محاولة تسجيل وجبة فيها اسم عنصر غذائي صدفة.
// الشرط المركّب (علامة سؤال + كلمة موضوع) يمنع أي تصادم مع تسجيل وجبة حقيقي.
export const GENERAL_NUTRITION_MARKERS = ["فايدة", "فوائد", "اضرار", "أضرار", "مضر", "صحي لو", "شنو ال", "احتاج", "لازم"];
export const GENERAL_NUTRITION_TOPICS = [
  ...PROTEIN_WORDS, ...CARB_WORDS, ...FAT_WORDS, ...FIBER_WORDS,
  "مشروبات غازية", "فاست فود", "حلويات", "قبل التمرين", "بعد التمرين", "توقيت الوجبات",
];

export const WATER_PHRASES = ["شربت", "اشرب ماي", "شربت ماي", "شربت مي"];
export const WEIGHT_PHRASES = ["وزني", "وزنت", "صار وزني", "نزل وزني", "زاد وزني", "احسبلي وزن"];
export const ASK_TIP_PHRASES = ["عطيني نصيحة", "نصيحة سريعة", "افادة"];

// رغبة/احتمال أكل شي — مو استهلاك فعلي، ما يسجّل وجبة أبدًا حتى لو ذكر اسم أكلة معروفة
// (مثلاً "أريد بيض" ما يسجّل بيضة — يفرق جوهري عن "اكلت بيض")
export const DESIRE_MARKERS = [
  "أريد", "اريد", "ابي", "أبي", "ابغي", "أبغى", "يمكن", "ممكن اكل", "ممكن آكل",
  "أفكر", "افكر", "حاب اكل", "حاب آكل", "ودي اكل", "ودي آكل", "أحب أكل", "احب اكل",
];

// اشتهاء طعام محدد بالاسم ("مشتهي دولمة") — يختلف عن DESIRE_MARKERS العامة بإنه غالبًا يستحق
// عرض مساعدة بتحديد كمية مناسبة للطعام المذكور تحديدًا، مو رد عام. لا تضعها ضمن RECIPE_TRIGGERS
// أبدًا — كانت هناك سابقًا وسببت تحويل أي رسالة اشتهاء لبحث وصفة حر بكامل نص الرسالة.
export const CRAVING_MARKERS = ["مشتهي", "مشتهية", "نفسي ب", "نفسي بـ", "خاطري ب", "خاطري بـ"];

// نية مستقبلية صريحة بالأكل — مو استهلاك فعلي، ما يسجّل وجبة أبدًا (يفرق جوهري عن "اكلت دولمة")
export const PLAN_TO_EAT_MARKERS = ["راح آكل", "راح اكل", "ناوي آكل", "ناوي اكل", "بروح آكل", "بروح اكل"];

// سؤال عن كمية مناسبة لطعام محدد (وليس "شكد أكلت؟" التوضيحي لوجبة قيد التسجيل) — يُفحص بأولوية
// أعلى من CRAVING_MARKERS/PLAN_TO_EAT_MARKERS حتى رسالة مركّبة متل "مشتهي دولمه شكد لازم اكل؟"
// تروح لتوصية الكمية مباشرة، مو لرد اشتهاء عام بس.
// ملاحظة: normalize() يحوّل "آ" إلى "ا" دايمًا قبل أي مطابقة — أي صيغة بـ"آكل" هنا ميتة (ما
// تنطابق أبدًا)، لهذا كل الصيغ هنا مكتوبة بالألف العادي فقط (اكتُشف ومُصلح: "قديش آكل" الأصلية
// كانت ميتة تمامًا، صفر رسالة تقدر تطابقها).
export const PORTION_QUESTION_MARKERS = ["شكد لازم اكل", "شكد اخلي", "شكد اكل", "قديش اكل"];

// سؤال معلوماتي صرف عن سعرات/حجم/وحدة/ملاءمة طعام معيّن — يفرق جوهري عن PORTION_QUESTION_MARKERS
// (اللي يطلب توصية "شكد لازم آكل")، هذا بس معلومة بدون أي نية أكل أو توصية كمية.
export const CALORIES_QUESTION_MARKERS = [
  "شكد سعرات", "شكد سعره", "شكد سعرة", "كم سعرة", "كم سعرات", "شكد سعراتها",
  "سعراتها شكد", "سعراته شكد", "شكد فيها سعرة", "شكد فيه سعرة", "شكد تحسب",
];
export const FOOD_SIZE_QUESTION_MARKERS = [
  "شكد حجم", "شنو حجم", "حجمها شكد", "حجمه شكد", "شكد كبيرة", "شكد صغيرة", "أي حجم", "اي حجم",
];
// سؤال تعريف وحدة قياس عامة (مو مرتبط بطعام محدد بالضرورة) — "خاشوقة"/"استكان" لازم تُفحص قبل
// "حبة" لأنها أوضح، بس الترتيب هنا غير حساس لأن الشرط "AND" مع كلمة وحدة فعلية.
export const UNIT_DEFINITION_MARKERS = ["شكد يعني", "شنو يعني", "چم غرام", "كم غرام", "شكد بالغرام"];
export const GENERIC_UNIT_WORDS = ["صحن", "حبة", "خاشوقة", "ملعقة", "استكان", "كوب", "قطعة", "شريحة", "رغيف", "حصة"];
export const FOOD_FIT_QUESTION_MARKERS = [
  "يناسب سعراتي", "تناسب سعراتي", "يضبط وياي", "مناسب لسعراتي", "يعدي سعراتي",
  "يتجاوز سعراتي", "ينفع وياي", "مناسبة لسعراتي", "تعدي سعراتي",
];
export const SUBSTITUTION_MARKERS = [
  "بديل أخف", "بديل اخف", "بديل أقل سعرات", "بديل اقل سعرات", "شنو البديل",
  "أخف منها", "اخف منها", "بديل صحي", "شي أخف", "شي اخف",
];
// أدوات الشرط الفرضي — "لو"/"إذا". ملاحظة مهمة: detectIntent يستلم النص كما هو (trim فقط، صفر
// normalize() فعلي — راجع handleMessage بـorchestrator.ts)، فلازم نذكر صيغتي الهمزة صراحة
// ("إذا" و"اذا") بنفس نمط CONSUMPTION_VERB_HINTS أعلاه ("اكلت"/"أكلت") بدل الاعتماد على توحيد
// تلقائي غير موجود فعليًا بهذا المسار. مقصود عدم تضييقها لعبارات محددة ("اذا اكلت") لأن الصيغ
// كثيرة ("لو اخذت"، "شنو اذا سويت")، والشرط الفعلي بـdetectIntent يجمعها مع hasConsumptionHint
// فقط — صفر خطر مصادفة مع رسالة عادية بدون فعل استهلاك.
export const WHAT_IF_PARTICLES = ["اذا", "إذا", "لو", "شنو لو", "شنو اذا", "شنو إذا"];

// أفعال استهلاك صريحة — تُستخدم بحارس الأمان العام (أسفل detectIntent) لتمييز جملة استهلاك
// حقيقية عن سؤال يذكر نفس الطعام صدفة (مثلاً "شكد حجم البيتزا؟" ما فيها أي من هذي).
export const CONSUMPTION_VERB_HINTS = [
  "اكلت", "أكلت", "تغديت", "تغذيت", "فطرت", "تعشيت", "طعمت", "ذقت", "تناولت",
  "شربت", "سويت", "حطيت", "ضفت", "أضفت", "اضفت",
];
// نفس CONSUMPTION_VERB_HINTS + صيغة المضارع/الأمر العراقية الشائعة بالسؤال الفرضي ("اذا اكل
// برگر هسه؟" بدل الماضي "اذا اكلت") — نطاق محصور بـWHAT_IF فقط عمدًا، **مو** إضافة لـ
// CONSUMPTION_VERB_HINTS العام أعلاه: "اكل" وحدها (بدون ت) سلسلة فرعية من "الاكل" (الطعام
// كاسم) كمان، فإضافتها للحارس العام كانت تهدد بإعادة فتح نفس ثغرة "شكد حجم البيتزا؟" لأسئلة
// عامة زي "شكد سعرات الاكل؟". هنا الخطر أقل بكثير لأنها مشروطة أصلاً بوجود WHAT_IF_PARTICLES.
export const WHAT_IF_CONSUMPTION_HINTS = [...CONSUMPTION_VERB_HINTS, "اكل", "أكل"];
// أدوات استفهام عراقية عامة — أي رسالة تحتوي إحداها (أو علامة ؟) ومالها فعل استهلاك صريح
// أعلاه، تُعتبر سؤال معلوماتي، مو تسجيل وجبة، بغض النظر هل طابقت نية محددة فوق أو لا.
export const QUESTION_INDICATORS = ["شكد", "كم", "شنو", "هل", "شلون", "وين", "متى", "ليش", "أي حجم", "اي حجم"];

export function looksLikeQuestion(textNorm: string): boolean {
  if (textNorm.includes("؟") || textNorm.includes("?")) return true;
  return QUESTION_INDICATORS.some((w) => textNorm.includes(w));
}

export function hasConsumptionHint(textNorm: string): boolean {
  return CONSUMPTION_VERB_HINTS.some((w) => textNorm.includes(w));
}

// عبارات اجتماعية قصيرة — تُفحص بمطابقة شبه-تامة (مو substring حر) حتى ما تبلع رسالة أكل حقيقية
// تبدأ برسالة ترحيب صدفة (مثلاً "هلا اكلت بيضتين وصمونة" لازم تضل LOG_MEAL)
export const GREETING_PHRASES = [
  "سلام", "السلام عليكم", "هلا", "هلاو", "هلا والله", "شلونك", "شلونچ", "شلونج", "شلونكم",
  "شنو الاخبار", "شنو أخبارك", "صباح الخير", "صباح النور", "صباح الفل", "مساء الخير", "مساء النور",
  "هاي", "hi", "hello", "يلا", "يلا بينا",
];
export const FAREWELL_PHRASES = ["تصبح على خير", "تصبحين على خير", "مع السلامة", "باي", "الله بالخير", "وياك بالسلامة"];
export const THANKS_PHRASES = [
  "شكرا", "شكراً", "شكرا الك", "مشكور", "مشكورين", "ممنون", "تسلم", "تسلمين",
  "يعطيك العافية", "الله يعافيك", "عاشت ايدك", "عاشت إيدك",
];
export const ACKNOWLEDGEMENT_PHRASES = ["زين", "زينين", "ماشي", "تمام", "اوكي", "اوك", "اي", "ايه", "نعم"];

export interface IntentContext {
  has_pending?: boolean;
  has_recipe?: boolean;
  has_undoable_log?: boolean;
  has_pending_recipe?: boolean;
  has_pending_food_topic?: boolean;
}

/**
 * صحيح لو الرسالة تساوي إحدى العبارات تمامًا، أو تبدأ فيها ويبقى بعدها ذيل قصير جدًا
 * (مثلاً "هلا كابتن") — يمنع ابتلاع رسالة أكل حقيقية تبدأ صدفة بكلمة ترحيب.
 */
function isMostlyPhrase(text: string, phrases: string[], maxExtra = 8): boolean {
  for (const p of phrases) {
    if (text === p) return true;
    if (text.startsWith(p) && text.length - p.length <= maxExtra) return true;
  }
  return false;
}

const includesAny = (text: string, phrases: string[]): boolean => phrases.some((p) => text.includes(p));

/**
 * ctx المتوقع: has_pending/has_recipe/has_undoable_log/has_pending_recipe/has_pending_food_topic.
 * الترتيب هنا هو ترتيب الأولوية (نفس فلسفة nutrition_engine.py القديمة، لكن مركزّة بمكان واحد).
 */
export function detectIntent(textNorm: string, ctx: IntentContext): string {
  const hasPending = ctx.has_pending ?? false;
  const hasRecipe = ctx.has_recipe ?? false;
  const hasUndoableLog = ctx.has_undoable_log ?? false;
  const hasPendingRecipe = ctx.has_pending_recipe ?? false;
  const hasPendingFoodTopic = ctx.has_pending_food_topic ?? false;

  if (includesAny(textNorm.toLowerCase(), OFFTOPIC_KEYWORDS)) return OFFTOPIC;
  if (includesAny(textNorm, MEDICAL_KEYWORDS)) return MEDICAL;

  // عبارات اجتماعية قصيرة — لا تحول أبدًا لنية غذائية، بغض النظر عن حالة المحادثة
  if (isMostlyPhrase(textNorm, GREETING_PHRASES)) return GREETING;
  if (isMostlyPhrase(textNorm, FAREWELL_PHRASES)) return FAREWELL;
  if (isMostlyPhrase(textNorm, THANKS_PHRASES)) return THANKS;

  if (hasPending) {
    if (CANCEL_PHRASES.includes(textNorm)) return CANCEL;
    if (CONFIRM_PHRASES.includes(textNorm)) return CONFIRM;
    if (includesAny(textNorm, CORRECTION_PHRASES)) return CORRECTION;
    if (includesAny(textNorm, SWAP_FOOD_PHRASES) && textNorm.includes("ب")) return SWAP_FOOD;
    if (includesAny(textNorm, REMOVE_FOOD_PHRASES)) return REMOVE_FOOD;
    if (includesAny(textNorm, CHANGE_QUANTITY_PHRASES)) return CHANGE_QUANTITY;
    if (includesAny(textNorm, ADD_FOOD_PHRASES)) return ADD_FOOD;
  }

  // جواب على "سويتها 😋 أكلتها لو بعدك؟" (وصفة خلص طبخها) — أولوية بعد pending (بناء وجبة) مباشرة
  // وقبل نافذة تراجع قديمة، حتى لو فيه undo سابق منتهي الأثر
  if (hasPendingRecipe && !hasPending) {
    if (CANCEL_PHRASES.includes(textNorm)) return CANCEL;
    if (CONFIRM_PHRASES.includes(textNorm) || RECIPE_EATEN_PHRASES.includes(textNorm)) return CONFIRM;
    if (NOT_YET_PHRASES.includes(textNorm)) return NOT_YET;
  }

  // جواب على اشتهاء/نية أكل طعام محدد ("مشتهي دولمة" ثم "اي"/"ماريد") — نفس منطق
  // has_pending_recipe فوق، بس لموضوع طعام عادي مو وصفة قيد الطبخ
  if (hasPendingFoodTopic && !hasPending && !hasPendingRecipe) {
    if (CANCEL_PHRASES.includes(textNorm)) return CANCEL;
    if (CONFIRM_PHRASES.includes(textNorm)) return CONFIRM;
    // "مشتهي دولمة" ← "500 سعرة" / "أريدها 500 سعرة" — رقم هدف يخص نفس الطعام المطروح توًا،
    // مو محادثة جديدة (نفس التوجيه اللي يستلمه ASK_PORTION_FOR_FOOD أصلاً، انظر handlePortionForFood)
    if (/\d/.test(textNorm) && (textNorm.includes("سعر"))) return ASK_PORTION_FOR_FOOD;
  }

  // وجبة اتسجّلت مباشرة (DIRECT_LOG) وبعدها ضمن نافذة التراجع — نفس عائلة أوامر التعديل
  // تشتغل عليها هي، مو على وجبة جديدة (مثلاً "لا مو بيضتين، 3" بعد "اكلت بيضتين")
  if (hasUndoableLog && !hasPending) {
    if (UNDO_PHRASES.includes(textNorm)) return CANCEL;
    if (includesAny(textNorm, CORRECTION_PHRASES)) return CORRECTION;
    if (includesAny(textNorm, SWAP_FOOD_PHRASES) && textNorm.includes("ب")) return SWAP_FOOD;
    if (includesAny(textNorm, REMOVE_FOOD_PHRASES)) return REMOVE_FOOD;
    if (includesAny(textNorm, CHANGE_QUANTITY_PHRASES)) return CHANGE_QUANTITY;
    if (includesAny(textNorm, ADD_FOOD_PHRASES)) return ADD_FOOD;
  }

  if (NOT_YET_PHRASES.includes(textNorm)) return NOT_YET;
  if (includesAny(textNorm, END_DAY_PHRASES)) return END_DAY;
  if (includesAny(textNorm, REMAINING_QUERY_PHRASES)) return ASK_REMAINING;
  if (includesAny(textNorm, GENERAL_NUTRITION_MARKERS) && includesAny(textNorm, GENERAL_NUTRITION_TOPICS)) {
    return GENERAL_NUTRITION;
  }
  if (includesAny(textNorm, CALORIE_TARGET_MEAL_PHRASES)) return ASK_CALORIE_TARGET_MEAL;
  // صيغة أوسع: فعل تحضير/رغبة + كلمة وجبة + رقم + "سعرة" ("سويلي الغداء 600 سعرة")
  if (
    /\d/.test(textNorm) && textNorm.includes("سعر") &&
    includesAny(textNorm, MEAL_TYPE_WORDS) && includesAny(textNorm, MEAL_BUDGET_VERB_MARKERS)
  ) {
    return ASK_CALORIE_TARGET_MEAL;
  }
  if (includesAny(textNorm, SUGGEST_QUERY_PHRASES)) return ASK_RECOMMENDATION;
  if (includesAny(textNorm, ASK_TIP_PHRASES)) return ASK_TIP;
  if (includesAny(textNorm, WEIGHT_PHRASES)) return WEIGHT_UPDATE;
  if (includesAny(textNorm, WATER_PHRASES)) return WATER_LOG;

  if (hasRecipe && (includesAny(textNorm, COOKING_NEXT_PHRASES) || includesAny(textNorm, COOKING_START_PHRASES))) {
    return COOKING_STEP;
  }
  if (hasRecipe && includesAny(textNorm, MISSING_INGREDIENT_TRIGGERS)) return COOKING_STEP;
  if (includesAny(textNorm, RECIPE_TRIGGERS) || includesAny(textNorm, RECIPE_CATEGORY_PHRASES)) return ASK_RECIPE;

  // What If Simulator — "إذا أكلت X هسه؟" — لازم يُفحص قبل أي فحص فعل استهلاك (بما فيها
  // الحارس النهائي أسفل) لأن الرسالة غالبًا تحتوي فعل استهلاك حقيقي ("أكلت") جوا الصياغة
  // الفرضية نفسها — هذا بالضبط ما كان يخلي hasConsumptionHint يتفعّل بالغلط ويُسقِط الرسالة
  // لـLOG_MEAL الافتراضي (Bug حقيقي حي مُصلَح هنا).
  if (includesAny(textNorm, WHAT_IF_PARTICLES) && WHAT_IF_CONSUMPTION_HINTS.some((w) => textNorm.includes(w))) return WHAT_IF;

  // أسئلة معلوماتية صرفة عن طعام (سعرات/حجم/وحدة/ملاءمة/بديل) — لازم تُفحص قبل PORTION_QUESTION_
  // MARKERS/LOG_MEAL لأنها لا تطلب توصية كمية ولا تعبّر عن نية أكل، بس معلومة. هذا يسد بالضبط
  // ثغرة "شكد حجم البيتزا؟" اللي كانت تتسجل كوجبة أكل فعلية (بيتزا تتطابق بثقة كاملة وما فيه
  // نية سابقة توقفها قبل LOG_MEAL الافتراضي).
  if (includesAny(textNorm, FOOD_FIT_QUESTION_MARKERS)) return ASK_FOOD_FIT;
  if (includesAny(textNorm, UNIT_DEFINITION_MARKERS) && includesAny(textNorm, GENERIC_UNIT_WORDS)) return ASK_UNIT;
  if (includesAny(textNorm, FOOD_SIZE_QUESTION_MARKERS)) return ASK_FOOD_SIZE;
  if (includesAny(textNorm, CALORIES_QUESTION_MARKERS)) return ASK_CALORIES;
  if (includesAny(textNorm, SUBSTITUTION_MARKERS)) return ASK_SUBSTITUTION;

  // ترتيب مقصود بالأولوية: سؤال الكمية أولاً (حتى رسالة مركّبة "مشتهي دولمه شكد لازم اكل؟"
  // تروح لتوصية كمية مباشرة)، ثم الاشتهاء، ثم النية المستقبلية — الثلاثة قبل LOG_MEAL الافتراضي
  // حتى ما تنعامل كاستهلاك فعلي بالغلط (نفس مشكلة "راح اكل دولمه" الأصلية)
  if (includesAny(textNorm, PORTION_QUESTION_MARKERS)) return ASK_PORTION_FOR_FOOD;
  if (includesAny(textNorm, CRAVING_MARKERS)) return EXPRESS_CRAVING;
  if (includesAny(textNorm, PLAN_TO_EAT_MARKERS)) return PLAN_TO_EAT;

  if (!hasPending && includesAny(textNorm, ADD_FOOD_PHRASES)) return ADD_FOOD;

  // "تمام"/"اي"/"زين" بدون أي وجبة أو تسجيل مباشر بانتظار رد عليه — رد اجتماعي فقط، صفر تسجيل
  // (لو فيه pending أو has_undoable_log كانت النية اتحسمت فوق كـCONFIRM/CANCEL أصلاً)
  if (!hasPending && !hasUndoableLog && isMostlyPhrase(textNorm, ACKNOWLEDGEMENT_PHRASES)) {
    return ACKNOWLEDGEMENT;
  }

  // رغبة/احتمال ("أريد بيض"، "يمكن آكل تمن") — مو استهلاك فعلي، لازم تُفحص قبل LOG_MEAL
  // الافتراضي، وإلا "أريد بيض" كانت راح تتسجل direct-log كبيضة وحدة فعلية
  if (includesAny(textNorm, DESIRE_MARKERS)) return EXPRESS_DESIRE;

  // حارس أمان عام أخير: أي رسالة تقرأ كسؤال (أداة استفهام أو "؟") ومالها فعل استهلاك صريح
  // (اكلت/تغديت/فطرت...) ما تنعامل أبدًا كتسجيل وجبة افتراضي — حتى لو ذكرت اسم طعام يتطابق
  // بثقة كاملة. أفضل رد "ما فهمت سؤالك بوضوح" من تسجيل وجبة وهمية بحساب المستخدم بالغلط.
  if (!hasConsumptionHint(textNorm) && looksLikeQuestion(textNorm)) {
    return ASK_GENERAL_FOOD_INFO;
  }

  // افتراضي: نحاول نطابقها كوجبة جديدة (المتصل orchestrator يقرر UNKNOWN إذا ما لقى أكل)
  return LOG_MEAL;
}
