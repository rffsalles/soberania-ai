'use client';

import * as React from 'react';

export interface InspectedMetadata {
  title: string;
  author: string;
  /** Nomes de categorias já normalizados pelo servidor contra o cadastro. */
  categories: string[];
}

export interface DocumentInspection {
  /** false quando os campos vieram da heurística local (provedor de IA indisponível). */
  aiApplied: boolean;
  suggestedCategory?: string;
}

/**
 * Envia o arquivo para /api/v1/library/documents/inspect e entrega título, autor e
 * categorias ao chamador. Falhas são silenciosas: o usuário preenche à mão.
 */
export function useDocumentInspection(onMetadata: (metadata: InspectedMetadata) => void) {
  const [isInspecting, setIsInspecting] = React.useState(false);
  const [inspection, setInspection] = React.useState<DocumentInspection | null>(null);
  const onMetadataRef = React.useRef(onMetadata);
  onMetadataRef.current = onMetadata;

  const reset = React.useCallback(() => setInspection(null), []);

  const inspect = React.useCallback(async (file: File) => {
    setIsInspecting(true);
    setInspection(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/v1/library/documents/inspect', { method: 'POST', body: formData });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.success || !data.metadata) return;
      const m = data.metadata;
      onMetadataRef.current({
        title: typeof m.title === 'string' ? m.title : '',
        author: typeof m.author === 'string' ? m.author : '',
        categories: Array.isArray(m.categories) ? m.categories.filter((c: unknown) => typeof c === 'string') : [],
      });
      setInspection({
        aiApplied: m.aiApplied === true,
        suggestedCategory: typeof m.suggestedCategory === 'string' && m.suggestedCategory ? m.suggestedCategory : undefined,
      });
    } catch {
      // Inspeção é opcional: o formulário segue preenchível manualmente.
    } finally {
      setIsInspecting(false);
    }
  }, []);

  return { isInspecting, inspection, inspect, reset };
}
