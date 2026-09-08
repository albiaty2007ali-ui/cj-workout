import os
from datetime import datetime, timedelta

from flask import (
    Blueprint, render_template, redirect, url_for, request, flash,
    current_app, abort,
)
from flask_login import login_required, current_user
from flask_wtf import FlaskForm
from werkzeug.utils import secure_filename

from models import db, Payment, Subscription, Plan, AdminLog
from email_service import send_payment_confirmed_email, send_payment_rejected_email
from auth import admin_required
from whatsapp_util import build_whatsapp_link

payments_bp = Blueprint("payments", __name__)

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
MAX_PROOF_SIZE = 5 * 1024 * 1024  # 5MB


class _CSRFOnlyForm(FlaskForm):
    pass


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@payments_bp.route("/subscribe", methods=["GET", "POST"])
@login_required
def subscribe():
    form = _CSRFOnlyForm()
    error = None
    card_number = os.environ.get("MANUAL_PAYMENT_CARD_NUMBER", "")
    price = int(os.environ.get("SUBSCRIPTION_PRICE_IQD", "10000"))

    def _whatsapp_link(reference: str = "") -> str:
        msg = f"هلا، أنا {current_user.name}. أرسلت تحويل اشتراك CJ WORKOUT."
        if reference:
            msg += f" الرقم المرجعي: {reference}"
        msg += " (هذا الإثبات مرفق بالصورة)"
        return build_whatsapp_link(msg)

    if request.method == "POST" and form.validate_on_submit():
        reference = request.form.get("reference", "").strip()
        note = request.form.get("note", "").strip()
        proof = request.files.get("proof")

        if len(reference) < 3:
            error = "أدخل رقمًا مرجعيًا صحيحًا لعملية التحويل"
        else:
            proof_path = None
            if proof and proof.filename:
                if not _allowed_file(proof.filename):
                    error = "صيغة الصورة غير مدعومة (png, jpg, jpeg, webp فقط)"
                else:
                    proof.seek(0, os.SEEK_END)
                    size = proof.tell()
                    proof.seek(0)
                    if size > MAX_PROOF_SIZE:
                        error = "حجم الصورة كبير جدًا (الحد الأقصى 5MB)"
                    else:
                        filename = secure_filename(
                            f"{current_user.id}_{int(datetime.utcnow().timestamp())}_{proof.filename}"
                        )
                        upload_dir = os.path.join(
                            current_app.root_path, "static", "uploads", "payment_proofs"
                        )
                        os.makedirs(upload_dir, exist_ok=True)
                        proof.save(os.path.join(upload_dir, filename))
                        proof_path = f"uploads/payment_proofs/{filename}"

            if not error:
                payment = Payment(
                    user_id=current_user.id,
                    plan_code="monthly",
                    amount=price,
                    currency="IQD",
                    method="manual_card_transfer",
                    status="pending_manual_review",
                    transfer_reference=reference,
                    proof_image_path=proof_path,
                    user_note=note or None,
                )
                db.session.add(payment)
                db.session.commit()
                return render_template(
                    "subscribe.html", submitted=True, form=form,
                    card_number=card_number, price=price,
                    whatsapp_link=_whatsapp_link(reference),
                )

    return render_template(
        "subscribe.html", submitted=False, form=form, error=error,
        card_number=card_number, price=price,
        whatsapp_link=_whatsapp_link(),
    )


@payments_bp.route("/admin/payments")
@login_required
@admin_required
def admin_payments():
    pending = (
        Payment.query.filter_by(status="pending_manual_review")
        .order_by(Payment.created_at.asc())
        .all()
    )
    form = _CSRFOnlyForm()
    return render_template("admin_payments.html", payments=pending, form=form)


@payments_bp.route("/admin/payments/<payment_id>/verify", methods=["POST"])
@login_required
@admin_required
def verify_payment(payment_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    payment = Payment.query.get_or_404(payment_id)
    if payment.status != "pending_manual_review":
        flash("تمت مراجعة هذه العملية مسبقًا", "error")
        return redirect(url_for("payments.admin_payments"))

    plan = Plan.query.filter_by(code=payment.plan_code).first()
    duration_days = plan.duration_days if plan else 30

    now = datetime.utcnow()
    subscription = Subscription(
        user_id=payment.user_id,
        plan_code=payment.plan_code,
        status="active",
        start_date=now,
        end_date=now + timedelta(days=duration_days),
        last_payment_id=payment.id,
    )
    db.session.add(subscription)

    payment.status = "completed"
    payment.reviewed_by = current_user.id
    payment.reviewed_at = now
    payment.completed_at = now

    db.session.add(AdminLog(
        admin_id=current_user.id, action="payment_verified", target_id=payment.id,
        details=f"user={payment.user_id} amount={payment.amount}",
    ))
    db.session.commit()

    try:
        send_payment_confirmed_email(
            payment.user.email, payment.user.name, payment.amount,
            subscription.end_date.strftime("%Y-%m-%d"),
        )
    except Exception as e:
        current_app.logger.warning(f"payment confirmation email failed: {e}")

    flash("تم تفعيل الاشتراك بنجاح", "success")
    return redirect(url_for("payments.admin_payments"))


@payments_bp.route("/admin/payments/<payment_id>/reject", methods=["POST"])
@login_required
@admin_required
def reject_payment(payment_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    payment = Payment.query.get_or_404(payment_id)
    if payment.status != "pending_manual_review":
        flash("تمت مراجعة هذه العملية مسبقًا", "error")
        return redirect(url_for("payments.admin_payments"))

    reason = request.form.get("reason", "لم يتم تحديد سبب").strip()
    payment.status = "rejected"
    payment.reviewed_by = current_user.id
    payment.reviewed_at = datetime.utcnow()
    payment.rejection_reason = reason

    db.session.add(AdminLog(
        admin_id=current_user.id, action="payment_rejected", target_id=payment.id,
        details=reason,
    ))
    db.session.commit()

    try:
        send_payment_rejected_email(payment.user.email, payment.user.name, reason)
    except Exception as e:
        current_app.logger.warning(f"payment rejection email failed: {e}")

    flash("تم رفض عملية الدفع", "info")
    return redirect(url_for("payments.admin_payments"))
