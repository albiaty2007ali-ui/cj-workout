/**
 * منفذ حرفي من nutrition_ai/responses.py — Response Templates. صياغات متعددة لكل نوع حدث بدل
 * جملة ثابتة تتكرر. الأرقام (سعرات/متبقي) تُمرَّر جاهزة من calculator.ts — هذا الملف يصيغ
 * الجملة فقط، ما يحسب شي. اختيار عشوائي بين القوالب (نفس random.choice بايثون) — التطابق هنا
 * يُختبر بأن الناتج ضمن مجموعة القوالب الصحيحة + الاستبدال (interpolation) صحيح، وليس بمطابقة
 * نص واحد محدد (السلوك أصلًا عشوائي بكلا اللغتين).
 */
import { pyRound, pyFloatStr } from "./pyRound.js";

export const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "الفطور", lunch: "الغداء", dinner: "العشاء", snack: "السناك",
};

export const MEAL_LOGGED_TEMPLATES = [
  "تم تسجيل {meal} ✓", "ثبتناها إلك 👍 {meal} انسجّل.", "تمام، انضافت لليوم. {meal} خلص.",
  "زين، سجلتها إلك ✓ {meal} خلص.", "تمام كابتن، {meal} انحسبت وانضافت لجدولك اليوم.",
  "خلصت 💪 {meal} مسجّل بالكامل.", "تسجّلت {meal} بنجاح ✓ عاشت إيدك.",
  "زين جدًا، {meal} صارت جزء من حساب اليوم.", "تمام، حطيت {meal} بالسجل. استمر هيچي 🌱",
  "أبشر، {meal} تثبتت إلك ✓",
];

export const MEAL_CONFIRM_PROMPT_TEMPLATES = [
  'أثبتها ضمن {meal}؟ (اكتب "اي" للتأكيد)', "هذا يصير {meal}. أثبتها؟",
  "خلّيها هيچي {meal}؟ اكتب تمام للتأكيد.", 'هاي تنحسب {meal} — تأكد الحساب صحيح وگلي "اي".',
  'أسجلها إلك ضمن {meal}؟ رد بـ"اي" أو "لا".', 'صح هذا شكل {meal}؟ اكتب "تمام" لو "اي" حتى أثبتها.',
  "باقي بس تأكيدك — أعتبرها {meal}؟", 'گلّي "اي" وأثبتلك هذا كـ{meal}، أو صحح إذا شي ناقص.',
];

export const WATER_LOGGED_TEMPLATES = [
  "تمام، سجلت {ml} مل ماي 💧", "زين، ضفنا {ml} مل لماي اليوم 💧", "أبشر، {ml} مل ماي انسجلت.",
  "تسجّل {ml} مل ماي ✓ استمر عليها.", "عاشت إيدك، ضفت {ml} مل لرصيد الماي اليوم 💧",
  "تمام كابتن، {ml} مل ماي انحسبت إلك.", "خلصت {ml} مل ✓ جسمك يشكرك 💧",
  "زين جدًا، صار عندك {ml} مل إضافية اليوم.",
];

export const WEIGHT_UPDATED_TEMPLATES = [
  "سجلت وزنك الجديد: {weight} كغم. هدفك الحالي: {target} سعرة.",
  "تمام كابتن، حدّثنا وزنك لـ{weight} كغم. الهدف صار {target} سعرة باليوم.",
  "زين، ثبتنا وزنك عند {weight} كغم — وعدّلنا هدفك ليصير {target} سعرة.",
  "تمام، وزنك الجديد {weight} كغم وصار هدفك اليومي {target} سعرة.",
  "عاشت إيدك على المتابعة 💪 وزنك هسه {weight} كغم، والهدف {target} سعرة.",
  "سجّلنا {weight} كغم كوزن جديد، وحدّثنا حسابك ليصير {target} سعرة باليوم.",
];

export const DIRECT_LOG_UNDO_HINT_TEMPLATES = [
  '↩️ اكتب "لا" أو "شيلها" إذا تريد تراجع.', '↩️ لو غلطة، اكتب "لا" وأرجعها.',
  '↩️ مو هذا الي تريده؟ گلي "لا" وأصلحها.', '↩️ تگدر تتراجع بأي وقت قريب، بس اكتب "شيلها".',
  '↩️ إذا تحتاج تعدلها، گلي شنو الغلط وأصلحلك ياها.', '↩️ ماكو مشكلة نصلحها، بس اكتب "لا".',
];

export const RECIPE_FINISHED_TEMPLATES = [
  'سويتها 😋 أكلتها لو بعدك؟\nاكتب "أكلتها" إذا خلصت الأكل وأحسبلك السعرات، "بعدني" إذا لسا، أو "لا" إذا ما أكلتها.',
  'خلصت الوصفة 👨‍🍳 أكلتها فعلًا؟\nگلي "أكلتها" حتى أسجلها وأحسب سعراتها، أو "بعدني" لو لسا، أو "لا" إذا تغيرت وياك.',
  'بالعافية عليك مقدمًا 🍽️ بس أكلتها لو لسا؟\n"أكلتها" تسجّلها بسعراتها الحقيقية، "بعدني" تخليها تنتظرك، "لا" تلغيها.',
  'خلصت الطبخ 🍳 شهيتك تفتحت أكيد! أكلتها هسه لو بعدك؟\nاكتب "أكلتها" للتسجيل، "بعدني" لو لسا، أو "لا" إذا تراجعت.',
  'تم 👨‍🍳 الوصفة خلصت. بس أكلتها فعلًا لو بعدها بالصحن؟\n"أكلتها" تحسبها إلك بدقة، "بعدني" لو راح تاكلها بعدين، "لا" إذا ماكو أكل.',
  'بالهنا والشفا مقدمًا 😋 أكلتها لو بعد؟\n"أكلتها" وأنا أحسبلك كل شي، "بعدني" تخليها معلقة، "لا" تلغي الموضوع.',
  'خلصت خطوات الطبخ ✅ الحين، أكلتها لو بعدك ماكلها؟\nگلّي "أكلتها" حتى أثبت السعرات، أو "بعدني"، أو "لا".',
];

export const RECIPE_NOT_YET_TEMPLATES = [
  'تمام، خليها بوقتها ❤️\nمن تاكلها رجعلي وگلي "أكلتها" حتى أحسبها إلك.',
  'ماكو مشكلة، ياكل براحتك 🌱 وبعدين اكتب "أكلتها" وأنا أحسبها.',
  'زين، خذ وقتك 😊 وأي وقت تاكلها، بس گلي "أكلتها".',
  'تمام كابتن، ماكو استعجال. اكتب "أكلتها" بس تاكلها وراح أسجلها بدقة.',
  'ولا يهمك، خلها براحتها 🍽️ وأنا بانتظار "أكلتها" منك.',
  "تمام، بعدها بانتظارك بالصحن 😄 خبرني بس تخلص.",
];

export const RECIPE_DECLINED_TEMPLATES = [
  "تمام 👍 ما راح أحسبها عليك.", "أوكي، ما سجلتها. خبرني إذا احتجت شي ثاني.",
  "ماكو مشكلة، ما راح تنحسب 🌱", "تمام، الغيتها من الحساب. أي وقت تحتاج وصفة ثانية گلي.",
  "زين، ما ضفتها للسجل. شنو رأيك نشوف وصفة بديلة؟", "أوكي كابتن، تم إلغاؤها بدون أي حساب.",
];

export const DESIRE_ACK_WITH_FOOD_TEMPLATES = [
  "تمام، لما تاكلها خبرني حتى أسجلها وأحسبلك السعرات 🌱", "زين، إذا اكلتها خبرني وأسجلها إلك مباشرة.",
  "تمام كابتن، بانتظارك. بس تاكلها گلي وأحسبها إلك.", "أوكي، خذ وقتك. أي وقت تاكل خبرني حتى أرتب حسابك.",
  "زين، فكرة حلوة 😋 وبس تصير حقيقة خبرني وأسجلها.", "تمام، محفوظة عندي. لما تاكلها فعليًا گلي وأحسبها.",
];

export const DESIRE_ACK_GENERIC_TEMPLATES = [
  "تمام، خبرني لما تاكل حتى أرتب حسابك.", "أوكي، وإذا تريد اقتراح هسه گلي.",
  "زين، أنا موجود أي وقت تحتاج شي.", "تمام كابتن، خذ راحتك وخبرني وقت تقرر.",
  "ماكو مشكلة، وإذا تحتاج فكرة عن شنو تاكل، بس اسأل.", "أوكي، بانتظار خبر منك.",
];

export const GREETING_TEMPLATES = [
  "هلا بيك 👋 كابتن CJ وياك، شنو مخطط اليوم؟", "هلا 😊 شنو أكلت لحد هسه؟",
  "أهلاً كابتن 💪 جاهز نرتب يومك؟", "هلا بيك، شلونك اليوم؟",
  "هلا وغلا 🌱 شنو الأخبار، أكلت شي لحد هسه؟", "أهلين كابتن ✨ خل نشوف وين وصلنا اليوم.",
  "هلا بيك من جديد 👋 شنو بيدك تسوي اليوم؟", "هاي كابتن 😎 جاهز نكمل من وين وقفنا؟",
  "هلا فيك 🌟 شنو حاب تسجل أو تعرف اليوم؟", "أهلاً وسهلاً 💪 خبرني شنو صاير معاك اليوم.",
];

export const RETURN_SHORT_TEMPLATES = [
  "هلا بيك 👋 خبرني شنو أكلت اليوم حتى نكمل.", "هلا 😊 شنو وضعك اليوم؟",
  "أهلين، رجعت زين 🌱 شنو أكلت لليوم؟", "هلا كابتن، خل نكمل من وين وقفنا. شنو أكلت؟",
  "هلا بيك، يوم جديد وصفحة جديدة 💪 شنو عندك اليوم؟", "أهلاً، جاهز نرتب اليوم؟ گلي شنو أكلت.",
];

export const RETURN_MEDIUM_TEMPLATES = [
  "هلا بيك من جديد ❤️ صارلك كم يوم ما نتحدث، بس ماكو مشكلة.\nخلينا نرتب يومك من البداية — شنو أكلت لحد هسه؟",
  "أهلاً 😄 المهم رجعت. خلينا نبدأ اليوم بشكل مرتب، گلي شنو أكلت اليوم؟",
  "هلا بيك 🌱 مر وقت من آخر مرة، بس المهم إنك رجعت.\nخل نبدي من جديد — شنو أكلت اليوم؟",
  "أهلين كابتن 💪 غياب بسيط ما يأثر على شي.\nخلينا نكمل الطريق من هسه، شنو أكلت لحد الآن؟",
  "هلا وغلا ❤️ يهمني إنك رجعت أكثر من أي شي ثاني.\nخل نشوف يومك اليوم — شنو أكلت؟",
];

export const RETURN_LONG_TEMPLATES = [
  "هلاا رجعت 😄 اشتقنالك.\nما يهم الفترة اللي مرت، المهم رجعت ❤️\nخلينا نرتب يومك من البداية — شنو أكلت لحد هسه؟",
  "هلا بيك من جديد 💪 رجعت بوقت ممتاز.\nخلينا نبدأ من الصفر اليوم، أول شي شنو أكلت؟",
  "هلا هلا 🌱 كل غيبة إلها رجعة، والمهم إنك هسه هنا.\nخل نبدي صفحة جديدة اليوم — شنو أكلت؟",
  "أهلاً وسهلاً من جديد ❤️ ماكو لوم ولا تأنيب، بس فرحة إنك رجعت.\nخلينا نرتب كل شي من جديد، گلي شنو أكلت لحد هسه؟",
  "هلا بيك كابتن 💪 الوقت مر بس الهدف لسا موجود.\nخل نبدأ اليوم بقوة — شنو أكلت لحد الآن؟",
];

export const STREAK_CONTINUES_TEMPLATES = [
  "🔥 محافظ على الستريك، اليوم يومك الـ{days}.", "🔥 يوم {days} بالستريك — عاشت إيدك.",
  "🔥 استمرارية رائعة، وصلت يوم {days} على التوالي.", "🔥 يوم {days} من الالتزام — ما توقفت.",
  "🔥 الستريك مستمر لليوم الـ{days}، استمر هيچي.", "🔥 {days} يوم متواصل — هذا انضباط حقيقي.",
];

export const FAREWELL_TEMPLATES = [
  "تصبح على خير ❤️ كابتن CJ وياك، وباجر نكمل.", "مع السلامة 🌙 باجر نرتب يوم جديد.",
  "الله بالخير، أشوفك باجر 💪", "تصبح على خير كابتن 🌙 يوم زين اليوم.",
  "مع السلامة ❤️ خذ راحتك، وباجر نبدي من جديد.", "الله معاك 🌱 نشوفك باجر إن شاء الله.",
  "ليلة هنية 🌙 وباجر نكمل المشوار.", "مع السلامة كابتن 💪 استريح زين.",
];

export const THANKS_TEMPLATES = [
  "العفو حبي ❤️", "تسلم، هذا شغلي 😊", "ولا يهمك، دايمًا حاضر 💪", "العفو كابتن، أي وقت تحتاج شي 🌱",
  "تدلل، هذا واجبي 😊", "ولا شكر على واجب ❤️", "حاضر دايمًا، ما عليك أمر 💪", "العفو، سعيد إني أفيدك.",
];

export const ACKNOWLEDGEMENT_TEMPLATES = [
  "عاشت إيدك 😎 شنو مخطط اليوم؟", "زين 👍 خبرني إذا تريد تسجل شي أو تحتاج اقتراح.",
  "تمام، أنا موجود إذا تحتاج شي.", "تمام كابتن 💪 گلي شنو التالي.",
  "زين جدًا 🌱 أي وقت تحتاج مساعدة گلي.", "أوكي، بانتظار أوامرك 😄",
  "تمام، خل نشوف شنو نسوي بعدين.", "زين، أنا جاهز لأي شي تحتاجه.",
];

export const COMPENSATION_MILD_TEMPLATES = [
  "\n\nتجاوز بسيط وما يسوى توقف بسببه. لا تستسلم، أنت بطل قصتك 💪 باجر نرجع للخطة ونكمل.",
  "\n\nزيادة بسيطة اليوم، ماكو داعي تحاسب نفسك عليها 🌱 استمر بنفس الطريق باجر.",
  "\n\nشوية زيادة عادية، صارت وراح تصير أحيانًا. المهم الاستمرارية مو الكمال 💪",
  "\n\nتجاوز خفيف جدًا، ما يأثر على مشوارك العام. خل نكمل باجر بنفس الحماس.",
  "\n\nهذا فرق بسيط، وما يلغي كل شغلك اليوم. استمر، وباجر يوم جديد.",
  "\n\nزيادة صغيرة ما تستاهل قلق. جسمك يتحمل هيچي فروقات — المهم النمط العام.",
  "\n\nشوية زيادة، وما راح توقفك عن هدفك 🌱 خلها وراك وكمل.",
];

export const COMPENSATION_HIGH_TEMPLATES = [
  "\n\nاليوم كان أعلى من هدفك، بس هذا ما يعني الخطة فشلت. خلينا نوازن باقي اليوم بوجبات أخف ومشبعة (سلطة + بروتين خفيف + ماي)، ونرتب باجر بشكل أفضل.",
  "\n\nتجاوزت الهدف اليوم أكثر من المعتاد، وماكو مشكلة بهذا. خل نخفف باقي اليوم بأكل خفيف وماي وياي، وباجر نبدأ بخطة مرتبة.",
  "\n\nاليوم زاد الحساب عن المخطط، بس هذا ما يلغي كل مجهودك. جرب توازن باقي اليوم بوجبة خفيفة، وباجر صفحة جديدة.",
  "\n\nصار تجاوز واضح اليوم، وهذا طبيعي يصير أحيانًا. خل نرتب باقي اليوم بأكل بسيط وخفيف، وباجر نضبط الخطة من جديد.",
  "\n\nاليوم تجاوزت أكثر من المعتاد، ما تحتاج تشعر بالذنب. خفف باقي اليوم شوي (خضار + بروتين + ماي)، وباجر نبدأ بحماس أكبر.",
  "\n\nصار فرق واضح عن الهدف اليوم. هذا جزء طبيعي من الرحلة — وازن باقي يومك، وباجر نرجع للمسار الصح.",
  "\n\nاليوم كان أعلى من الخطة، بس ما يعني شي راح يخرب. خل الوجبة الجاية أخف وأبسط، وباجر يوم مختلف.",
];

export const CLARIFY_CONFIRM_MATCH_TEMPLATES = [
  "تقصد {food}؟ (اكتب اي أو لا)", "قصدك {food}؟ گلي اي لو لا.",
  'يعني تقصد {food} صح؟ أكد إلي بـ"اي" أو "لا".', "تحسب هذا {food}؟ رد اي أو لا.",
  "هل هذا يقصد {food}؟ خبرني اي أو لا.", "شكلك تقصد {food} — صح؟ اكتب اي أو لا.",
];

export const CLARIFY_AMBIGUOUS_TEMPLATES = [
  "تقصد {a} لو {b}؟", "قصدك {a} أو {b}؟", "أي وحدة تقصد، {a} لو {b}؟",
  "ودك تقول {a} أو تقصد {b}؟", "بين {a} و{b}، أيهم تقصد بالضبط؟",
];

export const CLARIFY_QUANTITY_NO_PORTIONS_TEMPLATES = [
  "تمام، شكد تقريبًا أكلت من {food}؟ اكتبلي الوزن بالغرام.",
  "زين، شكد وزن اللي أكلته من {food}؟ گلي بالغرام تقريبًا.",
  "تمام كابتن، حدد شكد گرام تقريبًا من {food}.",
  "زين، بس أحتاج الكمية — شكد گرام كان {food}؟",
  "تمام، عطني تقدير الوزن بالغرام لـ{food}.",
];

export const CLARIFY_QUANTITY_HEADER_TEMPLATES = [
  "تمام كابتن، شكد تقريبًا أكلت من {food}؟ 🌱", "زين، شكد وزن أو كمية أكلتها من {food}؟",
  "تمام، احتاج أعرف الكمية — شكد أكلت من {food}؟", "كابتن، شكد تقريبًا كانت كمية {food}؟",
  "زين جدًا، بس عطني فكرة عن كمية {food} اللي أكلتها.",
];

export const CLARIFY_QUANTITY_FOOTER_TEMPLATES = [
  "أو اكتبلي الوزن بالغرام.", "أو گلي بالغرام إذا تعرفه بالضبط.", "ولو تعرف الوزن بالغرام، اكتبه مباشرة.",
];

export const CRAVING_ACK_WITH_FOOD_TEMPLATES = [
  "تمام، إذا مشتهي {food} أگدر أحددلك كمية مناسبة لسعراتك — بس گلي.",
  'زين، مشتهي {food}؟ گلي "شكد آكل" وأحسبلك كمية تناسب باقي يومك.',
  "تمام، {food} خيار زين — لو تريد أعرفلك شكد مناسب منها هسه، بس اسأل.",
];

export const CRAVING_ACK_GENERIC_TEMPLATES = [
  "تمام، شنو تحديدًا تشتهي؟ گلي اسم الأكلة وأساعدك بالكمية المناسبة.",
  "زين، خبرني شنو بالضبط تشتهي حتى أشوفلك كمية تناسب سعراتك.",
];

export const PLAN_ACK_WITH_FOOD_TEMPLATES = [
  "تمام، إذا ناوي على {food} أگدر أحددلك الكمية المناسبة حسب سعراتك — بس گلي.",
  'زين، لما تنوي تاكل {food}، گلي "شكد آكل" وأحسبلك كمية مناسبة.',
  "تمام، {food} خيار موجود — أي وقت تريد تعرف الكمية المناسبة، اسأل.",
];

export const PLAN_ACK_GENERIC_TEMPLATES = [
  "تمام، شنو بالضبط ناوي تاكل؟ گلي اسم الأكلة حتى أساعدك بالكمية.", "زين، خبرني شنو ناوي عليه بالضبط.",
];

export const FOOD_TOPIC_CANCEL_ACK_TEMPLATES = ["تمام 👍 نسيت الموضوع.", "أوكي، ماكو مشكلة.", "تمام، خبرني إذا احتجت شي ثاني."];

export const NO_FOOD_IN_TOPIC_PROMPT_TEMPLATES = [
  "شكد آكل من شنو بالضبط؟ گلي اسم الأكلة.", "عن أي أكلة تسأل؟ گلي اسمها وأحسبلك الكمية المناسبة.",
];

// أسئلة تغذية معلوماتية عامة (GENERAL_NUTRITION) — تعليم عام فقط، صفر أرقام مخترعة، وصفر
// نصيحة طبية. كل موضوع له مفتاح مطابق لكلمات GENERAL_NUTRITION_TOPICS بـintents.ts.
export const GENERAL_NUTRITION_TEMPLATES: Record<string, string[]> = {
  protein: [
    "البروتين يساعدك تحافظ على العضل وتحس بشبع أطول، وخصوصًا مهم إذا هدفك تنزيل وزن. حاول تضيفه لكل وجبة قد ما تكدر.",
    "البروتين يساعد الجسم يتعافى ويحافظ على الكتلة العضلية — بيض ودجاج ولبن مصادر زينة تگدر تضيفها لوجباتك.",
  ],
  carb: ["الكارب مو مضر بحد ذاته — هو مصدر طاقة أساسي، بس الكمية والنوع يفرقون. رز وتمن وخبز بكميات معقولة جزء طبيعي من وجبة متوازنة."],
  fat: ["لا، فيه دهون صحية زي اللي بالمكسرات وزيت الزيتون تحتاجها بجسمك، والمشكلة تصير بس بكميات كبيرة أو دهون مقلية زايدة."],
  fiber: ["الألياف موجودة بالخضار والفواكه والحبوب الكاملة، وتساعدك بالهضم وتخليك تحس بشبع أطول. سلطة صغيرة وياي وجبة تزيدها بسهولة."],
  sugary_drinks: ["المشروبات الغازية والسكرية تضيف سعرات هواي بدون ما تشبعك، فتقليلها تدريجيًا يفرق فعلاً بمجموع سعراتك اليومي."],
  fast_food: ["مرة وحدة بالأسبوع ضمن حساب سعراتك اليومي ماكو مشكلة كبيرة — المهم توازن باقي الأسبوع وما تخليها عادة يومية."],
  desserts: ["لا، ماكو داعي تمنع نفسك بالكامل — قطعة حلو صغيرة ضمن حسابك اليومي أفضل بكثير من الحرمان الكامل اللي يخليك تنهار بعدين."],
  pre_workout: ["وجبة خفيفة فيها كارب سريع وبروتين بسيط قبل التمرين بساعة تقريبًا تعطيك طاقة كافية — موزة أو تمر مع شوية بروتين خيار زين."],
  post_workout: ["بروتين وكارب سوا بعد التمرين يساعد الجسم يتعافى، زي دجاج مع رز أو بيض مع خبز — ضمن سعراتك المتبقية طبعًا."],
  meal_timing: ["ماكو وقت سحري واحد يناسب الكل — المهم توزع سعراتك بشكل مريح إلك خلال اليوم وتتجنب وجبة ثقيلة جدًا قريب وقت النوم."],
  generic: ["يعتمد على الكمية والنوع بالضبط — لو تحدد الطعام أو السؤال أكثر، أگدر أساعدك بمعلومة أدق."],
};

function pick<T>(templates: T[]): T {
  return templates[Math.floor(Math.random() * templates.length)];
}

function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}

export const greeting = () => pick(GREETING_TEMPLATES);

export function returnGreeting(tier: "short" | "medium" | "long"): string {
  return pick({ short: RETURN_SHORT_TEMPLATES, medium: RETURN_MEDIUM_TEMPLATES, long: RETURN_LONG_TEMPLATES }[tier]);
}

export const streakContinuesNote = (days: number) => format(pick(STREAK_CONTINUES_TEMPLATES), { days });
export const farewell = () => pick(FAREWELL_TEMPLATES);
export const thanksAck = () => pick(THANKS_TEMPLATES);
export const acknowledgement = () => pick(ACKNOWLEDGEMENT_TEMPLATES);
export const mealLogged = (mealType: string) => format(pick(MEAL_LOGGED_TEMPLATES), { meal: MEAL_TYPE_LABELS[mealType] ?? "الوجبة" });
export const directLogUndoHint = () => pick(DIRECT_LOG_UNDO_HINT_TEMPLATES);
export const recipeFinishedPrompt = () => pick(RECIPE_FINISHED_TEMPLATES);
export const recipeNotYetAck = () => pick(RECIPE_NOT_YET_TEMPLATES);
export const recipeDeclinedAck = () => pick(RECIPE_DECLINED_TEMPLATES);
export const desireAck = (hasFood: boolean) => pick(hasFood ? DESIRE_ACK_WITH_FOOD_TEMPLATES : DESIRE_ACK_GENERIC_TEMPLATES);

export interface InlineItem {
  food_name: string;
  quantity?: number | null;
}

/** يعرض عناصر الوجبة كسطر واحد طبيعي ("بيضة ×2 + صمونة") بدل قائمة نقطية بكل مرة. */
export function itemsInline(items: InlineItem[]): string {
  const parts: string[] = [];
  for (const item of items) {
    const qty = item.quantity;
    if (qty && qty !== 1) {
      // JS ما يميّز 2 عن 2.0 (بعكس بايثون) — String(qty) يعطي "2" و"2.5" مباشرة، يطابق
      // int(qty) if float(qty).is_integer() else qty بالأصل بدون حاجة لفرع منفصل.
      parts.push(`${item.food_name} ×${qty}`);
    } else {
      parts.push(item.food_name);
    }
  }
  return parts.join(" + ");
}

export const mealConfirmPrompt = (mealType: string) => format(pick(MEAL_CONFIRM_PROMPT_TEMPLATES), { meal: MEAL_TYPE_LABELS[mealType] ?? "الوجبة" });
export const waterLogged = (ml: number) => format(pick(WATER_LOGGED_TEMPLATES), { ml });

export const weightUpdated = (weight: number, target: number) =>
  format(pick(WEIGHT_UPDATED_TEMPLATES), { weight: pyFloatStr(weight), target });
export const compensationNote = (mild: boolean) => pick(mild ? COMPENSATION_MILD_TEMPLATES : COMPENSATION_HIGH_TEMPLATES);
export const clarifyConfirmMatch = (foodName: string) => format(pick(CLARIFY_CONFIRM_MATCH_TEMPLATES), { food: foodName });
export const clarifyAmbiguous = (optionA: string, optionB: string) => format(pick(CLARIFY_AMBIGUOUS_TEMPLATES), { a: optionA, b: optionB });
export const clarifyQuantityNoPortions = (foodName: string) => format(pick(CLARIFY_QUANTITY_NO_PORTIONS_TEMPLATES), { food: foodName });

export function clarifyQuantityWithPortions(foodName: string, portionLines: string): string {
  const header = format(pick(CLARIFY_QUANTITY_HEADER_TEMPLATES), { food: foodName });
  const footer = pick(CLARIFY_QUANTITY_FOOTER_TEMPLATES);
  return `${header}\n${portionLines}\n${footer}`;
}

export function cravingAck(foodName: string | null): string {
  return foodName ? format(pick(CRAVING_ACK_WITH_FOOD_TEMPLATES), { food: foodName }) : pick(CRAVING_ACK_GENERIC_TEMPLATES);
}

export function planAck(foodName: string | null): string {
  return foodName ? format(pick(PLAN_ACK_WITH_FOOD_TEMPLATES), { food: foodName }) : pick(PLAN_ACK_GENERIC_TEMPLATES);
}

export const foodTopicCancelAck = () => pick(FOOD_TOPIC_CANCEL_ACK_TEMPLATES);
export const noFoodInTopicPrompt = () => pick(NO_FOOD_IN_TOPIC_PROMPT_TEMPLATES);
export const generalNutritionAnswer = (topic: string) => pick(GENERAL_NUTRITION_TEMPLATES[topic] ?? GENERAL_NUTRITION_TEMPLATES.generic);

export function remainingMacro(label: string, remainingGrams: number, targetGrams: number): string {
  if (remainingGrams <= 0) {
    return `وصلت هدفك اليومي من ${label} (${targetGrams} غم تقريبًا) — عاشت إيدك 💪`;
  }
  return `باقيلك تقريبًا ${pyRound(remainingGrams)} غم ${label} من أصل ${targetGrams} غم اليوم.`;
}

// ---- What If Simulator (محاكاة فقط، صفر تسجيل وجبة أبدًا — راجع orchestrator.ts:handleWhatIf) ----

const WHAT_IF_NO_FOOD_TEMPLATES = [
  "شنو الأكلة اللي تسأل عنها بالضبط، أو شكد سعراتها تقريبًا؟ گلي وأحسبلك التأثير على سعراتك.",
];
const WHAT_IF_FITS_TEMPLATES = [
  "تگدر تاكلها كابتن 👍 {food} بيها ~{calories} سعرة، وباقيلك {remaining} سعرة اليوم — بعدها يضلّلك تقريبًا {after} سعرة.",
  "أي، {food} (~{calories} سعرة) يناسب سعراتك المتبقية ({remaining} سعرة) — بعد ما تاكلها يضلّلك تقريبًا {after} سعرة.",
];
const WHAT_IF_EXCEEDS_TEMPLATES = [
  "تگدر تاكلها، بس راح تتجاوز المتبقي اليومي بحوالي {over} سعرة ({food} ~{calories} سعرة مقابل {remaining} سعرة باقيلك).",
  "{food} (~{calories} سعرة) أعلى من الباقي إلك ({remaining} سعرة) بحوالي {over} سعرة لو أكلتها هسه.",
];
const WHAT_IF_ALTERNATIVES_INTRO_TEMPLATES = [
  "إذا تريد تبقى قريب من المتبقي، عندي كم خيار أخف من قسم وجبات الدايت:",
  "لو تحب بديل أقرب لسعراتك المتبقية، هذي خيارات حقيقية من قسم وجبات الدايت:",
];

export const whatIfNoFood = () => pick(WHAT_IF_NO_FOOD_TEMPLATES);

export function whatIfImpact(food: string, calories: number, remaining: number, after: number): string {
  if (after >= 0) return format(pick(WHAT_IF_FITS_TEMPLATES), { food, calories, remaining, after });
  return format(pick(WHAT_IF_EXCEEDS_TEMPLATES), { food, calories, remaining, over: Math.abs(after) });
}

export const whatIfAlternativesIntro = () => pick(WHAT_IF_ALTERNATIVES_INTRO_TEMPLATES);
