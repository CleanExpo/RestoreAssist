/**
 * JEV provider environment. Every provider gets an obviously fake, present
 * value, so a route gets past "is it configured?" and reaches its outbound
 * call, which setup.ts refuses and counts. A 5xx with a refused host is then
 * INCONCLUSIVE ("needs provider"); a 5xx with none is a real defect.
 *
 * Values always overwrite, so a real key in the caller's shell never reaches
 * a route. None is a real credential: each says "jev" and "fake". Hosts point
 * at .invalid, which never resolves.
 */
const HEX32 = "6a65762d66616b652d6b65792d6e6f742d7265616c2d30303030303030303030"; // "jev-fake-key-not-real-0000000000"

export const JEV_FAKE_ENV: Record<string, string> = {
  NEXTAUTH_SECRET: "jev-fake-nextauth-secret-not-real",
  NEXTAUTH_URL: "http://localhost",
  NEXT_PUBLIC_APP_URL: "http://localhost",
  APP_URL: "http://localhost",
  CREDENTIAL_ENCRYPTION_KEY: HEX32,
  INTEGRATION_ENCRYPTION_KEY: HEX32,
  CRON_SECRET: "jev-fake-cron-secret",
  PORTAL_SECRET: "jev-fake-portal-secret",
  CLIENT_PORTAL_JWT_SECRET: "jev-fake-portal-jwt-secret",
  STRIPE_SECRET_KEY: "sk_test_jevfakenotreal",
  STRIPE_PUBLISHABLE_KEY: "pk_test_jevfakenotreal",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_jevfakenotreal",
  STRIPE_WEBHOOK_SECRET: "whsec_jev_fake_not_a_secret",
  STRIPE_PRICE_MONTHLY: "price_jevfake",
  STRIPE_PRICE_STANDARD: "price_jevfake",
  CLOUDINARY_CLOUD_NAME: "jevfake",
  CLOUDINARY_API_KEY: "jevfake",
  CLOUDINARY_API_SECRET: "jevfake",
  ANTHROPIC_API_KEY: "jev-fake-anthropic",
  OPENAI_API_KEY: "jev-fake-openai",
  GEMINI_API_KEY: "jev-fake-gemini",
  GOOGLE_GENERATIVE_AI_API_KEY: "jev-fake-google-ai",
  OPENROUTER_API_KEY: "jev-fake-openrouter",
  GEMMA_ENDPOINT_URL: "https://gemma.jev.invalid",
  GEMMA_API_KEY: "jev-fake-gemma",
  MAILTRAP_API_KEY: "jev-fake-mailtrap",
  SENDER_EMAIL: "jev@jev.invalid",
  XERO_CLIENT_ID: "jev-fake-xero",
  XERO_CLIENT_SECRET: "jev-fake-xero",
  GOOGLE_CLIENT_ID: "jev-fake-google",
  GOOGLE_CLIENT_SECRET: "jev-fake-google",
  ELEVENLABS_API_KEY: "jev-fake-elevenlabs",
  HEYGEN_API_KEY: "jev-fake-heygen",
  FIRECRAWL_API_KEY: "jev-fake-firecrawl",
  APIFY_API_TOKEN: "jev-fake-apify",
  PROPERTY_SCRAPER_URL: "https://scraper.jev.invalid",
  ABR_API_GUID: "jev-fake-abr",
  AWS_ACCESS_KEY_ID: "jev-fake-aws",
  AWS_SECRET_ACCESS_KEY: "jev-fake-aws",
  AWS_REGION: "ap-southeast-2",
  AWS_S3_BUCKET: "jev-fake-bucket",
  SYNTHEX_BASE_URL: "https://synthex.jev.invalid",
  SYNTHEX_SERVICE_TOKEN: "jev-fake-synthex",
  NEXT_PUBLIC_SUPABASE_URL: "https://supabase.jev.invalid",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "jev-fake-anon",
  SUPABASE_SERVICE_ROLE_KEY: "jev-fake-service-role",
};

export function applyFakeEnv(): void {
  for (const [k, v] of Object.entries(JEV_FAKE_ENV)) process.env[k] = v;
}
