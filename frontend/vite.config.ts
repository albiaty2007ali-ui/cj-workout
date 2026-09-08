import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// أثناء التطوير المحلي فقط: يمرّر /api/* لسيرفر Netlify Dev (netlify dev، منفذ 8888 افتراضيًا)
// حتى نقدر نشغّل npm run dev بمجلد frontend/ بدون تكرار كل الـFunctions محليًا بدون Netlify CLI.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:8888", changeOrigin: true },
    },
  },
});
