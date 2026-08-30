import { executeHybridSearch } from '@/domains/rag/hybrid-search';
import { CLASSROOM_SOCRATIC_SYSTEM_PROMPT, STUDY_GROUP_SYSTEM_PROMPT, DRAFT_MENTOR_SYSTEM_PROMPT } from './prompts/socratic-prompts';
import { EXAM_PROCTOR_SYSTEM_PROMPT, checkExamGuardrail } from './prompts/exam-guardrails';
import type { AgendaType } from '@/domains/agendas/types';

export interface AgentRequest {
  userMessage: string;
  agendaType: AgendaType;
  sessionId?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AgentResponse {
  content: string;
  citation?: string;
  isGuardrailViolation?: boolean;
  modelUsed: string;
  latencyMs: number;
}

export async function processAgentInteraction(
  request: AgentRequest
): Promise<AgentResponse> {
  const startTime = Date.now();
  const { userMessage, agendaType } = request;

  // 1. Verificação de Guardrail Anti-Cola em Sessões de Prova
  if (agendaType === 'EXAM') {
    const guardrailCheck = checkExamGuardrail(userMessage);
    if (guardrailCheck.isViolation) {
      return {
        content: guardrailCheck.refusalMessage!,
        isGuardrailViolation: true,
        modelUsed: 'SLM-7B-ExamGuard (LoRA-Proctor)',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  // 2. Busca RAG Híbrida Determinística sobre o Material Didático Oficial
  const ragResult = await executeHybridSearch({
    query: userMessage,
    topK: 2,
  });

  const bestChunk = ragResult.chunks[0];
  const citation = ragResult.primaryCitation;

  // 3. Simulação de Resposta Socrática contextualizada
  let generatedText = '';

  if (agendaType === 'CLASSROOM') {
    if (userMessage.toLowerCase().includes('join') || userMessage.toLowerCase().includes('tabela')) {
      generatedText = `Excelente pergunta! Vamos pensar juntos: imagine que temos a tabela de **Alunos** e a tabela de **Matrículas**. Se um aluno acabou de entrar e ainda não se matriculou em nenhuma disciplina, o que aconteceria com ele se usássemos um \`INNER JOIN\` versus um \`LEFT JOIN\`?\n\nComo está destacado no nosso material: *"o LEFT OUTER JOIN preserva todas as tuplas da tabela à esquerda, preenchendo com valores NULL os atributos da direita quando não houver correspondência."*\n\nQual desses dois você escolheria para um relatório de todos os alunos cadastrados no sistema?`;
    } else if (userMessage.toLowerCase().includes('3fn') || userMessage.toLowerCase().includes('normalizacao') || userMessage.toLowerCase().includes('normalização')) {
      generatedText = `Normalização é a chave para evitar anomalias de atualização! Na **3ª Forma Normal**, a regra de ouro é: cada coluna não-chave deve depender *apenas* da chave primária, e de mais nada.\n\nSe você tiver uma tabela com \`id_aluno\`, \`cidade_id\` e \`nome_cidade\`, você percebe que \`nome_cidade\` depende de \`cidade_id\` e não diretamente do aluno? Como você refatoraria essa estrutura para atingir a 3FN?`;
    } else {
      generatedText = `Muito bem! Analisando o conceito com base nas nossas referências didáticas: quando estruturamos esse modelo, precisamos garantir a integridade dos dados e a performance das consultas.\n\nConsiderando o trecho do livro: *"${bestChunk?.content || 'A consistência relacional depende de chaves primárias bem definidas.'}"*, como você aplicaria isso no nosso projeto de laboratório?`;
    }
  } else if (agendaType === 'STUDY_GROUP') {
    generatedText = `Olá pessoal! Ótima discussão no grupo. O colega levantou um ponto importante sobre o isolamento de transações. Alguém gostaria de complementar explicando como o nível de isolamento \`READ COMMITTED\` se comporta nesse caso prático?`;
  } else if (agendaType === 'DRAFT_REVIEW') {
    generatedText = `### 📝 Parecer Formativo da Profª. Luci\n\n- **Estrutura & Clareza (Nota 8.5/10):** Seu texto apresenta uma linha de raciocínio clara e boa contextualização do problema.\n- **Fundamentação Teórica (Nota 8.0/10):** Recomendo enriquecer a seção 2 com referências formais à álgebra relacional e às formas normais.\n- **Dica de Aprimoramento:** Evite parágrafos com mais de 6 linhas na introdução. Leia a seção correspondente em ${citation || '[Apostila Oficial]'}.`;
  } else {
    generatedText = `Olá! Estou à disposição para tirar dúvidas conceituais. Em que ponto da matéria você gostaria de aprofundar hoje?`;
  }

  const latencyMs = Date.now() - startTime;

  return {
    content: generatedText,
    citation,
    modelUsed: 'vLLM-SLM-8B-Pedagogy (Multi-LoRA-DB)',
    latencyMs: Math.max(80, latencyMs),
  };
}

export async function handleAgentOrchestration(params: {
  message: string;
  agendaType: AgendaType;
  studentId?: string;
  studentName?: string;
  sessionId?: string;
  videoTimestampSeconds?: number;
}) {
  const result = await processAgentInteraction({
    userMessage: params.message,
    agendaType: params.agendaType,
    sessionId: params.sessionId,
  });

  return {
    reply: result.content,
    citations: result.citation ? [result.citation] : [],
    isSocraticChallenge: params.agendaType === 'CLASSROOM' && !result.isGuardrailViolation,
    latencyMs: result.latencyMs,
    blockedByExamGuardrail: result.isGuardrailViolation,
  };
}
