# Dev image for the web app. Build context is the repo root.
FROM node:20-alpine

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @brightloop/web...

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "dev", "--host", "0.0.0.0"]
