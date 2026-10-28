import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Testes nunca herdam a flag de bypass de horário do .env do desenvolvedor; testes que precisam dela usam vi.stubEnv.
    env: { NEXT_PUBLIC_AGENDA_IGNORE_TIME_WINDOW: 'false' },
    // Worktrees aninhados (.claude/worktrees, .worktrees) têm seus próprios testes: não rodar daqui.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '.claude/**', '.worktrees/**', 'worktrees/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
