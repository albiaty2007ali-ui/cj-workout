import secrets
from datetime import datetime
from functools import wraps

from flask import Blueprint, render_template, redirect, url_for, request, flash, current_app, abort
from flask_login import login_user, logout_user, login_required, current_user
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField
from wtforms.validators import DataRequired
from werkzeug.security import generate_password_hash, check_password_hash

from models import db, User, PasswordResetToken
from validation import validate_email, validate_password, validate_name
from email_service import send_welcome_email, send_password_reset_email
from extensions import limiter


def admin_required(view):
    """يمنع أي مستخدم غير أدمن من الوصول، حتى لو فتح الرابط يدويًا.
    التحقق هنا Server-Side بالكامل من قاعدة البيانات — لا نثق بأي شيء من الـ Frontend."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated or current_user.role != "admin":
            abort(403)
        return view(*args, **kwargs)
    return wrapped


def _post_auth_redirect():
    """بعد التسجيل/الدخول: لو ما أكمل الـ Onboarding نرسله له، وإلا نرسله لواجهة الـChat مباشرة."""
    if current_user.onboarding_completed:
        return redirect(url_for("chat.app_home"))
    return redirect(url_for("chat.onboarding"))

auth_bp = Blueprint("auth", __name__)


# نماذج بسيطة فقط للحصول على حماية CSRF من Flask-WTF — التحقق الفعلي يدويًا أدناه
class _CSRFOnlyForm(FlaskForm):
    pass


@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    form = _CSRFOnlyForm()
    errors = {}

    if request.method == "POST" and form.validate_on_submit():
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        confirm = request.form.get("confirm", "")

        if err := validate_name(name):
            errors["name"] = err
        if err := validate_email(email):
            errors["email"] = err
        if err := validate_password(password):
            errors["password"] = err
        if password != confirm:
            errors["confirm"] = "كلمتا المرور غير متطابقتين"
        if not errors and User.query.filter_by(email=email).first():
            errors["email"] = "هذا البريد الإلكتروني مستخدم من قبل"

        if not errors:
            user = User(name=name, email=email, role="user")
            user.set_password(password)
            db.session.add(user)
            db.session.commit()

            # إرسال إيميل ترحيب حقيقي — فشله لا يوقف التسجيل
            try:
                if send_welcome_email(email, name):
                    user.welcome_email_sent = True
                    db.session.commit()
            except Exception as e:
                current_app.logger.warning(f"welcome email failed: {e}")

            login_user(user)
            flash("تم إنشاء حسابك بنجاح، أهلًا بيك بـ CJ WORKOUT", "success")
            return _post_auth_redirect()

    return render_template("register.html", form=form, errors=errors,
                            values=request.form)


@auth_bp.route("/login", methods=["GET", "POST"])
@limiter.limit("10 per minute")
def login():
    form = _CSRFOnlyForm()
    error = None

    if request.method == "POST" and form.validate_on_submit():
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        user = User.query.filter_by(email=email).first()
        if not user or not user.check_password(password):
            error = "البريد الإلكتروني أو كلمة المرور غير صحيحة"
        elif user.disabled:
            error = "هذا الحساب معطّل، تواصل مع الإدارة"
        else:
            login_user(user)
            flash("تم تسجيل الدخول بنجاح", "success")
            return _post_auth_redirect()

    return render_template("login.html", form=form, error=error)


@auth_bp.route("/logout")
@login_required
def logout():
    logout_user()
    flash("تم تسجيل الخروج", "info")
    return redirect(url_for("main.home"))


@auth_bp.route("/forgot-password", methods=["GET", "POST"])
@limiter.limit("5 per minute")
def forgot_password():
    form = _CSRFOnlyForm()
    sent = False

    if request.method == "POST" and form.validate_on_submit():
        email = request.form.get("email", "").strip().lower()
        user = User.query.filter_by(email=email).first()

        # لا نكشف للمستخدم هل الإيميل موجود أم لا (منع Email Enumeration)
        # نعرض نفس رسالة النجاح دائمًا، لكن نرسل الإيميل فقط إذا كان الحساب موجود فعلًا
        if user:
            raw_token = secrets.token_urlsafe(32)
            token_row = PasswordResetToken(
                user_id=user.id,
                token_hash=generate_password_hash(raw_token),
                expires_at=PasswordResetToken.new_expiry(minutes=30),
            )
            db.session.add(token_row)
            db.session.commit()

            reset_url = url_for(
                "auth.reset_password", token=raw_token, uid=user.id, _external=True
            )
            try:
                send_password_reset_email(user.email, reset_url)
            except Exception as e:
                current_app.logger.warning(f"reset email failed: {e}")

        sent = True

    return render_template("forgot_password.html", form=form, sent=sent)


@auth_bp.route("/reset-password", methods=["GET", "POST"])
def reset_password():
    form = _CSRFOnlyForm()
    token = request.args.get("token") or request.form.get("token")
    uid = request.args.get("uid") or request.form.get("uid")
    error = None

    def _find_valid_token():
        if not token or not uid:
            return None
        candidates = PasswordResetToken.query.filter_by(
            user_id=uid, used=False
        ).order_by(PasswordResetToken.created_at.desc()).all()
        for row in candidates:
            if row.expires_at > datetime.utcnow() and check_password_hash(row.token_hash, token):
                return row
        return None

    valid_token = _find_valid_token()
    if not valid_token and request.method == "GET":
        return render_template("reset_password.html", form=form, invalid=True)

    if request.method == "POST" and form.validate_on_submit():
        if not valid_token:
            return render_template("reset_password.html", form=form, invalid=True)

        password = request.form.get("password", "")
        confirm = request.form.get("confirm", "")

        if err := validate_password(password):
            error = err
        elif password != confirm:
            error = "كلمتا المرور غير متطابقتين"

        if not error:
            user = User.query.get(valid_token.user_id)
            user.set_password(password)
            valid_token.used = True
            db.session.commit()
            flash("تم تغيير كلمة المرور بنجاح، سجّل الدخول الآن", "success")
            return redirect(url_for("auth.login"))

    return render_template(
        "reset_password.html", form=form, invalid=False, error=error, token=token, uid=uid
    )
