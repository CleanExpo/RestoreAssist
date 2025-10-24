# Environment Variables Reference

**⚠️ SECURITY NOTE**: This document shows the STRUCTURE of environment variables, not actual values.
Actual values are stored securely in Vercel and should never be committed to the repository.

Last Updated: 2025-10-24

---

## Application Configuration

### Base Configuration
| Key | Type | Example | Description |
|-----|------|---------|-------------|
| `NODE_ENV` | String | `production` | Environment mode |
| `PORT` | Number | `3001` | Backend server port |
| `BASE_URL` | URL | `https://restoreassist.app` | Production domain |
| `ALLOWED_ORIGINS` | CSV | `https://restoreassist.app,https://www.restoreassist.app` | CORS allowed origins |
| `VITE_API_URL` | String | `/api` | Frontend API endpoint path |

---

## Database Configuration

### PostgreSQL / Supabase
| Key | Type | Example | Description |
|-----|------|---------|-------------|
| `USE_POSTGRES` | Boolean | `false` | Enable PostgreSQL |
| `DB_HOST` | String | `db.xxxxx.supabase.co` | Database host |
| `DB_PORT` | Number | `5432` | Database port |
| `DB_NAME` | String | `postgres` | Database name |
| `DB_USER` | String | `postgres` | Database username |
| `DB_PASSWORD` | Secret | `****************` | Database password |
| `DB_POOL_SIZE` | Number | `20` | Connection pool size |

### Supabase
| Key | Type | Example | Description |
|-----|------|---------|-------------|
| `SUPABASE_URL` | URL | `https://xxxxx.supabase.co` | Supabase project URL |
| `SUPABASE_ANON_KEY` | JWT | `eyJhbGciOiJIUzI1NiIs...` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT | `eyJhbGciOiJIUzI1NiIs...` | Service role key (SECRET) |
| `SUPABASE_DB_URL` | Connection String | `postgresql://postgres:****@db.xxxxx.supabase.co:5432/postgres` | Full database URL |

---

## Authentication & Security

### JWT Configuration
| Key | Type | Example | Description |
|-----|------|---------|-------------|
| `JWT_SECRET` | Secret | `****************` | JWT signing secret (64+ chars) |
| `JWT_EXPIRY` | Duration | `15m` | Access token expiration |
| `JWT_REFRESH_SECRET` | Secret | `****************` | Refresh token secret (64+ chars) |
| `JWT_REFRESH_EXPIRY` | Duration | `7d` | Refresh token expiration |

### Google OAuth
| Key | Type | Example | Description |
|-----|------|---------|-------------|
| `GOOGLE_CLIENT_ID` | String | `292141944467-xxxxx.apps.googleusercontent.com` | Google OAuth Client ID |
| `VITE_GOOGLE_CLIENT_ID` | String | `292141944467-xxxxx.apps.googleusercontent.com` | Frontend Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Secret | `GOCSPX-****************` | Google OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | URL | `https://restoreassist.app/api/integrations/google-drive/callback` | OAuth redirect URL |

---

## Stripe Payment Integration

### Backend Stripe Keys
| Key | Type | Example | Description |
|-----|------|---------|-------------|
| `STRIPE_SECRET_KEY` | Secret | `sk_live_****************` | Stripe secret key (NEVER expose) |
| `STRIPE_WEBHOOK_SECRET` | Secret | `whsec_****************` | Stripe webhook signing secret |

### Frontend Stripe Keys (Public)
| Key | Type | Example | Description |
|-----|------|---------|-------------|
| `VITE_STRIPE_PUBLISHABLE_KEY` | Public | `pk_live_****************` | Stripe publishable key (safe for frontend) |

### Stripe Price IDs
| Key | Type | Example | Description |
|-----|------|---------|-------------|
| `STRIPE_PRICE_FREE_TRIAL` | Price ID | `price_1SK6CHBY5KEPMwxdjZxT8CKH` | Free trial price ID |
| `STRIPE_PRICE_MONTHLY` | Price ID | `price_1SK6GPBY5KEPMwxd43EBhwXx` | Monthly subscription price ID |
| `STRIPE_PRICE_YEARLY` | Price ID | `price_1SK6I7BY5KEPMwxdC451vfBk` | Yearly subscription price ID |
| `VITE_STRIPE_PRICE_FREE_TRIAL` | Price ID | `price_1SK6CHBY5KEPMwxdjZxT8CKH` | Frontend free trial price ID |
| `VITE_STRIPE_PRICE_MONTHLY` | Price ID | `price_1SK6GPBY5KEPMwxd43EBhwXx` | Frontend monthly price ID |
| `VITE_STRIPE_PRICE_YEARLY` | Price ID | `price_1SK6I7BY5KEPMwxdC451vfBk` | Frontend yearly price ID |

### Stripe Product IDs
| Key | Type | Example | Description |
|-----|------|---------|-------------|
| `STRIPE_PRODUCT_FREE_TRIAL` | Product ID | `prod_TGdTtgqCXY34na` | Free trial product ID |
| `STRIPE_PRODUCT_MONTHLY` | Product ID | `prod_TGdXM0eZiBxmfW` | Monthly subscription product ID |
| `STRIPE_PRODUCT_YEARLY` | Product ID | `prod_TGdZP6UNZ8ONMh` | Yearly subscription product ID |
| `VITE_STRIPE_PRODUCT_FREE_TRIAL` | Product ID | `prod_TGdTtgqCXY34na` | Frontend free trial product ID |
| `VITE_STRIPE_PRODUCT_MONTHLY` | Product ID | `prod_TGdXM0eZiBxmfW` | Frontend monthly product ID |
| `VITE_STRIPE_PRODUCT_YEARLY` | Product ID | `prod_TGdZP6UNZ8ONMh` | Frontend yearly product ID |

**✅ Status**: All Stripe environment variables are now clean (no trailing newlines) as of 2025-10-24

---

## Email Configuration

### SendGrid
| Key | Type | Example | Description |
|-----|------|---------|-------------|
| `EMAIL_PROVIDER` | String | `sendgrid` | Email service provider |
| `EMAIL_FROM` | String | `RestoreAssist <airestoreassist@gmail.com>` | Default sender email |
| `SENDGRID_API_KEY` | Secret | `SG.****************` | SendGrid API key |

---

## AI Integration

### Anthropic Claude
| Key | Type | Example | Description |
|-----|------|---------|-------------|
| `ANTHROPIC_API_KEY` | Secret | `sk-ant-api03-****************` | Anthropic Claude API key |

---

## Vercel Configuration (Auto-Injected)

These variables are automatically provided by Vercel during deployment:

| Key | Description |
|-----|-------------|
| `VERCEL` | Always `"1"` when running on Vercel |
| `VERCEL_ENV` | Environment: `production`, `preview`, or `development` |
| `VERCEL_URL` | Deployment URL |
| `VERCEL_TARGET_ENV` | Target environment |
| `VERCEL_GIT_*` | Git commit information |
| `VERCEL_OIDC_TOKEN` | OpenID Connect token for authentication |

---

## Turborepo Configuration

| Key | Type | Value | Description |
|-----|------|-------|-------------|
| `TURBO_CACHE` | String | `remote:rw` | Enable remote caching |
| `TURBO_REMOTE_ONLY` | Boolean | `true` | Use only remote cache |
| `TURBO_RUN_SUMMARY` | Boolean | `true` | Generate run summaries |
| `TURBO_DOWNLOAD_LOCAL_ENABLED` | Boolean | `true` | Enable local downloads |
| `NX_DAEMON` | Boolean | `false` | Disable NX daemon |

---

## Environment Variable Counts

- **Total Variables**: 43 user-defined + Vercel auto-injected
- **Secret Variables**: 11 (NEVER commit these)
- **Public Variables**: 10 (Stripe Price/Product IDs, publishable keys)
- **Configuration Variables**: 22 (URLs, ports, settings)

---

## Security Best Practices

### ✅ DO:
- Store all secrets in Vercel environment variables
- Use `printf` when adding environment variables to avoid trailing newlines
- Rotate secrets regularly
- Use different keys for development/staging/production
- Keep this reference document updated

### ❌ DON'T:
- Commit `.env` files with actual values to Git
- Use `echo` when adding environment variables (causes trailing `\n`)
- Share secret keys in Slack, email, or documentation
- Reuse secrets across different services
- Store secrets in code or comments

---

## Adding New Environment Variables

### Correct Method (No Trailing Newlines)

```bash
# ✅ CORRECT - Using printf
printf "your-secret-value-here" | vercel env add YOUR_VAR_NAME production --scope unite-group

# ❌ WRONG - Using echo (adds \n)
echo "your-secret-value-here" | vercel env add YOUR_VAR_NAME production --scope unite-group
```

### Verification

After adding variables, verify they don't have trailing newlines:
```bash
vercel env pull .env.test --environment production
cat .env.test | grep "YOUR_VAR_NAME"
# Should not show \n at the end
```

---

## Troubleshooting

### Issue: API returning "Invalid key" errors
**Cause**: Trailing newline character in environment variable
**Solution**: Remove and re-add the variable using `printf`

### Issue: Stripe checkout failing with "No such price"
**Cause**: Trailing newline in STRIPE_PRICE_* variables
**Solution**: Already fixed as of 2025-10-24 - all Stripe vars clean

### Issue: Database connection failing
**Cause**: Trailing newlines in DB_* variables
**Solution**: Clean and re-add all DB variables (see note below)

---

## ⚠️ IMPORTANT NOTES

### Remaining Trailing Newlines Detected

The following variables were found to have trailing `\n` characters and should be cleaned:

**Critical (Affecting Functionality):**
- `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT`, `DB_USER`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`
- `SENDGRID_API_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `VITE_GOOGLE_CLIENT_ID`

**Non-Critical (Settings):**
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRY`, `JWT_REFRESH_EXPIRY`
- `EMAIL_FROM`, `EMAIL_PROVIDER`
- `NODE_ENV`, `PORT`, `USE_POSTGRES`

### Cleanup Recommended

To ensure all environment variables are clean, run the cleanup script or manually remove and re-add affected variables using `printf`.

---

**Last Verified**: 2025-10-24
**Stripe Variables Status**: ✅ Clean (no trailing newlines)
**Other Variables Status**: ⚠️ Need cleanup (trailing newlines detected)
