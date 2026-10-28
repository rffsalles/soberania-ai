import { describe, it, expect } from 'vitest';
import { formatChatTimestamp } from '../chat-timestamp';

const now = new Date('2026-10-28T15:00:00.000Z');
const tz = 'America/Sao_Paulo';

describe('formatChatTimestamp', () => {
  it('mesmo dia mostra só HH:mm', () => {
    expect(formatChatTimestamp('2026-10-28T22:05:00.000Z', now, tz)).toBe('19:05');
  });
  it('outro dia do mesmo ano inclui dd/MM', () => {
    expect(formatChatTimestamp('2026-10-27T22:05:00.000Z', now, tz)).toBe('27/10 19:05');
  });
  it('outro ano inclui o ano', () => {
    expect(formatChatTimestamp('2025-10-27T22:05:00.000Z', now, tz)).toBe('27/10/2025 19:05');
  });
  it('respeita o fuso (UTC já no dia seguinte, ainda ontem em São Paulo)', () => {
    expect(formatChatTimestamp('2026-10-28T02:30:00.000Z', now, tz)).toBe('27/10 23:30');
  });
});
