-- Aulas já vinculadas a uma agenda estavam efetivamente em uso: marca-as como publicadas.
-- As demais permanecem como rascunho (default da coluna).
UPDATE "lesson_plans"
SET "status" = 'PUBLISHED'
WHERE EXISTS (SELECT 1 FROM "agendas" a WHERE a."lessonPlanId" = "lesson_plans"."id");

-- Converte a bibliografia textual dos planos de ensino em referências estruturadas.
-- Casamento por título (sem espaços e sem o trecho entre parênteses em diante, sem diferenciar maiúsculas),
-- igual a restoreReferences da UI. A básica é inserida primeiro e vence em caso de conflito.
-- Entradas sem material correspondente não geram linha. Id determinístico, sem depender de extensão.
INSERT INTO "teaching_plan_references" ("id", "teachingPlanId", "materialId", "kind")
SELECT DISTINCT ON (tp."id", m."id")
  'tpr_' || md5(tp."id" || ':' || m."id"), tp."id", m."id", 'BASIC'::"ReferenceKind"
FROM "teaching_plans" tp
CROSS JOIN LATERAL unnest(tp."basicBibliography") AS entry
JOIN "didactic_materials" m
  ON lower(trim(m."title")) = lower(trim(regexp_replace(entry, '\s*\([^)]*\).*$', '')))
ON CONFLICT ("teachingPlanId", "materialId") DO NOTHING;

INSERT INTO "teaching_plan_references" ("id", "teachingPlanId", "materialId", "kind")
SELECT DISTINCT ON (tp."id", m."id")
  'tpr_' || md5(tp."id" || ':' || m."id"), tp."id", m."id", 'COMPLEMENTARY'::"ReferenceKind"
FROM "teaching_plans" tp
CROSS JOIN LATERAL unnest(tp."complementaryBiblio") AS entry
JOIN "didactic_materials" m
  ON lower(trim(m."title")) = lower(trim(regexp_replace(entry, '\s*\([^)]*\).*$', '')))
ON CONFLICT ("teachingPlanId", "materialId") DO NOTHING;
