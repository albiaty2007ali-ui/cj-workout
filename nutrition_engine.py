"""
محرك المحادثة الغذائية — Local-First بالكامل. لا يوجد أي اتصال API خارجي هنا.

هذا الملف واجهة رقيقة (facade) فقط — كل المنطق الفعلي انتقل إلى حزمة nutrition_ai/
(طبقات مستقلة: Intent Detector, Entity Extractor, Quantity Resolver, Meal State Machine,
Nutrition Calculator, Recommendation Engine, Tips Engine, Context Manager, Response Generator).
أبقيناه بنفس الاسم والتوقيع حتى chat.py ما يحتاج يتغيّر.

القواعد الأساسية (لسا نافذة بالكامل عبر nutrition_ai/orchestrator.py):
1. لا نخمّن السعرات أبدًا — تأتي من قاعدة البيانات فقط (food_search.py / foods.sqlite).
2. لا نفترض الكمية أبدًا — إذا غير واضحة، نسأل.
3. لا نسجّل وجبة إلا بعد تأكيد صريح من المستخدم (Meal Confirmation).
"""
from nutrition_ai.orchestrator import handle_message

__all__ = ["handle_message"]
