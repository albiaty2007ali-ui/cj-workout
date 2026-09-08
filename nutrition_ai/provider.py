"""
AIProvider — واجهة جاهزة لربط Local LLM مستقبلاً (Ollama/llama.cpp/أي Local Runtime)
بدون تغيير أي طبقة حسابية. اللي مفعّل حاليًا هو NullAIProvider فقط (يرجع None دائمًا)،
فيرجع orchestrator.py للـ Response Templates (nutrition_ai/responses.py) — نفس فلسفة
"لو فشل الـLLM ما يوگف التطبيق" لأنه أصلاً غير مفعّل الآن.

مهم: أي Provider مستقبلي مسموحله يصيغ الجملة فقط (Natural Conversation) — ممنوع يرجع
رقم سعرات/كمية يُستخدم مباشرة بالحساب. الأرقام دائمًا من nutrition_ai/calculator.py.

اختيار المزوّد عبر متغير بيئة AI_PROVIDER (غير موجود = "null" = NullAIProvider، صفر
تفعيل بالإنتاج). حتى لو انضبط مزوّد ثاني، is_available() يفحص فعليًا قبل الاستخدام —
أي فشل بالاتصال (السيرفر المحلي مو شغال، Timeout، إلخ) يرجّع تلقائيًا لـNullAIProvider
بدون ما يوقف أي رد بالشات.
"""
import os
from abc import ABC, abstractmethod

import requests


class AIProvider(ABC):
    @abstractmethod
    def is_available(self) -> bool:
        ...

    @abstractmethod
    def rephrase(self, base_text: str, context: dict) -> str | None:
        """يرجّع صياغة أخف/أطبع لنص جاهز، أو None لو ما قدر (يبقى النص الأصلي كما هو)."""
        ...


class NullAIProvider(AIProvider):
    """المزوّد الافتراضي الآن — ما فيه LLM فعلي، فيخلي كل الردود من Templates محلية بالكامل."""

    def is_available(self) -> bool:
        return False

    def rephrase(self, base_text: str, context: dict) -> str | None:
        return None


class OllamaProvider(AIProvider):
    """يتواصل مع Ollama محلي (https://ollama.com) عبر HTTP — بدون أي بيانات تطلع خارج الجهاز.
    عنوان السيرفر من OLLAMA_BASE_URL (افتراضي http://localhost:11434)، والموديل من
    OLLAMA_MODEL (افتراضي "qwen2.5:7b" — أي موديل عربي/متعدد اللغات موجود محليًا يشتغل)."""

    def __init__(self):
        self.base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
        self.model = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")

    def is_available(self) -> bool:
        try:
            r = requests.get(f"{self.base_url}/api/tags", timeout=2)
            return r.status_code == 200
        except requests.RequestException:
            return False

    def rephrase(self, base_text: str, context: dict) -> str | None:
        try:
            r = requests.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": _rephrase_prompt(base_text, context),
                    "stream": False,
                },
                timeout=8,
            )
            if r.status_code != 200:
                return None
            text = (r.json().get("response") or "").strip()
            return text or None
        except (requests.RequestException, ValueError):
            return None


class LlamaCppProvider(AIProvider):
    """يتواصل مع سيرفر llama.cpp محلي (llama-server، endpoint متوافق مع OpenAI Chat Completions)
    عبر LLAMACPP_BASE_URL (افتراضي http://localhost:8080)."""

    def __init__(self):
        self.base_url = os.environ.get("LLAMACPP_BASE_URL", "http://localhost:8080").rstrip("/")

    def is_available(self) -> bool:
        try:
            r = requests.get(f"{self.base_url}/health", timeout=2)
            return r.status_code == 200
        except requests.RequestException:
            return False

    def rephrase(self, base_text: str, context: dict) -> str | None:
        try:
            r = requests.post(
                f"{self.base_url}/v1/chat/completions",
                json={
                    "messages": [{"role": "user", "content": _rephrase_prompt(base_text, context)}],
                    "temperature": 0.7,
                },
                timeout=8,
            )
            if r.status_code != 200:
                return None
            text = r.json()["choices"][0]["message"]["content"].strip()
            return text or None
        except (requests.RequestException, ValueError, KeyError, IndexError):
            return None


class OpenAICompatibleProvider(AIProvider):
    """أي Endpoint متوافق مع OpenAI Chat Completions API (LocalAI, vLLM, أو حتى خدمة خارجية
    لو انضبطت صراحة) — العنوان/المفتاح/الموديل من OPENAI_COMPATIBLE_BASE_URL /
    OPENAI_COMPATIBLE_API_KEY / OPENAI_COMPATIBLE_MODEL. بدون مفتاح، is_available() ترجع False."""

    def __init__(self):
        self.base_url = os.environ.get("OPENAI_COMPATIBLE_BASE_URL", "").rstrip("/")
        self.api_key = os.environ.get("OPENAI_COMPATIBLE_API_KEY", "")
        self.model = os.environ.get("OPENAI_COMPATIBLE_MODEL", "")

    def is_available(self) -> bool:
        return bool(self.base_url and self.api_key and self.model)

    def rephrase(self, base_text: str, context: dict) -> str | None:
        if not self.is_available():
            return None
        try:
            r = requests.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": _rephrase_prompt(base_text, context)}],
                    "temperature": 0.7,
                },
                timeout=8,
            )
            if r.status_code != 200:
                return None
            text = r.json()["choices"][0]["message"]["content"].strip()
            return text or None
        except (requests.RequestException, ValueError, KeyError, IndexError):
            return None


def _rephrase_prompt(base_text: str, context: dict) -> str:
    return (
        "أعد صياغة الجملة التالية بلهجة عراقية طبيعية وودية، بدون تغيير أي رقم أو معنى فيها، "
        "وبدون إضافة معلومات جديدة:\n\n" + base_text
    )


_PROVIDERS = {
    "ollama": OllamaProvider,
    "llamacpp": LlamaCppProvider,
    "openai_compatible": OpenAICompatibleProvider,
}


def get_provider() -> AIProvider:
    name = os.environ.get("AI_PROVIDER", "null")
    provider_cls = _PROVIDERS.get(name)
    if not provider_cls:
        return NullAIProvider()
    provider = provider_cls()
    return provider if provider.is_available() else NullAIProvider()
