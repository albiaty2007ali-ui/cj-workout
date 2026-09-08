import os

from flask import Blueprint, render_template, redirect, url_for, send_from_directory, current_app
from flask_login import login_required, current_user

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def home():
    return render_template("index.html")


@main_bp.route("/sw.js")
def service_worker():
    # لازم يُخدَم من الجذر (مو /static/sw.js) حتى يغطي Scope الموقع كامل — شرط Service Worker API
    response = send_from_directory(
        os.path.join(current_app.root_path, "static"), "sw.js", mimetype="application/javascript",
    )
    response.headers["Cache-Control"] = "no-cache"
    return response


@main_bp.route("/dashboard")
@login_required
def dashboard():
    # الداشبورد القديم انسحب لصالح تجربة الـChat — هذا رابط توافقي فقط
    if current_user.onboarding_completed:
        return redirect(url_for("chat.app_home"))
    return redirect(url_for("chat.onboarding"))
