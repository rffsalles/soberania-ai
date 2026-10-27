import type { ComboboxItem } from '@/components/ui/advanced-combobox';

export type ClientPlanChapter = {
  id: string;
  order: number;
  title: string;
  startPage: number;
  endPage: number | null;
  parentId: string | null;
  depth: number;
  number: string;
};

export type ClientPlanChapterBook = {
  materialId: string;
  title: string;
  author: string;
  kind: 'BASIC' | 'COMPLEMENTARY';
  chapters: ClientPlanChapter[];
};

// em space: não colapsa no HTML
export const CHAPTER_INDENT = '\u2003';

export function chapterToComboboxItem(
  chapter: ClientPlanChapter,
  book: { title: string; author: string },
): ComboboxItem {
  return {
    id: chapter.id,
    title: `${CHAPTER_INDENT.repeat(chapter.depth)}${chapter.number} ${chapter.title}`,
    subtitle: `${book.title} (${book.author})`,
    badge: chapter.endPage != null ? `p. ${chapter.startPage} a ${chapter.endPage}` : `p. ${chapter.startPage}`,
  };
}

export function planChaptersToComboboxItems(books: ClientPlanChapterBook[]): ComboboxItem[] {
  return books.flatMap((book) => book.chapters.map((c) => chapterToComboboxItem(c, book)));
}

function compareNumbers(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number(x) || 0);
  const pb = b.split('.').map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

export function formatChapterShortList(numbers: string[]): string {
  const unique = [...new Set(numbers)].sort(compareNumbers);
  return unique.length ? `Cap. ${unique.join(', ')}` : '—';
}
