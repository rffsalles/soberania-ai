import { db } from '@/lib/db';
import { DEFAULT_CATEGORY_COLOR } from '@/lib/constants/library';
import { DEFAULT_CATEGORIES } from '../default-categories';

export function listCategories() {
  return db.documentCategory.findMany({ orderBy: { name: 'asc' } });
}

export function findCategoryByName(name: string) {
  return db.documentCategory.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });
}

export function createCategory(data: { name: string; description?: string | null; color?: string }) {
  return db.documentCategory.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      color: data.color || DEFAULT_CATEGORY_COLOR,
    },
  });
}

/** Creates the category when no case-insensitive match exists; tolerates creation races. */
export async function upsertCategoryByName(name: string) {
  const existing = await findCategoryByName(name);
  if (existing) return existing;
  return createCategory({ name }).catch(() => null);
}

export async function ensureDefaultCategories() {
  await db.documentCategory.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    skipDuplicates: true,
  });
  return listCategories();
}
