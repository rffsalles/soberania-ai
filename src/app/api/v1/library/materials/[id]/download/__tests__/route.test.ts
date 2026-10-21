import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/request-user', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/request-user')>()),
  requireUser: vi.fn(async () => ({ id: 't1', role: 'TEACHER', classId: null })),
}));
vi.mock('@/domains/rag/services/library-service', () => ({
  getMaterialDownload: vi.fn(async () => ({
    buffer: Buffer.from('conteúdo'),
    filename: 'Apostila — SQL “avançado”.pdf',
    contentType: 'application/pdf',
  })),
}));

import { GET } from '../route';

describe('GET /api/v1/library/materials/:id/download', () => {
  it('responde 200 com Content-Disposition seguro para nome fora do Latin-1', async () => {
    const res = await GET(new Request('http://localhost/x'), { params: Promise.resolve({ id: 'm1' }) });
    expect(res.status).toBe(200);
    const header = res.headers.get('content-disposition')!;
    expect(header).toContain(`filename="Apostila _ SQL _avancado_.pdf"`);
    expect(header).toContain(`filename*=UTF-8''Apostila%20%E2%80%94%20SQL%20%E2%80%9Cavan%C3%A7ado%E2%80%9D.pdf`);
  });
});
