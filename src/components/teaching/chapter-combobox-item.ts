import type { ComboboxItem } from '@/components/ui/advanced-combobox';

export type ClientPlanChapterBook = {
  materialId: string;
  title: string;
  author: string;
  kind: 'BASIC' | 'COMPLEMENTARY';
  chapters: { id: string; order: number; title: string; startPage: number; endPage: number | null }[];
};

export function chapterToComboboxItem(
  chapter: { id: string; order: number; title: string; startPage: number; endPage: number | null },
  book: { title: string; author: string },
): ComboboxItem {
  return {
    id: chapter.id,
    title: `Cap. ${chapter.order}: ${chapter.title}`,
    subtitle: `${book.title} (${book.author})`,
    badge: chapter.endPage != null ? `p. ${chapter.startPage} a ${chapter.endPage}` : `p. ${chapter.startPage}`,
  };
}

export function planChaptersToComboboxItems(books: ClientPlanChapterBook[]): ComboboxItem[] {
  return books.flatMap((book) => book.chapters.map((c) => chapterToComboboxItem(c, book)));
}

export function formatChapterShortList(orders: number[]): string {
  const unique = [...new Set(orders)].sort((a, b) => a - b);
  return unique.length ? `Cap. ${unique.join(', ')}` : '—';
}
