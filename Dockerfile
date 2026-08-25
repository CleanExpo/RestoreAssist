FROM node:22.23.2-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json .npmrc ./
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
RUN npm ci

FROM base AS builder
ARG GIT_SHA
ARG NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID
ENV GIT_SHA=${GIT_SHA} \
    NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_ANDROID_WEB_CLIENT_ID}
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runtime
ARG GIT_SHA
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    GIT_SHA=${GIT_SHA}
LABEL org.opencontainers.image.source="https://github.com/CleanExpo/RestoreAssist" \
      org.opencontainers.image.revision="${GIT_SHA}"

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --chown=node:node scripts/container-entrypoint.sh ./scripts/container-entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["sh", "./scripts/container-entrypoint.sh"]
