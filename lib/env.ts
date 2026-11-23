// RA-7784 — the single declaration of every runtime environment variable,
// and the only shipped module allowed to read the Node `process` object for
// configuration. ESLint enforces that (config/eslint-process-env.mjs); files
// that still read `process.env` directly are listed in
// config/process-env-baseline.json and move here one at a time.
//
// `.env.example` and ENV_SCHEMA must name the same variables, in both
// directions. `npm run check:env-schema` fails when they drift.
//
// `required` mirrors REQUIRED_VARS in lib/env-check.ts (a unit test keeps the
// two in step). Values are never stored here; .env.example holds placeholders.
//
// Client code: Next.js inlines NEXT_PUBLIC_* only for a literal
// `process.env.NEXT_PUBLIC_X` member access. A dynamic lookup such as
// readEnv("NEXT_PUBLIC_X") is NOT inlined into a browser bundle, so client
// reads of NEXT_PUBLIC_* stay on the baseline until a literal-access accessor
// lands. Use these readers from server code only.

export interface EnvVarSpec {
  /** Production startup refuses to run without it (lib/env-check.ts). */
  readonly required: boolean;
}

export const ENV_SCHEMA = {
  DEV_LOGIN_TOKEN: { required: false },
  DATABASE_URL: { required: true },
  DIRECT_URL: { required: false },
  NEXT_PUBLIC_SUPABASE_URL: { required: false },
  NEXT_PUBLIC_SUPABASE_ANON_KEY: { required: false },
  SUPABASE_SERVICE_ROLE_KEY: { required: false },
  NEXT_PUBLIC_LIVE_TEACHER: { required: false },
  NEXTAUTH_SECRET: { required: true },
  NEXTAUTH_URL: { required: true },
  GOOGLE_CLIENT_ID: { required: true },
  GOOGLE_CLIENT_SECRET: { required: true },
  GOOGLE_DRIVE_CLIENT_ID: { required: false },
  GOOGLE_DRIVE_CLIENT_SECRET: { required: false },
  MICROSOFT_CLIENT_ID: { required: false },
  MICROSOFT_CLIENT_SECRET: { required: false },
  MICROSOFT_TENANT_ID: { required: false },
  GOOGLE_IOS_CLIENT_ID: { required: false },
  NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID: { required: false },
  NEXT_PUBLIC_FIREBASE_API_KEY: { required: false },
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: { required: false },
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: { required: false },
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: { required: false },
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: { required: false },
  NEXT_PUBLIC_FIREBASE_APP_ID: { required: false },
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: { required: false },
  FIREBASE_SERVICE_ACCOUNT_KEY: { required: false },
  NEXT_PUBLIC_GOOGLE_APP_ID: { required: false },
  NEXT_PUBLIC_GOOGLE_API_KEY: { required: false },
  GOOGLE_PROJECT_ID: { required: false },
  GOOGLE_CLIENT_EMAIL: { required: false },
  GOOGLE_PRIVATE_KEY: { required: false },
  CLAIMS_ANALYSIS_PAUSED: { required: false },
  BILLING_MODE: { required: false },
  STRIPE_SECRET_KEY: { required: false },
  STRIPE_PUBLISHABLE_KEY: { required: false },
  STRIPE_WEBHOOK_SECRET: { required: true },
  STRIPE_CONNECT_WEBHOOK_SECRET: { required: false },
  INVOICE_ONLINE_PAYMENT_ENABLED: { required: false },
  STRIPE_PRICE_STANDARD: { required: false },
  STRIPE_PRICE_PREMIUM: { required: false },
  STRIPE_PRICE_ENTERPRISE: { required: false },
  STRIPE_PRICE_MONTHLY: { required: false },
  ANTHROPIC_API_KEY: { required: false },
  GOOGLE_GENERATIVE_AI_API_KEY: { required: false },
  OPENAI_API_KEY: { required: false },
  DEEPSEEK_API_KEY: { required: false },
  GEMINI_API_KEY: { required: false },
  OLLAMA_BASE_URL: { required: false },
  OLLAMA_MODEL: { required: false },
  MAILTRAP_API_KEY: { required: false },
  SENDER_EMAIL: { required: false },
  CLOUDINARY_CLOUD_NAME: { required: false },
  CLOUDINARY_API_KEY: { required: false },
  CLOUDINARY_API_SECRET: { required: false },
  AWS_ACCESS_KEY_ID: { required: false },
  AWS_SECRET_ACCESS_KEY: { required: false },
  AWS_REGION: { required: false },
  AWS_S3_BUCKET: { required: false },
  XERO_CLIENT_ID: { required: false },
  XERO_CLIENT_SECRET: { required: false },
  XERO_WEBHOOK_KEY: { required: false },
  XERO_ACCOUNT_WATER: { required: false },
  XERO_ACCOUNT_FIRE: { required: false },
  XERO_ACCOUNT_MOULD: { required: false },
  XERO_ACCOUNT_STORM: { required: false },
  XERO_ACCOUNT_BIOHAZARD: { required: false },
  XERO_ACCOUNT_CONTENTS: { required: false },
  XERO_ACCOUNT_GENERAL: { required: false },
  QUICKBOOKS_CLIENT_ID: { required: false },
  QUICKBOOKS_CLIENT_SECRET: { required: false },
  QUICKBOOKS_WEBHOOK_TOKEN: { required: false },
  MYOB_CLIENT_ID: { required: false },
  MYOB_CLIENT_SECRET: { required: false },
  MYOB_WEBHOOK_SECRET: { required: false },
  MYOB_ACCOUNT_WATER: { required: false },
  MYOB_ACCOUNT_FIRE: { required: false },
  MYOB_ACCOUNT_MOULD: { required: false },
  ZOHO_CLIENT_ID: { required: false },
  ZOHO_CLIENT_SECRET: { required: false },
  SERVICEM8_CLIENT_ID: { required: false },
  SERVICEM8_CLIENT_SECRET: { required: false },
  SERVICEM8_WEBHOOK_SECRET: { required: false },
  ASCORA_API_KEY: { required: false },
  ASCORA_API_SECRET: { required: false },
  ASCORA_CLIENT_ID: { required: false },
  ASCORA_CLIENT_SECRET: { required: false },
  ASCORA_SYNC_USER_EMAIL: { required: false },
  ASCORA_JOB_TYPE_WATER: { required: false },
  ASCORA_JOB_TYPE_FIRE: { required: false },
  ASCORA_JOB_TYPE_MOULD: { required: false },
  INTEGRATION_ENCRYPTION_KEY: { required: false },
  CREDENTIAL_ENCRYPTION_KEY: { required: true },
  GUIDEWIRE_SANDBOX_URL: { required: false },
  YOUI_API_URL: { required: false },
  HOLLARD_API_URL: { required: false },
  ABR_API_GUID: { required: false },
  ABR_BASE_URL: { required: false },
  PROPERTY_SCRAPER_URL: { required: false },
  PROPERTY_SCRAPER_REQUIRED: { required: false },
  POSTHOG_API_KEY: { required: false },
  POSTHOG_HOST: { required: false },
  GEMMA_ENDPOINT_URL: { required: false },
  GEMMA_API_KEY: { required: false },
  RESTOREASSIST_AI_ENDPOINT: { required: false },
  RESTOREASSIST_AI_API_KEY: { required: false },
  RESTOREASSIST_AI_MODEL: { required: false },
  INTEGRATION_DEV_MODE: { required: false },
  ENABLE_REGULATORY_CITATIONS: { required: false },
  ENABLE_ADMIN_IMPERSONATION: { required: false },
  NEXT_PUBLIC_APP_URL: { required: false },
  CRON_SECRET: { required: false },
  CRON_ALERT_EMAIL: { required: false },
  SIGNUP_ALERT_EMAIL: { required: false },
  SMOKE_TEST_BOT_BYPASS_SECRET: { required: false },
  CONNECTIONS_STATUS_TOKEN: { required: false },
  GITHUB_WEBHOOK_SECRET: { required: false },
  LINEAR_API_KEY: { required: false },
  LINEAR_RA_TEAM_ID: { required: false },
  LINEAR_SCOUT_LABEL_ID: { required: false },
  MISSION_CONTROL_WORKERS: { required: false },
  LINEAR_RA_TODO_STATE_ID: { required: false },
  HERMES_BASE_URL: { required: false },
  NEXT_PUBLIC_HERMES_OPS_URL: { required: false },
  MARGOT_NEXUS_CONTEXT: { required: false },
  TELEGRAM_BOT_TOKEN: { required: false },
  TELEGRAM_CHAT_ID: { required: false },
  TEXT_JOB_IN_ENABLED: { required: false },
  TELEGRAM_JOB_BOT_TOKEN: { required: false },
  TELEGRAM_JOB_WEBHOOK_SECRET: { required: false },
  PILOT_ADJUSTER_TOKEN: { required: false },
  SYNTHEX_BASE_URL: { required: false },
  SYNTHEX_SERVICE_TOKEN: { required: false },
  ELEVENLABS_API_KEY: { required: false },
  ELEVENLABS_VOICE_ID: { required: false },
  NEXT_PUBLIC_ELEVENLABS_AGENT_ID: { required: false },
  HEYGEN_API_KEY: { required: false },
  HEYGEN_AVATAR_ID: { required: false },
  HEYGEN_WEBHOOK_SECRET: { required: false },
  HEYGEN_GREETING_VIDEO_URL: { required: false },
  HEYGEN_EXPLAINER_VIDEO_URL: { required: false },
  YOUTUBE_API_KEY: { required: false },
  YOUTUBE_CHANNEL_ID: { required: false },
  YOUTUBE_CLIENT_ID: { required: false },
  YOUTUBE_CLIENT_SECRET: { required: false },
  CONTENT_SYSTEM_USER_ID: { required: false },
  NEXT_PUBLIC_COMPANY_ABN: { required: false },
  PORTAL_SECRET: { required: false },
  PLATFORM_SUPPORT_USER_IDS: { required: false },
  STORE_PUBLISHING_OPERATOR_USER_IDS: { required: false },
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: { required: false },
  ASC_API_KEY_ID: { required: false },
  ASC_ISSUER_ID: { required: false },
  ASC_PRIVATE_KEY_BASE64: { required: false },
  APPLE_TEAM_ID: { required: false },
  APPLE_CLIENT_ID: { required: false },
  APPLE_CLIENT_SECRET: { required: false },
  NEXT_PUBLIC_APPLE_SIGNIN_ENABLED: { required: false },
  CLOUDINARY_URL: { required: false },
  MARGOT_TOOLS_ENABLED: { required: false },
  MARGOT_FILE_SEARCH_STORE: { required: false },
  SETUP_WIZARD_ENABLED: { required: false },
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: { required: false },
  OPENROUTER_API_KEY: { required: false },
  OPENROUTER_MODEL: { required: false },
  OPENROUTER_SITE_URL: { required: false },
  SKETCH_IMPORT_ABLITERATION_FALLBACK: { required: false },
  ABLITERATION_API_KEY: { required: false },
  QUICKBOOKS_ENVIRONMENT: { required: false },
  MYOB_ENVIRONMENT: { required: false },
  ASCORA_BASE_URL: { required: false },
  STANDARDS_INGEST_TOKEN: { required: false },
  GOOGLE_DRIVE_STANDARDS_FOLDER_ID: { required: false },
  NEXT_PUBLIC_SUPPORT_EMAIL: { required: false },
  NEXT_PUBLIC_SECURITY_EMAIL: { required: false },
  AI_DEFAULT_DAILY_BUDGET_USD: { required: false },
  INVOICE_PUBLIC_TOKEN_DAYS: { required: false },
  RATE_USD_AUD: { required: false },
  NEXT_PUBLIC_APP_VERSION: { required: false },
  ALLOW_TEST_HELPERS: { required: false },
  ALLOW_TEST_HELPERS_IN_PROD_ENV: { required: false },
  NEXT_PUBLIC_UNDERLAY_URL_IMPORT: { required: false },
  FIRECRAWL_API_KEY: { required: false },
  MINIMAX_API_KEY: { required: false },
  MINIMAX_BASE_URL: { required: false },
  MINIMAX_TEXT_MODEL: { required: false },
  MINIMAX_VIDEO_MODEL: { required: false },
  ADMIN_MIGRATE_V2_ENABLED: { required: false },
  ALLOWED_APP_HOSTS: { required: false },
  APIFY_API_TOKEN: { required: false },
  APIFY_API_KEY: { required: false },
  APPLE_BUNDLE_ID: { required: false },
  APP_URL: { required: false },
  BOTID_DISABLED: { required: false },
  BRAND_AMBASSADOR_LLM_PROVIDER: { required: false },
  CLIENT_PORTAL_JWT_SECRET: { required: true },
  CONTRACTOR_ASSISTANT_ENABLED: { required: false },
  DOCKER_BUILD: { required: false },
  EMAIL_REPLY_TO: { required: false },
  EVIDENCE_REQUIRE_SIGNED_MANIFEST: { required: false },
  EXPO_PUBLIC_API_BASE: { required: false },
  GIT_SHA: { required: false },
  GOOGLE_PRIVATE_KEY_ID: { required: false },
  MARGOT_MODEL: { required: false },
  NCC_EDITION: { required: false },
  NEXTAUTH_URL_INTERNAL: { required: false },
  NEXT_PHASE: { required: false },
  NEXT_PUBLIC_APPLE_BUNDLE_ID: { required: false },
  NEXT_PUBLIC_COMPANY_ADDRESS: { required: false },
  NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID: { required: true },
  NEXT_PUBLIC_IMPORT_DATA_ENABLED: { required: false },
  NEXT_PUBLIC_MYOB_ENABLED: { required: false },
  NEXT_PUBLIC_NRPG_ENABLED: { required: false },
  NEXT_PUBLIC_PROPERTY_TEST_ADDRESS: { required: false },
  NEXT_PUBLIC_QUICKBOOKS_ENABLED: { required: false },
  NEXT_PUBLIC_SERVICEM8_ENABLED: { required: false },
  NEXT_PUBLIC_ZOHO_ENABLED: { required: false },
  NEXT_PUBLIC_SITE_URL: { required: false },
  NEXUS_PROMPT_PATH: { required: false },
  PILOT_TESTER_JUDGE_API_KEY: { required: false },
  PRICING_REMINDER_ENABLED: { required: false },
  REENGAGEMENT_SEND_TOKEN: { required: false },
  SCOUT_AGENT_LLM_PROVIDER: { required: false },
  TENANT_DATABASE_HOST_ALLOWLIST: { required: false },
  TENANT_DATABASE_PROVISIONING_ENABLED: { required: false },
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: { required: false },
  PLATFORM_SUPPORT_DEV_OPEN: { required: false },
} as const satisfies Record<string, EnvVarSpec>;

export type EnvName = keyof typeof ENV_SCHEMA;

/** Every declared name, in .env.example order. */
export const ENV_NAMES = Object.keys(ENV_SCHEMA) as readonly EnvName[];

/**
 * True only for a name declared in ENV_SCHEMA. Uses Object.hasOwn, so
 * inherited keys such as "constructor" and "toString" are not declared.
 */
export function isDeclaredEnvName(name: string): name is EnvName {
  return Object.hasOwn(ENV_SCHEMA, name);
}

/**
 * The raw value of a declared variable, exactly as `process.env.NAME` returns
 * it on the server: a string (possibly empty) or undefined.
 */
export function readEnv(name: EnvName): string | undefined {
  return process.env[name];
}

/**
 * Lookup by a runtime string. An undeclared name, or one the process
 * environment only inherits (e.g. "constructor"), is "not configured".
 */
export function readDeclaredEnv(name: string): string | undefined {
  if (!isDeclaredEnvName(name)) return undefined;
  return Object.hasOwn(process.env, name) ? process.env[name] : undefined;
}

/**
 * True when this process is a production build (`NODE_ENV=production`), which is what
 * every deployed environment runs. For development-only and test-only pages that must
 * answer 404 there (RA-8110). NODE_ENV is set by Next itself, so it is not in ENV_SCHEMA.
 */
export function isProductionBuild(): boolean {
  return process.env.NODE_ENV === "production";
}
