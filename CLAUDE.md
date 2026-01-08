# RestoreAssist - Quick Reference Hub

## Project Essentials

**Production**: https://restoreassist.app  
**Stack**: Next.js 15.0.0 + React 19.2.0 + TypeScript + Prisma + Stripe  
**Deployment**: Vercel (Sydney region) + Supabase PostgreSQL  
**Status**: Production-ready

## Critical Dependency Constraints

⚠️ **DO NOT UPGRADE**:
- **Next.js 15.0.0** → Upgrading to 16.x breaks next-auth
- **React 19.2.0** → Only compatible with Next.js 15
- **nodemailer 7.0.10** → Compatible with next-auth 4.24.11

## Quick Start

```bash
npm run dev              # Start dev server (localhost:3000)
npm run build            # Production build
npm start                # Run production server
npx prisma migrate dev   # Create database migration
npx prisma studio       # Open database GUI
vercel deploy --prod     # Deploy to production
```

**Full command reference**: See `docs/COMMANDS.md`

## Essential Environment Variables

Production variables (set in Vercel):
- `DATABASE_URL` - Supabase pooled connection
- `DIRECT_URL` - Supabase direct connection (migrations)
- `NEXTAUTH_SECRET` - Auth secret (32+ random chars)
- `STRIPE_SECRET_KEY` - Stripe API key
- `ANTHROPIC_API_KEY` - Claude AI API key

**Complete reference**: See `docs/ENVIRONMENT.md`

## Project Structure

```
D:\RestoreAssist/
├── app/                     # Next.js App Router
│   ├── api/                 # API routes
│   ├── dashboard/           # Protected routes
│   └── page.tsx            # Homepage
├── components/              # React components
├── lib/                     # Utilities & services
├── prisma/                  # Database schema & migrations
├── docs/                    # Documentation hub
│   ├── COMMANDS.md          # All commands
│   ├── DEPENDENCIES.md      # Full dependency list
│   ├── ENVIRONMENT.md       # All env variables
│   ├── TROUBLESHOOTING.md   # Common issues
│   └── TESTING.md           # Test strategy
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config
├── next.config.js          # Next.js config
└── CLAUDE.md               # This file
```

## Key Features

- **Authentication**: NextAuth with Google/email login
- **Payments**: Stripe subscriptions and one-time payments
- **Database**: Prisma ORM + Supabase PostgreSQL
- **AI Integration**: Claude API for chatbot and analysis
- **File Upload**: Cloudinary image management
- **Email**: Nodemailer for transactional emails

## Common Tasks

### Start Development
```bash
npm install                 # Install dependencies
npm run dev                 # Start dev server
npx prisma studio         # Open database GUI (optional)
```

### Database Changes
```bash
# Edit prisma/schema.prisma first
npx prisma migrate dev --name descriptive_name
# Review migration, test locally
git add prisma/migrations/
git commit -m "feat: Add new table"
```

### Deploy to Production
```bash
npm run build              # Test build locally
npm run type-check         # Check types
npm audit                  # Check security
git push origin main       # Push changes
vercel deploy --prod       # Deploy
```

### Debug Issues
- Database: See `docs/TROUBLESHOOTING.md` → Database Connection Issues
- Build: See `docs/TROUBLESHOOTING.md` → Build Failures
- Auth: See `docs/TROUBLESHOOTING.md` → Authentication Issues
- Deployment: See `docs/TROUBLESHOOTING.md` → Vercel Deployment

## Important Rules

1. **Use npm only** (not pnpm or yarn)
2. **Test migrations locally** before production
3. **Never commit secrets** (.env, credentials)
4. **Always use printf** for Vercel env vars (not echo)
   ```bash
   printf "value" | vercel env add VAR_NAME production
   ```
5. **Check for extra newlines** in environment variables

## Git Workflow

```bash
git checkout -b feature/description    # Create feature branch
# Make changes
git add .
git commit -m "feat: Description"      # Conventional commits
git push origin feature/description
# Create PR, review, merge to main
vercel deploy --prod                   # Automatic after main merge
```

**Branching**: `feature/*`, `fix/*`, `docs/*`, `chore/*`

## Database Maintenance

```bash
# Backup (automatic daily on Supabase)
# View at: Supabase Dashboard → Backups

# Check migration status
npx prisma migrate status

# Review schema
npx prisma studio
```

## Performance Monitoring

- **Frontend**: Vercel Analytics (automatic)
- **Database**: Supabase metrics
- **API**: Check Vercel function logs

## Security Best Practices

✅ **DO**:
- Store secrets in Vercel only
- Use environment variables for config
- Rotate credentials quarterly
- Keep Node version updated
- Run `npm audit` regularly

❌ **DON'T**:
- Commit `.env` files
- Log sensitive data
- Expose secrets in client code
- Use weak secrets (<32 chars)
- Skip dependency updates

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Database connection fails | See `docs/TROUBLESHOOTING.md` |
| Build fails | Run `npm install --force` and `npx prisma generate` |
| Type errors | Run `npm run type-check` |
| Env var newlines | Use `printf "value"` not `echo` |
| Port 3000 in use | Kill process: `lsof -ti:3000 \| xargs kill -9` |

**More help**: See `docs/TROUBLESHOOTING.md`

## Useful Links

- **Production**: https://restoreassist.app
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Supabase**: https://app.supabase.com
- **Stripe**: https://dashboard.stripe.com
- **GitHub**: Check git remote

## Documentation Files

- **CLAUDE.md** (this file) - Quick reference hub
- **docs/COMMANDS.md** - Complete command reference
- **docs/DEPENDENCIES.md** - All npm packages explained
- **docs/ENVIRONMENT.md** - All environment variables
- **docs/TROUBLESHOOTING.md** - Common issues and fixes
- **docs/TESTING.md** - Testing strategy and tools

## Recent Changes (Jan 2026)

- React upgraded to 19.2.0
- nodemailer upgraded to 7.0.10
- Prisma updated to 6.1.0
- Added chatbot feature (Claude API)
- Added claims analysis engine
- Context window optimized (unused MCP servers disabled)

---

**Last Updated**: 2026-01-08  
**Context Optimized**: Yes (40% reduction)  
**Status**: Production Ready
