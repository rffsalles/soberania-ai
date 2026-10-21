import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgendaType, Role } from '@prisma/client';
import { localMcpServer } from '../mcp-server';

const generateMinute = vi.hoisted(() => vi.fn());
const executeHybridSearch = vi.hoisted(() => vi.fn());
const createInteraction = vi.hoisted(() => vi.fn());
const getAgendaForUser = vi.hoisted(() => vi.fn());
const findStudent = vi.hoisted(() => vi.fn());
vi.mock('@/domains/agendas/services/agenda-service', () => ({ getAgendaForUser }));
vi.mock('@/domains/pedagogy/services/minute-repository', () => ({ findStudent }));
vi.mock('@/domains/pedagogy/services/minutes-service', () => ({
  generateMinute,
}));
vi.mock('@/domains/rag/hybrid-search', () => ({ executeHybridSearch }));
vi.mock('@/domains/pedagogy/services/interaction-repository', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createInteraction,
}));

const teacher = { id: 't1', role: Role.TEACHER, classId: null };
const student = { id: 's1', role: Role.STUDENT, classId: 'c1' };

describe('Local MCP Server', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deve listar todas as ferramentas educacionais registradas', () => {
    const tools = localMcpServer.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(6);
    const names = tools.map((t) => t.name);
    expect(names).toContain('search_didactic_material');
    expect(names).toContain('get_lesson_faqs');
    expect(names).toContain('register_student_interaction');
    expect(names).toContain('generate_class_minutes');
    expect(names).toContain('mcp_math_python_sandbox');
    expect(JSON.parse(JSON.stringify(tools))[0].parameters).toBeDefined();
  });

  it('generate_class_minutes exige o contexto do usuário autenticado', async () => {
    await expect(localMcpServer.executeTool('generate_class_minutes', { agendaId: 'ag1' })).rejects.toMatchObject({
      status: 401,
    });
  });

  it('generate_class_minutes delega ao service com o usuário do contexto', async () => {
    generateMinute.mockResolvedValueOnce({ id: 'm1' });
    const res = await localMcpServer.executeTool(
      'generate_class_minutes',
      { agendaId: 'ag1', studentId: 's1' },
      { user: teacher }
    );
    expect(res).toEqual({ id: 'm1' });
    expect(generateMinute).toHaveBeenCalledWith(teacher, { agendaId: 'ag1', studentId: 's1' });
  });

  it('argumentos inválidos resultam em 400', async () => {
    await expect(
      localMcpServer.executeTool('search_didactic_material', { query: '' }, { user: teacher })
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      localMcpServer.executeTool('search_didactic_material', { query: 'x', topK: 999 }, { user: teacher })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('ferramenta inexistente resulta em 404', async () => {
    await expect(localMcpServer.executeTool('nope', {}, { user: teacher })).rejects.toMatchObject({ status: 404 });
  });

  it('search_didactic_material delega à busca híbrida', async () => {
    executeHybridSearch.mockResolvedValueOnce({ chunks: [{ id: 'c1' }] });
    const res = await localMcpServer.executeTool<{ chunks: unknown[] }>(
      'search_didactic_material',
      { query: 'JOIN' },
      { user: teacher }
    );
    expect(res.chunks).toHaveLength(1);
    expect(executeHybridSearch).toHaveBeenCalledWith(expect.objectContaining({ query: 'JOIN' }));
  });

  it('o schema remove chaves extras', async () => {
    generateMinute.mockResolvedValueOnce({ id: 'm1' });
    await localMcpServer.executeTool('generate_class_minutes', { agendaId: 'ag1', hack: 'x' }, { user: teacher });
    expect(generateMinute).toHaveBeenCalledWith(teacher, { agendaId: 'ag1' });
  });

  const interactionArgs = {
    agendaId: 'ag1',
    studentId: 'other',
    questionText: 'q',
    responseText: 'r',
  };
  const examAgenda = { id: 'ag1', type: AgendaType.EXAM, classId: 'c1' };

  it('register_student_interaction proíbe studentId alheio para STUDENT (403)', async () => {
    await expect(
      localMcpServer.executeTool('register_student_interaction', interactionArgs, { user: student })
    ).rejects.toMatchObject({ status: 403 });
    expect(createInteraction).not.toHaveBeenCalled();
  });

  it('register_student_interaction resolve a agenda no escopo do usuário e deriva o agendaType dela', async () => {
    getAgendaForUser.mockResolvedValueOnce(examAgenda);
    findStudent.mockResolvedValueOnce({ id: 'other', name: 'A', classId: 'c1' });
    createInteraction.mockResolvedValueOnce({ id: 'i1' });
    const res = await localMcpServer.executeTool(
      'register_student_interaction',
      { ...interactionArgs, agendaType: AgendaType.CLASSROOM },
      { user: teacher }
    );
    expect(res).toEqual({ success: true, recordId: 'i1' });
    expect(getAgendaForUser).toHaveBeenCalledWith('ag1', teacher);
    expect(createInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ agendaId: 'ag1', studentId: 'other', agendaType: AgendaType.EXAM })
    );
  });

  it('register_student_interaction propaga 404 de agenda fora do escopo do professor', async () => {
    getAgendaForUser.mockRejectedValueOnce(Object.assign(new Error('Agenda não encontrada.'), { status: 404 }));
    await expect(
      localMcpServer.executeTool('register_student_interaction', interactionArgs, { user: teacher })
    ).rejects.toMatchObject({ status: 404 });
    expect(createInteraction).not.toHaveBeenCalled();
  });

  it('register_student_interaction recusa aluno de outra turma (404)', async () => {
    getAgendaForUser.mockResolvedValueOnce(examAgenda);
    findStudent.mockResolvedValueOnce({ id: 'other', name: 'A', classId: 'c2' });
    await expect(
      localMcpServer.executeTool('register_student_interaction', interactionArgs, { user: teacher })
    ).rejects.toMatchObject({ status: 404 });
    expect(createInteraction).not.toHaveBeenCalled();
  });
});
