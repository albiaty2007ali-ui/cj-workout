"""
استيراد بيانات الأكل إلى قاعدة CJ WORKOUT المحلية.

الاستخدام:
    python scripts/import_foods.py --seed          # يبني القاعدة من بيانات CJ WORKOUT المنسّقة
    python scripts/import_foods.py --usda <folder>  # يستورد ملفات USDA CSV (بعد رفعها يدويًا)

لا يوجد أي اتصال إنترنت هنا — الاستيراد يقرأ ملفات محلية فقط.
"""
import argparse
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from food_db import get_connection, init_schema, DB_PATH
from foods_seed import FOODS_SEED
from arabic_normalize import normalize


def _get_or_create_source(conn, name):
    conn.execute("INSERT OR IGNORE INTO food_sources(name) VALUES (?)", (name,))
    return conn.execute("SELECT id FROM food_sources WHERE name=?", (name,)).fetchone()["id"]


def _get_or_create_category(conn, name):
    conn.execute("INSERT OR IGNORE INTO food_categories(name) VALUES (?)", (name,))
    return conn.execute("SELECT id FROM food_categories WHERE name=?", (name,)).fetchone()["id"]


def import_seed():
    print(f"إنشاء قاعدة البيانات في: {DB_PATH}")
    conn = get_connection()
    init_schema(conn)

    source_id = _get_or_create_source(conn, "CJ_WORKOUT")
    inserted = 0

    for item in FOODS_SEED:
        category_id = _get_or_create_category(conn, item["category"])
        cur = conn.execute(
            "INSERT INTO foods(name, normalized_name, category_id, source_id, is_bulk) VALUES (?,?,?,?,?)",
            (item["name"], normalize(item["name"]), category_id, source_id, int(item["is_bulk"])),
        )
        food_id = cur.lastrowid

        n = item["nutrients_per_100g"]
        conn.execute(
            "INSERT INTO food_nutrients(food_id, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g) "
            "VALUES (?,?,?,?,?,?)",
            (food_id, n["calories"], n.get("protein", 0), n.get("carbs", 0), n.get("fat", 0), n.get("fiber", 0)),
        )

        for alias in item["aliases"]:
            norm_alias = normalize(alias["text"])
            alias_cur = conn.execute(
                "INSERT INTO food_aliases(food_id, alias, normalized_alias, quantity_multiplier, is_plural_unspecified) "
                "VALUES (?,?,?,?,?)",
                (food_id, alias["text"], norm_alias, alias.get("multiplier", 1), int(alias.get("is_plural_unspecified", False))),
            )
            conn.execute(
                "INSERT INTO food_alias_fts(rowid, normalized_alias, food_id, alias_id) VALUES (?,?,?,?)",
                (alias_cur.lastrowid, norm_alias, food_id, alias_cur.lastrowid),
            )

        for portion in item.get("portions", []):
            conn.execute(
                "INSERT INTO food_portions(food_id, portion_name, normalized_portion_name, grams) VALUES (?,?,?,?)",
                (food_id, portion["name"], normalize(portion["name"]), portion["grams"]),
            )

        inserted += 1

    conn.commit()
    conn.close()
    print(f"✅ تم استيراد {inserted} طعام من بيانات CJ WORKOUT المحلية.")


def import_usda(folder: str):
    """
    استيراد ملفات USDA FoodData Central (Foundation Foods) القياسية.
    نستورد فقط الأصناف المصنّفة "foundation_food" (بيانات مختبرية منقّاة) —
    وليس كل صفوف food.csv، لأنها تحتوي أيضًا على عينات مختبرية خام (sample_food,
    market_acquisition, sub_sample_food...) مكررة وغير مناسبة للعرض للمستخدم النهائي.
    """
    food_csv = os.path.join(folder, "food.csv")
    nutrient_csv = os.path.join(folder, "food_nutrient.csv")
    foundation_csv = os.path.join(folder, "foundation_food.csv")
    portion_csv = os.path.join(folder, "food_portion.csv")
    measure_unit_csv = os.path.join(folder, "measure_unit.csv")

    if not os.path.exists(food_csv):
        print(f"❌ ما لكيت الملف: {food_csv}")
        print("تأكد إن مجلد USDA يحتوي على food.csv و food_nutrient.csv بعد فك الضغط.")
        return

    foundation_ids = None
    if os.path.exists(foundation_csv):
        foundation_ids = set()
        with open(foundation_csv, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                foundation_ids.add(row["fdc_id"])
        print(f"تم العثور على foundation_food.csv — سيتم استيراد {len(foundation_ids)} صنف منقّى فقط.")
    else:
        print("⚠️ ما لكيت foundation_food.csv — راح يتم استيراد كل الصفوف بملف food.csv (قد يحتوي بيانات خام مكررة).")

    conn = get_connection()
    init_schema(conn)
    source_id = _get_or_create_source(conn, "USDA")
    category_id = _get_or_create_category(conn, "USDA Import")

    NUTRIENT_ID_MAP = {
        "1008": "calories", "1003": "protein", "1005": "carbs", "1004": "fat", "1079": "fiber",
    }

    print("جاري قراءة food.csv (Streaming — بدون تحميل كل الملف بالذاكرة)...")
    food_id_map = {}
    batch = 0

    with open(food_csv, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            fdc_id = row.get("fdc_id")
            description = row.get("description")
            if not fdc_id or not description:
                continue
            if foundation_ids is not None and fdc_id not in foundation_ids:
                continue

            name = description.strip().title()
            cur = conn.execute(
                "INSERT INTO foods(name, normalized_name, category_id, source_id, source_ref_id, is_bulk) "
                "VALUES (?,?,?,?,?,0)",
                (name, normalize(name), category_id, source_id, fdc_id),
            )
            local_id = cur.lastrowid
            food_id_map[fdc_id] = local_id

            norm_alias = normalize(name)
            alias_cur = conn.execute(
                "INSERT INTO food_aliases(food_id, alias, normalized_alias, quantity_multiplier) VALUES (?,?,?,1)",
                (local_id, name, norm_alias),
            )
            conn.execute(
                "INSERT INTO food_alias_fts(rowid, normalized_alias, food_id, alias_id) VALUES (?,?,?,?)",
                (alias_cur.lastrowid, norm_alias, local_id, alias_cur.lastrowid),
            )

            batch += 1
            if batch % 2000 == 0:
                conn.commit()
                print(f"  ...{batch} طعام حتى الآن")

    conn.commit()
    print(f"تم إدخال {len(food_id_map)} طعام من food.csv. جاري ربط القيم الغذائية...")

    if not os.path.exists(nutrient_csv):
        print("⚠️ ملف food_nutrient.csv غير موجود — تم استيراد الأسماء فقط بدون قيم غذائية.")
        conn.close()
        return

    pending_nutrients = {}
    with open(nutrient_csv, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            fdc_id = row.get("fdc_id")
            nutrient_id = row.get("nutrient_id")
            amount = row.get("amount")
            if fdc_id not in food_id_map or nutrient_id not in NUTRIENT_ID_MAP or not amount:
                continue
            local_id = food_id_map[fdc_id]
            key = NUTRIENT_ID_MAP[nutrient_id]
            pending_nutrients.setdefault(local_id, {}).setdefault(key, float(amount))

    for local_id, values in pending_nutrients.items():
        conn.execute(
            "INSERT OR REPLACE INTO food_nutrients(food_id, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g) "
            "VALUES (?,?,?,?,?,?)",
            (local_id, values.get("calories", 0), values.get("protein", 0),
             values.get("carbs", 0), values.get("fat", 0), values.get("fiber", 0)),
        )
    conn.commit()
    print(f"✅ تم ربط القيم الغذائية لـ {len(pending_nutrients)} طعام من USDA.")

    if os.path.exists(portion_csv) and os.path.exists(measure_unit_csv):
        print("جاري استيراد الحصص (Portions) الحقيقية...")
        measure_units = {}
        with open(measure_unit_csv, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                measure_units[row["id"]] = row["name"]

        portions_count = 0
        with open(portion_csv, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                fdc_id = row.get("fdc_id")
                gram_weight = row.get("gram_weight")
                if fdc_id not in food_id_map or not gram_weight:
                    continue
                local_id = food_id_map[fdc_id]
                unit_name = measure_units.get(row.get("measure_unit_id", ""), "")
                amount = row.get("amount") or "1"
                desc = row.get("portion_description") or unit_name or "حصة"
                portion_name = f"{amount} {desc}".strip()
                conn.execute(
                    "INSERT INTO food_portions(food_id, portion_name, normalized_portion_name, grams) VALUES (?,?,?,?)",
                    (local_id, portion_name, normalize(portion_name), float(gram_weight)),
                )
                portions_count += 1
        conn.commit()
        print(f"✅ تم استيراد {portions_count} حصة (Portion) حقيقية.")
    else:
        print("⚠️ ما لكيت food_portion.csv أو measure_unit.csv — تم تخطي استيراد الحصص.")

    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="استيراد بيانات الأكل لقاعدة CJ WORKOUT المحلية")
    parser.add_argument("--seed", action="store_true", help="استورد بيانات CJ WORKOUT المنسّقة (عراقية/عربية)")
    parser.add_argument("--usda", type=str, help="مسار مجلد يحتوي ملفات USDA CSV بعد فك الضغط")
    parser.add_argument("--reset", action="store_true", help="احذف القاعدة الحالية قبل الاستيراد")
    args = parser.parse_args()

    if args.reset and os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        print("🗑️  تم حذف القاعدة القديمة.")

    if args.seed:
        import_seed()
    if args.usda:
        import_usda(args.usda)
    if not args.seed and not args.usda:
        parser.print_help()
