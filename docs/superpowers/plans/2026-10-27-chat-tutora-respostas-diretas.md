# Chat da Tutora: respostas diretas e completas — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a Tutora Lucy responder sem cortar frases, sem se apresentar a cada resposta e sem vazar markdown/LaTeX cru no balão do chat.

**Architecture:** (1) o pipeline único da tutora (`startTutorPipeline`) passa a informar `maxTokens` próprio ao provedor, via constante nova em `src/lib/constants/tutor.ts`; (2) um bloco de estilo compartilhado (`TUTOR_STYLE_RULES`) é anexado ao fim dos 4 prompts de tutoria, e a regra que mandava reforçar a identidade é removida. Nenhuma mudança de UI nem de provedor.

**Tech Stack:** TypeScript, Next.js, vitest (ambiente node nestas tasks).

**Spec:** sem arquivo de spec (trabalho bounded); o contexto está na seção "Contexto" abaixo.

## Contexto

Teste manual em 2026-10-27 (aluno ALU002, sala "Conjuntos Numéricos") mostrou 3 problemas:

1. **Resposta cortada no meio da frase.** `src/domains/agents/tutor-pipeline.ts:93-96` chama `streamChat(..., { citation: rag.primaryCitation })` sem `maxTokens`, caindo no padrão `max_tokens: options.maxTokens ?? 512` de `src/lib/ai-provider.ts:183`. Todos os fluxos do aluno (classroom, office hours, study group via `chatWithTutor`) passam por esse ponto.
2. **Toda resposta começa com "Olá! Sou a Tutora Lucy..." e tem preâmbulo e encerramento longos.** Causa provável: `src/domains/agents/prompts/socratic-prompts.ts:12` (regra 6, "Reforce sempre que você é a Tutora Lucy...") e ausência de instrução de concisão nos 4 prompts (`CLASSROOM_SOCRATIC_SYSTEM_PROMPT` L1-13, `STUDY_GROUP_SYSTEM_PROMPT` L15-24, `DRAFT_MENTOR_SYSTEM_PROMPT` L26-35, `OFFICE_HOURS_SYSTEM_PROMPT` L37-45).
3. **Markdown e LaTeX aparecem como texto cru.** O balão renderiza `<p className="whitespace-pre-line">{msg.text}</p>` em `src/components/ai/chat-message-list.tsx:75`; não há lib de markdown no `package.json` e nenhum lugar do app renderiza markdown. Os prompts não dizem nada sobre formato.

## Global Constraints

- Nunca criar branch; commits diretos em `main`; sem pull request.
- Textos de UI e prompts em português do Brasil.
- Sem novas dependências npm.
- Não alterar `src/lib/ai-provider.ts` nem o padrão 512 (outros serviços dependem de passar o próprio limite).
- Não alterar `EXAM_PROCTOR_SYSTEM_PROMPT` (`src/domains/agents/prompts/exam-guardrails.ts`).
- Testes: vitest, `globals: true`; testes de componente/hook levam `// @vitest-environment jsdom` na linha 1 (não se aplica às tasks abaixo, que são node).
- Comandos: teste `npx vitest run <path>`; typecheck `npx tsc --noEmit`.

## Review Focus

- Uma resposta longa legítima (ex.: 3 exemplos com justificativa) ainda cabe em 1200 tokens em pt-BR? O teste da Task 1 fixa o valor; a Task 3 confirma manualmente que não corta.
- Study group usa `chatWithTutor` (não stream) e passa pelo mesmo pipeline: o bloco de estilo não pode quebrar a detecção de menção `@lucy` nem o `STUDY_GROUP_MAX_MESSAGE_LENGTH` (`src/lib/constants/tutor.ts`).
- `isSocraticChallengeText` (`src/domains/agents/answer-judge.ts:7`) testa `endsWith('?')`: respostas mais curtas devem continuar terminando com pergunta guia. O bloco proíbe "convites ou frases de efeito" no fim, não a pergunta socrática.
- Ordem final do system prompt: prompt da agenda → estilo → escopo ("Esta aula cobre") → RAG (`tutor-pipeline.ts:89-90`); o teste "Esta aula cobre" deve seguir passando.
- Modelos pequenos podem ignorar "sem markdown" em listas longas; a Task 3 cobre isso manualmente.

---

### Task 1: Limite de tokens do chat da tutora

**Files:**
- Modify: `src/lib/constants/tutor.ts` (nova constante após `JUDGE_MAX_TOKENS`, L41)
- Modify: `src/domains/agents/tutor-pipeline.ts` (import no topo; L95)
- Test: `src/domains/agents/__tests__/tutor-pipeline.test.ts` (novo `describe` ao final; reusa `chunk` L6-15)

**Interfaces:**
- Consumes: `startTutorPipeline(request, deps)` com `deps.search` e `deps.streamChat` (já existentes); `AICompletionOptions.maxTokens` (`src/lib/ai-provider.ts:67`).
- Produces: `export const TUTOR_MAX_TOKENS = 1200` em `@/lib/constants/tutor`.

- [ ] **Step 1: Write the failing test**

Em `tutor-pipeline.test.ts`, importar `TUTOR_MAX_TOKENS` de `@/lib/constants/tutor` e acrescentar ao final do arquivo:

```ts
describe('startTutorPipeline (opções do provedor)', () => {
  it('passa TUTOR_MAX_TOKENS ao streamChat', async () => {
    const calls: unknown[][] = [];
    const streamChat = vi.fn(async function* (...args: unknown[]): AsyncGenerator<StreamChunk> {
      calls.push(args);
      yield { token: '', isComplete: true };
    });
    const c = chunk({});
    const start = await startTutorPipeline(
      { message: 'o que é entidade?', agendaType: 'CLASSROOM' },
      { search: async () => ({ query: 'q', chunks: [c], primaryCitation: '[Apostila · Cap. 2, pág. 31]', latencyMs: 1 }), streamChat }
    );
    if (start.kind !== 'stream') throw new Error('esperava stream');
    for await (const _ of start.stream) { /* consome */ }
    expect(calls[0][1]).toEqual({ citation: '[Apostila · Cap. 2, pág. 31]', maxTokens: TUTOR_MAX_TOKENS });
  });
});
```

Se `RAGSearchResult` não tiver `primaryCitation` com esse formato/tipo, ajustar o literal ao tipo real em `src/domains/rag/types.ts` (o assert deve comparar com o mesmo valor devolvido pelo `search` mockado).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domains/agents/__tests__/tutor-pipeline.test.ts`
Expected: falha de import/resolução de `TUTOR_MAX_TOKENS` (ou `undefined`) no novo teste; os demais testes do arquivo passam.

- [ ] **Step 3: Implement**

- `src/lib/constants/tutor.ts`, logo após `JUDGE_MAX_TOKENS`: `export const TUTOR_MAX_TOKENS = 1200;` com JSDoc `/** Respostas do chat da tutora; o padrão do provedor, 512, cortava respostas no meio. */`.
- `src/domains/agents/tutor-pipeline.ts`: `import { TUTOR_MAX_TOKENS } from '@/lib/constants/tutor';` e trocar L95 por `{ citation: rag.primaryCitation, maxTokens: TUTOR_MAX_TOKENS }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domains/agents/__tests__/tutor-pipeline.test.ts && npx tsc --noEmit`
Expected: todos os testes do arquivo passam; typecheck sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/lib/constants/tutor.ts src/domains/agents/tutor-pipeline.ts src/domains/agents/__tests__/tutor-pipeline.test.ts
git commit -m "fix(tutor): limite de 1200 tokens nas respostas do chat

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Bloco de estilo compartilhado nos prompts da tutora

**Files:**
- Modify: `src/domains/agents/prompts/socratic-prompts.ts` (nova constante no topo; edições L4, L10, L11, L12; fim dos 4 prompts)
- Create: `src/domains/agents/prompts/__tests__/socratic-prompts.test.ts` (padrão dos vizinhos, ex.: `teaching-plan-prompt.test.ts`: `import { describe, it, expect } from 'vitest'`, ambiente node, sem `// @vitest-environment`)
- Não tocar: `src/domains/agents/prompts/exam-guardrails.ts` (o prompt de EXAM fica sem o bloco).

**Interfaces:**
- Consumes: nenhuma.
- Produces: `export const TUTOR_STYLE_RULES: string`; os 4 prompts exportados (`CLASSROOM_SOCRATIC_SYSTEM_PROMPT`, `STUDY_GROUP_SYSTEM_PROMPT`, `DRAFT_MENTOR_SYSTEM_PROMPT`, `OFFICE_HOURS_SYSTEM_PROMPT`) passam a terminar com `TUTOR_STYLE_RULES`. Assinaturas inalteradas.

- [ ] **Step 1: Write the failing test**

Criar `socratic-prompts.test.ts` importando os 4 prompts e `TUTOR_STYLE_RULES` de `../socratic-prompts`, com 3 casos:

```ts
const PROMPTS = {
  CLASSROOM: CLASSROOM_SOCRATIC_SYSTEM_PROMPT,
  STUDY_GROUP: STUDY_GROUP_SYSTEM_PROMPT,
  DRAFT_MENTOR: DRAFT_MENTOR_SYSTEM_PROMPT,
  OFFICE_HOURS: OFFICE_HOURS_SYSTEM_PROMPT,
};

describe('prompts da tutora', () => {
  it('todos os prompts de tutoria terminam com as regras de estilo', () => {
    for (const prompt of Object.values(PROMPTS)) {
      expect(prompt.trimEnd().endsWith(TUTOR_STYLE_RULES.trimEnd())).toBe(true);
    }
  });

  it('as regras proíbem apresentação, markdown e LaTeX', () => {
    for (const trecho of ['Não se apresente', 'sem markdown', 'sem LaTeX', '√2']) {
      expect(TUTOR_STYLE_RULES).toContain(trecho);
    }
  });

  it('o prompt de sala não manda reforçar a identidade', () => {
    expect(CLASSROOM_SOCRATIC_SYSTEM_PROMPT).not.toContain('Reforce sempre que você é a Tutora Lucy');
    expect(CLASSROOM_SOCRATIC_SYSTEM_PROMPT).toContain('NUNCA dê a resposta de forma mastigada');
    expect(CLASSROOM_SOCRATIC_SYSTEM_PROMPT).toContain('[Livro Didático · Cap. X, pág. Y]');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domains/agents/prompts/__tests__/socratic-prompts.test.ts`
Expected: 3 falhas (`TUTOR_STYLE_RULES` não exportado / `undefined`).

- [ ] **Step 3: Implement**

Em `socratic-prompts.ts`:

1. Declarar ANTES dos prompts `export const TUTOR_STYLE_RULES = \`...\`;` com exatamente este texto (sem linha em branco inicial/final dentro do template além da quebra após a crase de abertura, de modo que `trimEnd()` do teste case):

```
ESTILO DE RESPOSTA (obrigatório):
- Não se apresente nem diga quem você é. Não cumprimente, não agradeça a pergunta, não encerre com convites ou frases de efeito.
- Comece direto pelo conteúdo. Vá ao ponto; evite preâmbulos e repetições do que o aluno disse.
- Responda em texto puro: sem markdown (nada de #, **, listas com * ou -, > ou ---), sem LaTeX (nada de \( \), $ ou \frac). Escreva fórmulas em notação simples: 3/4, 2,75, √2, π, x², a/b.
- Use parágrafos curtos. Numere passos como "1)", "2)" só quando houver sequência.
- Seja breve: o suficiente para guiar o raciocínio, sem repetir a mesma ideia.
```

   Atenção: dentro de template string, `\(`, `\)` e `\frac` precisam de escape (`\\(`, `\\)`, `\\frac`) para o texto final conter a barra literal, e `$` seguido de `{` não ocorre aqui (ok).
2. Terminar cada um dos 4 prompts com `\n\n${TUTOR_STYLE_RULES}\n` (interpolação no fim do template; o `\n` final fica depois do bloco, e o teste usa `trimEnd`).
3. `CLASSROOM_SOCRATIC_SYSTEM_PROMPT`: remover a regra 6 (L12); L4 "acolhedora, empática e pedagogicamente rigorosa" → "direta, respeitosa e pedagogicamente rigorosa"; L10 "valide calorosamente" → "confirme em uma frase"; L11 "aponte com carinho onde está o equívoco" → "aponte objetivamente onde está o equívoco". Manter as regras 1-3 intactas.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domains/agents && npx tsc --noEmit`
Expected: novo arquivo com 3 testes passando; `tutor-pipeline.test.ts` e `answer-judge.test.ts` seguem passando (inclusive "Esta aula cobre"). Se algum teste existente quebrar por causa do bloco, investigar a causa antes de ajustar o código; nunca afrouxar o assert.

- [ ] **Step 5: Commit**

```bash
git add src/domains/agents/prompts/socratic-prompts.ts src/domains/agents/prompts/__tests__/socratic-prompts.test.ts
git commit -m "feat(tutor): respostas diretas, sem apresentação, markdown ou LaTeX

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Verificação manual no navegador

**Files:** nenhum (sem código).

**Interfaces:**
- Consumes: Tasks 1 e 2 em `main`.
- Produces: relatório de aceite (checkboxes abaixo).

- [ ] **Step 1: Preparar o ambiente.** Conferir `NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW="true"` no `.env` e reiniciar `next dev` (os prompts são constantes de módulo e só recarregam no restart).
- [ ] **Step 2: Primeira pergunta.** Logar como aluno de teste da Turma A, abrir `/classroom/cmvn9ana700fc11q6cpgi3sna` e perguntar: "Qual a diferença entre números racionais e irracionais? Pode dar um exemplo de cada?"
- [ ] **Step 3: Segunda mensagem.** Responder: "3/4 e 2,75 viram fração; √2 e π não. Racional é o que vira fração e irracional o que não vira?"
- [ ] **Step 4: Conferir critérios de aceite** nas duas respostas:
  - [ ] (a) nenhuma resposta começa com "Olá" nem contém "Sou a Tutora Lucy"
  - [ ] (b) nenhuma resposta exibe `**`, `##`, `\(` ou `\frac`
  - [ ] (c) a segunda resposta termina com pontuação final e não para no meio de frase
  - [ ] (d) ainda há pergunta guia (método socrático) e citação `[Livro Didático · Cap. ..., pág. ...]`
  - [ ] (e) o evento `done` da rota `POST /api/v1/agent/chat/stream` chega com HTTP 200 (aba Network)
- [ ] **Step 5: Registrar o resultado.** Se (b) falhar com vazamentos pontuais de markdown, anotar no relatório final e abrir o follow-up de renderizador (ver "Fora do escopo"). Sem commit.

---

## Fora do escopo

- **Biblioteca de markdown/KaTeX:** não será adicionada; o problema 3 é tratado por instrução de formato no prompt (texto puro). Se o modelo continuar vazando markdown apesar da instrução, o follow-up é um renderizador no `ChatMessageList` (`src/components/ai/chat-message-list.tsx:75`).
- **Saudação sintética do cliente** (`GREETINGS` em `src/components/ai/universal-socratic-chat.tsx:27-32`, "Olá! Sou a Tutora Lucy. ..."): não muda; é a mensagem única de abertura, não resposta da IA.
- **Método socrático** e `citations: []`: o método é mantido (princípio do produto) e `citations: []` fica fora deste plano.
