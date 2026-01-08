# Command Reference

Comprehensive guide to all npm scripts and commands for RestoreAssist.

## Development Commands

### npm run dev
Start development server on localhost:3000
- Hot reload enabled
- Source maps available
- API routes functional
Stop with: Ctrl+C

### npm run build
Build application for production
- Generates optimized bundle
- Runs Prisma generate
- Runs database migrations
- Creates .next directory
Takes ~2-3 minutes

### npm start
Start production server
- Must run `npm run build` first
- Requires production environment variables
- Single-threaded (not for load balancing)

### npm run lint
Run ESLint to check code quality
- Fixes fixable issues with --fix
- Checks TypeScript files
- Reports style violations

### npm run type-check
Run TypeScript type checking without build
- No output files generated
- Faster than full build
- Catches type errors early

## Database Commands (Prisma)

### npx prisma generate
Generate Prisma client
- Must run after schema changes
- Required before build
- Creates node_modules/.prisma/client

### npx prisma migrate dev --name <migration_name>
Create and run migration in development
- Creates migration file
- Runs migration
- Updates schema
- Example: npx prisma migrate dev --name add_users_table

### npx prisma migrate status
Check migration status
- Shows pending migrations
- Shows applied migrations
- Use before deploying

### npx prisma migrate deploy
Deploy migrations to production database
- Run pending migrations
- Used in CI/CD pipelines
- DO NOT run on production without testing
- Test locally first: npx prisma migrate dev

### npx prisma db push
Push schema changes to database (dev only)
- Skips migration files
- Use for rapid prototyping
- NOT recommended for production
- Useful during development

### npx prisma studio
Open Prisma Studio GUI
- Browse data in database
- Edit records
- View schema
- Runs on localhost:5555

### npx prisma db seed
Run seed file (if configured)
- Populates database with sample data
- Defined in prisma/seed.ts
- Useful for development/testing

### npx prisma migrate reset
RESET DATABASE (Development only!)
- Deletes all data
- Re-runs all migrations
- Re-seeds if seed configured
- WARNING: Irreversible on production

## Building & Deployment

### vercel deploy
Deploy to Vercel preview environment
- Creates temporary preview URL
- For testing before production

### vercel deploy --prod
Deploy to production
- Updates https://restoreassist.app
- Runs build on Vercel
- Triggers database migrations
- ALWAYS test with --preview first

### vercel env ls
List all environment variables
- Shows production env vars
- Shows preview env vars
- Does not show values (for security)

### vercel env pull
Pull environment variables locally
- Creates/overwrites .env.local
- Gets production configuration
- WARNING: Contains secrets, don't commit

### vercel env add <VAR_NAME> <TARGET>
Add environment variable
- Target: production, preview, development
- Use printf, not echo (no newlines!)
- Example: printf "value" | vercel env add STRIPE_SECRET_KEY production

### vercel env rm <VAR_NAME> <TARGET>
Remove environment variable
- Removes from specified environment
- Useful when rotating credentials

### vercel logs --tail
View real-time Vercel logs
- Shows deployment and runtime logs
- Use for debugging production issues
- Stop with: Ctrl+C

## Git & Repository Commands

### git status
Show working tree status
- Lists modified files
- Lists untracked files
- Shows branch info

### git add <file>
Stage file for commit
- Multiple files: git add .
- Specific files: git add app/ lib/

### git commit -m "message"
Create commit
- Use conventional commits: feat:, fix:, chore:, docs:
- Example: git commit -m "feat: Add chatbot feature"

### git push origin <branch>
Push commits to remote
- Example: git push origin main

### git pull origin <branch>
Pull updates from remote
- Example: git pull origin main
- Use before starting work

### git checkout -b <branch>
Create new feature branch
- Example: git checkout -b feature/new-feature
- Branching strategy: feature/*, fix/*, docs/*

### git log --oneline
View commit history
- Shows recent commits
- One line per commit

## Cleaning & Maintenance

### npm run clean
Remove build artifacts
- Deletes .next directory
- Deletes dist directory
- Deletes build directory
- Deletes coverage directory

### rm -rf node_modules
Delete dependencies (use after this)
- Removes all installed packages
- Free up disk space
- Usually followed by npm install

### rm -rf .next
Clear Next.js cache
- Fixes some build issues
- Regenerates on next build
- Safe to delete anytime

### npm audit
Check for security vulnerabilities
- Lists vulnerable packages
- Shows severity levels
- Suggests fixes

### npm audit fix
Automatically fix vulnerabilities
- Updates packages to patched versions
- May introduce breaking changes
- Test after running

### npm outdated
Check for available updates
- Shows current vs latest version
- Indicates which are major/minor/patch

### npm update
Update packages to latest versions
- Respects semver constraints
- Safer than npm audit fix

## Database Backups

### Supabase Backup
Automated daily backups on Supabase (free tier)
- Retention: 7 days on free tier
- Located: Supabase Dashboard → Backups
- Manual backup: Trigger via Dashboard

## Verification Commands

### npm run build && npm start
Full production build and run locally
- Tests full production build
- Runs production server
- Port: 3000
- Stop with: Ctrl+C

### npm run type-check
Check TypeScript types
- No build, just type checking
- Fast validation

## Docker Commands (if using Docker)

### docker-compose up -d
Start containers in background
- Starts all services in docker-compose.yml
- -d flag runs detached

### docker-compose down
Stop and remove containers
- Stops all running services
- Removes containers

### docker-compose logs -f
View container logs
- -f flag for streaming (tail)
- Stop with: Ctrl+C

## Useful Combinations

### Full local testing workflow
npm run build && npm start
- Test complete build
- Test production server

### Development with fresh start
rm -rf node_modules .next
npm install
npm run dev
- Clean installation
- Fresh build
- Start dev server

### Before pushing to production
npm run type-check
npm audit
npm run build
vercel deploy
- Type check code
- Check security
- Build locally
- Deploy to preview first

### Emergency revert on production
git log --oneline
git revert <commit-hash>
git push origin main
vercel deploy --prod
- Find problem commit
- Create new commit that reverts it
- Push and redeploy

---
Last Updated: 2026-01-08
