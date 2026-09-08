"""
البروفايل الاجتماعي — عرض/تعديل بيانات المستخدم نفسه، وعرض عام محدود لمستخدمين آخرين
(يحترم User.profile_visibility). رفع الصورة يمر عبر نفس نمط payments.py (secure_filename +
فحص امتداد/حجم)، بالإضافة لتحقق حقيقي بمحتوى الصورة وضغط/قص عبر Pillow.
"""
import os
import re
from datetime import datetime

from flask import Blueprint, render_template, request, jsonify, abort, url_for
from flask_login import login_required, current_user
from flask_wtf import FlaskForm
from flask_wtf.csrf import validate_csrf, ValidationError
from werkzeug.utils import secure_filename
from PIL import Image, UnidentifiedImageError

import iraq_time
from models import db, User, MealLog, WaterLog
from nutrition_ai import calculator, levels, streaks

profile_bp = Blueprint("profile", __name__)

ALLOWED_PHOTO_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
MAX_PHOTO_SIZE = 5 * 1024 * 1024  # 5MB
USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")


class _CSRFOnlyForm(FlaskForm):
    pass


def _allowed_photo(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_PHOTO_EXTENSIONS


def _validate_csrf_header():
    try:
        validate_csrf(request.headers.get("X-CSRFToken", ""))
        return None
    except ValidationError:
        return jsonify({"ok": False, "error": "جلسة منتهية، أعد تحميل الصفحة"}), 400


def _own_stats(user):
    from datetime import timedelta

    day_totals = calculator.today_totals(user, MealLog)
    today = iraq_time.now_baghdad().date()
    active_dates = streaks.recent_active_dates(user, days=30)
    calendar = [
        {"date": today - timedelta(days=offset), "active": (today - timedelta(days=offset)) in active_dates,
         "is_today": offset == 0}
        for offset in range(29, -1, -1)
    ]
    return {
        "meals_logged": MealLog.query.filter_by(user_id=user.id).count(),
        "water_logs": WaterLog.query.filter_by(user_id=user.id).count(),
        "today_calories": day_totals["calories"],
        "calendar": calendar,
    }


@profile_bp.route("/profile")
@login_required
def my_profile():
    progress = levels.xp_progress(current_user.xp)
    form = _CSRFOnlyForm()
    return render_template(
        "profile.html", user=current_user, is_own=True, progress=progress,
        stats=_own_stats(current_user), form=form, today=iraq_time.now_baghdad().date(),
    )


@profile_bp.route("/u/<username>")
def public_profile(username):
    user = User.query.filter_by(username=username.lower()).first_or_404()

    is_owner_or_admin = current_user.is_authenticated and (
        current_user.id == user.id or current_user.role == "admin"
    )
    if user.profile_visibility == "private" and not is_owner_or_admin:
        return render_template("profile_private.html", user=user), 403

    progress = levels.xp_progress(user.xp)
    is_own = current_user.is_authenticated and current_user.id == user.id
    return render_template(
        "profile.html", user=user, is_own=is_own, progress=progress,
        stats=_own_stats(user) if is_own else None,
        form=_CSRFOnlyForm() if is_own else None, today=iraq_time.now_baghdad().date(),
    )


@profile_bp.route("/profile/edit", methods=["POST"])
@login_required
def edit_profile():
    err = _validate_csrf_header()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    username = (data.get("username") or "").strip().lower()
    bio = (data.get("bio") or "").strip()

    errors = {}
    if len(name) < 2:
        errors["name"] = "الاسم قصير جدًا"
    if username and not USERNAME_RE.match(username):
        errors["username"] = "يوزرنيم صحيح: حروف/أرقام إنكليزية و_ فقط، 3-20 حرف"
    if username:
        existing = User.query.filter(User.username == username, User.id != current_user.id).first()
        if existing:
            errors["username"] = "اليوزرنيم هذا مستخدم من قبل"
    if len(bio) > 300:
        errors["bio"] = "البايو طويل جدًا (حد أقصى 300 حرف)"

    if errors:
        return jsonify({"ok": False, "errors": errors}), 400

    current_user.name = name
    current_user.username = username or None
    current_user.bio = bio or None
    db.session.commit()

    return jsonify({
        "ok": True, "name": current_user.name, "username": current_user.username, "bio": current_user.bio,
    })


@profile_bp.route("/profile/photo", methods=["POST"])
@login_required
def upload_photo():
    err = _validate_csrf_header()
    if err:
        return err

    photo = request.files.get("photo")
    if not photo or not photo.filename:
        return jsonify({"ok": False, "error": "ما انتخبت صورة"}), 400
    if not _allowed_photo(photo.filename):
        return jsonify({"ok": False, "error": "صيغة الصورة غير مدعومة (png, jpg, jpeg, webp فقط)"}), 400

    photo.seek(0, os.SEEK_END)
    size = photo.tell()
    photo.seek(0)
    if size > MAX_PHOTO_SIZE:
        return jsonify({"ok": False, "error": "حجم الصورة كبير جدًا (الحد الأقصى 5MB)"}), 400

    try:
        img = Image.open(photo.stream)
        img.verify()
    except (UnidentifiedImageError, OSError):
        return jsonify({"ok": False, "error": "الملف مو صورة صالحة"}), 400

    photo.stream.seek(0)
    img = Image.open(photo.stream).convert("RGB")
    width, height = img.size
    side = min(width, height)
    left, top = (width - side) // 2, (height - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((512, 512), Image.LANCZOS)

    old_photo = current_user.photo_url
    filename = secure_filename(f"{current_user.id}_{int(datetime.utcnow().timestamp())}.jpg")
    upload_dir = os.path.join("static", "uploads", "profile_photos")
    os.makedirs(upload_dir, exist_ok=True)
    img.save(os.path.join(upload_dir, filename), "JPEG", quality=85, optimize=True)

    current_user.photo_url = f"uploads/profile_photos/{filename}"
    db.session.commit()

    if old_photo and old_photo.startswith("uploads/profile_photos/"):
        old_path = os.path.join("static", old_photo)
        if os.path.exists(old_path):
            os.remove(old_path)

    return jsonify({"ok": True, "photo_url": url_for("static", filename=current_user.photo_url)})


@profile_bp.route("/profile/photo/remove", methods=["POST"])
@login_required
def remove_photo():
    err = _validate_csrf_header()
    if err:
        return err

    old_photo = current_user.photo_url
    current_user.photo_url = None
    db.session.commit()

    if old_photo and old_photo.startswith("uploads/profile_photos/"):
        old_path = os.path.join("static", old_photo)
        if os.path.exists(old_path):
            os.remove(old_path)

    return jsonify({"ok": True})
