import { useEffect, useRef } from "react";

interface AdSlotProps {
  /** كود HTML/Script الخام الجاهز من شبكة الإعلانات (Adsterra/AdSense/...) — null = ما يعرض شي. */
  html: string | null | undefined;
  className?: string;
}

/**
 * حاوية عامة لأي كود إعلان خارجي. React's dangerouslySetInnerHTML ما ينفّذ وسوم <script> — لازم
 * نبنيها يدويًا (createElement + appendChild) حتى تشتغل سكربتات الشبكات الإعلانية فعليًا.
 * ترجع null (صفر DOM إضافي) لو ماكو كود معطى بعد — هذا يخلي كل أماكن الإعلان بالتطبيق آمنة
 * تمامًا قبل ما نحصل أكواد حقيقية من الشبكة، بدون أي صندوق فاضي أو خطأ.
 */
export default function AdSlot({ html, className }: AdSlotProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!html || !ref.current) return;
    const container = ref.current;
    container.innerHTML = "";

    const temp = document.createElement("div");
    temp.innerHTML = html;
    Array.from(temp.childNodes).forEach((node) => {
      if (node.nodeName === "SCRIPT") {
        const original = node as HTMLScriptElement;
        const script = document.createElement("script");
        Array.from(original.attributes).forEach((attr) => script.setAttribute(attr.name, attr.value));
        script.text = original.text;
        container.appendChild(script);
      } else {
        container.appendChild(node.cloneNode(true));
      }
    });

    return () => {
      container.innerHTML = "";
    };
  }, [html]);

  if (!html) return null;
  return <div ref={ref} className={className} />;
}
