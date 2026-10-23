import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Páginas sob os layouts por área ficam abaixo do header compartilhado. Um wrapper
 * `min-h-screen` nelas soma 100vh à altura do header e cria rolagem espúria em toda
 * página curta; o preenchimento do viewport vem de `flex-1` dentro do `#main-content`.
 */
const AREA_DIRS = ['(student)', '(teacher)', '(admin)', 'teacher', 'admin'].map((d) =>
  join(__dirname, '..', d)
);

function listPageComponents(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__') out.push(...listPageComponents(full));
    } else if (/(^page\.tsx$|Page\.tsx$)/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('páginas sob os layouts por área', () => {
  it('não usam min-h-screen (o header compartilhado já ocupa parte do viewport)', () => {
    const offenders = AREA_DIRS.flatMap(listPageComponents).filter((file) =>
      /\bmin-h-screen\b/.test(readFileSync(file, 'utf8'))
    );
    expect(offenders.map((f) => f.replace(join(__dirname, '..'), 'src/app'))).toEqual([]);
  });
});
