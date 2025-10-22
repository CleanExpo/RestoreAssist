# Environment Variables Documentation

Complete reference for all environment variables used in RestoreAssist.

## Backend Environment Variables

### Server Configuration
- **PORT** - Server port (default: 3001)
- **NODE_ENV** - Environment mode (development/production)
- **BASE_URL** - Base URL for the API

### Database Configuration
- **USE_POSTGRES** - Use PostgreSQL (true) or in-memory (false)
- **DATABASE_URL** - Prisma database connection URL
- **DIRECT_DATABASE_URL** - Direct database connection URL
- **DB_HOST** - Database host
- **DB_PORT** - Database port
- **DB_NAME** - Database name
- **DB_USER** - Database user
- **DB_PASSWORD** - Database password

### Authentication
- **JWT_SECRET** - JWT signing secret (32+ characters)
- **JWT_REFRESH_SECRET** - JWT refresh token secret
- **JWT_EXPIRY** - Access token expiry (default: 15m)
- **JWT_REFRESH_EXPIRY** - Refresh token expiry (default: 7d)

### AI Integration
- **ANTHROPIC_API_KEY** - Anthropic Claude API key (required)
- **ENABLE_SKILLS** - Enable AI skills (default: true)

### Google OAuth
- **GOOGLE_CLIENT_ID** - Google OAuth client ID
- **GOOGLE_CLIENT_SECRET** - Google OAuth client secret
- **GOOGLE_REDIRECT_URI** - OAuth callback URL

### Stripe Payment
- **STRIPE_SECRET_KEY** - Stripe secret key
- **STRIPE_WEBHOOK_SECRET** - Stripe webhook endpoint secret

### Email Configuration
- **EMAIL_PROVIDER** - Email service (smtp/sendgrid/resend)
- **EMAIL_FROM** - From email address

#### SMTP Settings
- **SMTP_HOST** - SMTP server host
- **SMTP_PORT** - SMTP server port
- **SMTP_SECURE** - Use TLS/SSL
- **SMTP_USER** - SMTP username
- **SMTP_PASS** - SMTP password

#### SendGrid
- **SENDGRID_API_KEY** - SendGrid API key

#### Resend
- **RESEND_API_KEY** - Resend API key

### CRM Integrations
- **SERVICEM8_API_KEY** - ServiceM8 API key
- **SERVICEM8_DOMAIN** - ServiceM8 domain
- **ASCORA_API_URL_TEMPLATE** - Ascora API URL template
- **ASCORA_WEBHOOK_SECRET** - Webhook verification secret

### Monitoring
- **SENTRY_DSN** - Sentry error tracking DSN

### CORS
- **ALLOWED_ORIGINS** - Allowed CORS origins (comma-separated)

## Frontend Environment Variables

### API Configuration
- **VITE_API_URL** - Backend API URL

### Google OAuth (Public)
- **VITE_GOOGLE_CLIENT_ID** - Google OAuth client ID

### Stripe (Public Keys)
- **VITE_STRIPE_PUBLISHABLE_KEY** - Stripe publishable key
- **VITE_STRIPE_PRODUCT_FREE_TRIAL** - Free trial product ID
- **VITE_STRIPE_PRODUCT_MONTHLY** - Monthly subscription product ID
- **VITE_STRIPE_PRODUCT_YEARLY** - Yearly subscription product ID
- **VITE_STRIPE_PRICE_FREE_TRIAL** - Free trial price ID
- **VITE_STRIPE_PRICE_MONTHLY** - Monthly price ID
- **VITE_STRIPE_PRICE_YEARLY** - Yearly price ID

### Media
- **VITE_DEMO_VIDEO_ID** - YouTube video ID for demos

### Monitoring
- **VITE_SENTRY_DSN** - Sentry error tracking DSN
- **VITE_APP_VERSION** - Application version

## Required Variables

### Backend (Minimum Required)
```env
NODE_ENV=production
BASE_URL=https://api.restoreassist.com
ANTHROPIC_API_KEY=sk-ant-api03-xxx
JWT_SECRET=random_32_char_string_here
JWT_REFRESH_SECRET=another_random_32_char_string
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
EMAIL_FROM="RestoreAssist" <noreply@restoreassist.com>
ALLOWED_ORIGINS=https://app.restoreassist.com
```

### Frontend (Minimum Required)
```env
VITE_API_URL=https://api.restoreassist.com
VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
```

## Getting API Keys

### Anthropic API Key
1. Visit https://console.anthropic.com
2. Sign up or log in
3. Navigate to API Keys section
4. Create new API key

### Google OAuth Credentials
1. Visit https://console.cloud.google.com
2. Create or select project
3. Enable Google+ API
4. Go to Credentials
5. Create OAuth 2.0 Client ID
6. Add authorized redirect URIs

### Stripe Keys
1. Visit https://dashboard.stripe.com
2. Navigate to Developers > API Keys
3. Copy Publishable and Secret keys
4. Set up webhooks and copy signing secret

### SendGrid API Key
1. Visit https://app.sendgrid.com
2. Navigate to Settings > API Keys
3. Create API Key with full access

### Sentry DSN
1. Visit https://sentry.io
2. Create new project
3. Copy DSN from project settings

## Security Best Practices

1. **Never commit .env files to version control**
2. **Use strong secrets** - Generate with: `openssl rand -base64 32`
3. **Rotate secrets regularly**
4. **Use environment-specific variables**
5. **Secure storage** - Use secret management services

## Example Development Configuration

### Backend (.env.development)
```env
NODE_ENV=development
PORT=3001
BASE_URL=http://localhost:3001
USE_POSTGRES=false
ANTHROPIC_API_KEY=sk-ant-api03-dev-key
JWT_SECRET=development_jwt_secret
JWT_REFRESH_SECRET=development_refresh_secret
GOOGLE_CLIENT_ID=dev.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-dev
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=dev@example.com
SMTP_PASS=app_password
EMAIL_FROM="Dev RestoreAssist" <dev@example.com>
ALLOWED_ORIGINS=http://localhost:5173
```

### Frontend (.env.development)
```env
VITE_API_URL=http://localhost:3001
VITE_GOOGLE_CLIENT_ID=dev.apps.googleusercontent.com
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

## Example Production Configuration

### Backend (.env.production)
```env
NODE_ENV=production
PORT=3001
BASE_URL=https://api.restoreassist.com.au
USE_POSTGRES=true
DATABASE_URL=postgresql://user:pass@host:5432/restoreassist
ANTHROPIC_API_KEY=sk-ant-api03-prod-key
JWT_SECRET=production_jwt_secret_32_chars
JWT_REFRESH_SECRET=production_refresh_secret_32_chars
GOOGLE_CLIENT_ID=prod.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-prod
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.production_key
EMAIL_FROM="RestoreAssist" <noreply@restoreassist.com.au>
STRIPE_SECRET_KEY=sk_live_xxx
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
ALLOWED_ORIGINS=https://app.restoreassist.com.au
```

### Frontend (.env.production)
```env
VITE_API_URL=https://api.restoreassist.com.au
VITE_GOOGLE_CLIENT_ID=prod.apps.googleusercontent.com
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

## Troubleshooting

### Common Issues
1. **Missing required variables** - Check console for error messages
2. **Invalid API keys** - Verify keys are copied correctly
3. **Connection issues** - Check URLs and network connectivity

## Support

For environment configuration assistance, contact: support@restoreassist.com.au
