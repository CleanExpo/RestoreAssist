# RestoreAssist production image.
#
# Exists to give DigitalOcean App Platform a source it can pin by sha256
# digest. The previous `github: { branch: main }` source is mutable: Create
# Deployment resolves whatever that branch points at when it runs, so there is
# no way to say "ship exactly this commit" and no artefact to roll back to.
# `.do/app.yaml` and .github/workflows/deploy-production.yml both refused to
# deploy for that reason. This image is the fix.
#
# Build and start stay non-mutating, matching scripts/build.sh and
# scripts/start-production.sh: no migrations are applied or resolved here.
# Applying migrations remains a separate, approved, exact-revision operation.

# Pinned to an exact patch version. `node:22-bookworm-slim` would be mutable
# in exactly the way this change exists to avoid, but note this is still a TAG,
# not a digest — the tag could in principle be repointed upstream. Pinning the
# base by sha256 is the stricter follow-up; it needs a registry lookup that the
# authoring environment could not perform, so it is left as a deliberate,
# stated gap rather than a fabricated digest.
# Matches package.json engines (20.x || 22.x) and .nvmrc (22.22.3). It said so
# while pinning 22.22.0, which is the drift this line now removes: the image
# production runs should be the runtime the repo declares, not a neighbouring
# patch. Tag existence confirmed against registry-1.docker.io (HTTP 200).
FROM node:22.22.3-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

# ── deps ───────────────────────────────────────────────────────────────────
# Separate layer so a source-only change does not reinstall node_modules.
FROM base AS deps
WORKDIR /app
# openssl is required by Prisma's query engine on bookworm-slim.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# .npmrc is REQUIRED here, not optional. It sets legacy-peer-deps=true, and
# without it `npm ci` dies on an ERESOLVE peer conflict inside the image while
# succeeding on the CI runner — which is exactly the kind of "works there, not
# here" split this repo has been bitten by all week. It also sets
# puppeteer_skip_download=true, which keeps a Chromium download out of the
# image. Proven by CI: the first PR build failed at `RUN npm ci` with
# "Fix the upstream dependency conflict, or retry ... --legacy-peer-deps".
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
# `npm ci` is deliberate: it fails on a lockfile that disagrees with
# package.json rather than silently resolving something new. That desync broke
# production once already (RA-7359).
# postinstall runs `prisma generate`; the schema is copied above so it can.
RUN npm ci

# ── builder ────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# DOCKER_BUILD=1 switches next.config.mjs to `output: "standalone"`. Nothing
# else in the repo sets it.
ENV DOCKER_BUILD=1
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=8192

# GIT_SHA is baked in so a running container can state which commit it is.
# The digest proves what shipped; this makes it readable without a registry
# lookup. Defaults to "unknown" so a local build still succeeds.
ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}

# `npm run build`, NOT `sh scripts/build.sh` directly. package.json defines a
# `prebuild` lifecycle script (tsx scripts/build-help-index.ts) that writes
# public/help-index.json, which HelpSearchModal fetches at runtime. npm fires
# prebuild only for `npm run build`; invoking the shell script bypasses it, and
# the output is gitignored so it is not in the build context either. The image
# would have shipped with an empty help search index.
RUN npm run build

# ── runner ─────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}

# Run unprivileged. The node image already ships a `node` user (uid 1000).
RUN mkdir -p /app && chown node:node /app

# Standalone output carries its own minimal node_modules; `static` and
# `public` are not included in it and must be copied alongside.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Prisma's generated client and query engine are resolved at runtime and are
# not always traced into standalone. Copy them explicitly rather than find out
# in production.
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=node:node /app/prisma ./prisma

# data/ is read from disk at REQUEST time, not bundled at build time:
#   lib/help/load-article.ts     process.cwd()/data/content/help/<cat>/<slug>.mdx
#   lib/nexus-hub-context.ts     process.cwd()/data/content/nexus-hub
# The help routes are dynamic, so without this the reads hit ENOENT and every
# help article 404s in production. 604K — the cost of omitting it is far higher
# than the cost of copying it.
COPY --from=builder --chown=node:node /app/data ./data

# Same required-env contract as scripts/start-production.sh. Failing here is
# far cheaper than a container that boots and then 500s on first request.
COPY --chown=node:node docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER node
EXPOSE 3000

# App Platform also health-checks /api/health/migrations (see .do/app.yaml).
# This one is for anything running the image outside App Platform.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health/migrations').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./entrypoint.sh"]
