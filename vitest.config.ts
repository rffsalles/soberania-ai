import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Worktrees aninhados (.claude/worktrees, .worktrees) têm seus próprios testes: não rodar daqui.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '.claude/**', '.worktrees/**', 'worktrees/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
