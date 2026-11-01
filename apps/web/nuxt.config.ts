export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: ['@nuxtjs/i18n'],
  css: ['~/assets/main.css'],

  // @ahm/sim ships TypeScript source (ADR-001).
  build: { transpile: ['@ahm/sim'] },
  nitro: { externals: { inline: ['@ahm/sim'] } },

  // Server only: the browser never talks to Supabase (ADR-017).
  runtimeConfig: {
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabaseServiceKey: '',
  },

  i18n: {
    defaultLocale: 'en',
    strategy: 'no_prefix',
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'sk', language: 'sk-SK', name: 'Slovenčina', file: 'sk.json' },
    ],
    detectBrowserLanguage: { useCookie: true, cookieKey: 'ahm_locale', fallbackLocale: 'en' },
  },
})
