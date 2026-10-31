# Dev image for the API. Build context is the repo root.
FROM node:20-alpine

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @brightloop/api...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY database database
COPY apps/api apps/api

WORKDIR /app/apps/api
EXPOSE 4000
# SEED_DEMO=true also loads the demo dataset (resets the database on every start).
CMD ["sh", "-c", "pnpm db:migrate && pnpm db:seed && { [ \"$SEED_DEMO\" != true ] || pnpm db:seed:demo --reset --with-faults; } && pnpm dev"]
