-- CreateEnum
CREATE TYPE "ClassEventType" AS ENUM ('STEP_CHANGED', 'TUTOR_CARD', 'TUTOR_QUESTION', 'TEACHER_NOTE', 'SESSION_STARTED', 'SESSION_ENDED', 'TUTOR_SKIPPED');

-- CreateEnum
CREATE TYPE "ClassEventActor" AS ENUM ('TEACHER', 'TUTOR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "InferencePurpose" AS ENUM ('CHAT', 'TUTOR_CARD', 'TUTOR_QUESTION');

-- AlterTable
ALTER TABLE "inference_logs" ADD COLUMN     "agendaId" TEXT,
ADD COLUMN     "purpose" "InferencePurpose";

-- CreateTable
CREATE TABLE "class_events" (
    "id" TEXT NOT NULL,
    "agendaId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" "ClassEventType" NOT NULL,
    "stepIndex" INTEGER,
    "payload" JSONB NOT NULL,
    "audience" TEXT NOT NULL,
    "createdBy" "ClassEventActor" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_events_agendaId_seq_key" ON "class_events"("agendaId", "seq");

-- CreateIndex
CREATE INDEX "inference_logs_agendaId_idx" ON "inference_logs"("agendaId");

-- AddForeignKey
ALTER TABLE "class_events" ADD CONSTRAINT "class_events_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "agendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Idempotência da tutora: no máximo um card/pergunta por passo da aula
CREATE UNIQUE INDEX class_events_tutor_step_uq ON class_events ("agendaId", "stepIndex", type) WHERE type IN ('TUTOR_CARD','TUTOR_QUESTION');

-- Avisa o canal SSE (LISTEN class_events_<agendaId>) a cada evento novo
CREATE OR REPLACE FUNCTION class_events_notify() RETURNS trigger AS $$
BEGIN PERFORM pg_notify('class_events_' || NEW."agendaId", NEW.seq::text); RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER class_events_notify_trg AFTER INSERT ON class_events FOR EACH ROW EXECUTE FUNCTION class_events_notify();
