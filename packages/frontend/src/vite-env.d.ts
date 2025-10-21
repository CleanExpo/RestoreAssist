/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_GOOGLE_CLIENT_ID: string
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string
  readonly VITE_STRIPE_PRODUCT_FREE_TRIAL: string
  readonly VITE_STRIPE_PRODUCT_MONTHLY: string
  readonly VITE_STRIPE_PRODUCT_YEARLY: string
  readonly VITE_STRIPE_PRICE_FREE_TRIAL: string
  readonly VITE_STRIPE_PRICE_MONTHLY: string
  readonly VITE_STRIPE_PRICE_YEARLY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
