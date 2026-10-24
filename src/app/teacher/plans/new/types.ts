export interface SubjectOption {
  id: string;
  discipline: { name: string; code: string };
  class: { name: string; course: { name: string } };
}

export interface DocumentReference {
  id: string;
  title: string;
  author: string;
  category: string;
  totalChunks?: number;
  sampleExcerpt?: string;
  isCustomUpload?: boolean;
}

export interface CategoryOption {
  id?: string;
  name: string;
  documentCount?: number;
  chunkCount?: number;
  description?: string | null;
  color?: string | null;
}

export interface AcademicPeriodOption {
  id: string;
  name: string;
  code: string;
  year: number;
  semester?: number | null;
  type?: string;
}

/** Horas em null = ainda não informadas pelo professor (plano novo começa vazio, sem valores inventados). */
export interface NdeComplianceData {
  totalHours: number | null;
  theoryHours: number | null;
  practiceHours: number | null;
  ndeComplianceStatus: string;
}

export interface GeneratedPlanData {
  syllabus: string;
  generalObjectives: string;
  bloomLevels: string[];
  methodology: string;
  citations: string[];
  academicPeriod: string;
}

