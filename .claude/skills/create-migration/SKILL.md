---
name: create-migration
description: Cria e aplica uma migration Prisma com revisão do SQL antes de aplicar (protege contra DROPs espúrios de colunas pgvector/tsvector). Use ao alterar prisma/schema.prisma.
disable-model-invocation: true
---

# create-migration

Argumento: nome da migration em snake_case (ex.: `add_turma_ano`).

## Regras

- O banco de dev usa a porta 5432. NUNCA rode seed nele.
- Esta skill nunca roda `prisma db seed`, `migrate reset` nem `db push`.

## Passos

1. Confirme que `prisma/schema.prisma` está válido: `npx prisma validate`.
2. Gere sem aplicar: `npx prisma migrate dev --create-only --name <nome>`.
3. Inspecione o `migration.sql` gerado (`prisma/migrations/<timestamp>_<nome>/`):
   - `grep -n -i "DROP" migration.sql`
   - `grep -n -i -E "Unsupported|vector|tsvector" migration.sql`
4. Se houver `DROP` de coluna ou índice pgvector/tsvector: é espúrio (drift do
   `Unsupported`). Avise o usuário e remova essas linhas à mão antes de aplicar.
   Qualquer outro `DROP` de dados: destaque e peça decisão explícita.
5. Mostre o SQL final ao usuário e PEÇA CONFIRMAÇÃO. Não prossiga sem um "sim".
6. Só então aplique: `npx prisma migrate dev`.
7. Rode `npm run prisma:generate` e lembre o usuário de reiniciar o `next dev`.

## Depois

Não edite o `migration.sql` após commitar (o hook `protect-generated` bloqueia):
crie uma nova migration.
