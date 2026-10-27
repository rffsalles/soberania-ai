-- AlterTable
ALTER TABLE "material_chapters" ADD COLUMN     "depth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "material_chapters_parentId_idx" ON "material_chapters"("parentId");

-- AddForeignKey
ALTER TABLE "material_chapters" ADD CONSTRAINT "material_chapters_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "material_chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
