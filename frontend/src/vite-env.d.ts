/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AD_CHAT_BANNER?: string;
  readonly VITE_AD_RECIPES_TOP?: string;
  readonly VITE_AD_DAILY_BOTTOM?: string;
  readonly VITE_AD_WEIGHT_BOTTOM?: string;
  readonly VITE_AD_SUBSCRIBE_INTERSTITIAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
