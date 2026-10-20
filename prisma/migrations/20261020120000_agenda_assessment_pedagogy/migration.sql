-- DropForeignKey
ALTER TABLE "lesson_plans" DROP CONSTRAINT "lesson_plans_agendaId_fkey";

-- DropIndex
DROP INDEX "lesson_plans_agendaId_key";

-- AlterTable
ALTER TABLE "agendas" ADD COLUMN     "assessmentId" TEXT,
ADD COLUMN     "lessonPlanId" TEXT,
ADD COLUMN     "subjectId" TEXT,
ADD COLUMN     "teacherId" TEXT;

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "lesson_plans" DROP COLUMN "agendaId";

-- AlterTable
ALTER TABLE "pedagogical_minutes" ADD COLUMN     "sessionTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "socraticChallengesAnswered" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalQuestionsAsked" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "student_interactions" ADD COLUMN     "agendaType" "AgendaType" NOT NULL DEFAULT 'CLASSROOM',
ADD COLUMN     "guardrailBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latencyMs" INTEGER;

-- CreateTable
CREATE TABLE "study_group_messages" (
    "id" TEXT NOT NULL,
    "agendaId" TEXT NOT NULL,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "isAi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_group_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_submissions" (
    "id" TEXT NOT NULL,
    "agendaId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "feedback" TEXT,
    "rubricScores" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inference_logs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "ttftMs" INTEGER NOT NULL,
    "totalLatencyMs" INTEGER NOT NULL,
    "tokensPerSecond" DOUBLE PRECISION NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "externalTrafficBytes" INTEGER NOT NULL DEFAULT 0,
    "agendaType" "AgendaType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inference_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DidacticMaterialToDocumentCategory" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DidacticMaterialToDocumentCategory_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "study_group_messages_agendaId_idx" ON "study_group_messages"("agendaId");

-- CreateIndex
CREATE INDEX "draft_submissions_agendaId_idx" ON "draft_submissions"("agendaId");

-- CreateIndex
CREATE INDEX "draft_submissions_studentId_idx" ON "draft_submissions"("studentId");

-- CreateIndex
CREATE INDEX "inference_logs_createdAt_idx" ON "inference_logs"("createdAt");

-- CreateIndex
CREATE INDEX "_DidacticMaterialToDocumentCategory_B_index" ON "_DidacticMaterialToDocumentCategory"("B");

-- CreateIndex
CREATE UNIQUE INDEX "agendas_lessonPlanId_key" ON "agendas"("lessonPlanId");

-- CreateIndex
CREATE INDEX "agendas_teacherId_idx" ON "agendas"("teacherId");

-- CreateIndex
CREATE INDEX "agendas_subjectId_idx" ON "agendas"("subjectId");

-- CreateIndex
CREATE INDEX "agendas_assessmentId_idx" ON "agendas"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "pedagogical_minutes_agendaId_studentId_key" ON "pedagogical_minutes"("agendaId", "studentId");

-- AddForeignKey
ALTER TABLE "agendas" ADD CONSTRAINT "agendas_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendas" ADD CONSTRAINT "agendas_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendas" ADD CONSTRAINT "agendas_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendas" ADD CONSTRAINT "agendas_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "lesson_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_messages" ADD CONSTRAINT "study_group_messages_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "agendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_group_messages" ADD CONSTRAINT "study_group_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_submissions" ADD CONSTRAINT "draft_submissions_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "agendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_submissions" ADD CONSTRAINT "draft_submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DidacticMaterialToDocumentCategory" ADD CONSTRAINT "_DidacticMaterialToDocumentCategory_A_fkey" FOREIGN KEY ("A") REFERENCES "didactic_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DidacticMaterialToDocumentCategory" ADD CONSTRAINT "_DidacticMaterialToDocumentCategory_B_fkey" FOREIGN KEY ("B") REFERENCES "document_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

