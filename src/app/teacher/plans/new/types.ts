export interface SubjectOption {
  id: string;
  name: string;
  code: string;
  courseName: string;
  academicLevel?: string;
  academicYear?: number;
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

export interface NdeComplianceData {
  totalHours: number;
  theoryHours: number;
  practiceHours: number;
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

