# 📋 PLAN: Pitch de Apresentação Executiva & Interativa (`/pitch`)

> **Documento:** Plano de Engenharia e Arquitetura de Front-End  
> **Status:** 🟢 Concluído & Implementado  
> **Responsável Principal:** `@[project-planner]` e `@[frontend-specialist]`  
> **Referência Técnica:** [`docs/PRD.md`](file:///c:/projects/soberania-ai/docs/PRD.md) · [`docs/UX_UI_DESIGN_SYSTEM.md`](file:///c:/projects/soberania-ai/docs/UX_UI_DESIGN_SYSTEM.md) · [`docs/rules/CLEAN_CODE.md`](file:///c:/projects/soberania-ai/docs/rules/CLEAN_CODE.md)  
> **Stitch Screen Blueprint:** `bea1d9e991ca4feea645e187af97a6d0` (Projeto `9396079196886748298`)

---

## 1. 🎯 Visão Executiva do Pitch

Criar uma experiência interativa e imersiva na rota `/pitch` projetada especificamente para **apresentações executivas presenciais** (para diretores, mantenedores, coordenadores e equipes de TI escolar).

A tela deve gerar um **forte efeito WOW**, equilibrando a autoridade tecnológica e a soberania do appliance on-premises com o acolhimento pedagógico do design system (*Teal* `#0D9488`, *Warm Orange* `#F97316`, superfícies *Dark Slate* e tipografia *Poppins + Inter*).

### Decisões Alinhadas no Brainstorming:
1. **Micro-Animações:** Transições suaves de entrada, badges pulsantes de status local, showcase interativo com micro-estados e tabs fluidas.
2. **CTAs para Login/Plataforma:** Direcionamento direto para a experiência ao vivo da plataforma (`/dashboard`, `/classroom`, `/appliance`), dispensando formulários de agendamento.
3. **Calculadora Interativa de TCO/ROI:** Comparador dinâmico de custos Cloud (APIs por token) vs Appliance Físico Soberania (custo fixo em comodato).

---

## 2. 🧩 Arquitetura de Componentes & Estrutura de Pastas

Seguindo o **Thin Page Pattern** e limites estritos de até 350 LOC por arquivo:

```
src/app/pitch/
├── page.tsx                                  # Thin Page Wrapper ('use client')
└── _components/
    ├── PitchPage.tsx                         # Container orquestrador principal e scroll tracking
    ├── PitchHeader.tsx                       # Header glassmorphic, status on-premises, CTAs de login
    ├── PitchHero.tsx                         # Hero display, proposta de valor, badges de telemetria
    ├── PitchDilemmasSection.tsx              # Os 3 Grandes Dilemas (LGPD, Custo Cloud, Alucinação/Cola)
    ├── PitchMultiAgendasShowcase.tsx         # Showcase interativo das 5 Multi-Agendas com tabs e mockups
    ├── PitchRoiCalculator.tsx                # Calculadora de ROI e economia financeira com slider
    ├── PitchHardwareTelemetry.tsx           # Visão do Appliance Físico, vLLM, pgvector e resiliência offline
    ├── PitchFooter.tsx                       # Selos MEC / 100% LGPD, links rápidos por papel
    └── pitch-constants.ts                    # Constantes de texto, agendas, métricas e fórmulas de ROI
```

---

## 3. 📝 Detalhamento dos Módulos

### 3.1 `PitchHeader.tsx`
- Header com efeito *glassmorphic* (`backdrop-blur-md bg-slate-900/80 border-b border-slate-800/60`).
- Logo oficial do **Soberania AI** com badge pulsante: `100% On-Premises · LGPD Safe`.
- Navegação de âncora suave para as seções: *Dilemas*, *Multi-Agendas*, *Calculadora ROI*, *Hardware*.
- Botão primário com ícone de acesso rápido: **"Acessar Demonstração"** (redireciona para `/dashboard`).

### 3.2 `PitchHero.tsx`
- Título display em *Poppins* com gradiente sutil: *"A Primeira IA Educacional Soberana em Appliance Plug-and-Play"*.
- Subtítulo focado nas 3 dores resolvidas (privacidade absoluta, custo fixo e intencionalidade pedagógica).
- Grid de 4 **Metric Cards Flutuantes** com micro-animações:
  - `0 KB`: Tráfego de inferência externo (100% local).
  - `< 1.2s`: Time-to-First-Token (vLLM local).
  - `100%`: Conformidade LGPD (Dados de menores protegidos).
  - `Zero Surpresas`: Custo fixo em comodato (sem cobrança por token).
- Ações: *"Iniciar Demonstração ao Vivo"* e *"Ver Comparador de Custos"*.

### 3.3 `PitchDilemmasSection.tsx`
- Apresentação comparativa dos 3 entraves da IA na educação:
  1. **Privacidade & LGPD:** Nuvem expõe histórico escolar vs Appliance mantém 100% dos dados na rede da escola.
  2. **Orçamento & Custo:** Tokens dolarizados imprevisíveis vs Assinatura fixa com hardware incluso.
  3. **Cognição & Cola:** Chatbots genéricos que dão a resposta vs Professor IA Socrático com citações RAG da apostila.

### 3.4 `PitchMultiAgendasShowcase.tsx`
- Sistema de tabs estilizadas com as **5 Multi-Agendas Especializadas** do [`docs/PRD.md`](file:///c:/projects/soberania-ai/docs/PRD.md):
  1. **Aula Interativa Síncrona:** Player de vídeo didático com pausas automáticas e reflexão socrática.
  2. **Grupo de Estudos Colaborativo:** Mediação socrática em grupo sem entrega de respostas prontas.
  3. **Sala de Provas Supervisionada:** Cronômetro regressivo com **Guardrail Anti-Cola Estrito**.
  4. **Orientador de Trabalhos & Redações:** Avaliação diagnóstica com rubricas oficiais.
  5. **Plantão de Dúvidas 24/7:** RAG Híbrido com citação obrigatória de livro/capítulo/página.
- Cada tab exibe uma simulação visual detalhada e acolhedora com feedback imediato.

### 3.5 `PitchRoiCalculator.tsx`
- Slider interativo de quantidade de alunos da instituição (de 500 a 20.000 alunos).
- Cálculo dinâmico de TCO anual:
  - Estimativa de custo de API Nuvem (ex: OpenAI/Claude a ~200k tokens/aluno/mês).
  - Custo fixo do comodato do Soberania AI Appliance.
  - Exibição do valor economizado com barra de progresso visual e destaque financeiro.

### 3.6 `PitchHardwareTelemetry.tsx`
- Apresentação visual da arquitetura local do Appliance:
  - *vLLM Inference Engine* (SLMs 3B-8B quantizados).
  - *pgvector HNSW + tsvector* (RAG Híbrido com RRF no PostgreSQL).
  - *MCP Protocol Sandbox* (Cálculos matemáticos sem alucinação).
  - *FastEmbed CPU Embeddings* (Zero consumo de VRAM de inferência).
- Card de resiliência: demonstração visual de que o sistema continua operando mesmo se o link de internet da escola cair.

### 3.7 `PitchFooter.tsx`
- Selos de conformidade: **MEC** e **100% LGPD**.
- Atalhos rápidos para apresentação dos 3 perfis da plataforma:
  - `[Ambiente do Aluno →]` (`/dashboard`)
  - `[Painel do Professor & Atas →]` (`/reports`)
  - `[Telemetria do Appliance de TI →]` (`/appliance`)

---

## 4. 📐 Design System, Acessibilidade & Clean Code

- **Cores & Tokens:** Uso rigoroso de `brand-teal` (`#0D9488`), `brand-orange` (`#F97316`), `brand-ink` (`#0F172A`) e classes `glass` de `globals.css`.
- **Componentes:** Componentes oficiais shadcn/ui (`Button`, `Card`, `Badge`, `Tabs`, `Slider`, `Progress`).
- **Ícones:** Apenas `lucide-react` (proibido emojis como ícones funcionais).
- **Precisão Financeira:** Cálculos de ROI baseados em `CurrencyMath` / `decimal.js`.
- **Responsividade:** Layout testado e otimizado para mobile (320px), tablet (768px) e desktop (1280px+).

---

## 5. 🚦 Plano de Execução & Tarefas

| Tarefa | Descrição | Responsável | Status |
| :--- | :--- | :--- | :--- |
| **Task 1** | Criar utilitário `src/lib/currency-math.ts` para cálculos de precisão monetária e ROI | `@[backend-specialist]` | ✅ Concluído |
| **Task 2** | Criar `pitch-constants.ts` com dados dos dilemas, 5 agendas, métricas e parâmetros de TCO | `@[frontend-specialist]` | ✅ Concluído |
| **Task 3** | Implementar `PitchHeader.tsx`, `PitchHero.tsx` e `PitchDilemmasSection.tsx` | `@[frontend-specialist]` | ✅ Concluído |
| **Task 4** | Implementar `PitchMultiAgendasShowcase.tsx` e `PitchRoiCalculator.tsx` | `@[frontend-specialist]` | ✅ Concluído |
| **Task 5** | Implementar `PitchHardwareTelemetry.tsx` e `PitchFooter.tsx` | `@[frontend-specialist]` | ✅ Concluído |
| **Task 6** | Montar `PitchPage.tsx` e o thin wrapper `src/app/pitch/page.tsx` | `@[frontend-specialist]` | ✅ Concluído |
| **Task 7** | Validar build (`npm run build`), testes e responsividade visual | `@[security-auditor]` / `@[frontend-specialist]` | ✅ Concluído |
