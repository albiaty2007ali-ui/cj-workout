/**
 * محوّل Markdown صغير مكتوب يدويًا لردود الشات — بديل متعمَّد لمكتبة تحليل+تعقيم خارجية (صفر
 * تبعية جديدة، حجم Bundle صغير، يطابق نمط المشروع). **الأمان أولًا**: escape لكل HTML خام قبل أي
 * تحويل، فأي وسم/سكربت يكتبه المستخدم أو يرجّعه Gemini يظهر كنص حرفي أبدًا لا يُنفَّذ. يدعم فقط
 * مجموعة مغلقة معروفة: عناوين/عريض/مائل/كود مضمّن/روابط (http/https فقط)/قوائم نقطية ومرقّمة —
 * أي شي غير مطابق يبقى نص عادي، صفر HTML عام يُمرَّر.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function renderSafeMarkdown(raw: string): string {
  const lines = escapeHtml(raw).split("\n");
  const html: string[] = [];
  let listBuffer: string[] = [];
  let listType: "ul" | "ol" | null = null;

  function flushList() {
    if (listType && listBuffer.length > 0) {
      html.push(`<${listType}>${listBuffer.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${listType}>`);
    }
    listBuffer = [];
    listType = null;
  }

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);

    if (heading) {
      flushList();
      const level = heading[1].length;
      html.push(`<h${level + 2}>${renderInline(heading[2])}</h${level + 2}>`);
    } else if (bullet) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listBuffer.push(bullet[1]);
    } else if (numbered) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listBuffer.push(numbered[1]);
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      html.push(`<p>${renderInline(line)}</p>`);
    }
  }
  flushList();
  return html.join("");
}
