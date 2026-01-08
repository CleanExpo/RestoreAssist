# Troubleshooting Guide

Common issues and solutions for RestoreAssist development and deployment.

## Database Connection Issues

### P1000: Authentication Failed
- Check Supabase Dashboard credentials
- Verify DATABASE_URL has no extra whitespace
- Ensure IP is allowlisted (0.0.0.0/0 for Vercel)
- Check if database is paused, resume if needed

### ECONNREFUSED / Connection Timeout
- Check Supabase status at https://supabase.com/status
- Verify port: 6543 (pooled), 5432 (direct)
- Check firewall isn't blocking connection
- Test with: psql your-connection-string

## Build Failures

### npm ERR! peer dep missing
Solution: Already configured in .npmrc with legacy-peer-deps=true
Run: npm install --force

### Cannot find module '@/...'
- Run: npx prisma generate
- Clear cache: rm -rf .next
- Restart dev server
- Check tsconfig.json path mappings

### P2025: Record not found (Prisma)
- Check migrations applied: npx prisma migrate status
- Run pending migrations: npx prisma migrate deploy
- For dev, reset: npx prisma migrate reset (loses all data)

## Development Server

### Port 3000 already in use
Windows: netstat -ano | findstr :3000, then taskkill /PID <PID> /F
macOS/Linux: lsof -ti:3000 | xargs kill -9

### Changes not reflecting
- Clear .next: rm -rf .next
- Restart dev server
- Check for TypeScript errors: npm run type-check
- Regenerate Prisma: npx prisma generate

## Stripe Issues

### Invalid API Key Provided
- Check STRIPE_SECRET_KEY is set (sk_... format)
- Verify in Stripe Dashboard
- Check test vs live environment
- Run: echo $STRIPE_SECRET_KEY

### Webhook signature verification failed
- Verify STRIPE_WEBHOOK_SECRET in env
- Check Stripe Dashboard webhook signing secret
- Regenerate if changed
- Restart application

## Authentication Issues

### NextAuth session not persisting
- Verify NEXTAUTH_SECRET is set
- Check NEXTAUTH_URL matches domain
- Users may need to re-login if secret changed
- Ensure same secret across deployments

### OAuth redirect failing
- Check NEXTAUTH_URL: https://restoreassist.app (production)
- Verify callback URL in OAuth provider settings
- Google: Check authorized redirect URIs
- GitHub: Check authorization callback URL

## Email Issues

### ECONNREFUSED / Timeout
- Check EMAIL_SERVER_HOST and EMAIL_SERVER_PORT
- Verify firewall allows SMTP
- Gmail: Use App Passwords with 2FA
- SendGrid: Use smtp.sendgrid.net port 587

### Authentication failed
- Check EMAIL_SERVER_USER and EMAIL_SERVER_PASSWORD
- Gmail: Need App Password, not account password
- SendGrid: Check API key format

## Vercel Deployment

### Build rejected before starting
- Check vercel.json for invalid env section (remove it)
- Verify all env vars in Vercel dashboard: vercel env ls
- Check build command is correct
- View logs: vercel logs --tail

### Works locally, fails on Vercel
- Delete pnpm-lock.yaml if present
- Verify all env vars: vercel env ls
- Check Node.js version in package.json
- Try local build: npm run build
- Deploy: vercel deploy --prod

### ENOENT: no such file or directory
- Check working directory paths
- Verify imports use correct paths
- Check .gitignore isn't excluding needed files

## Performance

### Dev server slow
- Check CPU/memory usage
- Clear cache: npm run clean && rm -rf .next node_modules
- Restart dev server
- Check for circular dependencies

### Build too slow
- Check expensive operations in _app.tsx / root layout
- Disable source maps in production
- Check for large dependencies: npm ls

## Git Issues

### Merge conflicts in package-lock.json
Solution:
rm -f package-lock.json
npm install
git add package-lock.json

### Committed files that shouldn't be
Unstaged: git reset HEAD <file>
Discard: git checkout -- <file>
Undo commit: git reset --soft HEAD~1

## Deployment Troubleshooting

### For Vercel environment variable issues
vercel env pull          # Pull current vars
vercel env ls            # List all vars
vercel env rm VAR        # Remove variable
printf "value" | vercel env add VAR production  # Add (no newlines!)
vercel deploy --prod     # Redeploy

## Getting Help
1. Check CLAUDE.md, ENVIRONMENT.md, DEPENDENCIES.md
2. View Vercel logs: vercel logs --tail
3. Check docs:
   - NextAuth: https://next-auth.js.org
   - Prisma: https://www.prisma.io/docs
   - Stripe: https://stripe.com/docs/api

---
Last Updated: 2026-01-08
