-- Carga horária deixa de ter valores inventados pelo banco: o professor informa.
ALTER TABLE "teaching_plans" ALTER COLUMN "totalHours" DROP DEFAULT;
ALTER TABLE "teaching_plans" ALTER COLUMN "theoryHours" DROP DEFAULT;
ALTER TABLE "teaching_plans" ALTER COLUMN "practiceHours" DROP DEFAULT;

-- Nenhum plano nasce "100% OK - Alinhado DCNs": o parecer começa pendente.
ALTER TABLE "teaching_plans" ALTER COLUMN "ndeComplianceStatus" SET DEFAULT 'Pendente de Avaliação Colegiado';
