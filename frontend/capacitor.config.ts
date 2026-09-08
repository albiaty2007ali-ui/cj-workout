import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cjworkout.app',
  appName: 'CJ WORKOUT',
  webDir: 'dist',
  // WebView حقيقي يفتح الموقع المنشور مباشرة — كل تحديث ينشر على Netlify ينعكس بالتطبيق فورًا
  // بدون الحاجة لإعادة بناء APK جديد، بعكس تضمين dist/ محليًا داخل الحزمة.
  server: {
    url: 'https://cjworkout.netlify.app',
    cleartext: false,
  },
};

export default config;
