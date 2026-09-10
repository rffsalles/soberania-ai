-- AlterTable
ALTER TABLE "exam_submissions" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "users_classId_idx" ON "users"("classId");

-- CreateIndex
CREATE INDEX "agendas_classId_idx" ON "agendas"("classId");
