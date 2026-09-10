# 📋 PLAN: Atualização do PRD - Alinhamento "Tutora Lucy & Professor Responsável"

> **Status:** 🟢 Concluído / Implementado  
> **Arquivo Alvo:** [`docs/PRD.md`](file:///c:/projects/soberania-ai/docs/PRD.md)  
> **Objetivo:** Atualizar o documento de requisitos do produto (PRD) para refletir a centralidade do Professor Humano como autoridade pedagógica e a Tutora Lucy como agente IA de apoio e tutoria socrática.  
> **Agente Responsável:** `@[project-planner]`  

---

## 1. 🔍 Diagnóstico do PRD Atual (`docs/PRD.md`)

A análise de [`docs/PRD.md`](file:///c:/projects/soberania-ai/docs/PRD.md) identificou que o documento original foi concebido com terminologias onde a IA assumia o papel de "Professor IA" ou "Agente Professor". Isso contradiz a diretriz pedagógica atual, onde:
- **O Professor Humano é a peça-chave** e autoridade máxima de ensino.
- **A Lucy é a TUTORA IA**, prestando suporte socrático contínuo sob a supervisão do docente titular.

### Trechos com Inconsistência Identificados:
1. **Seção 1.2 (A Solução):** Menciona *"onde o professor de IA assume papéis ativos..."*.
2. **Seção 2 (Personas):** A persona do Professor Titular não explicita seu papel como orquestrador e beneficiário direto da IA; falta a definição da persona institucional da **Tutora Lucy**.
3. **Seção 4.1 (Módulo 1 - Multi-Agendas):** O módulo está intitulado *"Multi-Agendas do Agente Professor"*. As User Stories tratam a IA como "Professor IA" (US-01), "Agente Avaliador" (US-03) e "Agente Orientador" (US-04).
4. **US-02 (Grupo de Estudos):** Cita gatilho `@professor` em vez de `@lucy` / `@tutora`.
5. **Seção 4.4 (Relatórios Pedagógicos):** As Atas Pedagógicas precisam ser categorizadas formalmente como *"Pareceres Diagnósticos emitidos pela Tutora Lucy para o Professor Titular"*.
6. **Seção 7 (Casos de Borda):** Tratamento de desvios e jailbreak cita *"O agente professor responde..."* em vez de *"A Tutora Lucy responde..."*.

---

## 2. 📝 Tarefas de Atualização no `docs/PRD.md`

### Tarefa 1: Atualização da Visão Executiva (Seção 1.2)
- Reenquadrar o conceito de Multi-Agendas: cada evento conta com a supervisão de um **Professor Titular/Responsável** e com a assistência contínua da **Tutora Lucy** (Agente IA de tutoria socrática e mediação on-premises).

### Tarefa 2: Ajuste da Matriz de Personas (Seção 2)
- Enriquecer a persona do **Professor Titular (Clara)** destacando que ela define os parâmetros pedagógicos de cada agenda e recebe superpoderes analíticos da IA.
- Adicionar uma sub-seção ou nota de arquitetura pedagógica para a **Tutora Lucy (Agente On-Premises)**, definindo seus limites de atuação (não leciona matérias novas por conta própria, não altera notas sem aval do professor, foca em método socrático e conformidade curricular).

### Tarefa 3: Reestruturação do Módulo 1 (Seção 4.1 - Multi-Agendas)
- Renomear Módulo 1 para: `Multi-Agendas com Apoio da Tutora Lucy & Professor Responsável`.
- **US-01 (Aula Síncrona com Vídeo):** Vídeo com timestamps pedagógicos pré-definidos pelo Professor Titular; a Tutora Lucy faz pausas socráticas para checagem ativa.
- **US-02 (Grupo de Estudos):** Tutora Lucy atua como mediadora socrática com menções ativadas para `@lucy` e `@tutora` (mantendo retrocompatibilidade com `@luci`).
- **US-03 (Aplicação de Provas):** Prova formulada pelo Professor Titular; Tutora Lucy atua no proctoring (fiscalização de integridade, bloqueio de cola e pré-correção diagnóstica).
- **US-04 (Orientação de Trabalhos):** Análise formativa e socrática da Tutora Lucy apoiando a rubrica estipulada pelo docente.
- **US-05 (Plantão de Dúvidas):** Tutora Lucy esclarece dúvidas fundamentada no RAG dos materiais do professor.

### Tarefa 4: Refinamento dos Relatórios Pedagógicos (Seção 4.4)
- **US-10:** Deixar explícito que a Tutora Lucy elabora as atas e métricas de retenção para entregar uma visão 360º ao Professor Titular, que é o tomador de decisão final.

### Tarefa 5: Alinhamento de Casos de Borda (Seção 7)
- Padronizar respostas nos cenários de desvio para a persona da Tutora Lucy (ex: *"Lucas, hoje o Prof. Carlos definiu que nosso foco é Gravitação Universal..."*).

---

## 3. 👥 Matriz de Agentes Envolvidos

| Agente | Papel nesta Etapa |
| :--- | :--- |
| `@[project-planner]` | Estruturação e redação do plano de alinhamento documental. |
| `@[documentation-writer]` / `@[orchestrator]` | Execução das substituições e revisão textual no [`docs/PRD.md`](file:///c:/projects/soberania-ai/docs/PRD.md). |
| `@[frontend-specialist]` | Garantia de paridade semântica entre os requisitos do PRD e as telas já planejadas no frontend. |

---

## 4. 🏁 Critérios de Conclusão (Definition of Done)

1. [x] [`docs/PRD.md`](file:///c:/projects/soberania-ai/docs/PRD.md) sem nenhuma ocorrência de "Professor IA" ou "Agente Professor" como substituto do docente.
2. [x] Todas as User Stories refletindo a colaboração: **Professor Titular (Autoridade)** + **Tutora Lucy (Apoio IA)**.
3. [x] Gatilhos de menção em chat alinhados com `@lucy` / `@tutora`.
4. [x] Base de código e frontend sincronizados com a persona da Tutora Lucy e supervisão docente.
