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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// نفس مسار data/database/foods.sqlite بجذر المشروع الأصلي — يُشحن كملف ثابت مع كل Function
const DEFAULT_DB_PATH = path.resolve(__dirname, "../../../data/database/foods.sqlite");

let sqlJsPromise: Promise<SqlJsStatic> | null = null;
let dbInstance: Database | null = null;
let dbPathUsed: string | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    // createRequire بدل import.meta.resolve — الأخيرة غير مدعومة بسياق SSR/vite-node
    // (Vitest) بدون علم تجريبي. "sql.js/package.json" مرفوض بحقل exports الخاص بالحزمة —
    // نستخدم subpath "./dist/*" المصرَّح به فعليًا بدلًا منه.
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    sqlJsPromise = initSqlJs({ locateFile: () => wasmPath });
  }
  return sqlJsPromise;
}

/** يفتح (أو يرجّع من الكاش) اتصال Read-Only بقاعدة foods.sqlite. */
export async function getFoodDb(dbPath: string = DEFAULT_DB_PATH): Promise<Database> {
  if (dbInstance && dbPathUsed === dbPath) return dbInstance;
  const SQL = await getSqlJs();
  const fileBuffer = readFileSync(dbPath);
  dbInstance = new SQL.Database(fileBuffer);
  dbPathUsed = dbPath;
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
