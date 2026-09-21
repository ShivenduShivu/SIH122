FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/adapters/package.json packages/adapters/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN npm ci --no-audit --no-fund

FROM dependencies AS web-build
COPY apps/web apps/web
COPY packages packages
COPY tsconfig.json ./
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

FROM dependencies AS worker
COPY --chown=node:node apps/worker apps/worker
COPY --chown=node:node packages packages
COPY --chown=node:node scripts/check-worker-heartbeat.mjs scripts/check-worker-heartbeat.mjs
ENV NODE_ENV=production WORKER_HEARTBEAT_PATH=/tmp/intelligrid-worker-heartbeat.json
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 CMD node scripts/check-worker-heartbeat.mjs
CMD ["node", "node_modules/tsx/dist/cli.mjs", "apps/worker/src/index.ts"]
