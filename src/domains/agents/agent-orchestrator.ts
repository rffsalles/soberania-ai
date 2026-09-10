import { executeHybridSearch } from '@/domains/rag/hybrid-search';
import {
  CLASSROOM_SOCRATIC_SYSTEM_PROMPT,
  STUDY_GROUP_SYSTEM_PROMPT,
  DRAFT_MENTOR_SYSTEM_PROMPT,
  OFFICE_HOURS_SYSTEM_PROMPT,
} from './prompts/socratic-prompts';
import { EXAM_PROCTOR_SYSTEM_PROMPT, checkExamGuardrail } from './prompts/exam-guardrails';
import { aiProvider, type StreamChunk } from '@/lib/ai-provider';
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

/**
 * Seleciona o System Prompt de acordo com o tipo da Multi-Agenda
 */
export function getSystemPromptForAgenda(agendaType: AgendaType): string {
  switch (agendaType) {
    case 'CLASSROOM':
      return CLASSROOM_SOCRATIC_SYSTEM_PROMPT;
    case 'STUDY_GROUP':
      return STUDY_GROUP_SYSTEM_PROMPT;
    case 'DRAFT_REVIEW':
      return DRAFT_MENTOR_SYSTEM_PROMPT;
    case 'OFFICE_HOURS':
      return OFFICE_HOURS_SYSTEM_PROMPT;
    case 'EXAM':
      return EXAM_PROCTOR_SYSTEM_PROMPT;
    default:
      return CLASSROOM_SOCRATIC_SYSTEM_PROMPT;
  }
}

/**
 * Orquestra a resposta completa do agente com RAG Híbrido, Guardrails e Telemetria
 */
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

  const citation = ragResult.primaryCitation;
  const ragContext = ragResult.chunks
    .map((c) => `[FONTE: ${c.bookTitle} - ${c.chapter}, pág. ${c.pageNumber}]\n${c.content}`)
    .join('\n\n');

  const systemPrompt = getSystemPromptForAgenda(agendaType);
  const enrichedSystemPrompt = `${systemPrompt}\n\nMATERIAL DIDÁTICO RELEVANTE (RAG HÍBRIDO):\n${ragContext}`;

  // 3. Execução via AI Provider Gateway
  let fullContent = '';
  const stream = aiProvider.streamChat(
    [
      { role: 'system', content: enrichedSystemPrompt },
      ...(request.history || []),
      { role: 'user', content: userMessage },
    ],
    { citation }
  );

  for await (const chunk of stream) {
    fullContent += chunk.token;
  }

  const latencyMs = Date.now() - startTime;
  const providerInfo = aiProvider.getProviderInfo();

  return {
    content: fullContent.trim(),
    citation,
    isGuardrailViolation: false,
    modelUsed: `${providerInfo.provider.toUpperCase()} · ${providerInfo.model}`,
    latencyMs,
  };
}

/**
 * Streaming em tempo real para a Sala de Aula Interativa e Chat
 */
export async function* streamAgentInteraction(
  request: AgentRequest
): AsyncGenerator<StreamChunk, void, unknown> {
  const { userMessage, agendaType } = request;

  // 1. Guardrail Check
  if (agendaType === 'EXAM') {
    const guardrailCheck = checkExamGuardrail(userMessage);
    if (guardrailCheck.isViolation) {
      yield {
        token: guardrailCheck.refusalMessage!,
        isComplete: true,
      };
      return;
    }
  }

  // 2. Busca RAG Híbrida
  const ragResult = await executeHybridSearch({
    query: userMessage,
    topK: 2,
  });

  const citation = ragResult.primaryCitation;
  const ragContext = ragResult.chunks
    .map((c) => `[FONTE: ${c.bookTitle} - ${c.chapter}, pág. ${c.pageNumber}]\n${c.content}`)
    .join('\n\n');

  const systemPrompt = getSystemPromptForAgenda(agendaType);
  const enrichedSystemPrompt = `${systemPrompt}\n\nMATERIAL DIDÁTICO RELEVANTE (RAG):\n${ragContext}`;

  const stream = aiProvider.streamChat(
    [
      { role: 'system', content: enrichedSystemPrompt },
      ...(request.history || []),
      { role: 'user', content: userMessage },
    ],
    { citation }
  );

  for await (const chunk of stream) {
    yield chunk;
  }
}

export interface AgentOrchestrationParams {
  message: string;
  agendaType?: AgendaType;
  studentId?: string;
  studentName?: string;
  sessionId?: string;
  videoTimestampSeconds?: number;
}

export interface AgentOrchestrationResult {
  reply: string;
  isSocraticChallenge: boolean;
  citations: string[];
  latencyMs: number;
  blockedByExamGuardrail: boolean;
  modelUsed: string;
}

/**
 * Ponto de entrada de orquestração do agente para APIs e rotas de chat
 */
export async function handleAgentOrchestration(
  params: AgentOrchestrationParams
): Promise<AgentOrchestrationResult> {
  const result = await processAgentInteraction({
    userMessage: params.message,
    agendaType: params.agendaType || 'CLASSROOM',
    sessionId: params.sessionId,
  });

  return {
    reply: result.content,
    isSocraticChallenge: !result.isGuardrailViolation,
    citations: result.citation ? [result.citation] : [],
    latencyMs: result.latencyMs,
    blockedByExamGuardrail: result.isGuardrailViolation || false,
    modelUsed: result.modelUsed,
  };
}
