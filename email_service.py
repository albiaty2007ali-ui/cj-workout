"""
خدمة إرسال الإيميلات الحقيقية عبر Resend API.
لا نستخدم SDK خارجي إضافي — طلب HTTP مباشر يكفي ويقلل الاعتماديات.
"""
import os
import requests

RESEND_API_URL = "https://api.resend.com/emails"
BRAND_GREEN = "#1f3a2e"
BRAND_GOLD = "#b98d4a"
BRAND_CREAM = "#faf8f3"


def _wrap(body_html: str) -> str:
    return f"""
    <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; background:{BRAND_CREAM}; padding: 32px 0;">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e5e0d3;">
        <div style="background:{BRAND_GREEN};padding:28px 32px;text-align:center;">
          <p style="margin:0;color:#faf8f3;font-size:22px;font-weight:800;letter-spacing:1px;">CJ WORKOUT</p>
        </div>
        <div style="padding:32px;color:#22201b;line-height:1.9;font-size:15px;">
          {body_html}
        </div>
        <div style="padding:20px 32px;background:#f4efe3;text-align:center;font-size:12px;color:#7a7563;">
          CJ WORKOUT — كابتن CJ وياك
        </div>
      </div>
    </div>"""


def _send(to: str, subject: str, html: str) -> bool:
    api_key = os.environ.get("RESEND_API_KEY")
    from_addr = os.environ.get("EMAIL_FROM", "CJ WORKOUT <onboarding@resend.dev>")
    if not api_key:
        raise RuntimeError("RESEND_API_KEY غير موجود بـ .env — لا يمكن إرسال إيميلات")

    resp = requests.post(
        RESEND_API_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={"from": from_addr, "to": [to], "subject": subject, "html": html},
        timeout=10,
    )
    if resp.status_code >= 400:
        # لا نطلع تفاصيل الخطأ للمستخدم، بس نسجلها للمطوّر
        print(f"[Resend] فشل الإرسال ({resp.status_code}): {resp.text}")
        return False
    return True


def send_welcome_email(to: str, name: str) -> bool:
    html = _wrap(f"""
      <h2 style="color:{BRAND_GREEN};margin-top:0;">أهلًا بيك، {name} 👋</h2>
      <p>حسابك بـ CJ WORKOUT جاهز. من هسه صاعد، عندك رفيق يساعدك توصل لهدفك بخطوات واضحة وواقعية.</p>
      <p>افتح حسابك وكمل بياناتك حتى نجهزلك خطتك الشخصية.</p>
    """)
    return _send(to, "أهلًا بيك بـ CJ WORKOUT 💪", html)


def send_password_reset_email(to: str, reset_url: str) -> bool:
    html = _wrap(f"""
      <h2 style="color:{BRAND_GREEN};margin-top:0;">إعادة تعيين كلمة المرور</h2>
      <p>وصلنا طلب لإعادة تعيين كلمة المرور لحسابك. اضغط الزر أدناه لإكمال العملية:</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="{reset_url}" style="background:{BRAND_GOLD};color:#22201b;
           padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:bold;">
           إعادة تعيين كلمة المرور
        </a>
      </p>
      <p style="color:#7a7563;font-size:13px;">
        هذا الرابط صالح لمدة 30 دقيقة فقط. إذا ما طلبت هذا، تجاهل الرسالة ولا داعي لأي إجراء.
      </p>
    """)
    return _send(to, "إعادة تعيين كلمة المرور — CJ WORKOUT", html)


def send_payment_confirmed_email(to: str, name: str, amount: int, end_date_str: str) -> bool:
    html = _wrap(f"""
      <h2 style="color:{BRAND_GREEN};margin-top:0;">تم تأكيد دفعتك ✅</h2>
      <p>هلا {name}،</p>
      <p>استلمنا وتأكدنا من تحويلك بمبلغ <strong>{amount:,} دينار عراقي</strong>.</p>
      <div style="background:#f4efe3;border-radius:12px;padding:16px;margin:16px 0;">
        <p style="margin:0;">اشتراكك الآن: <strong style="color:{BRAND_GOLD};">نشط ✅</strong></p>
        <p style="margin:8px 0 0;">ساري لحد: <strong>{end_date_str}</strong></p>
      </div>
      <p>استمر نحو جسم ومستوى أحلامك 💪</p>
    """)
    return _send(to, "تم تفعيل اشتراكك بنجاح — CJ WORKOUT", html)


def send_payment_rejected_email(to: str, name: str, reason: str) -> bool:
    html = _wrap(f"""
      <h2 style="color:{BRAND_GREEN};margin-top:0;">حول عملية الدفع</h2>
      <p>هلا {name}،</p>
      <p>ما كدرنا نأكد عملية الدفع اللي أرسلتها. السبب:</p>
      <p style="background:#fdeeee;border-radius:12px;padding:14px;color:#7a1f1f;">{reason}</p>
      <p>تكدر تعيد إرسال طلب الدفع من صفحة الاشتراك، أو تراسلنا إذا تحتاج مساعدة.</p>
    """)
    return _send(to, "بخصوص عملية الدفع — CJ WORKOUT", html)
