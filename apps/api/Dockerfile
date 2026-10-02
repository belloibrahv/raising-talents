# syntax=docker/dockerfile:1.10
# One image runs all three roles. The ECS task chooses the command:
#   api:     dist/main.api.js        (default)
#   worker:  dist/main.worker.js
#   migrate: dist/platform/database/migrate.js
# Build from the repository root:
#   docker buildx build --platform linux/arm64 -f apps/api/Dockerfile -t raising-talents-api .

ARG NODE_VERSION=22.22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable
WORKDIR /repo

# Dependencies first, so source changes do not invalidate the slowest layer.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch --frozen-lockfile

FROM deps AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --filter=@rt/api... \
 && pnpm turbo run build --filter=@rt/api... \
 && pnpm --filter=@rt/api deploy --prod --legacy /out

# Amazon's certificate bundle, so Postgres TLS can be verified (DATABASE_SSL=verify-full).
FROM base AS certs
ADD --chmod=0444 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /certs/rds-global-bundle.pem

# Distroless: no shell, no package manager, runs as a non-root user (uid 65532).
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    DATABASE_CA_FILE=/etc/ssl/rds/global-bundle.pem
WORKDIR /app
COPY --from=certs /certs/rds-global-bundle.pem /etc/ssl/rds/global-bundle.pem
COPY --from=build --chown=65532:65532 /out ./
USER 65532:65532
EXPOSE 3000
# The distroless entrypoint is node. Telemetry loads before the application.
CMD ["--import", "./dist/instrument.js", "dist/main.api.js"]
