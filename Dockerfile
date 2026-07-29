# syntax=docker/dockerfile:1
#
# NOTE: this image has not been built yet — Docker is not installed on the
# machine where it was written. Expect to iterate on first `docker build`.
#
# Debian slim rather than Alpine on purpose: Prisma's query engine links against
# OpenSSL, and the musl builds are a recurring source of "libssl.so.3 not found"
# failures. The image is larger; for a low-traffic internal tool that trade is
# worth not debugging glibc/musl at deploy time.

# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /app

# Prisma needs openssl to generate and run its query engine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy manifests and the schema first so `npm ci` and `prisma generate` are cached
# independently of source changes.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# ---------- runtime ----------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# openssl for the Prisma engine; ca-certificates for the TLS connection to
# Supabase (the connection string uses sslmode=require).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

# The generated Prisma client lives in node_modules; copy it rather than running
# `prisma generate` here, since the Prisma CLI is a devDependency.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist

# HOST defaults to 0.0.0.0 (see src/config/env.ts), which is what a container needs.
EXPOSE 3000
USER node

# Note: tesseract.js fetches its language data on first use, so the container
# needs outbound network access (or a pre-warmed *.traineddata volume) before the
# first receipt upload.
CMD ["node", "dist/src/server.js"]
