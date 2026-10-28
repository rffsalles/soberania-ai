-- AlterTable: atas existentes herdam createdAt como updatedAt
ALTER TABLE "pedagogical_minutes" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "pedagogical_minutes" SET "updatedAt" = "createdAt";
ALTER TABLE "pedagogical_minutes" ALTER COLUMN "updatedAt" SET NOT NULL;
