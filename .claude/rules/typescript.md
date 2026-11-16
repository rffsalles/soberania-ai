---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.mts"
  - "**/*.cts"
---
# TypeScript rules

- Lint: `npm run lint`.
- Format: no formatter configured.
- Typecheck: `npm run typecheck`. Avoid `any`; prefer explicit types at boundaries.
- Keep modules small and single-purpose. Prefer named exports.
- Do not add dependencies without a clear need.
