// Módulo puro (sem banco): pode ser importado por componentes de cliente.

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

const LATEX_SYMBOLS: Record<string, string> = {
  times: '×', cdot: '·', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', pm: '±', approx: '≈',
  infty: '∞', pi: 'π', Delta: 'Δ', delta: 'δ', alpha: 'α', beta: 'β', gamma: 'γ', theta: 'θ', lambda: 'λ',
  mu: 'μ', sigma: 'σ', Sigma: 'Σ', sum: 'Σ', in: '∈', to: '→', rightarrow: '→', Rightarrow: '⇒', leftarrow: '←',
};

function wrapIfCompound(expr: string): string {
  const t = expr.trim();
  return /^[\p{L}\p{N}.,]+$/u.test(t) ? t : `(${t})`;
}

/** Converte uma expressão LaTeX simples em notação de texto (3/4, √2, n², ≤). */
function latexToText(expr: string): string {
  let out = expr;
  for (let i = 0; i < 3; i++) {
    out = out
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a: string, b: string) => `${wrapIfCompound(a)}/${wrapIfCompound(b)}`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a: string) => `√${wrapIfCompound(a)}`)
      .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, '$1');
  }
  return out
    .replace(/\^\{?(\d)\}?/g, (_, d: string) => SUPERSCRIPT[d])
    .replace(/\^\{([^{}]*)\}/g, '^$1')
    .replace(/_\{([^{}]*)\}/g, '_$1')
    .replace(/\\(?:left|right)\s*/g, '')
    .replace(/\\[,;:!]\s*/g, ' ')
    .replace(/\\([A-Za-z]+)\s?/g, (_, name: string) => (LATEX_SYMBOLS[name] ? `${LATEX_SYMBOLS[name]} ` : `${name} `))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([)\]},.;])/g, '$1')
    .replace(/([(\[{])\s+/g, '$1')
    .trim();
}

function tableRow(line: string): string {
  const cells = line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
  if (cells.length <= 1) return cells.join('');
  return `${cells[0]}: ${cells.slice(1).join('; ')}`;
}

function convertLine(line: string): string | null {
  if (/^[ \t]*```/.test(line)) return null; // cerca de código
  if (/^[ \t]*([-*_][ \t]*){3,}$/.test(line)) return null; // régua horizontal
  if (/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/.test(line)) return null; // separador de tabela
  if (/^[ \t]*\|.*\|[ \t]*$/.test(line)) return tableRow(line);
  return line
    .replace(/^[ \t]*#{1,6}[ \t]+/, '')
    .replace(/^[ \t]*>[ \t]?/, '')
    .replace(/^[ \t]*[-*•+][ \t]+/, '')
    .replace(/^[ \t]*(\d+)\.[ \t]+/, '$1) ');
}

/**
 * Sanitização determinística da resposta da tutora para texto simples.
 *
 * Os balões do chat renderizam o texto cru (`whitespace-pre-line`), então markdown e LaTeX aparecem como
 * símbolos soltos. Mesmo com TUTOR_STYLE_RULES no prompt o modelo às vezes os usa; aqui eles viram texto:
 * títulos, negrito/itálico, listas, citações em bloco, réguas, código, links, tabelas e fórmulas simples.
 */
export function toPlainText(text: string): string {
  const lines = text.split('\n').map(convertLine).filter((l): l is string => l !== null);
  return lines
    .join('\n')
    .replace(/\\\((.+?)\\\)/gs, (_, m: string) => latexToText(m))
    .replace(/\\\[(.+?)\\\]/gs, (_, m: string) => latexToText(m))
    .replace(/\$\$(.+?)\$\$/gs, (_, m: string) => latexToText(m))
    .replace(/\$(?=\S)([^$\n]+?)(?<=\S)\$/g, (_, m: string) => latexToText(m))
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '$1')
    .replace(/__(?=\S)(.+?)(?<=\S)__/g, '$1')
    .replace(/(^|[^\p{L}\p{N}*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\p{L}\p{N}*])/gmu, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\[([^\]\n]+)\]\((?:https?:\/\/|\/)[^)\s]*\)/g, '$1')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
