export interface DidacticMaterialItem {
  id: string;
  title: string;
  author: string;
  category: string;
  materialType: string;
  storagePath: string;
  originalFilename?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  isOcrApplied: boolean;
  totalChunks: number;
  totalPages: number;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialsStats {
  totalMaterials: number;
  totalChunks: number;
  ocrCount: number;
  totalBytes: number;
}

export interface MaterialsResponse {
  success: boolean;
  materials: DidacticMaterialItem[];
  stats: MaterialsStats;
  categories: string[];
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  } catch {
    return isoString;
  }
}
