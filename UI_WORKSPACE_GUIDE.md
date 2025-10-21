# UI Workspace Guide (shadcn/ui)

## What Is This?

The `ui/` directory contains the **shadcn/ui component library source code**. This is separate from your RestoreAssist application.

**Workspace Structure**:
```
ui/
├── apps/
│   ├── www/      → Documentation website
│   └── v4/       → Component registry & demos
├── packages/
│   └── shadcn/   → CLI tool
└── package.json  → Monorepo config (pnpm workspaces + turbo)
```

---

## Next Steps After Installation

### Step 1: Start the Development Server

**Option A: Start all apps** (www + v4)
```bash
cd ui
pnpm dev
```

**Option B: Start specific app**

Documentation site (port 3000):
```bash
pnpm www:dev
```

Component registry (port 4000):
```bash
pnpm v4:dev
```

---

### Step 2: View in Browser

**Documentation Site**:
```
http://localhost:3000
```

**Component Registry**:
```
http://localhost:4000
```

---

### Step 3: Build for Production (Optional)

**Build all apps**:
```bash
pnpm build
```

**Build specific app**:
```bash
# Documentation
pnpm www:build

# Component registry
pnpm v4:build

# CLI tool
pnpm shadcn:build
```

---

## Common Commands

### Development
```bash
# Start all dev servers
pnpm dev

# Start documentation site
pnpm www:dev

# Start component registry
pnpm v4:dev

# Start CLI in dev mode
pnpm shadcn:dev
```

### Testing
```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:dev
```

### Linting & Formatting
```bash
# Check everything
pnpm check

# Lint
pnpm lint

# Fix lint issues
pnpm lint:fix

# Format code
pnpm format:write
```

### Building
```bash
# Build all
pnpm build

# Build registry
pnpm build:registry

# Build docs
pnpm docs:build
```

---

## Relationship to RestoreAssist

**This UI workspace is SEPARATE from your RestoreAssist application.**

### RestoreAssist Structure (Main App)
```
d:\RestoreAssist/
├── packages/
│   ├── frontend/   → Your React app (Vite)
│   └── backend/    → Your Express API
└── ui/             → shadcn/ui source (this workspace)
```

### How They Connect

**RestoreAssist uses shadcn/ui components**, but you don't need to develop the UI workspace for RestoreAssist to work.

**You only need the UI workspace if**:
- You want to contribute to shadcn/ui itself
- You want to customize/preview components locally
- You want to build custom components based on shadcn

**For normal RestoreAssist development**, work in:
- `packages/frontend/` - Your frontend app
- `packages/backend/` - Your backend API

---

## Warnings Explained

```
WARN  Failed to create bin at ...shadcn. ENOENT: no such file or directory
```

**This is expected** during initial installation because:
1. `packages/shadcn/dist/index.js` doesn't exist yet
2. It gets created when you run `pnpm build:cli` or `pnpm shadcn:build`

**To fix** (if you need the CLI):
```bash
cd ui
pnpm shadcn:build
```

---

## Do I Need This for RestoreAssist?

**Short Answer**: No, not for deployment.

**Long Answer**:
- RestoreAssist frontend already uses shadcn components (installed via npm)
- The `ui/` workspace is the **source code** for those components
- You only need this if you want to:
  - Preview components
  - Customize the component library
  - Contribute to shadcn/ui
  - Build custom registry entries

**For RestoreAssist deployment**, focus on:
```bash
cd d:\RestoreAssist
cd packages/backend
npm run build   # Build backend

cd ../frontend
npm run build   # Build frontend
```

---

## Typical Workflow

### If Working on RestoreAssist (Your App)
```bash
# Work in the main packages
cd d:\RestoreAssist\packages\frontend
npm run dev
```

### If Customizing shadcn Components
```bash
# Work in the UI workspace
cd d:\RestoreAssist\ui
pnpm v4:dev   # Preview components
pnpm www:dev  # View documentation
```

---

## Next Steps Recommendations

### For RestoreAssist Development
**👉 Go back to the main project**:
```bash
cd d:\RestoreAssist\packages\backend
npm run dev
```

Then continue with Vercel deployment testing from [VERCEL_TESTING_PLAN.md](../VERCEL_TESTING_PLAN.md).

### For shadcn/ui Exploration
**👉 Start the component preview**:
```bash
cd d:\RestoreAssist\ui
pnpm v4:dev
```

Open http://localhost:4000 to see all components.

---

## Troubleshooting

### Error: "Cannot find module 'turbo'"
**Fix**: Already installed, try:
```bash
pnpm install --force
```

### Error: "shadcn command not found"
**Fix**: Build the CLI first:
```bash
pnpm shadcn:build
```

### Port Already in Use
**Fix**: Check running processes:
```bash
# Windows
netstat -ano | findstr :3000
netstat -ano | findstr :4000

# Kill process
taskkill /PID <PID> /F
```

### Build Fails
**Fix**: Clean and rebuild:
```bash
pnpm clean  # If available
rm -rf node_modules .turbo
pnpm install
pnpm build
```

---

## Summary

✅ **Installation Complete**: All 1771 packages installed successfully

**Choose Your Path**:

1. **Continue RestoreAssist Development** (Recommended)
   - Go to `packages/frontend` or `packages/backend`
   - Continue with Vercel deployment testing

2. **Explore shadcn Components**
   - Run `pnpm v4:dev` in `ui/` directory
   - View components at http://localhost:4000

3. **Build the CLI Tool**
   - Run `pnpm shadcn:build` to fix bin warnings
   - Use `shadcn` command locally

---

**Most Likely Next Step**: Return to RestoreAssist development
```bash
cd d:\RestoreAssist
```

Then follow the Vercel deployment guide:
- [VERCEL_DEPLOYMENT.md](../VERCEL_DEPLOYMENT.md)
- [VERCEL_TESTING_PLAN.md](../VERCEL_TESTING_PLAN.md)
- [POTENTIAL_DEPLOYMENT_ISSUES.md](../POTENTIAL_DEPLOYMENT_ISSUES.md)
