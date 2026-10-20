import { describe, it, expect, vi } from 'vitest';
import { Role } from '@prisma/client';
import { localMcpServer } from '../mcp-server';

const generateMinute = vi.hoisted(() => vi.fn());
vi.mock('@/domains/pedagogy/services/minutes-service', () => ({
  generateMinute,
}));

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

  it('generate_class_minutes exige o contexto do usuário autenticado', async () => {
    await expect(localMcpServer.executeTool('generate_class_minutes', { agendaId: 'ag1' })).rejects.toMatchObject({
      status: 401,
    });
  });

  it('generate_class_minutes delega ao service com o usuário do contexto', async () => {
    const user = { id: 't1', role: Role.TEACHER, classId: null };
    generateMinute.mockResolvedValueOnce({ id: 'm1' });
    const res = await localMcpServer.executeTool(
      'generate_class_minutes',
      { agendaId: 'ag1', studentId: 's1' },
      { user }
    );
    expect(res).toEqual({ id: 'm1' });
    expect(generateMinute).toHaveBeenCalledWith(user, {
      agendaId: 'ag1',
      studentId: 's1',
    });
  });

  it('deve executar a tool search_didactic_material com sucesso', async () => {
    const res = await localMcpServer.executeTool<{ chunks: unknown[] }>('search_didactic_material', { query: 'JOIN' });
    expect(res.chunks).toBeDefined();
    expect(res.chunks.length).toBeGreaterThan(0);
  });
});
