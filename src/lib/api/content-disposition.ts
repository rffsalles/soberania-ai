const COMBINING_MARKS = /[\u0300-\u036f]/g;
const NOT_SAFE_ASCII = /[^\x20-\x7e]|["\\]/g;
const RFC5987_RESERVED = /[!'()*]/g;

/**
 * `Content-Disposition: attachment` aceito por qualquer nome de arquivo: `filename=` ASCII de fallback
 * (acentos removidos, demais caracteres viram `_`) e `filename*=UTF-8''` com o nome original (RFC 6266/5987).
 * Sem isso, caracteres fora do Latin-1 (ex.: `—`, `“`) fazem `Headers` lançar e a rota responder 500.
 */
export function attachmentDisposition(filename: string): string {
  const ascii = filename.normalize('NFD').replace(COMBINING_MARKS, '').replace(NOT_SAFE_ASCII, '_');
  const encoded = encodeURIComponent(filename).replace(
    RFC5987_RESERVED,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
