"""
استخدام: python3 make_admin.py user@email.com
يحوّل مستخدم موجود إلى صلاحية أدمن.
"""
import sys
from app import create_app
from models import db, User

if len(sys.argv) < 2:
    print("استخدام: python3 make_admin.py user@email.com")
    sys.exit(1)

email = sys.argv[1].strip().lower()
app = create_app()

with app.app_context():
    user = User.query.filter_by(email=email).first()
    if not user:
        print(f"❌ ما لكيت مستخدم بهذا الإيميل: {email}")
        sys.exit(1)
    user.role = "admin"
    db.session.commit()
    print(f"✅ تم تعيين {email} كأدمن")
