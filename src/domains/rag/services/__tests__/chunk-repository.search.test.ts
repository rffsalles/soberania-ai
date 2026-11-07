import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Prisma } from '@prisma/client';

const queryRaw = vi.fn();
vi.mock('@/lib/db', () => ({
  db: { $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => queryRaw(strings, ...values) },
}));

import { Prisma as P } from '@prisma/client';
import { searchHybrid } from '../chunk-repository';

function capturedSql(): Prisma.Sql {
  const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
  return P.sql(strings, ...values);
}

describe('searchHybrid (ramo léxico)', () => {
  beforeEach(() => {
    queryRaw.mockReset();
    queryRaw.mockResolvedValue([]);
  });

  it('usa to_tsquery em português com os termos unidos por OR, não websearch_to_tsquery (AND)', async () => {
    await searchHybrid({ query: 'Quais propriedades ACID?', embedding: null, topK: 2 });
    const sql = capturedSql();
    expect(sql.sql).not.toContain('websearch_to_tsquery');
    expect(sql.sql).toMatch(/\bto_tsquery\(\S+::regconfig, \S+\)/);
    expect(sql.values).toContain('portuguese');
    expect(sql.values).toContain('quais | propriedades | acid');
  });

  it('mantém o filtro por capítulos (subárvore expandida) e materiais no ramo léxico', async () => {
    await searchHybrid({
      query: 'join',
      embedding: null,
      topK: 2,
      chapterIds: ['c1', 'c2'],
      materialIds: ['m1'],
    });
    const sql = capturedSql();
    expect(sql.sql).toContain('material_chunks."chapterId" = ANY(');
    expect(sql.sql).toContain('material_chunks."materialId" = ANY(');
    expect(sql.values).toContainEqual(['c1', 'c2']);
    expect(sql.values).toContainEqual(['m1']);
  });

  it('sem termos aproveitáveis o ramo léxico não roda tsquery nenhuma', async () => {
    await searchHybrid({ query: '?!', embedding: null, topK: 2 });
    const sql = capturedSql();
    expect(sql.sql).not.toContain('to_tsquery');
  });
});
