---
description: Next.js coding standards and anti-patterns
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# Next.js — Coding Standards

**Sources:** Vercel/Next.js official docs · nextjs.org

## Anti-patterns

| Forbidden | Alternative |
|-----------|-------------|
| Unnecessary `"use client"` at the top | Server Components by default; client only for interactivity |
| Native HTML `<img>` | `next/image` for automatic optimization |
| Fonts without `next/font` | `next/font` eliminates layout shift and auto-optimizes |
| `fetch` without a cache policy | Explicitly define `cache: 'force-cache'`, `'no-store'` or `revalidate` |
| `useSearchParams` outside `<Suspense>` | Wrap in `<Suspense fallback={...}>` |
| Data fetched in a Client Component that could be a Server Component | Move fetch to a Server Component and pass as prop |
| Server Action added for a mutation | Mutations go through Route Handlers in `src/app/api/v1/<recurso>/route.ts` (root CLAUDE.md Conventions) |
| `getServerSideProps` (Pages Router) in new code | App Router with Server Components |
| `cookies()`/`headers()` in the root layout component | Dynamic functions only where necessary |

## Conventions

- `app/` router (App Router) in new projects — not Pages Router
- Layout: shared `layout.tsx` · `page.tsx` per route · `loading.tsx` and `error.tsx` per segment
- Metadata: `export const metadata` or `generateMetadata()` in each `page.tsx`
- Images: always define `width` and `height` on `<Image>` or use `fill` with a positioned container
- Environment variables: `NEXT_PUBLIC_` only for what must reach the client; others remain server-only
- Middleware in `src/middleware.ts`, function `middleware()`. When migrating to Next 16: rename to `proxy.ts` and `proxy()`

## Tooling

- ESLint via `.eslintrc.json` and `next lint` (Next 15); flat config (`eslint.config.mjs`, `@next/eslint-plugin-next`) only on upgrade to Next 16, where `next lint` was removed
- `@next/bundle-analyzer` to inspect the bundle
- Vercel Speed Insights + Web Analytics for production metrics
