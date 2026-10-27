import { z } from 'zod';
import type { ChapterNode } from '@/domains/rag/chapters';
import { CHAPTER_TITLE_MAX, MAX_CHAPTER_DEPTH, MAX_CHAPTER_NODES } from '@/domains/rag/constants';

export type ChapterNodeInput = { title: string; startPage: number; children?: ChapterNodeInput[] };

const chapterNodeSchema: z.ZodType<ChapterNode, z.ZodTypeDef, ChapterNodeInput> = z.lazy(() =>
  z.object({
    title: z.string().trim().min(1).max(CHAPTER_TITLE_MAX),
    startPage: z.number().int().min(1),
    children: z.array(chapterNodeSchema).max(MAX_CHAPTER_NODES).default([]),
  }),
);

function exceedsLimits(roots: ChapterNode[]): boolean {
  let count = 0;
  const stack: Array<{ node: ChapterNode; depth: number }> = roots.map((node) => ({ node, depth: 0 }));
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    count += 1;
    if (count > MAX_CHAPTER_NODES || depth > MAX_CHAPTER_DEPTH) return true;
    for (const child of node.children) stack.push({ node: child, depth: depth + 1 });
  }
  return false;
}

export const materialChaptersSchema: z.ZodType<
  { chapters: ChapterNode[] },
  z.ZodTypeDef,
  { chapters: ChapterNodeInput[] }
> = z
  .object({ chapters: z.array(chapterNodeSchema).max(MAX_CHAPTER_NODES) })
  .superRefine((value, ctx) => {
    if (exceedsLimits(value.chapters)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Árvore de capítulos excede os limites.' });
    }
  });
