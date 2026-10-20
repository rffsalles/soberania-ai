import { searchDidacticMaterialTool } from './tools/search-material-tool';
import { getLessonFaqsTool } from './tools/faq-tool';
import { registerInteractionTool } from './tools/interaction-tool';
import { generateMinutesTool } from './tools/minutes-tool';
import { ingestDidacticMaterialTool } from './tools/ingest-material-tool';
import type { McpContext } from './mcp-context';

export const MCP_TOOLS = [
  searchDidacticMaterialTool,
  getLessonFaqsTool,
  registerInteractionTool,
  generateMinutesTool,
  ingestDidacticMaterialTool,
];

export const localMcpServer = {
  listTools: () => MCP_TOOLS,
  executeTool: async <T = unknown>(toolName: string, args: Record<string, unknown>, ctx?: McpContext): Promise<T> => {
    const tool = MCP_TOOLS.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Ferramenta MCP '${toolName}' não encontrada no servidor local.`);
    }
    // @ts-expect-error args forwarding
    return (await tool.execute(args, ctx)) as T;
  },
};

export async function callMCPTool(toolName: string, args: Record<string, unknown>, ctx?: McpContext) {
  return await localMcpServer.executeTool(toolName, args, ctx);
}
