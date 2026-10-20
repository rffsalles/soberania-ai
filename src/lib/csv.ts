const BOM = '﻿';
const SEPARATOR = ';';
const LINE_BREAK = '\r\n';
const ARRAY_SEPARATOR = '|';
const QUOTE = '"';
const NEEDS_QUOTING = /[;"\r\n]/;

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = Array.isArray(value) ? value.join(ARRAY_SEPARATOR) : String(value);
  if (!NEEDS_QUOTING.test(text)) return text;
  return `${QUOTE}${text.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}`;
}

/** Serializa linhas em CSV (RFC 4180) com `;`, CRLF e BOM UTF-8 para abrir corretamente no Excel. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return BOM;
  const columns = Object.keys(rows[0]);
  const lines = [
    columns.map(formatCell).join(SEPARATOR),
    ...rows.map((row) => columns.map((col) => formatCell(row[col])).join(SEPARATOR)),
  ];
  return BOM + lines.join(LINE_BREAK);
}
