-- AlterTable
ALTER TABLE "didactic_materials" ADD COLUMN IF NOT EXISTS "originalFilename" TEXT;
ALTER TABLE "didactic_materials" ADD COLUMN IF NOT EXISTS "fileSize" INTEGER;
ALTER TABLE "didactic_materials" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "didactic_materials" ADD COLUMN IF NOT EXISTS "isOcrApplied" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "didactic_materials" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;
