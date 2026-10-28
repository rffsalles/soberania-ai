/** Módulo puro (sem Prisma): também é importado pelo cliente React. */
export type ChapterLabelInput = {
  number: string;
  title: string;
  book: { title: string; author: string };
  startPage: number;
  endPage: number | null;
};

export function formatChapterLabel(c: ChapterLabelInput): string {
  const pages = c.endPage ? `p. ${c.startPage} a ${c.endPage}` : `p. ${c.startPage}`;
  return `Cap. ${c.number}: ${c.title} — ${c.book.title} (${c.book.author}), ${pages}`;
}
