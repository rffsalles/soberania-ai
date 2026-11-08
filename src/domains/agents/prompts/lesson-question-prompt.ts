import type { AIMessage } from '@/lib/ai-provider';
import type { DidacticChunk } from '@/domains/rag/types';
import { formatCitation } from '@/domains/rag/hybrid-search';

export const LESSON_QUESTION_SYSTEM_PROMPT = `
Você é a Tutora Lucy propondo uma pergunta de verificação para os alunos durante a aula.
Use SOMENTE os trechos fornecidos. Responda APENAS com um objeto JSON, sem markdown, no formato:
{"questions":[{"id":"q1","enunciation":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctKey":"A","rationale":"...","topic":"..."}]}
Elabore exatamente 1 questão de múltipla escolha, com exatamente 4 alternativas (A a D) e uma única correta.
O "rationale" deve ser curto e citar o trecho que sustenta a resposta correta.
`;

export type LessonQuestionPromptInput = {
  activity: string;
  description: string;
  dailyObjective: string;
  chunks: DidacticChunk[];
};

export function buildLessonQuestionMessages(input: LessonQuestionPromptInput): AIMessage[] {
  const context = input.chunks.map((c) => `${formatCitation(c)}\n${c.content}`).join('\n\n');
  const user = `Passo da aula: ${input.activity}\nDescrição: ${input.description}\nObjetivo do dia: ${input.dailyObjective}\n\nTrechos de apoio:\n${context}\n\nElabore 1 questão.`;
  return [
    { role: 'system', content: LESSON_QUESTION_SYSTEM_PROMPT.trim() },
    { role: 'user', content: user },
  ];
}
