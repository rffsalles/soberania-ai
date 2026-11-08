-- AlterTable
ALTER TABLE "student_interactions" ADD COLUMN     "classEventSeq" INTEGER;

-- CreateTable
CREATE TABLE "tutor_step_drafts" (
    "id" TEXT NOT NULL,
    "lessonPlanId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "stepHash" TEXT NOT NULL,
    "card" JSONB,
    "question" JSONB,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutor_step_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tutor_step_drafts_lessonPlanId_stepIndex_key" ON "tutor_step_drafts"("lessonPlanId", "stepIndex");

-- AddForeignKey
ALTER TABLE "tutor_step_drafts" ADD CONSTRAINT "tutor_step_drafts_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "lesson_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Resposta única por aluno e evento da aula (índice parcial: só existe no SQL)
CREATE UNIQUE INDEX student_interactions_class_event_answer_uq
  ON student_interactions ("agendaId", "studentId", "classEventSeq") WHERE "classEventSeq" IS NOT NULL;
