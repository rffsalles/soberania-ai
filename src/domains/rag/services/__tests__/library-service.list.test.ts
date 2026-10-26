import { describe, expect, it, vi } from 'vitest';

vi.mock('../material-repository', () => ({
  listMaterials: vi.fn(async () => [
    {
      id: 'seed-1',
      title: 'Diretrizes Curriculares',
      author: 'MEC',
      edition: null,
      subject: 'Legislação',
      totalPages: 3,
      filePath: 'seed://mat-dcn-mec-1',
      originalFilename: null,
      fileSize: null,
      mimeType: null,
      isOcrApplied: false,
      status: 'INDEXED',
      createdAt: new Date('2026-01-01'),
      _count: { chunks: 2 },
    },
    {
      id: 'up-1',
      title: 'Apostila SQL',
      author: 'Prof.',
      edition: null,
      subject: 'Banco de Dados',
      totalPages: 10,
      filePath: 'uploads/apostila.pdf',
      originalFilename: 'apostila.pdf',
      fileSize: 1234,
      mimeType: 'application/pdf',
      isOcrApplied: false,
      status: 'INDEXED',
      createdAt: new Date('2026-01-02'),
      _count: { chunks: 5 },
    },
  ]),
  findMaterial: vi.fn(),
  materialStats: vi.fn(async () => ({ totalMaterials: 2, totalChunks: 7, ocrCount: 0, totalBytes: 1234 })),
}));
vi.mock('../category-repository', () => ({
  listCategories: vi.fn(async () => [{ name: 'Legislação' }, { name: 'Banco de Dados' }]),
}));

import { listMaterialsWithStats } from '../library-service';

describe('listMaterialsWithStats', () => {
  it('não inventa originalFilename para material sem arquivo (ex.: corpus do seed)', async () => {
    const { materials } = await listMaterialsWithStats({});
    const seed = materials.find((m) => m.id === 'seed-1')!;
    const uploaded = materials.find((m) => m.id === 'up-1')!;
    expect(seed.originalFilename).toBeNull();
    expect(uploaded.originalFilename).toBe('apostila.pdf');
  });
});
