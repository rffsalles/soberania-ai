import type { DidacticChunk } from '../../src/domains/rag/types';

// Corpus didático oficial e artigos científicos pré-indexados (semeado em DidacticMaterial/MaterialChunk)
export const SEED_CORPUS: DidacticChunk[] = [
  {
    id: 'chunk-db-001',
    materialId: 'mat-db-1',
    bookTitle: 'Sistemas de Banco de Dados',
    author: 'Navathe & Elmasri',
    chapter: 'Capítulo 4: Álgebra Relacional e SQL',
    section: '4.2 Junções e Cláusulas JOIN',
    pageNumber: 58,
    category: 'Banco de Dados',
    content:
      'A cláusula INNER JOIN combina tuplas de duas tabelas com base em uma condição de junção. Tuplas que não satisfazem o predicado são descartadas do resultado. Já o LEFT OUTER JOIN preserva todas as tuplas da tabela à esquerda, preenchendo com valores NULL os atributos da direita quando não houver correspondência.',
  },
  {
    id: 'chunk-db-002',
    materialId: 'mat-db-1',
    bookTitle: 'Sistemas de Banco de Dados',
    author: 'Navathe & Elmasri',
    chapter: 'Capítulo 6: Normalização de Dados Relacionais',
    section: '6.3 Terceira Forma Normal (3FN)',
    pageNumber: 112,
    category: 'Banco de Dados',
    content:
      'Uma relação R está na Terceira Forma Normal (3FN) se estiver na 2FN e nenhum atributo não-chave depender transitivamente da chave primária. Em outras palavras, para toda dependência funcional não-trivial X -> A, X é uma superchave ou A é um atributo primo.',
  },
  {
    id: 'chunk-db-003',
    materialId: 'mat-db-1',
    bookTitle: 'Sistemas de Banco de Dados',
    author: 'Navathe & Elmasri',
    chapter: 'Capítulo 8: Transações e Propriedades ACID',
    section: '8.1 Atomicidade e Isolamento',
    pageNumber: 164,
    category: 'Banco de Dados',
    content:
      'As propriedades ACID garantem a integridade das transações no SGBD. A Atomicidade assegura que todas as operações sejam executadas ou nenhuma o seja. A Consistência preserva os invariantes do esquema. O Isolamento previne interferências entre transações concorrentes.',
  },
  {
    id: 'chunk-algo-001',
    materialId: 'mat-algo-1',
    bookTitle: 'Estruturas de Dados e Algoritmos',
    author: 'Cormen et al.',
    chapter: 'Capítulo 2: Complexidade Assintótica',
    section: '2.1 Notação Big-O',
    pageNumber: 34,
    category: 'Algoritmos & Estrutura de Dados',
    content:
      'A notação Big-O (O grande) descreve o limite superior da taxa de crescimento do tempo de execução ou espaço de memória de um algoritmo no pior caso. O algoritmo de busca binária opera em O(log n), enquanto uma busca linear opera em O(n).',
  },
  {
    id: 'chunk-algo-002',
    materialId: 'mat-algo-1',
    bookTitle: 'Estruturas de Dados e Algoritmos',
    author: 'Cormen et al.',
    chapter: 'Capítulo 5: Árvores de Busca Binária (BST)',
    section: '5.2 Inserção e Balanceamento AVL',
    pageNumber: 88,
    category: 'Algoritmos & Estrutura de Dados',
    content:
      'Em uma Árvore de Busca Binária (BST), todo nó à esquerda possui chave estritamente menor que a chave raiz, e todo nó à direita possui chave maior. As árvores AVL mantêm o fator de balanceamento entre -1 e +1 através de rotações simples e duplas.',
  },
  {
    id: 'chunk-paper-001',
    materialId: 'mat-paper-edu-1',
    bookTitle: 'Revista Brasileira de Informática na Educação',
    author: 'Vasconcelos, Salles et al. (2024)',
    chapter: 'Artigo: Aprendizagem Ativa e Tutores Inteligentes Socráticos',
    section: 'Seção 3: Metodologia e Retenção Cognitiva',
    pageNumber: 14,
    category: 'Metodologias Ativas & Pedagogia',
    content:
      'Estudos empíricos com 450 estudantes do ensino técnico demonstraram que a intervenção mediada por agentes tutores socráticos — que devolvem questionamentos reflexivos em vez de gabaritos diretos — elevou a taxa de retenção conceitual em 34% em comparação com métodos tradicionais de leitura passiva de apostilas.',
  },
  {
    id: 'chunk-paper-002',
    materialId: 'mat-paper-slm-1',
    bookTitle: 'IEEE Transactions on Learning Technologies',
    author: 'Mendes & Oliveira (2025)',
    chapter: 'Artigo: Avaliação de SLMs On-Premises em Ambientes Educacionais',
    section: 'Seção 4: Soberania de Dados e Latência no vLLM',
    pageNumber: 28,
    category: 'Inteligência Artificial & Soberania',
    content:
      'Modelos de Linguagem Pequenos (SLMs de 3B a 8B parâmetros) quantizados em AWQ e executados localmente atingiram acurácia pedagógica comparável a LLMs proprietários comerciais quando combinados com RAG híbrido e citação documental obrigatória, garantindo conformidade estrita com legislações de proteção a menores (LGPD).',
  },
  {
    id: 'chunk-dcn-001',
    materialId: 'mat-dcn-mec-1',
    bookTitle: 'Diretrizes Curriculares Nacionais para Computação',
    author: 'MEC / Conselho Nacional de Educação (Res. CNE/CES 5/2016)',
    chapter: 'Artigo 4º: Competências e Habilidades Específicas',
    section: 'Eixo de Modelagem e Soluções Computacionais',
    pageNumber: 8,
    category: 'Diretrizes Curriculares Nacionais (DCN / MEC)',
    content:
      'O egresso dos cursos de graduação da área de Computação deve possuir sólida formação técnico-científica e humanística que o capacite a conceber, projetar, implementar e gerenciar sistemas de informação com rigor metodológico, aplicando princípios de modelagem de dados, algoritmos eficientes e governança ética da informação.',
  },
  {
    id: 'chunk-dcn-002',
    materialId: 'mat-dcn-mec-1',
    bookTitle: 'Diretrizes Curriculares Nacionais para Computação',
    author: 'MEC / Conselho Nacional de Educação (Res. CNE/CES 5/2016)',
    chapter: 'Artigo 7º: Práticas de Ensino e Aprendizagem Significativa',
    section: 'Articulação Teoria e Prática',
    pageNumber: 12,
    category: 'Diretrizes Curriculares Nacionais (DCN / MEC)',
    content:
      'Os planos pedagógicos devem priorizar metodologias ativas com resolução de problemas reais, laboratórios práticos e projetos integradores, promovendo a autonomia intelectual do estudante através do raciocínio analítico, resolução dialógica e avaliação formativa continuada.',
  },
];
