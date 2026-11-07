import type { AgendaType } from '@/domains/agendas/types';
import { TUTOR_MENTIONS } from '@/lib/constants/tutor';

// Módulo puro (sem banco): pode ser importado por componentes de cliente.

/** Modos em que a tutora responde só com base no material e recusa o que não está nele. */
const MATERIAL_BOUND_AGENDAS: ReadonlySet<AgendaType> = new Set<AgendaType>(['CLASSROOM', 'OFFICE_HOURS']);

/**
 * Palavras que não indicam assunto: interrogativas, pronomes, auxiliares, cumprimentos e pedidos genéricos.
 * Palavras de até 2 letras já são ignoradas antes desta lista.
 */
const NON_SUBJECT_WORDS = new Set([
  'que', 'quem', 'qual', 'quais', 'quando', 'onde', 'como', 'porque', 'porquê', 'por', 'quanto', 'quanta', 'quantos', 'quantas',
  'você', 'vocês', 'voce', 'voces', 'ele', 'ela', 'eles', 'elas', 'nós', 'mim', 'comigo', 'contigo', 'seu', 'sua', 'seus', 'suas',
  'meu', 'minha', 'meus', 'minhas', 'dele', 'dela', 'isso', 'isto', 'aquilo', 'esse', 'essa', 'esses', 'essas', 'este', 'esta',
  'estes', 'estas', 'aquele', 'aquela', 'tudo', 'nada', 'algo', 'coisa', 'coisas', 'uma', 'umas', 'uns', 'dos', 'das', 'nos', 'nas',
  'pelo', 'pela', 'pelos', 'pelas', 'para', 'pra', 'com', 'sem', 'sobre', 'entre', 'até', 'mais', 'menos', 'muito', 'muita',
  'pouco', 'bem', 'mal', 'sim', 'não', 'nao', 'também', 'ainda', 'agora', 'aqui', 'ali', 'então', 'mas', 'porém', 'só', 'apenas',
  'ser', 'sou', 'são', 'foi', 'era', 'está', 'estou', 'estão', 'esta', 'tem', 'têm', 'ter', 'tenho', 'há', 'pode', 'podes',
  'poderia', 'consegue', 'seria', 'faz', 'fazer', 'vai', 'vou', 'quero', 'queria', 'gostaria', 'preciso', 'precisa',
  'explique', 'explica', 'explicar', 'fale', 'fala', 'falar', 'diga', 'diz', 'dizer', 'conte', 'conta', 'mostre', 'mostra',
  'ajude', 'ajuda', 'ajudar', 'saber', 'entender', 'entendi', 'dúvida', 'dúvidas', 'pergunta', 'perguntas', 'favor',
  'olá', 'ola', 'oi', 'oie', 'bom', 'boa', 'dia', 'tarde', 'noite', 'beleza', 'legal', 'obrigado', 'obrigada',
  'valeu', 'tchau', 'professor', 'professora', 'tutora',
  ...TUTOR_MENTIONS.map((m) => m.slice(1)),
]);

const WORD = /[\p{L}\p{M}\p{N}]+/gu;

/** A mensagem tem ao menos um termo de assunto (algo que o material poderia ou não cobrir)? */
export function hasSubjectTerms(message: string): boolean {
  const words = message.normalize('NFC').toLowerCase().match(WORD) ?? [];
  return words.some((w) => (w.length > 2 || /\p{N}/u.test(w)) && !NON_SUBJECT_WORDS.has(w));
}

/**
 * Curto-circuito determinístico: sala de aula ou plantão, nenhum trecho recuperado e nenhuma conversa em
 * andamento. Sem trecho não há o que ensinar a partir do material, e deixar o modelo responder é o caminho
 * para explicações fora do acervo e citações inventadas. Com histórico, a mensagem pode ser a resposta do
 * aluno a uma pergunta da tutora ("acho que é a atomicidade"), que não recupera trecho por si só: nesse caso
 * o modelo decide, guiado pela regra de escopo do prompt. Mensagem sem termo de assunto (cumprimento, "quem é
 * você?") também vai ao modelo: não é pergunta sobre conteúdo, então "não encontrei no material" não cabe. Grupo de estudos (intervenção da tutora),
 * revisão de texto (o texto do aluno é o objeto) e prova (guardrail próprio) ficam de fora.
 */
export function shouldRefuseWithoutMaterial(input: {
  agendaType: AgendaType;
  chunkCount: number;
  historyLength: number;
  message: string;
}): boolean {
  return (
    MATERIAL_BOUND_AGENDAS.has(input.agendaType) &&
    input.chunkCount === 0 &&
    input.historyLength === 0 &&
    hasSubjectTerms(input.message)
  );
}

/** Recusa curta e explícita, com sugestão do que a tutora pode fazer dentro do material. */
export function buildNoMaterialReply(agendaType: AgendaType, scope: { chapterLabels?: string[] } | undefined): string {
  if (agendaType === 'CLASSROOM') {
    const labels = scope?.chapterLabels ?? [];
    if (labels.length > 0) {
      return `Não encontrei isso no material desta aula. Posso ajudar com o que ela cobre: ${labels.join('; ')}. Qual dúvida você tem sobre esses capítulos?`;
    }
    return 'Não encontrei isso no material desta aula. Posso ajudar com os conceitos do material adotado pelo professor: qual dúvida você tem sobre o conteúdo que está sendo estudado?';
  }
  return 'Não encontrei isso no material da disciplina. Posso ajudar com dúvidas sobre o conteúdo do material adotado pelo professor; se for o caso, reformule a pergunta com os termos usados no capítulo que você está estudando.';
}
