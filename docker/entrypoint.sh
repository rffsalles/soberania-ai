#!/bin/sh
set -e

echo "[entrypoint] Aplicando migracoes (prisma migrate deploy)..."
npx prisma migrate deploy

# SEED_DEMO=true cria os usuarios/dados de demonstracao (majoritariamente idempotente; veja docs/DEPLOY.md).
if [ "${SEED_DEMO:-false}" = "true" ]; then
  echo "[entrypoint] Rodando seed de demonstracao..."
  npx prisma db seed
fi

exec "$@"
