-- Fallbacks gravados antes de 2026-10-23 tinham texto de modelo (não nulo). Marca-os pela assinatura do texto;
-- o conteúdo é preservado, a UI passa a exibi-los como "IA indisponível" por causa da flag.
UPDATE "draft_submissions"
SET "aiFallback" = true
WHERE "aiFallback" = false
  AND "feedback" LIKE '%A nota final é atribuída exclusivamente pelo Professor Responsável.';

UPDATE "pedagogical_minutes"
SET "aiFallback" = true
WHERE "aiFallback" = false
  AND ("rawSummary" LIKE '% não registrou interações com a tutora nesta sessão.'
    OR "rawSummary" LIKE '% desafio(s) socrático(s), com engajamento de %');
