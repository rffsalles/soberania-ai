-- CreateEnum
CREATE TYPE "ChapterSource" AS ENUM ('OUTLINE', 'AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "ReferenceKind" AS ENUM ('BASIC', 'COMPLEMENTARY');

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "lesson_plans" ADD COLUMN     "status" "LessonStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "material_chunks" ADD COLUMN     "chapterId" TEXT;

-- CreateTable
CREATE TABLE "teaching_plan_references" (
    "id" TEXT NOT NULL,
    "teachingPlanId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "kind" "ReferenceKind" NOT NULL,

    CONSTRAINT "teaching_plan_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_plan_chapters" (
    "lessonPlanId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,

    CONSTRAINT "lesson_plan_chapters_pkey" PRIMARY KEY ("lessonPlanId","chapterId")
);

-- CreateTable
CREATE TABLE "material_chapters" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "startPage" INTEGER NOT NULL,
    "endPage" INTEGER,
    "source" "ChapterSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teaching_plan_references_teachingPlanId_materialId_key" ON "teaching_plan_references"("teachingPlanId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "material_chapters_materialId_order_key" ON "material_chapters"("materialId", "order");

-- CreateIndex
CREATE INDEX "material_chunks_chapterId_idx" ON "material_chunks"("chapterId");

-- AddForeignKey
ALTER TABLE "teaching_plan_references" ADD CONSTRAINT "teaching_plan_references_teachingPlanId_fkey" FOREIGN KEY ("teachingPlanId") REFERENCES "teaching_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_plan_references" ADD CONSTRAINT "teaching_plan_references_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "didactic_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_chapters" ADD CONSTRAINT "lesson_plan_chapters_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "lesson_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plan_chapters" ADD CONSTRAINT "lesson_plan_chapters_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "material_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_chapters" ADD CONSTRAINT "material_chapters_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "didactic_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_chunks" ADD CONSTRAINT "material_chunks_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "material_chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
