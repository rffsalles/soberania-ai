import { describe, it, expect } from 'vitest';
import { localMcpServer } from '../mcp-server';

describe('Local MCP Server', () => {
  it('deve listar todas as ferramentas educacionais registradas', () => {
    const tools = localMcpServer.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(4);
    const names = tools.map((t) => t.name);
    expect(names).toContain('search_didactic_material');
    expect(names).toContain('get_lesson_faqs');
    expect(names).toContain('register_student_interaction');
    expect(names).toContain('generate_class_minutes');
  });

  it('deve executar a tool search_didactic_material com sucesso', async () => {
    const res = await localMcpServer.executeTool<{ chunks: unknown[] }>(
      'search_didactic_material',
      { query: 'JOIN' }
    );
    expect(res.chunks).toBeDefined();
    expect(res.chunks.length).toBeGreaterThan(0);
  });
});
