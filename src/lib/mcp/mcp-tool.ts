import type { z } from 'zod';
import type { McpContext } from './mcp-context';

/** Ferramenta MCP: `schema` valida os argumentos antes de `execute`; `parameters` é a descrição JSON publicada em listTools. */
export type MCPTool<I = unknown> = {
  name: string;
  description: string;
  schema: z.ZodType<I>;
  parameters: Record<string, unknown>;
  execute(input: I, ctx: McpContext): Promise<unknown>;
};

/** Preserva a tipagem de `I` ao declarar uma ferramenta. */
export function defineMcpTool<I>(tool: MCPTool<I>): MCPTool<I> {
  return tool;
}
