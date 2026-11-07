import type { ChapterNode } from '@/domains/rag/chapters';
import type { OutlineEntry } from '@/domains/rag/types';
import fixture from './livro-sintetico-pages.json';

export const LIVRO_SINTETICO_TOTAL_PAGES = 174;

export function livroSinteticoPages(): { pageNumber: number; text: string }[] {
  return (fixture.pages as string[]).map((text, i) => ({ pageNumber: i + 1, text }));
}

export const LIVRO_SINTETICO_OUTLINE: OutlineEntry[] = [
  { title: 'Capa_Logica_Computacional_Vol1.pdf', pageNumber: null, depth: 0 },
  { title: 'Página em branco', pageNumber: 2, depth: 0 },
  { title: 'Capa_Logica_Computacional_Vol1.pdf', pageNumber: null, depth: 0 },
  { title: 'Página em branco', pageNumber: 173, depth: 0 },
  { title: 'Página 1', pageNumber: 1, depth: 1 },
  { title: 'Página 1', pageNumber: 174, depth: 1 },
];

const n = (title: string, startPage: number, children: ChapterNode[] = []): ChapterNode => ({ title, startPage, children });

export const LIVRO_SINTETICO_PRINTED_TREE: ChapterNode[] = [
  n('Unidade 1 – Proposições Lógicas', 15, [
    n('Proposições Lógicas', 15),
    n('Proposições lógicas fundamentais', 18, [
      n('Operador lógico E', 19), n('Operador lógico OU', 19),
      n('Operador lógico NÃO', 20), n('Operador lógico XOR', 21),
      n('Operador lógico implicação', 22),
    ]),
    n('Tabelas-verdade', 23), n('Tautologia, contradição e contingência', 25), n('Equivalências lógicas', 27),
  ]),
  n('Unidade 2 – Álgebra Booleana e Circuitos', 43, [
    n('Álgebra booleana', 43), n('Circuitos', 48, [n('Portas lógicas', 51)]),
  ]),
  n('Unidade 3 – Conjuntos, Relações e Funções', 67, [
    n('Introdução', 67), n('Conjunto', 69, [n('Conjuntos especiais', 70)]),
    n('Relação', 73, [n('Relações de equivalência', 75), n('Relações de ordem parcial e total', 76)]),
    n('Função', 81, [n('Função injetora', 82)]),
  ]),
  n('Unidade 4 – Indução, Recursão e Complexidade', 95, [
    n('Introdução', 95), n('Indução', 97, [n('Tipos de indução', 97), n('Princípio da boa ordenação', 100)]),
    n('Recursão', 105), n('Complexidade', 107),
    n('Notação assintótica', 111, [n('Propriedades', 112), n('Classes de crescimento', 113)]),
  ]),
  n('Unidade 5 – Grafos e Árvores de 1º e 2º Níveis, Buscas de 1º Nível', 123, [
    n('Grafos de 1º nível com uma raiz', 123, [n('Construção de um grafo', 127)]),
    n('Árvores de 2º Nível ou Árvores Binárias', 133),
    n('Buscas de 1º Nível', 138, [n('Ordem de Visita em', 138), n('Propriedades dos percursos', 139)]),
  ]),
];
