# NETLIFY_MIGRATION_AUDIT.md

> **تحديث حرج بعد كتابة هذا التدقيق**: تأكدت من توثيق Netlify الرسمي مباشرة (docs.netlify.com) أن
> **Netlify Functions تدعم فقط JavaScript/TypeScript وGo رسميًا — لا يوجد دعم رسمي لـPython**
> لكتابة الدوال نفسها (الدعم المذكور بمدوّنة Netlify لـ"Python versions" يخص عملية الـBuild فقط،
> وليس تشغيل API). **القرار المتخذ صراحة مع المستخدم**: إعادة كتابة محرك `nutrition_ai/` بالكامل
> بـTypeScript (لا بورتة جزئية، لا Wrapper حول عملية Python — بورتة حقيقية للمنطق). هذا يغيّر كل
> الأقسام أدناه اللي تفترض ضمنيًا بقاء الكود بايثون داخل الـFunctions — تُقرأ الآن على إنها "نفس
> المنطق، بلغة TypeScript" وليس "نفس ملفات .py منقولة كما هي". تقدّم فعلي حقيقي (وليس نظري) بدأ
> فعلاً: `shared/nutrition-engine/{arabicNormalize,quantity,sequenceMatcher,fuzzy}.ts` — منفذة
> ومُتحقق من تطابقها 26/26 اختبار Parity ضد سلوك Python الفعلي المُشغَّل مباشرة للمقارنة (وليس
> افتراضًا نظريًا) — راجع `shared/nutrition-engine/__tests__/parity.test.ts`.

> **تحديث تقدّم التنفيذ (2026-09-08)**: هذا القسم يوثّق ما بُني فعليًا، بدقة، للرجوع له بجلسة قادمة.
>
> **مكتمل ومُتحقَّق منه (164 اختبار Parity/وحدة ناجح، كل رقم مقارن بتشغيل Python حقيقي)**:
> كل `shared/nutrition-engine/*.ts` — المحرك الكامل (فهم اللهجة، مطابقة الأكل، السعرات/الماكروز،
> XP/الستريك، الوصفات، DIRECT_LOG/Undo، `orchestrator.ts` نفسه) + `db/repository.ts` (الواجهة) +
> `db/inMemoryRepository.ts` (محاكي الاختبار) + `auth.ts`/`validation.ts` (نظام مصادقة JWT جديد).
>
> **تحديث قرار قاعدة البيانات**: بعد نقاش عن تعقيد Neon، تحوّلنا لـ**Firebase (Firestore)** —
> قرار المستخدم صراحة (أبسط للإدارة: قاعدة+مصادقة+تخزين صور بحساب واحد). `postgresRepository.ts`
> و`db/schema.sql` حُذفا بالكامل (لا نُبقي كود ميت)، واستبدلا بـ`db/firestoreRepository.ts` —
> بفضل نمط Repository، هذا التبديل لمس ملف واحد فقط + سطرين بـ`auth.ts` (لبحث/إنشاء المستخدم)،
> **صفر لمس على أي منطق أعمال** (orchestrator.ts وكل الباقي) — 164/164 اختبار بقيت تعمل بدون
> أي تعديل، بالضبط كما كان الهدف من هذا النمط.
>
> **`db/firestoreRepository.ts` — مُتحقَّق منه حيًا فعليًا (2026-09-08)**: شغّلت
> `shared/nutrition-engine/scripts/testFirestoreLive.ts` (عبر `npx vite-node`) ضد مشروع
> Firebase حقيقي للمستخدم (`cj-workout`) — الاتصال، القراءة/الكتابة، القيد الذري
> (`insertActiveDay` يرفض التكرار فعليًا)، والتحديث الذري (`incrementFreeMealsUsedIfBelowCap`)
> كلها نجحت ضد بيانات حقيقية، مو محاكاة. مفتاح Service Account محفوظ بـ`.env` المحلي
> (`FIREBASE_SERVICE_ACCOUNT_JSON`، مضاف بـ.gitignore، لن يُرفع لأي مكان عام).
>
> **مبني وغير مُختبَر بعد**: 10 Netlify Functions: `chat`, `auth-login`, `auth-register`,
> `auth-logout`, `me`, `progress-daily`, `progress-weight`, `recipes-list`, `recipes-detail`,
> `recipes-actions` — منطقها الداخلي (Repository) مُتحقَّق منه، لكن لم تُختبَر كـHTTP Endpoints
> فعلية بعد (يحتاج `netlify dev` أو نشر حقيقي). `netlify.toml` يبني الواجهة فعليًا الآن (كان أمر
> placeholder سابقًا، صُحِّح).
>
> **ملاحظة نشر مهمة**: على Netlify الحقيقي، `FIREBASE_SERVICE_ACCOUNT_JSON` يُضاف من إعدادات
> Environment Variables بلوحة Netlify (Site settings → Environment variables) — نفس القيمة
> المحفوظة بـ.env المحلي، Copy/Paste مباشر، **ليس من ملف .env نفسه** (ما يُرفع أصلًا).
>
> **الواجهة (frontend/, React+Vite)**: بدأت فعليًا — `Login`، `Register`، `Chat` (الحلقة
> الأساسية: تسجيل → دخول → محادثة) شغّالة ومُتحقَّق منها حيًا بمتصفح فعلي (`npm run build`
> ينجح، الصفحات تُصيَّر صح RTL، التنقّل بينها يعمل، إعادة التوجيه لصفحة الدخول عند عدم تسجيل
> الدخول تعمل). **باگ حقيقي انلقى ونُصلح أثناء هذا الفحص**: طلب API فاشل (سيرفر غير متوفر) كان
> يترك الصفحة بحالة فارغة معطوبة بدل التوجيه لصفحة الدخول — أُصلح بجعل `api.ts` لا يرمي خطأ أبدًا.
> لم يُختبَر بعد **تدفق كامل حقيقي** (تسجيل → محادثة فعلية) لأنه يحتاج Postgres حي + `netlify dev`
> شغّالين سوا، غير متوفرين بهذي البيئة.
>
> **لم يبدأ بعد**: باقي 21 صفحة (يومي الغذائي، متابعة الوزن، الوصفات، البروفايل، الإعدادات،
> الأدمن...)، ~30 Function متبقية (payments, profile, settings, admin)، تخزين الصور
> (StorageService)، الجدولة (Scheduled Functions للإشعارات).
>
> **خطوة التحقق الحرجة قبل أي نشر فعلي**: تشغيل حقيقي واحد لـ`postgresRepository.ts` ضد Neon
> تجريبي (إنشاء حساب Neon مجاني، تشغيل `db/schema.sql`، ثم `DATABASE_URL=... npx vitest` بنسخة
> مؤقتة من اختبارات orchestrator تستبدل `InMemoryRepository` بـ`PostgresRepository`) — لم يحصل
> بعد، وهو الفارق الوحيد بين "الكود يبدو صحيحًا" و"مُتحقَّق منه فعليًا" بنفس صرامة بقية المشروع.

فحص كامل للمشروع قبل أي تعديل — Phase 0 من خطة الانتقال إلى Netlify. هذا المستند توثيق للواقع
الحالي وخطة الهجرة المقترحة، **قبل** كتابة أي كود migration فعلي. الأرقام والمسارات هنا مأخوذة
من فحص مباشر للمشروع بتاريخ 2026-09-08، مو تقديرات.

---

## CURRENT ARCHITECTURE

### حجم المشروع (أرقام حقيقية)
- **24 ملف Python بجذر المشروع** (`app.py`, `models.py`, 9 blueprints, `nutrition_engine.py`,
  `food_db.py`, `food_search.py`, `foods_seed.py`, `calorie_calc.py`, `email_service.py`,
  `arabic_normalize.py`, `validation.py`, `iraq_time.py`, `whatsapp_util.py`, `auth.py`, `extensions.py`,
  `make_admin.py`).
- **33 ملف داخل `nutrition_ai/`** (منها 5 بمجلد فرعي `notifications/`، و4 بمجلد `dataset_tools/`
  غير متصلة بخط أنابيب المحادثة الحي — بيانات تحضيرية فقط، راجع `DATASET_GUIDE.md`).
- **24 قالب Jinja** بـ`templates/`.
- **7 ملفات JavaScript** بـ`static/js/` (بدون أي build step — Vanilla JS مباشر بالمتصفح).
- **72 Route حقيقي** موزعة على 9 Blueprints: `admin.py` (30)، `settings_bp.py` (11)،
  `progress_bp.py` (6)، `auth.py` (5)، `recipes_bp.py` (5)، `profile_bp.py` (5)، `payments.py` (4)،
  `chat.py` (3)، `main.py` (3).
- **21 نموذج SQLAlchemy** بـ`models.py` (508 سطر) — `User`, `Plan`, `Subscription`, `Payment`,
  `Advertisement`, `PasswordResetToken`, `AdminLog`, `NutritionProfile`, `WeightHistory`, `MealLog`,
  `ChatMessage`, `MealStatus`, `ShownTip`, `WaterLog`, `NutritionTip`, `XPTransaction`, `ActiveDay`,
  `Level`, `StreakMilestone`, `RecipeCategory`+`Recipe`+`RecipeIngredient`+`RecipeStep`+
  `RecipeSubstitution` (5 جداول)، `NotificationTemplate`, `PushSubscription`, `UserNotification`,
  `NotificationSettings`.
- أكبر ملفات المنطق: `nutrition_ai/orchestrator.py` (855 سطر، قلب خط أنابيب المحادثة)، `admin.py`
  (717 سطر، 30 route)، `food_search.py` (268 سطر)، `settings_bp.py` (257 سطر).

### قاعدتا البيانات (حقيقيتان، منفصلتان تمامًا)
1. **App DB** (`instance/cjworkout.db`، حاليًا 598KB بالتطوير) — SQLAlchemy ORM، 21 نموذج فوگ،
   `db.create_all()` عند الإقلاع، بدون أداة migration (لا Alembic) — أي عمود جديد يحتاج
   `ALTER TABLE` يدوي.
2. **Food KB** (`data/database/foods.sqlite`، **68KB فقط**) — `sqlite3` خام بدون ORM، **يعتمد على
   FTS5** (`CREATE VIRTUAL TABLE food_alias_fts USING fts5(...)` بـ`food_db.py:44`) للبحث السريع
   بالأسماء/الأسماء المستعارة العراقية. مكتوب مرة واحدة عبر `scripts/import_foods.py`، **يُقرأ فقط**
   وقت التشغيل (لا كتابة من كود الطلبات إطلاقًا — مؤكد بتوثيق CLAUDE.md وبالفحص).

### نظام المصادقة
`Flask-Login` (`login_manager.user_loader` بـ`app.py:53-55`) + جلسات Flask قياسية (Cookie موقّع،
`SESSION_COOKIE_HTTPONLY=True`, `SAMESITE=Lax`, عمر 14 يوم). كلمات المرور: `werkzeug.security`
(`generate_password_hash`/`check_password_hash`، PBKDF2 افتراضيًا). حساب الأدمن: عمود `role` بجدول
`users`، يُتحقق منه بـ`auth.admin_required` (Decorator خادمي، لا يُوثق بالـ Frontend أبدًا).

### الحالة الممتدة عبر الطلبات (State) — هذا الجزء المهم لـ Serverless
كل الحالة المؤقتة للمحادثة **مخزنة أصلاً بأعمدة DB على صف `User`**، وليست بذاكرة السيرفر:
`pending_meal_json`, `pending_food_topic_json`, `pending_recipe_confirmation_id`,
`last_direct_log_json`, `current_recipe_id`/`current_recipe_step`. **هذا خبر جيد للهجرة** —
النظام أصلاً مصمم Stateless بين الطلبات (لا Global Variables ولا Thread-local state تحمل بيانات
مستخدم)، خلاف الافتراض الشائع عن تطبيقات Flask التقليدية.

### الجدولة الخلفية (المشكلة الحقيقية الوحيدة بالـ State)
`nutrition_ai/notifications/scheduler.py:start_scheduler(app)` — يشغّل `APScheduler
BackgroundScheduler` **Thread حقيقي داخل نفس عملية gunicorn**، يفحص كل 5 دقائق
(`run_meal_reminder_tick`) توقيت وجبات كل مستخدم (`breakfast_time`/`lunch_time`/`dinner_time`)
ويرسل Web Push. هذا **الشيء الوحيد** بالمشروع الذي يعتمد فعليًا على "عملية دائمة" — كل شيء آخر
per-request.

### تخزين الملفات (3 أماكن فعلية، مؤكدة بالكود)
- `payments.py:69` — إثباتات الدفع (`static/uploads/payment_proofs/`).
- `profile_bp.py:164` — صور البروفايل (`static/uploads/profile_photos/`).
- `admin.py:477` — صور الوصفات (`static/uploads/recipe_images/`).
كلها بمسارات نسبية مبنية بـ`os.path.join("static", "uploads", ...)` مباشرة بالكود (غير قابلة
للتهيئة عبر متغير بيئة اليوم) + معالجة Pillow (قص مربّع، تحجيم، إعادة ترميز JPEG).

### متغيرات البيئة الحالية (من `.env.example`، 12 متغير حقيقي)
`SECRET_KEY`, `DATABASE_URL`, `MANUAL_PAYMENT_CARD_NUMBER`, `MANUAL_PAYMENT_CARD_NETWORK`,
`SUBSCRIPTION_PRICE_IQD`, `SUPPORT_WHATSAPP_NUMBER`, `RESEND_API_KEY`, `EMAIL_FROM`, `FLASK_ENV`,
`SESSION_COOKIE_SECURE`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY_PEM_BASE64`, `VAPID_CLAIMS_EMAIL`,
`NOTIFICATION_SCHEDULER_ENABLED`.

---

## PROBLEMATIC COMPONENTS

| المكوّن | لماذا مشكلة لـ Netlify | الخطورة |
|---|---|---|
| `nutrition_ai/notifications/scheduler.py` (APScheduler Thread) | Netlify Functions ما تدعم عملية خلفية دائمة — لازم تحويلها لـScheduled Function | **عالية** |
| `instance/cjworkout.db` (SQLite قابل للكتابة) | لا قرص دائم قابل للكتابة بمعمارية Serverless | **عالية** — جوهر المشكلة الأصلية |
| `Flask-Login` + Session Cookie تقليدي | يفترض ضمنيًا سيرفر واحد بالذاكرة؛ يحتاج توثيق أن الجلسة نفسها Stateless (Cookie موقّع فقط، لا Server-side session store) — فعليًا **يشتغل** تحت Serverless لأنه Cookie-based من الأساس، لكن يحتاج مراجعة دقيقة لكل قراءة لـ`current_user` داخل كل Function | متوسطة |
| رفع الملفات (3 أماكن) بمسارات محلية `static/uploads/*` | تُمسح بين استدعاءات الدالة، ما تُحفظ | **عالية** |
| `templates/*.html` (24 قالب Jinja) + `static/js/*.js` (Vanilla) | Netlify Functions ترجع JSON، مو HTML مُصيَّر من السيرفر — الواجهة كاملة لازم تتحول لتطبيق Frontend مستقل (SPA) يستهلك API | **عالية جدًا** — أكبر بند بالهجرة |
| FTS5 (`food_alias_fts`) بقاعدة `foods.sqlite` | Postgres ما يدعم FTS5 حرفيًا (بديله tsvector/pg_trgm) | منخفضة فعليًا — **قرار الهجرة أدناه يتجنبها كليًا** |
| `db.session.execute(db.text("UPDATE ... WHERE free_meals_used < 6"))` (تحديث ذري بـ`orchestrator.py`) | تركيب SQL متوافق مع SQLite و Postgres كلاهما (UPDATE شرطي عادي) — **لا مشكلة فعلية هنا** | لا خطورة |
| CSRF اليدوي (`validate_csrf(request.headers.get("X-CSRFToken"))`) | مبني على وجود Session Flask تقليدية؛ يحتاج استبدال بآلية تناسب JWT/API منفصل | متوسطة |
| `admin.py` (30 route، إدارة مباشرة عبر HTML forms) | يحتاج تحويل كامل لواجهة SPA + API، رغم إنه أقل استخدامًا (أدمن واحد أو اثنين فقط) | متوسطة (حجم كبير، مخاطرة منخفضة لأنه بدون مستخدمين عاديين) |

---

## MIGRATION PLAN (نظرة عامة)

```
CJ WORKOUT (Flask Monolith)
        │
        ├── Frontend (24 Jinja templates + 7 JS files)
        │        → React + Vite SPA على Netlify Hosting
        │
        ├── Backend (9 Blueprints, 72 routes)
        │        → ~40 Netlify Function مقسّمة منطقيًا (تفصيل بـAPI MIGRATION PLAN)
        │
        ├── App DB (SQLite instance/cjworkout.db)
        │        → PostgreSQL مُدار (Neon) عبر DATABASE_URL — صفر تغيير بالكود خارج السائق
        │
        ├── Food KB (foods.sqlite، 68KB، Read-Only)
        │        → **يبقى كما هو**، يُشحن كملف داخل حزمة كل Function (قرار موثّق أدناه)
        │
        ├── ملفات مرفوعة (3 مسارات محلية)
        │        → Object Storage (S3-compatible) عبر StorageService abstraction
        │
        └── APScheduler Thread
                 → Netlify Scheduled Function (Cron) تستدعي نفس منطق run_meal_reminder_tick
```

### الترتيب التنفيذي المقترح (تبعية حقيقية بين الأجزاء، مو ترتيب اعتباطي)
1. **DATABASE MIGRATION** أولاً — كل شيء آخر يعتمد عليها.
2. **AUTH MIGRATION** — لازم قبل أي API Function محمية.
3. **API MIGRATION** (تحويل الـ72 route إلى Functions) — بالتوازي مع Auth بما إنها تستهلكه.
4. **FILE STORAGE** — مستقل نسبيًا، يمكن بالتوازي مع #3.
5. **SCHEDULER MIGRATION** — يعتمد على DB الجديدة (#1) وAuth (#2) لأنه يرسل إشعارات لمستخدمين حقيقيين.
6. **FRONTEND MIGRATION** — آخر شيء منطقيًا لأنه يستهلك كل الـAPIs فوگ، لكن أكبرهم حجمًا؛ يمكن
   البدء بهيكلته بالتوازي مبكرًا.

---

## DATABASE MIGRATION PLAN

### القرار: Postgres للـ App DB فقط، SQLite تبقى للـ Food KB

**Food KB لن تُهاجَر** — فحصت حجمها فعليًا: **68KB فقط**. حدود حزمة Netlify Function (50MB
مضغوطة كحد أدنى مضمون بكل الخطط) أكبر من هذا الحجم بمئات المرات. القرار: تُشحن `foods.sqlite`
كملف ثابت ضمن حزمة كل Function تحتاج بحث أطعمة (نفس ملف git الحالي، بدون أي تعديل)، وتُفتح
بوضع Read-Only (`sqlite3.connect(path, uri=True, ... mode=ro")`) — تعمل FTS5 بشكل طبيعي لأنها
ملف SQLite حقيقي، ما نحتاج إعادة بناء البحث بـPostgres tsvector إطلاقًا. هذا يلغي أكبر نقطة خطر
بالمخطط الأصلي (فقرة "FOOD DATABASE" و"LARGE FOOD DATA" بالطلب) لأنها مبنية على افتراض حجم كبير
غير صحيح هنا.

**App DB تُهاجَر إلى PostgreSQL مُدار (Neon، الخيار المتفق عليه سابقًا بهذا المشروع)** — التطبيق
أصلاً يقرأ `DATABASE_URL` من البيئة (`app.py:30-32`)، SQLAlchemy تدعم كلا القاعدتين بنفس الكود
تقريبًا. نقاط تحتاج مراجعة فعلية (مو افتراضية):
- أعمدة `db.Column(db.String(32), primary_key=True, default=gen_id)` بكل الجداول (UUID hex نصي)
  — متوافقة 100% مع Postgres (نص عادي)، صفر تغيير.
- `db.UniqueConstraint` (3 مواضع: `MealStatus`, `ActiveDay`, `UserNotification`) — متوافقة مباشرة.
- التحديث الذري `UPDATE users SET free_meals_used = free_meals_used + 1 WHERE ... AND
  free_meals_used < 6` — تركيب SQL قياسي، يعمل بنفس الضمانات الذرية على Postgres (بل أفضل تحت
  تزامن حقيقي من SQLite).
- **الفرق الوحيد المؤثر فعليًا**: SQLite متساهلة بأنواع البيانات (Dynamic Typing)، Postgres صارمة
  — يحتاج تمرير `db.create_all()` على قاعدة Postgres فاضية والتحقق من كل نوع عمود يطابق القيم
  الفعلية المخزّنة حاليًا (خصوصًا حقول JSON المخزّنة كـ`db.Text` — تبقى نص خام، Postgres يقبلها
  بدون مشكلة، لسنا مضطرين لاستخدام `JSONB` إلا كتحسين لاحق اختياري).

### خط أنابيب الترحيل (بيانات حقيقية موجودة اليوم)
```
scripts/export_sqlite.py   → يقرأ instance/cjworkout.db بكل الجداول الـ21، يكتب JSON لكل جدول
scripts/import_postgres.py → يتصل بـDATABASE_URL الجديد (Postgres)، ينشئ الجداول عبر
                              db.create_all()، يستورد كل JSON صف-بصف، يتحقق COUNT(*) يطابق
                              الأصل لكل جدول
```
لا حاجة لتحويل معقّد (لا Foreign Key مركّبة، لا أنواع بيانات غريبة) — التعقيد الوحيد هو الحفاظ
على ترتيب الإدراج بسبب `ForeignKey` (مثلاً `users` قبل `meal_logs`)، يُحل بترتيب ثابت بالسكربت
حسب تبعية الجداول الفعلية بـ`models.py`.

### التحقق (Verify)
بعد كل جدول: `COUNT(*)` بالمصدر = `COUNT(*)` بالهدف، + عيّنة عشوائية 10 صفوف بالمقارنة الحرفية،
+ تشغيل `pytest tests/` كاملة ضد قاعدة Postgres تجريبية (فارغة، تُبنى من الصفر عبر `db.create_all()`
لا استيراد بيانات) للتأكد كل الاستعلامات تعمل بنفس السلوك.

---

## AUTH MIGRATION PLAN

### القرار: HTTP-only Secure Cookie موقّع بـJWT، وليس LocalStorage

بما إن نظام كلمات المرور (`werkzeug.security`) آمن فعلاً وما يحتاج تغيير، والحالة (User state)
أصلاً DB-driven لا Session-driven بالذاكرة، الانتقال يكون:

1. **تسجيل الدخول** (`auth-login` Function): يتحقق `check_password_hash`، يبني JWT يحمل
   `{user_id, role, exp}` (توقيع بـ`SECRET_KEY` نفسه أو `JWT_SECRET` منفصل)، يرجّعه بـ`Set-Cookie`
   **HttpOnly + Secure + SameSite=Lax** — **وليس** بجسم الاستجابة لتخزينه بـLocalStorage (يمنع
   سرقته عبر XSS، نفس مستوى الحماية الحالي تقريبًا).
2. **كل Function محمية**: Middleware صغير مشترك (`shared/auth_guard.py` أو ما يعادله بـNode لو
   استخدمنا Netlify Functions بـJS) يقرأ الكوكي، يتحقق التوقيع/الصلاحية، يحقن `user_id`/`role`
   بالسياق — يعادل تمامًا `current_user` بـFlask-Login اليوم.
3. **الأدمن**: نفس فحص `role == "admin"` الحالي بـ`auth.admin_required`، فقط داخل الـMiddleware
   بدل Decorator.
4. **نسيت كلمة المرور / إعادة التعيين**: `PasswordResetToken` (موجود جدول جاهز، `token_hash` +
   `expires_at` + `used`) يبقى **كما هو تمامًا** — منطق مستقل عن نوع الجلسة أصلاً، Function واحدة
   `auth-forgot-password` تنشئ Token وترسل إيميل (نفس `email_service.py`)، وFunction ثانية
   `auth-reset-password` تتحقق منه — صفر تغيير بالمنطق، فقط نقل الكود من `auth.py` route إلى
   Function.
5. **تسجيل الخروج**: مسح الكوكي (`Set-Cookie` بعمر منتهي) — لا حاجة لـServer-side session store
   ولا Blacklist لأن الجلسة أصلاً قصيرة العمر (نفس 14 يوم الحالية كـ`exp` بالـJWT) — قرار موثّق:
   **لا نبني "تسجيل خروج من كل الأجهزة"** لأنه غير موجود اليوم أصلاً (موثق بـCLAUDE.md كقرار نطاق
   سابق) ولن نضيفه بهذي الهجرة.

### لماذا ليس Managed Auth Provider (Auth0/Clerk/Netlify Identity)
قرار موثّق: نظام كلمات المرور والأدوار (`role`, `disabled`, Email عبر Resend) يعمل فعلاً ومختبر،
واستبداله بمزوّد خارجي يعني هجرة كل حساب مستخدم حالي لخدمة ثالثة (تعقيد إضافي غير مبرر) — JWT
ذاتي التوقيع يحل مشكلة "Serverless-compatible" المطلوبة فعليًا بدون هذا الاعتماد الإضافي.

---

## SCHEDULER MIGRATION PLAN

### الوضع الحالي بالتفصيل (`nutrition_ai/notifications/scheduler.py`)
`BackgroundScheduler` يشغّل Thread بنفس عملية gunicorn، Tick كل 5 دقائق يستدعي
`run_meal_reminder_tick(app)` — يفحص كل المستخدمين (`breakfast_time`/`lunch_time`/`dinner_time`
±15 دقيقة)، يستثني من سجّل وجبته (`MealStatus`)، يستبدل تذكير عادي برسالة "رجوع" لطيفة لو غاب
المستخدم 3+ أيام (`streaks.days_absent`)، ويرسل عبر `engine.send_notification()` (يتحقق Quiet
Hours + الحد اليومي + Cooldown من DB، لا حالة بالذاكرة).

**ملاحظة مهمة**: هذا المنطق **لا يحمل أي حالة بالذاكرة بين الـTicks** — كل قرار (هل أرسل، هل
بالـQuiet Hours، هل تجاوز الحد اليومي) يُقرأ من DB بكل Tick من الصفر. هذا يعني النقل لـScheduled
Function **مباشر منطقيًا**، المشكلة الوحيدة فرق التردد (5 دقائق Thread داخلي مقابل حد أدنى Cron
عادة كل دقيقة بـNetlify Scheduled Functions، لكن لا مشكلة تشغيلية من هذا الفرق).

### الخطة
```
netlify/scheduled/meal-reminders   (Cron: */5 * * * *)
    → يستدعي نفس دالة run_meal_reminder_tick() المنقولة من nutrition_ai/notifications/scheduler.py
    → تتصل بـPostgres الجديد، تفحص كل مستخدم نشط، ترسل عبر pywebpush (يبقى كما هو، لا تغيير)
```
`UserNotification.UniqueConstraint(user_id, category, dedup_key)` **يبقى هو خط الدفاع الوحيد ضد
الإرسال المضاعف** — بمعمارية Serverless احتمال تنفيذين متوازيين لنفس الـCron Tick أضعف من
`gunicorn -w 2` الحالي أصلاً (Cron واحد مجدول)، لكن القيد يبقى كما هو كطبقة حماية إضافية بدون أي
تغيير مطلوب.

**التقارير الأسبوعية** (لو أُضيفت مستقبلاً — غير موجودة اليوم فعليًا بالكود، فقط مذكورة بالطلب
كميزة Phase 3-الموسّع المؤجلة) تتبع نفس النمط: `netlify/scheduled/weekly-report` (Cron أسبوعي)
بدل التوليد المسبق — **قرار موثّق**: تُحسب On-Demand عبر `WeeklyReportService` وقت الطلب بدل
التوليد المجدول، لأنها أبسط وتتجنب مشكلة "بيانات محسوبة مسبقًا صارت قديمة" — يطابق توصية الطلب
نفسه بقسم "WEEKLY REPORT".

---

## FILE STORAGE PLAN

### `StorageService` Abstraction (طبقة واحدة، 3 دوال فقط)
```python
class StorageService:
    def upload(self, file_bytes: bytes, key: str, content_type: str) -> str: ...
    def delete(self, key: str) -> None: ...
    def get_url(self, key: str) -> str: ...
```
تطبيق واحد فعلي (`S3CompatibleStorage`، يعمل مع أي مزوّد متوافق S3 API — Cloudflare R2 الخيار
المتفق عليه سابقًا، أو AWS S3 لاحقًا بدون تغيير الكود المستهلك). الأماكن الثلاثة الفعلية بالكود
(`payments.py:69`, `profile_bp.py:164`, `admin.py:477`) تستبدل حفظها المحلي باستدعاء
`storage.upload(...)` — معالجة Pillow (قص/تحجيم/JPEG) **تبقى كما هي بالضبط**، فقط خطوة "الحفظ
الأخيرة" تتغير من `file.save(local_path)` إلى `storage.upload(processed_bytes, key, "image/jpeg")`.

### مسار الملف بالـDB
الأعمدة الحالية (`User.photo_url`, `Payment.proof_image_path`, `Recipe.image_path`) تبقى نصية —
تُخزَّن الـ`key` (أو الرابط الكامل) بدل المسار النسبي المحلي الحالي (`uploads/profile_photos/x.jpg`)،
صفر تغيير بشكل العمود نفسه.

---

## API MIGRATION PLAN

### تحويل الـ72 route الحالية إلى Netlify Functions (تجميع منطقي حسب الـBlueprint الأصلي، مو تفكيك حرفي واحد-لواحد)

| Blueprint الحالي | Routes | Netlify Functions المقترحة |
|---|---|---|
| `auth.py` (5) | تسجيل/دخول/خروج/نسيت كلمة المرور/إعادة تعيين | `auth-register`, `auth-login`, `auth-logout`, `auth-forgot-password`, `auth-reset-password` |
| `chat.py` (3) | `/app`, `/api/chat`, ... | `chat` (المحادثة الأساسية)، `chat-history` |
| `payments.py` (4) | اشتراك/رفع إثبات | `payments-subscribe`, `payments-status` |
| `profile_bp.py` (5) | بروفايل عام/خاص/تعديل/صورة | `profile-get`, `profile-update`, `profile-photo` |
| `settings_bp.py` (11) | إعدادات متعددة الأقسام + Push | `settings-get`, `settings-update`, `settings-notifications`, `settings-push-subscribe`, `settings-push-unsubscribe`, `settings-export`, `settings-delete-account` |
| `recipes_bp.py` (5) | تصفح/بحث/تفاصيل/بدء/إكمال | `recipes-list`, `recipes-search`, `recipes-detail`, `recipes-start`, `recipes-complete` |
| `progress_bp.py` (6) | يومي/وزن + AJAX | `daily-summary`, `weight-log`, `weight-goal`, `weight-delete`, `weight-chart-data` |
| `admin.py` (30) | كل لوحة الأدمن | `admin-tips`, `admin-levels`, `admin-streak-milestones`, `admin-payments`, `admin-recipes` (+ nested)، `admin-notifications` — تُجمَّع بـ5-6 Functions بدل 30 (كل واحدة تتعامل مع Verb مختلف لنفس المورد عبر `event.httpMethod`، مو Function منفصلة لكل زر) |
| `main.py` (3) | الصفحة الرئيسية/`/sw.js`/... | يُستبدل بـFrontend Routing مباشرة + Function وحيدة لخدمة `sw.js` إذا احتاج منطق ديناميكي |

**إجمالي واقعي**: ~35-40 Function (مو 72 واحد-لواحد) — التجميع حسب المورد (Resource) بدل الفعل
(Verb) يقلل عدد الـCold Starts المنفصلة ويطابق توصية الطلب "لا تجعل function واحدة ضخمة... قسّم
الخدمات منطقياً" بدون مبالغة بالتفتيت.

### شكل الاستجابة الموحّد
```json
{"success": true, "data": {...}, "error": null}
{"success": false, "data": null, "error": {"code": "TRIAL_EXHAUSTED", "message": "..."}}
```
أكواد الحالة: `400` (تحقق)، `401` (غير مسجّل)، `403` (ممنوع)، `404`، `409` (تعارض)، `429` (Rate
Limit — يحتاج بديل لـ`Flask-Limiter` الحالي، مثل Upstash Redis أو منطق عداد بـPostgres نفسه)،
`500` (بدون Stack Trace للمستخدم أبدًا، تُسجَّل بـLogs فقط).

---

## FRONTEND MIGRATION PLAN

### القرار: React + Vite SPA، هجرة تدريجية حسب الصفحة

24 قالب Jinja تتحول لصفحات React، مقسّمة حسب الأولوية (الصفحات الأكثر استخدامًا أولاً):

**المرحلة الأولى (الأساسية)**: `login`, `register`, `forgot_password`, `reset_password`,
`onboarding`, `chat` (الأهم — قلب المنتج), `index` (Landing).

**المرحلة الثانية**: `profile`, `profile_private`, `settings`, `daily`, `weight_progress`,
`recipes_index`, `recipe_detail`, `subscribe`.

**المرحلة الثالثة (أدمن، أقل إلحاحًا)**: `admin_*` (7 قوالب) — تبقى تعمل بأبسط شكل ممكن، أولوية
أقل لأن المستخدمين المتأثرين بها (الأدمن فقط) قلة معروفة، لا حاجة استثمار تصميم بنفس مستوى بقية
الصفحات بالمرحلة الأولى من الهجرة.

### إدارة الحالة (State Management)
- **JWT Cookie** يُرفق تلقائيًا بكل طلب `fetch` (`credentials: "include"`) — لا حاجة لتخزين Token
  يدويًا بالـJS إطلاقًا (ميزة أمان مباشرة من قرار AUTH MIGRATION PLAN).
- بيانات كل صفحة تُجلب عبر React Query (أو SWR) من الـAPIs الجديدة — يستبدل تصيير Jinja المباشر.
- `static/js/chat.js` (181 سطر، منطق تفاعل الشات الحالي) يتحول لمكوّن React `<ChatWindow />` بنفس
  منطق الطلبات (`POST /api/chat`)، فقط طبقة العرض (DOM manipulation يدوي) تتحول لـJSX.

### SPA Routing
`react-router` بمسارات مطابقة للمسارات الحالية (`/login`, `/chat`, `/profile`, `/daily`,
`/progress/weight`...) + `netlify.toml` fallback (`/* → /index.html`) لضمان الـRefresh المباشر
على أي مسار يعمل بدون 404.

---

## RISKS

| الخطر | الاحتمالية | الأثر | التخفيف |
|---|---|---|---|
| كسر حالة المحادثة (DIRECT_LOG/Undo Window/التصحيحات) أثناء فصلها عن Flask request context | متوسطة | عالي جدًا (هذا قلب المنتج) | نقل `nutrition_ai/` بأقل تعديل ممكن — الحفاظ على نفس التوابع بنفس التوقيعات، فقط استدعاؤها من Function بدل route؛ اختبار الـpytest الحالي (يغطي DIRECT_LOG/Undo/Corrections) يجب أن يمر 100% قبل وبعد |
| فقدان بيانات أثناء الترحيل SQLite→Postgres | منخفضة (بيانات تطوير فقط اليوم، صفر مستخدمين حقيقيين) | عالي لو حصل بعد إطلاق حقيقي | التحقق بـCOUNT + عينة عشوائية (موصوف أعلاه)، تنفيذ الترحيل **قبل** أي مستخدم حقيقي فعلي، وبنسخة احتياطية كاملة قبل البدء |
| Cold Start على أول طلب لكل Function بعد خمول | عالية (طبيعة Serverless) | متوسط (تجربة مستخدم، ليس فقدان بيانات) | تقليله عبر تجميع Functions حسب المورد (تقليل عدد الـCold Starts المختلفة)؛ لا يوجد حل كامل بهذي المعمارية |
| Rate Limiting (`Flask-Limiter`) بدون بديل مباشر بـServerless | متوسطة | متوسط (حماية من إساءة الاستخدام) | يحتاج قرار تنفيذي منفصل (Upstash Redis أو عداد Postgres) — **غير محسوم بهذا التدقيق**، يُحل ببداية Phase 3 |
| حجم عمل الهجرة يفوق ما يمكن التحقق منه بجلسة عمل واحدة | عالية جدًا | عالي (نشر كود غير مختبر بالكامل) | تنفيذ مرحلي صارم (Backend أولاً، Frontend صفحة-صفحة)، مع `pytest` + اختبار متصفح حي بعد كل مرحلة قبل الانتقال للتالية — **لا يُعتبر أي جزء "مكتمل" بدون اختبار فعلي** |
| فقدان ميزة "تسجيل خروج من كل الأجهزة" أو "Server-side session revocation" | منخفضة | منخفض | هذي الميزة غير موجودة أصلاً اليوم (قرار نطاق سابق موثّق بـCLAUDE.md) — لا نراجع تراجعًا، فقط نحافظ على نفس المستوى |

---

## TEST PLAN

1. **قبل أي تعديل**: تشغيل `pytest tests/ -v` الحالي كاملاً (يغطي DIRECT_LOG، Undo، Weight
   Stats، Daily Meals، Progress Routes Security) وتوثيق أنه 100% ناجح كخط أساس (Baseline).
2. **بعد DATABASE MIGRATION**: نفس مجموعة `pytest` كاملة، لكن ضد Postgres تجريبي فارغ (مش نسخة
   مستوردة) — يجب أن تمر 100% بدون أي تعديل بمنطق الاختبارات نفسها.
3. **بعد كل Function جديدة**: اختبار يدوي مباشر (`curl`/Postman) لكل حالة (نجاح، خطأ تحقق،
   غير مصرّح، تعارض) قبل ربطها بالـFrontend.
4. **بعد AUTH MIGRATION**: تسجيل حساب جديد → تسجيل دخول → الوصول لصفحة محمية → تسجيل خروج →
   محاولة وصول بعد الخروج (يجب يُرفض) → نسيت كلمة المرور → إعادة تعيين → دخول بكلمة المرور
   الجديدة.
5. **بعد كل صفحة Frontend مهاجَرة**: اختبار المتصفح الحي (Chrome/Browser tool) للمسار الكامل —
   ليس فقط "الصفحة تفتح" بل تفاعل حقيقي (تسجيل وجبة عبر الشات الجديد، رؤية الأرقام تتحدث بصفحة
   `/daily` الجديدة، تسجيل وزن ورؤيته بالرسم البياني).
6. **قبل اعتبار الهجرة مكتملة**: كل قائمة "DEFINITION OF DONE" المذكورة بطلب المستخدم الأصلي —
   تُحوَّل لقائمة تحقق فعلية بنهاية `NETLIFY_MIGRATION_REPORT.md` (يُنشأ بنهاية العمل، ليس الآن).

---

## القرارات الموثّقة (خارج قائمة الطلب الأصلي، لكن ضرورية لتنفيذ صادق)

- **Food KB لن تُهاجَر لـPostgres** — حجمها الحقيقي (68KB) يجعل شحنها كملف ثابت داخل كل Function
  أبسط وأصح هندسيًا من إعادة بناء بحث FTS5 بـtsvector بدون أي داعٍ فعلي.
- **Rate Limiting بديل لـFlask-Limiter غير محسوم بعد** — يحتاج قرار تقني منفصل (Upstash Redis
  الأرجح) قبل بدء Phase 3، سيُطرح كسؤال منفصل عند الوصول له.
- **لوحة الأدمن (30 route) أولوية منخفضة بالهجرة الفعلية** رغم إنها أكبر Blueprint بعدد الـroutes
  — عدد مستخدميها (أدمن واحد) لا يبرر استثمار نفس الجهد التصميمي كصفحات المستخدم العادي بالمرحلة
  الأولى.
- **لا Weekly Report مسبق التوليد** — يُحسب عند الطلب (On-Demand) بدل تخزينه، لأن الميزة أصلاً غير
  مبنية اليوم بالكود ولا داعي لتعقيد إضافي (تخزين + تحديث + Cache Invalidation) لشيء يمكن حسابه
  مباشرة من DB بكل طلب.

---

**الخلاصة**: المشروع فعليًا أفضل حالاً مما يوحي به حجمه للهجرة — الحالة الديناميكية DB-driven
أصلاً (لا Server Memory State حقيقي بالمنطق الجوهري)، قاعدة الأطعمة صغيرة جدًا (68KB، لا مشكلة
حجم)، ونظام كلمات المرور آمن ولا يحتاج تغيير. **العمل الحقيقي الثقيل هو إعادة بناء الواجهة
(24 قالب → React) وتقسيم الـ72 route إلى Functions** — هذا ما يحدد الجدول الزمني الفعلي، وليس
تعقيد منطق التغذية/الذكاء الاصطناعي نفسه الذي يبقى شبه سليم بالنقل.

الخطوة التالية: **PHASE 1 — TARGET ARCHITECTURE** (هيكلة المجلدات الفعلية `/frontend`,
`/netlify/functions`, `/netlify/scheduled`, `/shared`) ثم البدء الفعلي بـ**DATABASE MIGRATION**
كأول جزء تنفيذي حقيقي (بما إن كل شيء آخر يعتمد عليه).
