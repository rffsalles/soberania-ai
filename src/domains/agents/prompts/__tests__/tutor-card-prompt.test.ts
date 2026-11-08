import { describe, expect, it } from 'vitest';
import { parseClassEvent } from '@/domains/classroom/class-event-schema';
import {
  buildTutorCardMessages,
  chunkLabel,
  parseTutorCard,
  type CardSource,
} from '../tutor-card-prompt';

const src = (id: string, extra = {}): CardSource => ({ id, materialId: 'm', bookTitle: 'Sistemas de Banco de Dados', author: 'N', chapter: 'Capítulo 4: Álgebra Relacional e SQL', pageNumber: 58, content: 'x', label: 'Capítulo 4: Álgebra Relacional e SQL — Sistemas de Banco de Dados', ...extra });
const json = (concepts: object[], objectiveLink = 'Liga o passo ao objetivo.') => JSON.stringify({ concepts, objectiveLink });

describe('parseTutorCard', () => {
  it('cartão válido passa no schema do evento com citação vinda do trecho', () => {
    const card = parseTutorCard(json([{ title: 'INNER JOIN', explanation: 'Descarta tuplas sem par.', chunkId: 'c1' }, { title: 'LEFT JOIN', explanation: 'Preserva a esquerda.', chunkId: 'c2' }]), [src('c1'), src('c2', { pageNumber: 59 })]);
    expect(card?.concepts.map((c) => c.citation)).toEqual([{ chunkId: 'c1', label: src('c1').label, page: 58 }, { chunkId: 'c2', label: src('c2').label, page: 59 }]);
    expect(parseClassEvent('TUTOR_CARD', { ...card, source: 'GENERATED' }, 0).ok).toBe(true);
  });
  it('chunkId inventado é descartado; sobrando 1 conceito, null', () => {
    expect(parseTutorCard(json([{ title: 'A', explanation: 'a', chunkId: 'c1' }, { title: 'B', explanation: 'b', chunkId: 'zzz' }]), [src('c1')])).toBeNull();
  });
  it('markdown e referência inventada saem da explicação', () => {
    const card = parseTutorCard(json([{ title: '**JOIN**', explanation: 'Veja o **Cap. 9, p. 300**: junção.', chunkId: 'c1' }, { title: 'B', explanation: 'b', chunkId: 'c1' }]), [src('c1')]);
    expect(card!.concepts[0].title).toBe('JOIN');
    expect(card!.concepts[0].explanation).not.toMatch(/\*\*|Cap\. 9|p\. 300/);
  });
  it('quatro conceitos viram três; texto sem JSON dá null; trecho sintético sem página', () => {
    const four = [1, 2, 3, 4].map((n) => ({ title: `T${n}`, explanation: 'e', chunkId: 'c1' }));
    expect(parseTutorCard(json(four), [src('c1')])!.concepts).toHaveLength(3);
    expect(parseTutorCard('não sei', [src('c1')])).toBeNull();
    const syn = src('s1', { chapter: 'Trecho 3' });
    expect(parseTutorCard(json([{ title: 'A', explanation: 'a', chunkId: 's1' }, { title: 'B', explanation: 'b', chunkId: 's1' }]), [syn])!.concepts[0].citation.page).toBeNull();
  });
  it('pageNumber menor que 1 vira página nula', () => {
    const card = parseTutorCard(json([{ title: 'A', explanation: 'a', chunkId: 'c1' }, { title: 'B', explanation: 'b', chunkId: 'c1' }]), [src('c1', { pageNumber: 0 })]);
    expect(card!.concepts[0].citation.page).toBeNull();
  });
  it('JSON embutido em prosa é lido', () => {
    const body = json([{ title: 'A', explanation: 'a {x}', chunkId: 'c1' }, { title: 'B', explanation: 'b', chunkId: 'c1' }]);
    const card = parseTutorCard(`Claro! Aqui está:\n${body}\nEspero ter ajudado {fim}.`, [src('c1')]);
    expect(card?.concepts).toHaveLength(2);
  });
  it('objectiveLink vazio dá null', () => {
    expect(parseTutorCard(json([{ title: 'A', explanation: 'a', chunkId: 'c1' }, { title: 'B', explanation: 'b', chunkId: 'c1' }], '  '), [src('c1')])).toBeNull();
  });
});

describe('chunkLabel', () => {
  it('usa o rótulo do capítulo quando houver', () => {
    expect(chunkLabel({ ...src('c1'), chapterId: 'ch1' }, new Map([['ch1', 'Cap. 4: Álgebra — SBD (N), p. 50 a 70']]))).toBe('Cap. 4: Álgebra — SBD (N), p. 50 a 70');
    expect(chunkLabel(src('c1'), new Map())).toBe('Capítulo 4: Álgebra Relacional e SQL — Sistemas de Banco de Dados');
  });
});

describe('buildTutorCardMessages', () => {
  it('lista cada trecho com id, rótulo e conteúdo', () => {
    const m = buildTutorCardMessages({ activity: 'Joins', description: 'D', dailyObjective: 'O', sources: [src('c1', { content: 'Texto.' })] });
    expect(m[0].role).toBe('system');
    expect(m[1].content).toContain(`id: c1\n${src('c1').label}\nTexto.`);
  });
});
