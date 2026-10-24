-- CreateEnum
CREATE TYPE "AcademicLevel" AS ENUM ('HIGHER_EDUCATION', 'HIGH_SCHOOL', 'ELEMENTARY');

-- DropForeignKey
ALTER TABLE "subjects" DROP CONSTRAINT "subjects_classId_fkey";

-- DropForeignKey
ALTER TABLE "teaching_plans" DROP CONSTRAINT "teaching_plans_academicPeriodId_fkey";

-- DropIndex
DROP INDEX "subjects_code_key";

-- DropIndex
DROP INDEX "teaching_plans_academicPeriodId_idx";

-- AlterTable
ALTER TABLE "classes" DROP COLUMN "year",
ADD COLUMN     "academicPeriodId" TEXT NOT NULL,
ADD COLUMN     "courseId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "subjects" DROP COLUMN "academicLevel",
DROP COLUMN "academicYear",
DROP COLUMN "code",
DROP COLUMN "courseName",
DROP COLUMN "description",
DROP COLUMN "name",
DROP COLUMN "semester",
ADD COLUMN     "disciplineId" TEXT NOT NULL,
ALTER COLUMN "classId" SET NOT NULL;

-- AlterTable
ALTER TABLE "teaching_plans" DROP COLUMN "academicPeriodId";

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "academicLevel" "AcademicLevel" NOT NULL DEFAULT 'HIGHER_EDUCATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplines" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workloadHours" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disciplines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE INDEX "disciplines_courseId_idx" ON "disciplines"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "disciplines_courseId_code_key" ON "disciplines"("courseId", "code");

-- CreateIndex
CREATE INDEX "classes_courseId_idx" ON "classes"("courseId");

-- CreateIndex
CREATE INDEX "classes_academicPeriodId_idx" ON "classes"("academicPeriodId");

-- CreateIndex
CREATE INDEX "subjects_disciplineId_idx" ON "subjects"("disciplineId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_disciplineId_classId_key" ON "subjects"("disciplineId", "classId");

-- AddForeignKey
ALTER TABLE "disciplines" ADD CONSTRAINT "disciplines_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "academic_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

