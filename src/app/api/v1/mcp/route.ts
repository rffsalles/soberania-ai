import { NextRequest, NextResponse } from 'next/server';
import { localMcpServer } from '@/lib/mcp/mcp-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { toolName, args } = body;

    if (!toolName) {
      return NextResponse.json(
        { error: 'Parâmetro toolName é obrigatório.' },
        { status: 400 }
      );
    }

    const result = await localMcpServer.executeTool(toolName, args || {});
    return NextResponse.json({
      success: true,
      toolName,
      result,
    });
  } catch (error) {
    console.error('Erro na execução da MCP Tool:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Erro ao executar ferramenta MCP.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const tools = localMcpServer.listTools();
  return NextResponse.json({
    status: 'online',
    protocol: 'model-context-protocol/v1',
    runtime: 'on-premises-appliance',
    tools,
  });
}
