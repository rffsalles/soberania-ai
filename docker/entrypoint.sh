#!/bin/sh
set -e

echo "[entrypoint] Aplicando migracoes (prisma migrate deploy)..."
npx prisma migrate deploy

# SEED_DEMO=true cria os usuarios/dados de demonstracao (majoritariamente idempotente; veja docs/DEPLOY.md).
if [ "${SEED_DEMO:-false}" = "true" ]; then
  echo "[entrypoint] Rodando seed de demonstracao..."
  # A imagem roda com NODE_ENV=production e o guard do seed recusa rodar assim.
  # SEED_DEMO=true significa demo local por definicao, entao liberamos o guard
  # apenas para este comando (nao exportado para o processo do app).
  ALLOW_SEED_IN_PRODUCTION=true npx prisma db seed
fi

exec "$@"
