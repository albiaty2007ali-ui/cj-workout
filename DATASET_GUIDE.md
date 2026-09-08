# DATASET_GUIDE.md

دليل عملي لبنية `knowledge/` وأدوات `scripts/dataset_cli.py` — أضيفت بمرحلة "Phase 1:
Architecture" (راجع `AI_ROADMAP.md` للخطة الاستراتيجية الكاملة). هذا الدليل عملي/How-To فقط.

## نظرة سريعة

- **`knowledge/`**: بيانات محادثة حقيقية بصيغة JSONL (سطر = مثال)، منظمة بمجلدات حسب الموضوع
  (`conversations/`, `foods/`, `nutrition/`, `recipes/`, `iraqi/`, `safety/`, `faq/`).
- **`nutrition_ai/dataset_tools/`**: منطق التحقق (`schema.py`)، منع التكرار (`dedup.py`)،
  الاستيراد (`importer.py`)، والإحصائيات (`stats.py`) — كله قابل للاستيراد المباشر بايثون.
- **`scripts/dataset_cli.py`**: أداة سطر الأوامر الوحيدة اللي تحتاجها عمليًا.

هذا النظام **لا علاقة له** بمنطق الشات الحي اليوم — `nutrition_ai/orchestrator.py` ما يقرأ
من `knowledge/` أبدًا. هذي بيانات تحضيرية لمرحلة مستقبلية (راجع `AI_ROADMAP.md`).

## تشغيل الأداة

```bash
# تحقق من ملف/ملفات بدون أي كتابة (يقبل * للمسارات)
python scripts/dataset_cli.py validate "knowledge/**/*.jsonl"

# نفس الشي مع حفظ تقرير مفصّل
python scripts/dataset_cli.py validate "knowledge/foods/*.jsonl" --report data/reports/validate.json

# استيراد فعلي (تحقق + منع تكرار + كتابة بالوجهة)
python scripts/dataset_cli.py import knowledge/foods/new_batch.jsonl --dest knowledge/foods/meal_logging.jsonl

# تجربة استيراد بدون كتابة فعلية (يشوف شنو راح ينقبل/يترفض بدون أي أثر دائم)
python scripts/dataset_cli.py import knowledge/foods/new_batch.jsonl --dest knowledge/foods/meal_logging.jsonl --dry-run

# إحصائيات شاملة عن كل knowledge/
python scripts/dataset_cli.py stats
```

`--index` اختياري بأمر `import` لو حاب تستخدم فهرس تكرار غير الافتراضي
(`instance/dataset_index.sqlite`) — مفيد لو تريد تجرب استيراد بمعزل عن الفهرس الحقيقي.

## كيف تضيف بيانات جديدة

1. اكتب ملف `.jsonl` جديد (أو أضف أسطر لملف موجود) — سطر واحد = مثال واحد، JSON صحيح.
   شكل السجل موصوف بالكامل بـ`nutrition_ai/dataset_tools/schema.py` (كل حقل وسبب وجوده).
2. شغّل `python scripts/dataset_cli.py validate <ملفك.jsonl>` وصحح أي خطأ يظهر.
3. لو تريده يدخل ضمن `knowledge/` رسميًا، شغّل `import` بنفس الملف كمصدر ووجهة داخل
   `knowledge/<الفئة المناسبة>/`.
4. شغّل `pytest tests/dataset_tools/test_seed_dataset.py -v` للتأكد إن الإضافة ما كسرت
   شي (تكرار حرفي، Intent مو معروف، حقل ناقص).

## كيف تضيف Intent جديد

الـIntent الحقيقي مصدره الوحيد `nutrition_ai/intents.py` — إضافة قدرة شات جديدة فعلية
تحتاج:
1. Constant جديد بـ`intents.py` + كلمات مفتاحية بـ`detect_intent()`.
2. معالج جديد بـ`orchestrator.py` (راجع `CLAUDE.md` لنمط "add an intent... and a handler
   branch" الموجود أصلاً).
3. أضف نفس الاسم لمجموعة `KNOWN_INTENTS` بـ`nutrition_ai/dataset_tools/schema.py`.

لو الـIntent **مقترح بس غير مطبَّق بعد** (متل `STREAK_QUERY` الموجودة اليوم بـ`faq/`)، ضيفه
لمجموعة `PROPOSED_INTENTS` بدل `KNOWN_INTENTS`، واكتب كل سجل يستخدمه مع
`metadata.implemented: false` — الـValidator يرفض أي استخدام بدون هذا التنويه.

## كيف تضيف لهجة/لغة جديدة

اليوم `language` مقبول فقط كـ`"ar-IQ"` أو `"ar-MSA"` (`VALID_LANGUAGES` بـ`schema.py`).
لإضافة لهجة/لغة جديدة، أضف الكود المناسب (مثلاً `"ar-EG"`) لنفس المجموعة، وابدأ ملف
`knowledge/` جديد أو قسم مخصص لها. لا تخلط لهجتين بنفس الملف بدون داعٍ — يصعّب التتبع لاحقًا.

## كيف تضيف مصدر بيانات جديد (غير يدوي)

كل سجل يحمل `source` (اليوم القيمة الوحيدة الموجودة `"handwritten_seed"`). لو استوردت
بيانات من مصدر آخر (مثلاً مستخرجة من محادثات حقيقية بعد إخفاء الهوية، أو من نموذج LLM
لاحقًا بمرحلة Phase 3+)، استخدم قيمة `source` واضحة (`"llm_assisted_v1"`, `"real_conversations_anonymized"`...)
حتى تقدر تفلترها/تقيّمها بشكل منفصل بالإحصائيات لاحقًا.

## تجهيز البيانات لاحقًا (Fine-tuning / RAG)

راجع `AI_ROADMAP.md` للخطة الكاملة. باختصار:
- **RAG**: يحتاج فقط تحويل `knowledge/*.jsonl` (خصوصًا `nutrition/`, `faq/`) لـEmbeddings
  محلية — الحقول `input`/`output` هي كل اللي تحتاجه، بدون أي تجهيز إضافي.
- **Fine-tuning**: يحتاج تحويل كل سجل لصيغة الموديل المستهدف (عادة `{"messages": [...]}` أو
  `{"prompt": ..., "completion": ...}`) — تحويل بسيط من الحقول الحالية (`instruction`/`input`/`output`)
  وقت الحاجة الفعلية، بدون داعٍ لتغيير الـSchema الحالي مسبقًا.
