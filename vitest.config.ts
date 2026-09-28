import { defineConfig } from "vitest/config";

// frontend/ حزمة مستقلة بـvitest.config.ts خاص فيها (بيئة jsdom + إعداد @testing-library) —
// اختبارات الواجهة تُشغَّل من داخل frontend/ (npm test --prefix frontend)، مو من هنا. بدون هذا
// الاستثناء، vitest الجذر يحاول تشغيلها ببيئة node العادية ويفشل بـ"document is not defined".
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "frontend/**"],
  },
});
