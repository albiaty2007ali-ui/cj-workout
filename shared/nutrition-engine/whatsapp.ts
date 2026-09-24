/**
 * منفذ من whatsapp_util.py's consultation_whatsapp_link() — رابط wa.me عام، يُعاد استخدامه
 * الآن من أكثر من نقطة (subscribe.mts، consult.mts الجديدة) بدل تكرار نفس بناء الرابط بكل مكان.
 */
export function buildWhatsappLink(number: string | undefined, message: string): string {
  if (!number) return "";
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
