import { describe, it, expect } from 'vitest';
import { resolveMediaType } from '../media-type';

describe('resolveMediaType', () => {
  it('reconhece YouTube', () => {
    expect(resolveMediaType('https://www.youtube.com/watch?v=abcdefghijk')).toBe('YOUTUBE');
    expect(resolveMediaType('https://youtu.be/abcdefghijk')).toBe('YOUTUBE');
  });
  it('reconhece upload pela rota de mídia', () => {
    expect(resolveMediaType('/api/v1/teacher/lessons/l1/media')).toBe('S3_UPLOAD');
  });
  it('retorna NONE para vazio ou desconhecido', () => {
    expect(resolveMediaType(null)).toBe('NONE');
    expect(resolveMediaType(undefined)).toBe('NONE');
    expect(resolveMediaType('https://exemplo.com/video.mp4')).toBe('NONE');
  });
});
