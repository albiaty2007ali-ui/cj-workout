"""
يولّد زوج مفاتيح VAPID (لتوقيع Web Push) مرة وحدة — انسخ الناتج لملف .env (SUPPORT_WHATSAPP_NUMBER
وغيرها موجودة هناك أصلًا). لا تشغّله إلا مرة وحدة لكل بيئة (Dev/Prod) — تغيير المفاتيح يبطل كل
اشتراكات Push الحالية للمستخدمين (PushSubscription القديمة تصير غير صالحة، تُحذف تلقائيًا أول
مرة نحاول نرسل إلها).

الاستخدام:
    python3 scripts/generate_vapid_keys.py
"""
import base64

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from py_vapid import Vapid02


def main():
    vapid = Vapid02()
    vapid.generate_keys()

    private_pem = vapid.private_pem().decode("utf-8")
    raw_public = vapid.public_key.public_bytes(
        encoding=Encoding.X962, format=PublicFormat.UncompressedPoint,
    )
    public_b64url = base64.urlsafe_b64encode(raw_public).rstrip(b"=").decode("utf-8")

    print("انسخ هذا لملف .env:\n")
    print(f"VAPID_PUBLIC_KEY={public_b64url}")
    print("VAPID_PRIVATE_KEY_PEM_BASE64=" + base64.b64encode(private_pem.encode("utf-8")).decode("utf-8"))
    print("VAPID_CLAIMS_EMAIL=mailto:you@example.com")


if __name__ == "__main__":
    main()
