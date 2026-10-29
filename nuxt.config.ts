// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: false,
  app: {
    head: {
      htmlAttrs: { lang: 'ko' },
      title: 'memorize',
    },
  },
  modules: ['shadcn-nuxt'],
  imports: {
    dirs: ['stores'],
  },
  css: ['~/assets/css/tailwind.css'],
  vue: {
    compilerOptions: {
      isCustomElement: tag => tag === 'math-field',
    },
  },
  vite: {
    plugins: [
      tailwindcss(),
    ],
  },
  shadcn: {
    prefix: '',
    componentDir: '@/components/ui',
  },
  runtimeConfig: {
    public: {
      firebase: {
        apiKey: '',
        authDomain: '',
        projectId: '',
        storageBucket: '',
        messagingSenderId: '',
        appId: '',
      },
      useEmulator: false,
      sentryDsn: '',
    },
  },
})
