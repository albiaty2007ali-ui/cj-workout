# AI Architecture — CJ WORKOUT (Netlify/TypeScript engine)

هذا الملف يوثّق كيف تُستخدم Gemini بمشروع CJ WORKOUT الجديد (`shared/nutrition-engine/` +
`netlify/functions/chat.mts`)، وليش بُنيت بهذا الشكل بالضبط. يفترض قراءة `CLAUDE.md` أولاً
لفهم الهيكل العام (هذا الملف نسخة Netlify/TypeScript الجديدة، منفصلة عن Flask الأصلي الموثّق
هناك).

## القاعدة الذهبية (غير قابلة للتفاوض)

> **Gemini يفهم اللغة. لا يحسب سعرات، لا يخترع كميات، لا يسجّل وجبات.**

كل رقم غذائي نهائي (سعرات/بروتين/كارب/دهون/غرامات) يجي حصرًا من `foods.sqlite` عبر
`calculator.ts`/`foodSearch.ts`. لو Gemini اختفى تمامًا غدًا، التطبيق يبقى يشتغل بكامل دقته
الغذائية — بس بردود أقل ذكاءً بالفهم اللغوي المعقّد.

## الطبقات الثلاث

### 1. Local Intent Engine (`intents.ts`) — حتمي، صفر شبكة

كلمات مفتاحية/عبارات عراقية (`detectIntent()`) تصنّف كل رسالة لواحدة من ~35 نية. سريع، مجاني،
قابل للاختبار الكامل. **هذا يبقى المصدر الأساسي للقرار بكل الحالات الواضحة** (تسجيل وجبة، ماي،
وزن، تأكيد/إلغاء...).

**حارس أمان حرج** (أُضيف بعد اكتشاف Bug حقيقي — راجع "حادثة البيتزا" أسفل): أي رسالة تقرأ كسؤال
(أداة استفهام أو "؟") ومالها فعل استهلاك صريح (`hasConsumptionHint`)، أبدًا ما تنعامل كـ`LOG_MEAL`
افتراضي — ترجع `ASK_GENERAL_FOOD_INFO` بدالها (`looksLikeQuestion` بآخر `detectIntent()`).

### 2. Gemini NLU (`nlu/`) — اختياري، يُستدعى فقط عند الحاجة

يُستدعى **حصرًا** لما `detectIntent()` نفسه يرجّع `ASK_GENERAL_FOOD_INFO` — يعني النظام المحلي
اعترف صراحة إنه ما فهم. هذا هو Local-First Routing: أغلب الرسائل (تسجيل، ماي، وزن، أسئلة واضحة)
ما توصل Gemini إطلاقًا، صفر تكلفة/تأخير إضافي عليها.

```
User Message
    ↓
detectIntent() [محلي، حتمي]
    ↓
localIntent === ASK_GENERAL_FOOD_INFO ?
    ├── لا → استخدم localIntent مباشرة (99% من الرسائل)
    └── نعم + GEMINI_NLU_ENABLED=true
            ↓
        GeminiNLUProvider.understand(rawMessage, context)
            ↓ (Structured Output JSON، responseSchema صارم)
        validateNluResult() [Gemini NLU provider نفسها]
            ↓
        NLU_ALLOWED_INTENTS.has(intent)? [orchestrator.ts، تحقق مستقل ثاني]
            ├── لا → ارجع للنية المحلية (fallback صامت)
            └── نعم →
                Shadow Mode?
                  ├── نعم (الافتراضي) → سجّل بس، القرار المحلي يبقى الفعلي
                  └── لا (Live) → استخدم نية Gemini + food_query بالمعالج المحلي نفسه
```

**لماذا `ASK_GENERAL_FOOD_INFO` تحديدًا كنقطة الدخول؟** لأنه أصلاً "إشارة عدم ثقة" جاهزة
من النظام المحلي نفسه — بنيناها بالمرحلة 1 (حارس الأمان)، فاستخدامها كمشغّل NLU ما يحتاج أي
حساب Confidence إضافي مصطنع، وهي بالتعريف الحالات المعقدة/الغامضة اللي الكلمات المفتاحية عجزت
عنها (بند 26 بالطلب: "لا تدخل تعقيد غير مبرر").

### 3. Local Handlers + Food Database (كما هي، صفر تغيير)

بغض النظر مين قرر النية (محلي أو Gemini)، **نفس دوال `orchestrator.ts` بالضبط** (`handleFoodInfoQuestion`،
`handlePortionForFood`، إلخ) تتولى التنفيذ — تبحث بـ`foods.sqlite`، تحسب، وترجع رد. Gemini
أعطى بس "food_query" منظّف (تصحيح إملائي مثلاً) يُستخدم كنص بديل يُمرَّر لنفس دالة الاستخراج
المحلية (`extractFirstFood`) — لا يتجاوزها أبدًا.

## قواعد الأمان البنيوية (مو مجرد وعد بـsystem prompt)

1. **`LOG_MEAL` مستثناة نهائيًا من `NLU_ALLOWED_INTENTS`** (`nlu/knownIntents.ts`) — مهما ادّعى
   Gemini (`should_log_meal: true` أو أي شي)، مستحيل ينتج عنه مسار تسجيل وجبة، لأن أصلاً القيمة
   المرفوضة (`LOG_MEAL`) ما موجودة باللائحة البيضاء.
2. **تحقق مزدوج مستقل**: `GeminiNLUProvider.understand()` يتحقق داخليًا (`validateNluResult`)،
   و`orchestrator.ts` يتحقق **مرة ثانية بشكل مستقل** (`NLU_ALLOWED_INTENTS.has(result.intent)`)
   قبل ما يثق بأي نتيجة — دفاع بعمق (Defense in Depth)، ما نعتمد على طبقة وحدة.
   *اكتُشف فعليًا أثناء بناء الاختبارات*: بدون هذا التحقق الثاني، رسالة بريئة زي "ليش البيضة
   غالية هسه؟" (تحتوي صدفة اسم طعام يتطابق بثقة كاملة) كانت تتسجّل DIRECT_LOG فعلي لو مزوّد NLU
   (أي مستقبلي، مو حصرًا Gemini) ادّعى `LOG_MEAL` بدون تحقق داخلي صارم.
3. **الرسالة الأصلية تبقى مصدر الحقيقة**: NLU escalation ما يمس مسار `LOG_MEAL`/`handleMealMessage`
   إطلاقًا (نقطة الدخول الوحيدة `ASK_GENERAL_FOOD_INFO` أصلاً غير `LOG_MEAL`).
4. **Fail-safe دايمًا**: أي فشل (Timeout 4 ثواني، JSON غير صالح، نية غير مدرجة، خطأ شبكة) يرجّع
   `null`، والنظام يرجع للمسار المحلي فورًا، بدون كسر أو تعليق بالمحادثة.

## حادثة البيتزا (الدافع الحقيقي وراء هالتصميم)

أثناء التدقيق (قبل أي شغل بالمرحلة 3)، لقينا: **"شكد حجم البيتزا؟" كانت تُسجَّل كوجبة فعلية
(293 سعرة)** — لأن "بيتزا" تتطابق بثقة كاملة، وما كان فيه أي حارس يفرّق سؤال معلوماتي عن
استهلاك حقيقي. هذا صار الدرس المؤسِّس: أي تصميم NLU مستقبلي **يجب** يبني فوق حارس أمان صريح،
مو يعتمد على "الموديل رح يفهم صح" كضمانة وحيدة.

## Feature Flags

| المتغير | الافتراضي | الأثر |
|---|---|---|
| `GEMINI_NLU_ENABLED` | `false` (غير مضبوط) | `true` يفعّل استدعاء Gemini NLU عند `ASK_GENERAL_FOOD_INFO`. أي قيمة غير `"true"` = معطّل بالكامل. |
| `GEMINI_NLU_SHADOW_MODE` | `true` (حتى لو غير مضبوط، طالما NLU مفعّل) | `false` فقط يخلي نتيجة Gemini تُطبَّق فعليًا على الرد. **الوضع الآمن الافتراضي: يراقب بدون يغيّر شي.** |
| `GEMINI_API_KEY` | — | نفس المفتاح المستخدم بميزة إعادة الصياغة (`provider.ts`) — لا حاجة لمفتاح منفصل. |

**التفعيل التدريجي الموصى به**: `ENABLED=true` + `SHADOW_MODE=true` أسبوع أو أكثر (راقب
اللوگز `[nlu]` بـNetlify Function Logs، قارن `agreement` بين القرارين) → لو النتائج مطمئنة،
`SHADOW_MODE=false`.

**قرار مقصود: صفر Percentage Rollout حقيقي بهذي المرحلة.** بناء بنية A/B تدريجية (0%→10%→...)
تحتاج قاعدة مستخدمين حقيقية تبرر التعقيد — بحجم استخدام التطبيق الحالي هذا Overengineering
(بند 26 بالطلب الصريح: "لا تدخل تعقيد غير مبرر"). التبديل الثنائي (تشغيل/إيقاف) + Shadow Mode
كافي تمامًا للتحقق الحالي. لو التطبيق كبر فعليًا، إضافة Percentage عبر hash بسيط لـ`user.id`
تصير مبررة وقتها.

## Observability (بند 22)

كل استدعاء NLU (نجح أو فشل) يسجّل سطر واحد بصيغة JSON بـ`console.log("[nlu]", ...)` —
يظهر بـNetlify Function Logs فقط (صفر عرض للمستخدم النهائي). الحقول: `local_intent`،
`gemini_intent`، `gemini_confidence`، `agreement`، `shadow_mode`، `food_query`، أو
`fallback_reason` لو Gemini ما رجّع نتيجة صالحة.

**غير مبني بهذي المرحلة (قرار مقصود، بند 26)**: لوحة Metrics حقيقية (`total_messages`،
`agreement_rate`، متوسط زمن الاستجابة...) — لوگز نصية كافية للتحقق اليدوي الحالي؛ بناء Pipeline
تحليلات كامل لتطبيق بهذا الحجم Overengineering. لو احتجناها لاحقًا، أسهل مصدر بيانات هو نفس
سطور `[nlu]` هذي (parse-able JSON جاهزة).

## اختبارات

- `intents.parity.test.ts` — تصنيف النية المحلي (وحدة، بدون شبكة).
- `iraqiConversationCorpus.test.ts` — سجل موسّع (76 حالة) يغطي كل فئات المحادثة + حالات سلبية
  حرجة (سؤال بريء يجب أبدًا ما يتحول تسجيل وجبة).
- `askFoodInfo.parity.test.ts` — End-to-End (InMemoryRepository + `foods.sqlite` حقيقية) لكل
  معالجات الأسئلة المعلوماتية (المرحلة 2).
- `nluSchema.test.ts` — تحقق صارم من شكل استجابة Gemini (15 حالة، أهمها: `LOG_MEAL` مرفوضة دايمًا).
- `nluRouting.parity.test.ts` — توجيه End-to-End بمزوّد NLU مزيّف (Dependency Injection، صفر
  اتصال شبكة حقيقي بالاختبارات) — يغطي Shadow/Live Mode، Local-First (صفر استدعاء NLU لنية
  واضحة محليًا)، وأهم اختبار بكل المجموعة: "مزوّد شرّير يدّعي LOG_MEAL" يُرفض بنيويًا.

**تشغيل الاختبارات ضد Gemini الحقيقي**: تم يدويًا (`netlify dev` محلي، `GEMINI_NLU_ENABLED=true`)
للتأكد إن الـStructured Output API الحقيقي يشتغل ويلتزم بالـschema — راجع سجل الجلسة للتفاصيل.
الاختبارات الآلية (CI) تستخدم `setNluProviderForTesting()` حصرًا (صفر استدعاء API حقيقي، حتمية
100%، صفر تكلفة/فشل عشوائي بسبب الشبكة).

## ملفات هذي المرحلة

```
shared/nutrition-engine/
  nlu/
    types.ts              — NLUProvider, NLUResult, NLUContext (Interfaces)
    knownIntents.ts        — NLU_ALLOWED_INTENTS (لائحة بيضاء) + validateNluResult()
    geminiNluProvider.ts    — GeminiNLUProvider (Structured Output الحقيقي)
    config.ts               — Feature flags + getNluProvider() + hooks الاختبار
  orchestrator.ts (معدّل)   — resolveIntentViaNlu()، buildNluContext()، دفاع بعمق بـdispatch()
  intents.ts (معدّل)        — حارس الأمان (المرحلة 1) + نيات ASK_* الجديدة (المرحلة 2)
  recommendations.ts (معدّل) — describeFoodPortions، describeGenericUnit، checkFoodFits،
                               suggestLighterAlternative، suggestPortionNearTarget
```

## المؤجَّل عمدًا (Definition of Done الحقيقي لهذي المرحلة، بند 27)

- ✅ Gemini NLU حقيقي (Structured Intent، مو Text Rewriter)
- ✅ Gemini ليس مصدر Nutrition truth (بنيويًا، مو وعد)
- ✅ النظام المحلي يبقى يعمل صفر تغيير (295 اختبار خضراء، صفر Regression)
- ✅ حارس أمان قبل أي Logging (مرحلتين: intents.ts + orchestrator.ts دفاع بعمق)
- ✅ Multi-turn context (pending_food_topic يُمرَّر لـGemini)
- ✅ اللهجة العراقية + typos (مُختبر يدويًا وبـGemini الحقيقي)
- ✅ فشل Gemini/invalid output لا يكسر النظام (fail-safe مُختبر)
- ✅ مفتاح API آمن (Server-side env var فقط، نفس نمط `provider.ts` الموجود)
- ✅ Feature flag + Shadow Mode
- ⏳ **مؤجَّل بقرار صريح**: Percentage Rollout حقيقي، لوحة Metrics، واجهة Debug بالتطبيق نفسه
  (المتاح حاليًا: لوگز نصية بـNetlify Function Logs) — كلها تحتاج قاعدة مستخدمين/بيانات فعلية
  تبرر بناءها، وإلا Overengineering صريح حسب توجيه الطلب نفسه.
