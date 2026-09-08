"""
قاعدة بيانات الأكل المحلية — SQLite + FTS5.
لا يوجد أي اتصال بأي API خارجي هنا. كل البيانات تُحمّل مسبقًا عبر scripts/import_foods.py.
"""
import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "database", "foods.sqlite")

SCHEMA = """
CREATE TABLE IF NOT EXISTS food_sources (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL  -- USDA | CJ_WORKOUT | ADMIN
);

CREATE TABLE IF NOT EXISTS food_categories (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS foods (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    category_id INTEGER REFERENCES food_categories(id),
    source_id INTEGER REFERENCES food_sources(id),
    source_ref_id TEXT,          -- المعرّف بالمصدر الأصلي (مثلًا fdc_id لو USDA)
    is_bulk INTEGER NOT NULL DEFAULT 0,  -- 1 = يحتاج تحديد كمية/حصة إلزاميًا (رز، مرق...)
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_foods_normalized ON foods(normalized_name);

CREATE TABLE IF NOT EXISTS food_aliases (
    id INTEGER PRIMARY KEY,
    food_id INTEGER NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    quantity_multiplier REAL NOT NULL DEFAULT 1,  -- مثلاً "بيضتين" = 2
    is_plural_unspecified INTEGER NOT NULL DEFAULT 0  -- "تمرات" بدون رقم = يحتاج توضيح
);
CREATE INDEX IF NOT EXISTS idx_alias_normalized ON food_aliases(normalized_alias);

-- FTS5 index للبحث السريع بدون فحص الجدول كامل
CREATE VIRTUAL TABLE IF NOT EXISTS food_alias_fts USING fts5(
    normalized_alias, food_id UNINDEXED, alias_id UNINDEXED
);

CREATE TABLE IF NOT EXISTS food_nutrients (
    food_id INTEGER PRIMARY KEY REFERENCES foods(id) ON DELETE CASCADE,
    calories_per_100g REAL NOT NULL,
    protein_per_100g REAL NOT NULL DEFAULT 0,
    carbs_per_100g REAL NOT NULL DEFAULT 0,
    fat_per_100g REAL NOT NULL DEFAULT 0,
    fiber_per_100g REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS food_portions (
    id INTEGER PRIMARY KEY,
    food_id INTEGER NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    portion_name TEXT NOT NULL,      -- "حبة", "صحن صغير", "صحن متوسط"...
    normalized_portion_name TEXT NOT NULL,
    grams REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_portions_food ON food_portions(food_id);
"""


def get_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def database_exists_and_seeded() -> bool:
    if not os.path.exists(DB_PATH):
        return False
    conn = get_connection()
    try:
        row = conn.execute("SELECT COUNT(*) AS c FROM foods").fetchone()
        return bool(row and row["c"] > 0)
    except sqlite3.OperationalError:
        return False
    finally:
        conn.close()
