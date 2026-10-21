import { z } from 'zod';
import { runPython, PYTHON_SANDBOX_MAX_CODE_CHARS } from '@/lib/sandbox/python-sandbox';
import { defineMcpTool } from '../mcp-tool';

const schema = z.object({ code: z.string().min(1).max(PYTHON_SANDBOX_MAX_CODE_CHARS) });

export const pythonSandboxTool = defineMcpTool({
  name: 'mcp_math_python_sandbox',
  description:
    'Executa um trecho de Python puro (sem bibliotecas externas, com limites de tempo, memória e saída) para cálculos matemáticos. Desabilitado por padrão.',
  schema,
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Código Python a executar.', maxLength: PYTHON_SANDBOX_MAX_CODE_CHARS },
    },
    required: ['code'],
  },
  execute: (input) => runPython(input.code),
});
