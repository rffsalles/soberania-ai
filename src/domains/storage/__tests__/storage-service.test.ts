import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { storageService } from '../storage-service';
import fs from 'fs';
import path from 'path';

describe('StorageService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('deve utilizar provider local por padrão quando R2 não está configurado', () => {
    delete process.env.STORAGE_PROVIDER;
    delete process.env.R2_ACCOUNT_ID;
    expect(storageService.getProvider()).toBe('local');
  });

  it('deve realizar upload e leitura no fallback local com sucesso', async () => {
    process.env.STORAGE_PROVIDER = 'local';
    const testBuffer = Buffer.from('Conteúdo de teste para upload no storage service', 'utf-8');
    const filename = 'teste-storage.txt';

    const uploadResult = await storageService.uploadFile(testBuffer, filename, 'text/plain');
    expect(uploadResult.provider).toBe('local');
    expect(uploadResult.filePath).toContain('teste-storage.txt');

    const fileResult = await storageService.getFileBuffer(uploadResult.filePath);
    expect(fileResult.buffer.toString('utf-8')).toBe('Conteúdo de teste para upload no storage service');

    // Cleanup
    await storageService.deleteFile(uploadResult.filePath);
  });
});
