import { DomainError } from '@/lib/api/domain-error';
import { searchDidacticMaterialTool } from './tools/search-material-tool';
import { getLessonFaqsTool } from './tools/faq-tool';
import { registerInteractionTool } from './tools/interaction-tool';
import { generateMinutesTool } from './tools/minutes-tool';
import { ingestDidacticMaterialTool } from './tools/ingest-material-tool';
import { pythonSandboxTool } from './tools/python-sandbox-tool';
import type { McpContext } from './mcp-context';
import type { MCPTool } from './mcp-tool';

const MISSING_CONTEXT_MESSAGE = 'Contexto de usuário ausente para a ferramenta MCP.';
const INVALID_ARGS_MESSAGE = 'Argumentos inválidos.';

export const MCP_TOOLS: MCPTool<any>[] = [
  searchDidacticMaterialTool,
  getLessonFaqsTool,
  registerInteractionTool,
  generateMinutesTool,
  ingestDidacticMaterialTool,
  pythonSandboxTool,
];

export const localMcpServer = {
  /** Descrição pública das ferramentas (sem o schema Zod, que não é serializável). */
  listTools: () => MCP_TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters })),
  executeTool: async <T = unknown>(toolName: string, args: Record<string, unknown>, ctx?: McpContext): Promise<T> => {
    const tool = MCP_TOOLS.find((t) => t.name === toolName);
    if (!tool) {
      throw new DomainError(404, `Ferramenta MCP '${toolName}' não encontrada no servidor local.`);
    }
    if (!ctx?.user) throw new DomainError(401, MISSING_CONTEXT_MESSAGE);
    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) {
      throw new DomainError(400, parsed.error.issues[0]?.message ?? INVALID_ARGS_MESSAGE);
    }
    return (await tool.execute(parsed.data, ctx)) as T;
  },
};

export async function callMCPTool(toolName: string, args: Record<string, unknown>, ctx?: McpContext) {
  return await localMcpServer.executeTool(toolName, args, ctx);
}
