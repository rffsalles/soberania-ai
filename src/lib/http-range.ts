export type ByteRange = { start: number; end: number };

/** `null`: no (usable) single range, serve the whole body. `'unsatisfiable'`: answer 416. */
export type RangeResult = ByteRange | null | 'unsatisfiable';

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * Parses a single-range `Range: bytes=...` header against a known size (RFC 9110).
 * Multi-range and malformed headers are ignored (full body), as the RFC allows.
 */
export function parseRangeHeader(header: string | null | undefined, size: number): RangeResult {
  if (!header) return null;
  const match = SINGLE_RANGE.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return null;

  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (suffix === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(rawStart);
  if (start >= size) return 'unsatisfiable';
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (end < start) return null;
  return { start, end };
}
