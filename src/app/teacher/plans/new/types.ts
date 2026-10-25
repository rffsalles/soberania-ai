export interface OfferingOption {
  id: string;
  discipline: { code: string; name: string; workloadHours: number };
  class: {
    id: string;
    name: string;
    semester: number;
    course: { name: string; code: string; academicLevel: 'HIGHER_EDUCATION' | 'HIGH_SCHOOL' | 'ELEMENTARY' };
    academicPeriod: { id: string; name: string; code: string };
  };
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

/**
 * Horas em null = ainda não informadas pelo professor (plano novo começa vazio, sem valores inventados).
 * A carga total não é dado do plano na tela: vem da matriz (discipline.workloadHours da oferta).
 */
export interface NdeComplianceData {
  theoryHours: number | null;
  practiceHours: number | null;
  ndeComplianceStatus: string;
}

