/**
 * منفذ من food_db.py — لكن بدل sqlite3 القياسية (native binding)، يستخدم sql.js (WASM خالص،
 * صفر Native Binary) لأن foods.sqlite صغير جدًا (68KB، Read-Only بالكامل — راجع القرار الموثّق
 * بـNETLIFY_MIGRATION_AUDIT.md) ويُشحن كملف ثابت داخل حزمة كل Netlify Function. WASM يتجنب
 * مشكلة "native binary لازم يطابق بيئة Lambda" التي تظهر مع مكتبات SQLite ذات Binding أصلي.
 *
 * الاتصال يُبنى مرة واحدة ويُخزَّن (Module-level cache) — هذا تخزين لبيانات ثابتة للقراءة فقط
 * (لا حالة مستخدم، لا Mutable State)، آمن تمامًا بمعمارية Serverless حتى لو أُعيد استخدامه بين
 * استدعاءات مختلفة على نفس الـContainer الدافئ.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

// اسم مختلف عمدًا عن "__dirname" — esbuild (مُجمِّع Netlify Functions) يحقن shim تلقائي بهذا
// الاسم بالحزمة الناتجة (توافقًا مع أكواد تفترض CJS)، وإعادة تعريفه هنا يسبب خطأ حقيقي وقت
// التشغيل: "Identifier '__dirname' has already been declared".
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * يبحث عن ملف بين عدة مسارات محتملة ويرجّع أول وحدة موجودة فعليًا — ضروري هنا تحديدًا لأن
 * esbuild (مُجمِّع Netlify Functions) يعيد ترتيب بنية المجلدات وقت البناء، فمسار "__dirname
 * نسبي" الثابت (صالح بالتطوير المحلي وبـvitest) ينكسر بصمت بعد النشر الفعلي. لو ولا مسار
 * انلقى، نرمي خطأ يذكر كل المسارات المجرَّبة — يسهّل التشخيص من Netlify Function Logs مباشرة
 * بدل خطأ "file not found" غامض بلا سياق.
 */
function resolveExistingPath(candidates: string[]): string {
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `تعذّر إيجاد الملف بأي من المسارات المتوقعة (تحقق من [functions].included_files بـnetlify.toml):\n` +
    candidates.map((p) => `  - ${p}`).join("\n"),
  );
}

function candidatePaths(relativeFromRepoRoot: string): string[] {
  return [
    // مسار التطوير المحلي الطبيعي (شغّال بـnpm test/vite-node)
    path.resolve(moduleDir, "../../../", relativeFromRepoRoot),
    // بنية حزمة Netlify Function المحتملة بعد esbuild (جذر الحزمة = cwd وقت التشغيل)
    path.resolve(process.cwd(), relativeFromRepoRoot),
    // احتياط: أحيانًا included_files يُنسخ بجانب ملف الدالة نفسه مباشرة
    path.resolve(moduleDir, relativeFromRepoRoot),
    path.resolve(moduleDir, "../", relativeFromRepoRoot),
  ];
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null;
let dbInstance: Database | null = null;
let dbPathUsed: string | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    let wasmPath: string;
    try {
      // createRequire بدل import.meta.resolve — الأخيرة غير مدعومة بسياق SSR/vite-node
      // (Vitest) بدون علم تجريبي. "sql.js/package.json" مرفوض بحقل exports الخاص بالحزمة —
      // نستخدم subpath "./dist/*" المصرَّح به فعليًا بدلًا منه. هذا يعمل بالتطوير المحلي
      // (node_modules موجودة كما هي)، لكن بعد نشر Netlify قد لا يُحل نفس المسار، فنجرّب
      // مسارات included_files الاحتياطية أيضًا.
      const require = createRequire(import.meta.url);
      wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    } catch {
      wasmPath = resolveExistingPath(candidatePaths("node_modules/sql.js/dist/sql-wasm.wasm"));
    }
    sqlJsPromise = initSqlJs({ locateFile: () => wasmPath });
  }
  return sqlJsPromise;
}

/** يفتح (أو يرجّع من الكاش) اتصال Read-Only بقاعدة foods.sqlite. */
export async function getFoodDb(dbPath?: string): Promise<Database> {
  const resolvedPath = dbPath ?? resolveExistingPath(candidatePaths("data/database/foods.sqlite"));
  if (dbInstance && dbPathUsed === resolvedPath) return dbInstance;
  const SQL = await getSqlJs();
  const fileBuffer = readFileSync(resolvedPath);
  dbInstance = new SQL.Database(fileBuffer);
  dbPathUsed = resolvedPath;
  return dbInstance;
}

/** لأغراض الاختبار فقط — يمسح الكاش حتى يمكن إعادة تحميل قاعدة مختلفة. */
export function _resetFoodDbCacheForTests(): void {
  dbInstance?.close();
  dbInstance = null;
  dbPathUsed = null;
}

export interface SqlRow {
  [column: string]: string | number | null;
}

/** ينفّذ استعلام SELECT ويرجّع صفوف ككائنات عادية (يطابق sqlite3.Row + dict(r) بالأصل بايثون). */
export function queryAll(db: Database, sql: string, params: (string | number)[] = []): SqlRow[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows: SqlRow[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as SqlRow);
    }
    return rows;
  } finally {
    stmt.free();
  }
}

export function queryOne(db: Database, sql: string, params: (string | number)[] = []): SqlRow | null {
  const rows = queryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}
