import { aiProvider } from '@/lib/ai-provider';
import type { AgendaType } from '@/domains/agendas/types';
import { startTutorPipeline } from './tutor-pipeline';

export { getSystemPromptForAgenda } from './tutor-pipeline';

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

const GUARDRAIL_MODEL = 'SLM-7B-ExamGuard (LoRA-Proctor)';

/**
 * Resposta completa do agente (sem persistência) sobre o pipeline único de tutoria.
 */
export async function processAgentInteraction(request: AgentRequest): Promise<AgentResponse> {
  const startTime = Date.now();
  const start = await startTutorPipeline({
    message: request.userMessage,
    agendaType: request.agendaType,
    history: request.history,
  });

  if (start.kind === 'blocked') {
    return {
      content: start.refusalMessage,
      isGuardrailViolation: true,
      modelUsed: GUARDRAIL_MODEL,
      latencyMs: Date.now() - startTime,
    };
  }

  let content = '';
  for await (const chunk of start.stream) content += chunk.token;

  const providerInfo = aiProvider.getProviderInfo();
  return {
    content: content.trim(),
    citation: start.citation,
    isGuardrailViolation: false,
    modelUsed: `${providerInfo.provider.toUpperCase()} · ${providerInfo.model}`,
    latencyMs: Date.now() - startTime,
  };
}

export interface AgentOrchestrationParams {
  message: string;
  agendaType?: AgendaType;
  sessionId?: string;
}

export interface AgentOrchestrationResult {
  reply: string;
  isSocraticChallenge: boolean;
  citations: string[];
  latencyMs: number;
  blockedByExamGuardrail: boolean;
  modelUsed: string;
}

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
