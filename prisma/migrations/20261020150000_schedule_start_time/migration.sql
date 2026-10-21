-- Horário de início (HH:mm, fuso da instituição) das aulas geradas pelo cronograma. Expand-only.
-- AlterTable
ALTER TABLE "course_schedules" ADD COLUMN     "start_time" TEXT NOT NULL DEFAULT '19:00';
