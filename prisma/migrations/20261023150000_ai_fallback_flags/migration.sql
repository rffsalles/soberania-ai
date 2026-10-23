-- Sinaliza explicitamente avaliações geradas sem IA real (antes inferido por campos nulos/vazios).
ALTER TABLE "draft_submissions" ADD COLUMN "aiFallback" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pedagogical_minutes" ADD COLUMN "aiFallback" BOOLEAN NOT NULL DEFAULT false;

-- Dados anteriores à coluna: o que não tem parecer/feedback foi gerado sem IA.
UPDATE "draft_submissions" SET "aiFallback" = true WHERE "feedback" IS NULL;
UPDATE "pedagogical_minutes" SET "aiFallback" = true WHERE btrim("rawSummary") = '';
