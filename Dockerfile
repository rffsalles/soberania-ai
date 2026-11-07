# syntax=docker/dockerfile:1
# Imagem Debian (slim) e nao alpine: @napi-rs/canvas, tesseract.js e as engines do Prisma
# funcionam sem ajustes em glibc. Node 22 LTS.
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* sao embutidas no bundle em tempo de build: precisam chegar como build args.
ARG NEXT_PUBLIC_DEMO_MODE=false
ARG NEXT_PUBLIC_INSTITUTION_TIMEZONE=America/Sao_Paulo
ARG NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW=false
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE \
    NEXT_PUBLIC_INSTITUTION_TIMEZONE=$NEXT_PUBLIC_INSTITUTION_TIMEZONE \
    NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW=$NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW \
    NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

# Runner: mantem node_modules completo e o codigo-fonte porque o entrypoint roda
# `prisma migrate deploy` e, opcionalmente, o seed (tsx) e `admin:create`.
FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app --create-home app
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/.next ./.next
COPY --from=builder --chown=app:app /app/public ./public
COPY --from=builder --chown=app:app /app/prisma ./prisma
COPY --from=builder --chown=app:app /app/src ./src
COPY --from=builder --chown=app:app /app/scripts ./scripts
COPY --from=builder --chown=app:app /app/package.json /app/next.config.mjs /app/tsconfig.json ./
COPY --chown=app:app docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x docker/entrypoint.sh && mkdir -p storage/materials storage/media && chown -R app:app storage
USER app
EXPOSE 3000
VOLUME ["/app/storage"]
ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["npm", "start"]
