-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "courseName" TEXT NOT NULL,
    "academicLevel" TEXT NOT NULL DEFAULT 'HIGHER_EDUCATION',
    "academicYear" INTEGER NOT NULL DEFAULT 2026,
    "semester" INTEGER,
    "classId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_subjects" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_plans" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "syllabus" TEXT NOT NULL,
    "generalObjectives" TEXT NOT NULL,
    "specificObjectives" TEXT NOT NULL,
    "unitsContent" JSONB NOT NULL,
    "methodology" TEXT NOT NULL,
    "assessmentCriteria" TEXT NOT NULL,
    "basicBibliography" TEXT[],
    "complementaryBiblio" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teaching_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_schedules" (
    "id" TEXT NOT NULL,
    "teachingPlanId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "holidays" JSONB,
    "totalClasses" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_plans" (
    "id" TEXT NOT NULL,
    "courseScheduleId" TEXT NOT NULL,
    "agendaId" TEXT,
    "classDate" TIMESTAMP(3) NOT NULL,
    "classNumber" INTEGER NOT NULL,
    "topicTitle" TEXT NOT NULL,
    "dailyObjective" TEXT NOT NULL,
    "timeScript" JSONB NOT NULL,
    "methodology" TEXT NOT NULL,
    "resourcesNeeded" TEXT[],
    "fixationExercise" TEXT NOT NULL,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "s3ObjectKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "teachingPlanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "rubrics" JSONB NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE INDEX "subjects_classId_idx" ON "subjects"("classId");

-- CreateIndex
CREATE INDEX "teacher_subjects_teacherId_idx" ON "teacher_subjects"("teacherId");

-- CreateIndex
CREATE INDEX "teacher_subjects_subjectId_idx" ON "teacher_subjects"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_subjects_teacherId_subjectId_key" ON "teacher_subjects"("teacherId", "subjectId");

-- CreateIndex
CREATE INDEX "teaching_plans_subjectId_idx" ON "teaching_plans"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_plans_agendaId_key" ON "lesson_plans"("agendaId");

-- CreateIndex
CREATE INDEX "lesson_plans_courseScheduleId_idx" ON "lesson_plans"("courseScheduleId");

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_plans" ADD CONSTRAINT "teaching_plans_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_schedules" ADD CONSTRAINT "course_schedules_teachingPlanId_fkey" FOREIGN KEY ("teachingPlanId") REFERENCES "teaching_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_courseScheduleId_fkey" FOREIGN KEY ("courseScheduleId") REFERENCES "course_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_agendaId_fkey" FOREIGN KEY ("agendaId") REFERENCES "agendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_teachingPlanId_fkey" FOREIGN KEY ("teachingPlanId") REFERENCES "teaching_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
