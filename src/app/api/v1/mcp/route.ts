import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { localMcpServer } from '@/lib/mcp/mcp-server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { DomainError } from '@/lib/api/domain-error';

export async function POST(req: NextRequest) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const body = await req.json();
    const { toolName, args } = body;

    if (!toolName) {
      throw new DomainError(400, 'Parâmetro toolName é obrigatório.');
    }

    const result = await localMcpServer.executeTool(toolName, args || {});
    return NextResponse.json({
      success: true,
      toolName,
      result,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireUser(req, [Role.TEACHER, Role.ADMIN]);
    const tools = localMcpServer.listTools();
    return NextResponse.json({
      status: 'online',
      protocol: 'model-context-protocol/v1',
      runtime: 'on-premises-appliance',
      tools,
    });
  } catch (error) {
    return apiError(error);
  }
}
