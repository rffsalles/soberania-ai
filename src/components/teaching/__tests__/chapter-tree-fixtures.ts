import type { ClientPlanChapter, ClientPlanChapterBook } from '../chapter-combobox-item';

function ch(
  id: string,
  order: number,
  number: string,
  title: string,
  startPage: number,
  endPage: number,
  parentId: string | null,
): ClientPlanChapter {
  return { id, order, number, title, startPage, endPage, parentId, depth: number.split('.').length - 1 };
}

export const MAT_BOOK: ClientPlanChapterBook = {
  materialId: 'm-mat',
  title: 'Matemática Básica',
  author: 'Silva',
  kind: 'BASIC',
  chapters: [
    ch('u1', 1, '1', 'Unidade 1', 15, 42, null),
    ch('u2', 2, '2', 'Unidade 2', 43, 66, null),
    ch('s21', 3, '2.1', 'Produtos notáveis', 43, 47, 'u2'),
    ch('s22', 4, '2.2', 'Frações', 48, 66, 'u2'),
    ch('s221', 5, '2.2.1', 'Operações com frações', 51, 57, 's22'),
    ch('s222', 6, '2.2.2', 'Frações equivalentes', 58, 66, 's22'),
    ch('u3', 7, '3', 'Unidade 3', 67, 94, null),
  ],
};

export const COMP_BOOK: ClientPlanChapterBook = {
  materialId: 'm-comp',
  title: 'Leituras Complementares',
  author: 'Souza',
  kind: 'COMPLEMENTARY',
  chapters: [ch('x1', 1, '1', 'Apêndice', 1, 20, null)],
};
