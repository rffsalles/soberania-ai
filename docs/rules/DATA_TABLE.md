# Guia de Implementação: Tabelas de Dados (DATA_TABLE)

Este documento estabelece as diretrizes para a criação de tabelas de dados de alta performance e apelo visual premium no ecossistema do **mentoria-fit**. Toda listagem tabular no sistema deve seguir estas regras de layout e comportamento.

---

## 🎨 1. Estética e Glassmorphism Premium

As tabelas de dados devem transmitir modernidade e sofisticação visual. A estrutura padrão deve usar um container do tipo Glass Card para agrupar controles e a tabela:

- **Bordas e Fundos:** Utilize a classe `.glass` no container principal para dar o efeito de translucidez.
- **Divisores Suaves:** As linhas de cabeçalho e corpo da tabela devem usar cores suaves de borda (`border-border` ou `border-white/5` no tema escuro).
- **Hover Micro-interativo:** Linhas tabulares devem possuir um efeito sutil de hover para indicar interatividade (`hover:bg-white/5` ou `hover:bg-slate-900/50`).

```tsx
// Exemplo de estrutura de container premium
<div className="glass w-full rounded-2xl overflow-hidden shadow-xl p-6">
  {/* Filtros e Controles */}
  <div className="flex flex-col md:flex-row gap-4 mb-6">...</div>
  
  {/* Tabela de fato */}
  <Table>...</Table>
</div>
```

---

## 📥 2. Estados e UX (User Experience)

Uma tabela deve tratar elegantemente todas as quatro fases do ciclo de vida dos dados:

1. **Estado de Carregamento (Loading):**
   - NUNCA mostre uma tela em branco ou piscando.
   - Use o componente `<Skeleton>` do Shadcn para renderizar de 3 a 5 linhas falsas de dados enquanto a requisição dinâmica está pendente.
2. **Estado Vazio (Empty State):**
   - Quando o array de dados estiver vazio, exiba uma ilustração minimalista ou um ícone elegante (ex: `InboxIcon` ou `SparklesIcon` do Lucide), acompanhado de um texto descritivo amigável e um botão de ação rápida (ex: "Cadastrar Primeiro Aluno").
3. **Estado de Erro (Error State):**
   - Trate falhas de rede com elegância. Mostre um banner contendo feedback explicativo e um botão para "Tentar Novamente".
4. **Estado de Dados (Data Render):**
   - Exiba a tabela formatada com alinhamento adequado.

---

## 📊 3. Alinhamento de Conteúdo e Moeda

O alinhamento correto dos dados tabulares melhora drasticamente a legibilidade geral:

- **Alinhamento à Esquerda (default):** Texto geral, nomes de alunos, emails, descrições.
- **Alinhamento Central:** Status badges (ex: `PAGO`, `PENDENTE`, `INATIVO`), datas simples, seleções (checkboxes).
- **Alinhamento à Direita:** Números quantitativos, IDs pequenos, contagem de treinos, e **valores monetários**.
- **Valores Monetários:** Todo valor financeiro listado em colunas DEVE ser renderizado exclusivamente por meio do componente `<FormattedCurrency />` para evitar disparidades de formatação manual.

```tsx
{/* Exemplo de coluna de preço alinhada à direita e formatada */}
<TableCell className="text-right font-medium">
  <FormattedCurrency value={invoice.amount} />
</TableCell>
```

---

## 📱 4. Responsividade Extrema

Tabelas em telas móveis costumam quebrar e prejudicar o uso. Siga o protocolo de responsividade:

1. **Scroll Horizontal Controlado:** Envolva o componente `<Table>` com `<div className="w-full overflow-x-auto scrollbar-hide">`. Isso evita que a página inteira estoure a largura do dispositivo móvel.
2. **Ocultamento Oportunista de Colunas:** Colunas secundárias (ex: data de criação, email secundário, etc.) devem ser ocultadas em dispositivos menores usando classes responsivas do Tailwind CSS:
   - Ex: `className="hidden md:table-cell"`.
3. **Colunas Críticas Visíveis:** Mantenha sempre o identificador principal (ex: Nome) e a informação de maior impacto (ex: Valor/Status) visíveis mesmo em dispositivos móveis (`className="table-cell"`).
