/**
 * منفذ حرفي من email_service.py — إرسال حقيقي عبر Resend API (طلب fetch مباشر، بدون SDK إضافي).
 * فشل الإرسال لا يوقف أبدًا الإجراء الحقيقي (تسجيل/تفعيل اشتراك) — كل استدعاء يُغلَّف بـtry/catch
 * من المستدعي، تمامًا كقاعدة الأصل الموثّقة بـCLAUDE.md.
 */
const RESEND_API_URL = "https://api.resend.com/emails";
const BRAND_GREEN = "#1f3a2e";
const BRAND_GOLD = "#b98d4a";
const BRAND_CREAM = "#faf8f3";

function wrap(bodyHtml: string): string {
  return `
    <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; background:${BRAND_CREAM}; padding: 32px 0;">
      <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e5e0d3;">
        <div style="background:${BRAND_GREEN};padding:28px 32px;text-align:center;">
          <p style="margin:0;color:#faf8f3;font-size:22px;font-weight:800;letter-spacing:1px;">CJ WORKOUT</p>
        </div>
        <div style="padding:32px;color:#22201b;line-height:1.9;font-size:15px;">
          ${bodyHtml}
        </div>
        <div style="padding:20px 32px;background:#f4efe3;text-align:center;font-size:12px;color:#7a7563;">
          CJ WORKOUT — كابتن CJ وياك
        </div>
      </div>
    </div>`;
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.EMAIL_FROM ?? "CJ WORKOUT <onboarding@resend.dev>";
  if (!apiKey) throw new Error("RESEND_API_KEY غير موجود بالبيئة — لا يمكن إرسال إيميلات");

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromAddr, to: [to], subject, html }),
  });
  if (!res.ok) {
    console.warn(`[Resend] فشل الإرسال (${res.status}): ${await res.text()}`);
    return false;
  }
  return true;
}

export async function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  const html = wrap(`
    <h2 style="color:${BRAND_GREEN};margin-top:0;">أهلًا بيك، ${name} 👋</h2>
    <p>حسابك بـ CJ WORKOUT جاهز. من هسه صاعد، عندك رفيق يساعدك توصل لهدفك بخطوات واضحة وواقعية.</p>
    <p>افتح حسابك وكمل بياناتك حتى نجهزلك خطتك الشخصية.</p>
  `);
  return send(to, "أهلًا بيك بـ CJ WORKOUT 💪", html);
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const html = wrap(`
    <h2 style="color:${BRAND_GREEN};margin-top:0;">إعادة تعيين كلمة المرور</h2>
    <p>وصلنا طلب لإعادة تعيين كلمة المرور لحسابك. اضغط الزر أدناه لإكمال العملية:</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${resetUrl}" style="background:${BRAND_GOLD};color:#22201b;
         padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:bold;">
         إعادة تعيين كلمة المرور
      </a>
    </p>
    <p style="color:#7a7563;font-size:13px;">
      هذا الرابط صالح لمدة 30 دقيقة فقط. إذا ما طلبت هذا، تجاهل الرسالة ولا داعي لأي إجراء.
    </p>
  `);
  return send(to, "إعادة تعيين كلمة المرور — CJ WORKOUT", html);
}

export async function sendPaymentConfirmedEmail(to: string, name: string, amount: number, endDateStr: string): Promise<boolean> {
  const html = wrap(`
    <h2 style="color:${BRAND_GREEN};margin-top:0;">تم تأكيد دفعتك ✅</h2>
    <p>هلا ${name}،</p>
    <p>استلمنا وتأكدنا من تحويلك بمبلغ <strong>${amount.toLocaleString("en-US")} دينار عراقي</strong>.</p>
    <div style="background:#f4efe3;border-radius:12px;padding:16px;margin:16px 0;">
      <p style="margin:0;">اشتراكك الآن: <strong style="color:${BRAND_GOLD};">نشط ✅</strong></p>
      <p style="margin:8px 0 0;">ساري لحد: <strong>${endDateStr}</strong></p>
    </div>
    <p>استمر نحو جسم ومستوى أحلامك 💪</p>
  `);
  return send(to, "تم تفعيل اشتراكك بنجاح — CJ WORKOUT", html);
}

export async function sendPaymentRejectedEmail(to: string, name: string, reason: string): Promise<boolean> {
  const html = wrap(`
    <h2 style="color:${BRAND_GREEN};margin-top:0;">حول عملية الدفع</h2>
    <p>هلا ${name}،</p>
    <p>ما كدرنا نأكد عملية الدفع اللي أرسلتها. السبب:</p>
    <p style="background:#fdeeee;border-radius:12px;padding:14px;color:#7a1f1f;">${reason}</p>
    <p>تكدر تعيد إرسال طلب الدفع من صفحة الاشتراك، أو تراسلنا إذا تحتاج مساعدة.</p>
  `);
  return send(to, "بخصوص عملية الدفع — CJ WORKOUT", html);
}
