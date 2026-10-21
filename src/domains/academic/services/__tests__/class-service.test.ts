import { describe, it, expect } from 'vitest';
import { listClasses, type ClassDeps } from '../class-service';

describe('listClasses', () => {
  it('devolve as turmas do repositório com id, nome, código, semestre e ano', async () => {
    const rows = [{ id: 'c1', name: '3º Semestre · ADS', code: 'ADS-2026-3A', semester: 3, year: 2026 }];
    const deps: ClassDeps = { repo: { listClasses: async () => rows, findClassById: async () => null } };
    expect(await listClasses(deps)).toEqual(rows);
  });
});
