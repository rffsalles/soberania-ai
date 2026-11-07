import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/request-user', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/request-user')>()),
  requireUser: vi.fn(async () => ({ id: 't1', role: 'TEACHER', classId: null })),
}));
vi.mock('@/domains/rag/services/category-repository', async (orig) => ({
  ...(await orig<typeof import('@/domains/rag/services/category-repository')>()),
  listCategories: vi.fn(async () => [{ name: 'Banco de Dados' }, { name: 'Engenharia de Software' }]),
}));

import { documentInspectorService } from '@/domains/rag';
import { POST } from '../route';

describe('POST /api/v1/library/documents/inspect', () => {
  it('oferece as categorias cadastradas ao inspetor e devolve aiApplied e suggestedCategory', async () => {
    const spy = vi.spyOn(documentInspectorService, 'inspectDocumentHeader').mockResolvedValue({
      title: 'Fundamentos de Lógica Computacional',
      author: 'Autora Exemplo',
      categories: [],
      suggestedCategory: 'Matemática',
      source: 'ai',
      summary: 'Resumo',
      aiApplied: true,
    });
    const formData = new FormData();
    formData.append('file', new File(['Fundamentos de Lógica Computacional\nAutora Exemplo\nSumário'], 'livro sintetico.txt', { type: 'text/plain' }));

    const res = await POST(new Request('http://localhost/x', { method: 'POST', body: formData }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(expect.anything(), 'livro sintetico.txt', {
      availableCategories: ['Banco de Dados', 'Engenharia de Software'],
    });
    expect(body.metadata.aiApplied).toBe(true);
    expect(body.metadata.suggestedCategory).toBe('Matemática');
    expect(body.metadata.author).toBe('Autora Exemplo');
  });
});
