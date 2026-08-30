-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AgendaType" AS ENUM ('CLASSROOM', 'STUDY_GROUP', 'EXAM', 'DRAFT_REVIEW', 'OFFICE_HOURS');

-- CreateEnum
CREATE TYPE "AgendaStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('QUESTION', 'SOCRATIC_CHALLENGE', 'FAQ_CLICK', 'DRAFT_SUBMISSION', 'EXAM_ANSWER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "enrollment" TEXT,
    "avatarUrl" TEXT,
    "classId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "semester" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendas" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "type" "AgendaType" NOT NULL,
    "status" "AgendaStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "videoUrl" TEXT,
    "classId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "didactic_materials" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "edition" TEXT,
    "subject" TEXT NOT NULL,
    "totalPages" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INDEXED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "didactic_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_chunks" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "chapter" TEXT NOT NULL,
    "section" TEXT,
    "pageNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedagogical_minutes" (
    "id" TEXT NOT NULL,
    "agendaId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "engagementScore" DOUBLE PRECISION NOT NULL,
    "hesitationIndex" DOUBLE PRECISION NOT NULL,
    "topicsMastered" TEXT[],
    "topicsStruggled" TEXT[],
    "rawSummary" TEXT NOT NULL,
    "actionableAdvice" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedagogical_minutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_interactions" (
    "id" TEXT NOT NULL,
    "agendaId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "InteractionType" NOT NULL,
    "timestampInVideo" INTEGER,
    "questionText" TEXT NOT NULL,
    "responseText" TEXT NOT NULL,
    "ragSourcePage" INTEGER,
    "ragSourceBook" TEXT,
    "isSocraticChallenge" BOOLEAN NOT NULL DEFAULT false,
    "wasCorrect" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_submissions" (
    "id" TEXT NOT NULL,
    "agendaId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "answers" JSONB NOT NULL,
    "integrityLog" JSONB,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_enrollment_key" ON "users"("enrollment");
CREATE UNIQUE INDEX "classes_code_key" ON "classes"("code");
CREATE INDEX "material_chunks_materialId_idx" ON "material_chunks"("materialId");
CREATE INDEX "material_chunks_pageNumber_idx" ON "material_chunks"("pageNumber");
CREATE INDEX "pedagogical_minutes_agendaId_idx" ON "pedagogical_minutes"("agendaId");
CREATE INDEX "pedagogical_minutes_studentId_idx" ON "pedagogical_minutes"("studentId");
CREATE INDEX "student_interactions_agendaId_idx" ON "student_interactions"("agendaId");
CREATE INDEX "student_interactions_studentId_idx" ON "student_interactions"("studentId");
CREATE UNIQUE INDEX "exam_submissions_agendaId_studentId_key" ON "exam_submissions"("agendaId", "studentId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agendas" ADD CONSTRAINT "agendas_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "material_chunks" ADD CONSTRAINT "material_chunks_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "didactic_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pedagogical_minutes" ADD CONSTRAINT "pedagogical_minutes_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "agendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pedagogical_minutes" ADD CONSTRAINT "pedagogical_minutes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_interactions" ADD CONSTRAINT "student_interactions_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "agendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_interactions" ADD CONSTRAINT "student_interactions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "agendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_submissions" ADD CONSTRAINT "exam_submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
