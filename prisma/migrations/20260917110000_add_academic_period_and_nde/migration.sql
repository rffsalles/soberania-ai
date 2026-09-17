-- CreateTable
CREATE TABLE "academic_periods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "year" INTEGER NOT NULL DEFAULT 2026,
    "semester" INTEGER,
    "type" TEXT NOT NULL DEFAULT 'SEMESTER',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_periods_code_key" ON "academic_periods"("code");

-- AlterTable
ALTER TABLE "teaching_plans" ADD COLUMN "academicPeriodId" TEXT;
ALTER TABLE "teaching_plans" ADD COLUMN "totalHours" INTEGER NOT NULL DEFAULT 80;
ALTER TABLE "teaching_plans" ADD COLUMN "theoryHours" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "teaching_plans" ADD COLUMN "practiceHours" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "teaching_plans" ADD COLUMN "ndeComplianceStatus" TEXT NOT NULL DEFAULT '100% OK - Alinhado DCNs';

-- CreateIndex
CREATE INDEX "teaching_plans_academicPeriodId_idx" ON "teaching_plans"("academicPeriodId");

-- AddForeignKey
ALTER TABLE "teaching_plans" ADD CONSTRAINT "teaching_plans_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "academic_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
