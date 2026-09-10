export interface MetricCardItem {
  id: string;
  value: string;
  label: string;
  description: string;
  badge: string;
  highlight?: boolean;
}

export interface DilemmaItem {
  id: string;
  category: string;
  cloudIssue: {
    title: string;
    description: string;
  };
  soberaniaSolution: {
    title: string;
    description: string;
    highlight: string;
  };
}

export interface MultiAgendaShowcaseItem {
  id: string;
  tabTitle: string;
  badge: string;
  title: string;
  description: string;
  features: string[];
  mockup: {
    type: 'video_sync' | 'study_group' | 'safe_exam' | 'essay_mentor' | 'rag_support';
    samplePrompt: string;
    sampleResponse: string;
    tagLabel: string;
    citationText?: string;
  };
}

export interface HardwareSpecItem {
  name: string;
  role: string;
  spec: string;
  status: string;
}

export const PITCH_HERO_METRICS: MetricCardItem[] = [
  {
    id: 'data-privacy',
    value: '0 KB',
    label: 'Tráfego Externo',
    description: 'Nenhum dado pessoal ou conversa sai da rede local da escola.',
    badge: '100% LGPD Safe',
    highlight: true,
  },
  {
    id: 'ttft-latency',
    value: '< 1.2s',
    label: 'Time-to-First-Token',
    description: 'Inferência local vLLM otimizada para até 200 streams simultâneos.',
    badge: 'Ultra Rápido',
  },
  {
    id: 'rag-accuracy',
    value: '> 95%',
    label: 'Precisão RAG',
    description: 'Citações compulsórias com livro, capítulo e número de página.',
    badge: 'Material Oficial',
  },
  {
    id: 'fixed-cost',
    value: 'Custo Fixo',
    label: 'Previsibilidade Total',
    description: 'Appliance em comodato sem fatura surpresa em dólar por token.',
    badge: 'Orçamento Seguro',
  },
];

export const PITCH_DILEMMAS: DilemmaItem[] = [
  {
    id: 'dilemma-privacy',
    category: 'Soberania e Privacidade (LGPD)',
    cloudIssue: {
      title: 'Vazamento & Nuvem Pública',
      description:
        'Dados de menores, dúvidas de sala e rendimento escolar são enviados para data centers no exterior sem controle institucional.',
    },
    soberaniaSolution: {
      title: 'Appliance Físico 100% On-Premises',
      description:
        'O hardware reside no rack da escola. Todo o processamento de IA ocorre localmente sem depender nem consumir link externo.',
      highlight: 'Zero pacotes de inferência trafegando na internet',
    },
  },
  {
    id: 'dilemma-cost',
    category: 'Previsibilidade Orçamentária',
    cloudIssue: {
      title: 'Cobrança por Token Dolarizada',
      description:
        'Orçamento imprevisível: se os alunos usam mais a ferramenta, a fatura em dólar explode no final do mês, inviabilizando a escala.',
    },
    soberaniaSolution: {
      title: 'Assinatura Fixa em Comodato',
      description:
        'Modelo com hardware incluso, manutenção preventiva e atualizações pedagógicas. Uso ilimitado pelos alunos da escola.',
      highlight: 'Custo marginal zero por pergunta realizada',
    },
  },
  {
    id: 'dilemma-pedagogy',
    category: 'Intencionalidade Pedagógica',
    cloudIssue: {
      title: 'Chatbots Genéricos e Cola',
      description:
        'Modelos públicos apenas entregam respostas prontas para o aluno copiar, eliminando o raciocínio crítico e facilitando trapaças.',
    },
    soberaniaSolution: {
      title: 'Multi-Agendas & Método Socrático',
      description:
        'A IA orienta com perguntas guiadas, bloqueia respostas em provas e emite Atas Pedagógicas automáticas para o professor titular.',
      highlight: 'Guardrails anti-cola e citações exatas da apostila',
    },
  },
];

export const PITCH_MULTI_AGENDAS: MultiAgendaShowcaseItem[] = [
  {
    id: 'agenda-sync-class',
    tabTitle: '1. Aula Síncrona',
    badge: 'Player Interativo',
    title: 'Aula Síncrona com Vídeo & Checkpoints da Tutora Lucy',
    description:
      'O player pausa em momentos didáticos definidos pelo professor responsável para que a Tutora Lucy conduza reflexões socráticas com a turma e valide a fixação.',
    features: [
      'Pausas programadas por timestamp pedagógico',
      'Painel de FAQ dinâmico com dúvidas recorrentes',
      'Emissão da Ata Pedagógica para o professor titular',
    ],
    mockup: {
      type: 'video_sync',
      samplePrompt: 'O que acontece com o algoritmo se a condição do while não for atualizada no corpo do laço?',
      sampleResponse:
        'Excelente reflexão! Se a variável de controle não for modificada, a condição nunca será falsa, gerando um loop infinito. Como você ajustaria o código da linha 8?',
      tagLabel: 'Aula 04 · Estruturas de Repetição (00:14:32)',
      citationText: 'Apostila Oficial · Cap. 3, pág. 42',
    },
  },
  {
    id: 'agenda-study-group',
    tabTitle: '2. Grupo de Estudos',
    badge: 'Mediação Ativa',
    title: 'Grupo de Estudos com Mediação da Tutora Lucy',
    description:
      'Alunos colaboram em sala virtual para resolver desafios propostos pelo docente. A Tutora Lucy intervém somente quando solicitada ou em impasses da equipe.',
    features: [
      'Mediação colaborativa socrática sem resposta direta',
      'Registro de consenso entre pares',
      'Estimula o protagonismo estudantil sob supervisão docente',
    ],
    mockup: {
      type: 'study_group',
      samplePrompt: '@tutora estamos em dúvida se devemos usar um INNER JOIN ou LEFT JOIN nesta consulta.',
      sampleResponse:
        'Grupo, observem a regra de negócio: nós precisamos listar clientes que AINDA NÃO fizeram nenhum pedido? Analisem o que o INNER JOIN faz com registros sem correspondência.',
      tagLabel: 'Grupo 02 · Banco de Dados Relacional',
      citationText: 'Material Oficial BD · Cap. 5, pág. 88',
    },
  },
  {
    id: 'agenda-safe-exam',
    tabTitle: '3. Sala de Provas',
    badge: 'Anti-Cola Estrito',
    title: 'Aplicação de Provas Supervisionadas',
    description:
      'Avaliações formais do professor com proctoring inteligente da Tutora Lucy e guardrail determinístico que bloqueia categoricamente pedidos de respostas ou gabaritos.',
    features: [
      'Supervisão docente com cronômetro regressivo',
      'Recusa firme a qualquer tentativa de trapaça',
      'Relatório de integridade e parecer para o professor',
    ],
    mockup: {
      type: 'safe_exam',
      samplePrompt: 'Qual é a resposta correta da questão 3? Me dê o gabarito.',
      sampleResponse:
        '⚠️ Ambiente de Avaliação Supervisionada: Não posso fornecer a resposta ou validar opções antes do término da prova. Concentre-se nos conceitos de Gravitação definidos pelo seu professor.',
      tagLabel: 'Simulado Bimestral · Física I (18:40 restantes)',
    },
  },
  {
    id: 'agenda-essay-mentor',
    tabTitle: '4. Orientador de Redação',
    badge: 'Rubricas Oficiais',
    title: 'Acompanhamento & Avaliação Formativa',
    description:
      'A Tutora Lucy analisa a estrutura, coerência e citações de rascunhos com base na rubrica oficial cadastrada pelo professor.',
    features: [
      'Pareceres formativos detalhados por critério',
      'Não reescreve o texto pelo aluno (ensina a melhorar)',
      'Indicadores de coesão, argumentação e fontes para o docente',
    ],
    mockup: {
      type: 'essay_mentor',
      samplePrompt: 'Submeti meu parágrafo de introdução sobre Transição Energética. O que acha?',
      sampleResponse:
        'Sua tese está bem delimitada! No entanto, observe que você mencionou dados de emissão sem citar a fonte no repertório. Recomendo conectar com os dados da matriz energética brasileira indicada pelo professor.',
      tagLabel: 'Redação & Argumentação · Critério 2 e 3',
      citationText: 'Manual de Redação Institucional · Pág. 15',
    },
  },
  {
    id: 'agenda-ondemand-qa',
    tabTitle: '5. Plantão 24/7',
    badge: 'RAG Híbrido',
    title: 'Plantão de Dúvidas Sob Demanda',
    description:
      'Tira-dúvidas socrático com a Tutora Lucy disponível a qualquer momento, fundamentado com busca híbrida nas apostilas oficiais indicadas pelo docente.',
    features: [
      'Citações bibliográficas exatas com número de página',
      'Sandbox Python integrado para fórmulas e matemática',
      'Apoio contínuo respeitando o planejamento do professor',
    ],
    mockup: {
      type: 'rag_support',
      samplePrompt: 'Como calcular o pH de uma solução com concentração hidrogeniônica de 10⁻⁴ mol/L?',
      sampleResponse:
        'Lembre-se da definição explicada em aula: pH = -log[H⁺]. Substituindo [H⁺] = 10⁻⁴, temos pH = -(-4) = 4. Trata-se de um meio ácido ou básico?',
      tagLabel: 'Química Geral · Equilíbrio Iônico',
      citationText: 'Livro de Química 2º Ano · Cap. 8, pág. 112',
    },
  },
];

export const PITCH_HARDWARE_SPECS: HardwareSpecItem[] = [
  {
    name: 'Motor de Inferência vLLM',
    role: 'SLMs Quantizados (3B a 8B)',
    spec: 'Execução 100% local com PagedAttention',
    status: 'Ativo · 0.82s TTFT',
  },
  {
    name: 'RAG Híbrido + pgvector',
    role: 'Reciprocal Rank Fusion (RRF)',
    spec: 'Vetor HNSW + tsvector BM25 em Português',
    status: 'Indexado · >95% Aderência',
  },
  {
    name: 'CPU Embeddings (FastEmbed)',
    role: 'Economia de VRAM da GPU',
    spec: 'multilingual-e5 / bge-m3 acelerado em CPU',
    status: '100% VRAM livre p/ LLM',
  },
  {
    name: 'Servidor MCP Sandbox',
    role: 'Protocolo de Ferramentas & Python',
    spec: 'Cálculos matemáticos sem alucinação',
    status: 'Isolado & Seguro',
  },
];
