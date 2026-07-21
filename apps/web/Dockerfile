# Build context = monorepo root.
FROM oven/bun:1.3.9-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/
COPY apps/brain/package.json ./apps/brain/
COPY apps/web/package.json ./apps/web/
COPY packages/brain/package.json ./packages/brain/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/ui/package.json ./packages/ui/
COPY packages/config/package.json ./packages/config/
RUN bun install --frozen-lockfile

# Dev target — source is bind-mounted at runtime; this image just carries the
# Linux-built node_modules (preserved via anonymous volumes) and runs next dev.
FROM oven/bun:1.3.9-slim AS dev
WORKDIR /app
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app ./
COPY . .
EXPOSE 3000
CMD ["bun", "run", "--cwd", "apps/web", "dev"]

FROM oven/bun:1.3.9-slim AS builder
WORKDIR /app
# Bun places workspace bins (e.g. next) in each workspace's node_modules/.bin,
# so copy the whole installed tree, not just root node_modules.
COPY --from=deps /app ./
COPY . .
# NEXT_PUBLIC_* are inlined at build time, so they must be present here.
ARG NEXT_PUBLIC_API_URL
# Empty in production: CloudFront serves one origin and the ALB routes
# /api/brain/* to the brain service, so the browser calls a relative path.
ARG NEXT_PUBLIC_BRAIN_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BRAIN_URL=$NEXT_PUBLIC_BRAIN_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run --cwd apps/web build

FROM oven/bun:1.3.9-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Standalone output already contains a pruned node_modules and the server entry.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["bun", "apps/web/server.js"]
