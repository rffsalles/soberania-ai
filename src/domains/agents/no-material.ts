import type { AgendaType } from '@/domains/agendas/types';

// Módulo puro (sem banco): pode ser importado por componentes de cliente.

/** Modos em que a tutora responde só com base no material e recusa o que não está nele. */
const MATERIAL_BOUND_AGENDAS: ReadonlySet<AgendaType> = new Set<AgendaType>(['CLASSROOM', 'OFFICE_HOURS']);

/**
 * Curto-circuito determinístico: sala de aula ou plantão, nenhum trecho recuperado e nenhuma conversa em
 * andamento. Sem trecho não há o que ensinar a partir do material, e deixar o modelo responder é o caminho
 * para explicações fora do acervo e citações inventadas. Com histórico, a mensagem pode ser a resposta do
 * aluno a uma pergunta da tutora ("acho que é a atomicidade"), que não recupera trecho por si só: nesse caso
 * o modelo decide, guiado pela regra de escopo do prompt. Grupo de estudos (intervenção da tutora),
 * revisão de texto (o texto do aluno é o objeto) e prova (guardrail próprio) ficam de fora.
 */
export function shouldRefuseWithoutMaterial(input: {
  agendaType: AgendaType;
  chunkCount: number;
  historyLength: number;
}): boolean {
  return MATERIAL_BOUND_AGENDAS.has(input.agendaType) && input.chunkCount === 0 && input.historyLength === 0;
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
