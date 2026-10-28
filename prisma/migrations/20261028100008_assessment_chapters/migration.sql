-- CreateTable
CREATE TABLE "assessment_chapters" (
    "assessmentId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,

    CONSTRAINT "assessment_chapters_pkey" PRIMARY KEY ("assessmentId","chapterId")
);

-- AddForeignKey
ALTER TABLE "assessment_chapters" ADD CONSTRAINT "assessment_chapters_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_chapters" ADD CONSTRAINT "assessment_chapters_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "material_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
