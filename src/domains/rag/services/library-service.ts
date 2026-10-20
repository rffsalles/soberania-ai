import { DomainError } from '@/lib/api/domain-error';
import { DEFAULT_CATEGORY_COLOR, GENERAL_CATEGORY, MATERIAL_STATUS } from '@/lib/constants/library';
import { storageService } from '@/domains/storage';
import { validateFileSafety, parseDocumentFile } from '../file-parser';
import { documentIngestionService } from '../ingestion';
import { getAllCorpusChunks } from '../hybrid-search';
import type { RawDocumentPage } from '../types';
import * as materialRepo from './material-repository';
import * as chunkRepo from './chunk-repository';
import * as categoryRepo from './category-repository';

type MaterialRecord = Awaited<ReturnType<typeof materialRepo.createMaterial>>;

export interface LibraryDeps {
  storage: { uploadFile(buffer: Buffer, name: string, mime: string): Promise<{ filePath: string }> };
  materials: { createMaterial(data: Parameters<typeof materialRepo.createMaterial>[0]): Promise<MaterialRecord> };
  chunks: { createChunks(materialId: string, chunks: chunkRepo.NewChunk[]): Promise<unknown> };
  categories: { upsertCategoryByName(name: string): Promise<unknown> };
}

const defaultDeps: LibraryDeps = {
  storage: storageService,
  materials: materialRepo,
  chunks: chunkRepo,
  categories: categoryRepo,
};

export interface UploadMeta {
  title: string;
  author: string;
  edition?: string;
  categories: string[];
}

const SAMPLE_EXCERPT_LENGTH = 160;

export async function registerCategories(
  names: string[],
  deps: Pick<LibraryDeps, 'categories'> = defaultDeps
) {
  for (const name of names) {
    if (name && name !== GENERAL_CATEGORY) {
      await deps.categories.upsertCategoryByName(name);
    }
  }
}

export async function uploadAndIngest(
  file: { buffer: Buffer; name: string },
  meta: UploadMeta,
  deps: LibraryDeps = defaultDeps
) {
  const title = meta.title.trim();
  const author = meta.author.trim();
  if (!title || !author) {
    throw new DomainError(400, 'Título e Autor são obrigatórios.');
  }

  const validation = validateFileSafety(file.buffer, file.name);
  if (!validation.isValid) {
    throw new DomainError(400, validation.error || 'Arquivo inválido.');
  }

  const categoriesList = meta.categories.map((c) => c.trim()).filter(Boolean);
  if (categoriesList.length === 0) categoriesList.push(GENERAL_CATEGORY);
  const resolvedCategory = categoriesList.join(', ');

  await registerCategories(categoriesList, deps);

  const stored = await deps.storage.uploadFile(
    file.buffer,
    validation.sanitizedFilename,
    validation.mimeType
  );

  const parsed = await parseDocumentFile(file.buffer, file.name);

  const material = await deps.materials.createMaterial({
    title,
    author,
    edition: meta.edition?.trim() || null,
    subject: resolvedCategory,
    totalPages: parsed.totalPages,
    filePath: stored.filePath,
    originalFilename: file.name,
    fileSize: file.buffer.length,
    mimeType: validation.mimeType,
    isOcrApplied: parsed.isOcrApplied,
    status: MATERIAL_STATUS.INDEXED,
  });

  const ingest = documentIngestionService.ingestMaterial({
    id: material.id,
    title: material.title,
    author: material.author,
    edition: material.edition || undefined,
    subject: resolvedCategory,
    materialType: 'BOOK',
    filePath: material.filePath,
    originalFilename: material.originalFilename || undefined,
    fileSize: material.fileSize || undefined,
    mimeType: material.mimeType || undefined,
    isOcrApplied: parsed.isOcrApplied,
    pages: parsed.pages,
  });

  if (ingest.createdChunks && ingest.createdChunks.length > 0) {
    await deps.chunks.createChunks(material.id, ingest.createdChunks).catch((err) => {
      console.warn('[LibraryService] Advertência ao salvar chunks no banco:', err);
    });
  }

  return {
    material: {
      id: material.id,
      title: material.title,
      author: material.author,
      category: material.subject,
      totalPages: material.totalPages,
      totalChunks: ingest.totalChunks,
      fileSize: material.fileSize,
      originalFilename: material.originalFilename,
      isOcrApplied: material.isOcrApplied,
      sampleExcerpt: parsed.pages[0]?.text.slice(0, SAMPLE_EXCERPT_LENGTH) + '...',
      createdAt: material.createdAt,
    },
  };
}

export interface TextDocumentInput {
  title: string;
  author: string;
  edition?: string;
  materialType?: 'BOOK' | 'SCIENTIFIC_PAPER' | 'INSTITUTIONAL_GUIDE';
  categories: string[];
  text?: string;
  pages?: RawDocumentPage[];
}

const TEXT_PAGE_SIZE = 1000;

export async function ingestTextDocument(
  input: TextDocumentInput,
  deps: Pick<LibraryDeps, 'categories'> = defaultDeps
) {
  const categoriesList = input.categories.length > 0 ? input.categories : [GENERAL_CATEGORY];
  const resolvedCategory = categoriesList.join(', ') || GENERAL_CATEGORY;

  await registerCategories(categoriesList, deps);

  let pages: RawDocumentPage[] = [];
  if (Array.isArray(input.pages) && input.pages.length > 0) {
    pages = input.pages;
  } else if (typeof input.text === 'string' && input.text.trim().length > 0) {
    let pageNum = 1;
    for (let i = 0; i < input.text.length; i += TEXT_PAGE_SIZE) {
      pages.push({
        pageNumber: pageNum++,
        chapter: resolvedCategory,
        section: `Página ${pageNum - 1}`,
        text: input.text.slice(i, i + TEXT_PAGE_SIZE),
      });
    }
  } else {
    pages.push({
      pageNumber: 1,
      chapter: resolvedCategory,
      section: 'Documento Completo',
      text: `Documento de referência: ${input.title}, por ${input.author}. Categoria(s): ${resolvedCategory}.`,
    });
  }

  return documentIngestionService.ingestMaterial({
    title: input.title,
    author: input.author,
    edition: input.edition,
    subject: resolvedCategory,
    materialType: input.materialType || 'BOOK',
    pages,
  });
}

export interface LibraryDocumentSummary {
  id: string;
  title: string;
  author: string;
  category: string;
  totalChunks: number;
  sampleExcerpt: string;
}

export interface LibraryCategorySummary {
  name: string;
  documentCount: number;
  chunkCount: number;
}

type CategoryStat = { chunks: number; docIds: Set<string> };

export async function getLibraryOverview(filter: { category?: string | null; search?: string | null }) {
  const docMap = new Map<string, LibraryDocumentSummary>();
  const categoryStats = new Map<string, CategoryStat>();
  const statFor = (name: string) => {
    if (!categoryStats.has(name)) categoryStats.set(name, { chunks: 0, docIds: new Set<string>() });
    return categoryStats.get(name)!;
  };

  for (const chunk of getAllCorpusChunks()) {
    const category = chunk.category || GENERAL_CATEGORY;
    const stat = statFor(category);
    stat.chunks += 1;
    stat.docIds.add(chunk.materialId);

    const existing = docMap.get(chunk.materialId);
    if (existing) {
      existing.totalChunks += 1;
    } else {
      docMap.set(chunk.materialId, {
        id: chunk.materialId,
        title: chunk.bookTitle,
        author: chunk.author,
        category,
        totalChunks: 1,
        sampleExcerpt: chunk.content.slice(0, SAMPLE_EXCERPT_LENGTH) + '...',
      });
    }
  }

  for (const mat of await materialRepo.listMaterialsWithSample()) {
    const category = mat.subject || GENERAL_CATEGORY;
    const stat = statFor(category);
    stat.docIds.add(mat.id);
    if (!docMap.has(mat.id)) {
      stat.chunks += mat._count.chunks;
      docMap.set(mat.id, {
        id: mat.id,
        title: mat.title,
        author: mat.author,
        category,
        totalChunks: mat._count.chunks || 1,
        sampleExcerpt:
          mat.chunks[0]?.content.slice(0, SAMPLE_EXCERPT_LENGTH) ||
          `${mat.title} (${mat.totalPages} páginas)...`,
      });
    }
  }

  for (const dbCat of await categoryRepo.listCategories()) {
    statFor(dbCat.name);
  }

  const categories: LibraryCategorySummary[] = Array.from(categoryStats.entries()).map(
    ([name, stat]) => ({ name, documentCount: stat.docIds.size, chunkCount: stat.chunks })
  );

  let documents = Array.from(docMap.values());
  if (filter.category && filter.category !== 'ALL') {
    const wanted = filter.category.toLowerCase();
    documents = documents.filter((doc) => doc.category.toLowerCase() === wanted);
  }
  if (filter.search) {
    const q = filter.search;
    documents = documents.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q) ||
        doc.author.toLowerCase().includes(q) ||
        doc.category.toLowerCase().includes(q)
    );
  }

  return { categories, documents };
}

export async function listCategoriesWithStats() {
  let categories = await categoryRepo.listCategories();
  // Auto-seed canonical categories if database is empty (Task 11 moves this into the seed)
  if (categories.length === 0) {
    categories = await categoryRepo.ensureDefaultCategories();
  }

  const statsMap = new Map<string, CategoryStat>();
  for (const chunk of getAllCorpusChunks()) {
    const key = (chunk.category || GENERAL_CATEGORY).toLowerCase();
    if (!statsMap.has(key)) statsMap.set(key, { chunks: 0, docIds: new Set<string>() });
    const stat = statsMap.get(key)!;
    stat.chunks += 1;
    stat.docIds.add(chunk.materialId);
  }

  return categories.map((cat) => {
    const stat = statsMap.get(cat.name.toLowerCase());
    return {
      id: cat.id,
      name: cat.name,
      description: cat.description,
      color: cat.color,
      documentCount: stat ? stat.docIds.size : 0,
      chunkCount: stat ? stat.chunks : 0,
      createdAt: cat.createdAt,
    };
  });
}

export async function createCategoryIfMissing(input: {
  name: string;
  description?: string;
  color?: string;
}) {
  const name = input.name.trim();
  const existing = await categoryRepo.findCategoryByName(name);
  if (existing) return { category: existing, created: false };
  const category = await categoryRepo.createCategory({
    name,
    description: input.description?.trim() || null,
    color: input.color || DEFAULT_CATEGORY_COLOR,
  });
  return { category, created: true };
}

export async function listMaterialsWithStats(filter: { category?: string | null; search?: string | null }) {
  const [materials, stats, categories] = await Promise.all([
    materialRepo.listMaterials(filter),
    materialRepo.materialStats(),
    categoryRepo.listCategories(),
  ]);

  return {
    materials: materials.map((m) => ({
      id: m.id,
      title: m.title,
      author: m.author,
      edition: m.edition,
      category: m.subject,
      totalPages: m.totalPages,
      totalChunks: m._count.chunks,
      filePath: m.filePath,
      originalFilename: m.originalFilename || `${m.title}.pdf`,
      fileSize: m.fileSize || 0,
      mimeType: m.mimeType || 'application/pdf',
      isOcrApplied: m.isOcrApplied,
      status: m.status,
      createdAt: m.createdAt,
    })),
    stats,
    categories,
  };
}

export async function removeMaterial(id: string) {
  const material = await materialRepo.findMaterial(id);
  if (!material) throw new DomainError(404, 'Material não encontrado.');

  if (material.filePath) {
    await storageService.deleteFile(material.filePath).catch((err) => {
      console.warn('[LibraryService] Advertência ao remover arquivo do storage:', err);
    });
  }
  // Associated chunks are removed by onDelete: Cascade
  await materialRepo.deleteMaterial(id);
}

export async function getMaterialDownload(id: string) {
  const material = await materialRepo.findMaterial(id);
  if (!material) throw new DomainError(404, 'Material didático não encontrado.');

  let file;
  try {
    file = await storageService.getFileBuffer(material.filePath);
  } catch (err) {
    console.warn('[LibraryService] Erro ao buscar arquivo no storage:', err);
    throw new DomainError(
      404,
      'Arquivo do material não encontrado no repositório de armazenamento.'
    );
  }

  const filename = (material.originalFilename || `${material.title}.pdf`).replace(/"/g, '');
  return {
    buffer: file.buffer,
    filename,
    contentType: material.mimeType || file.contentType || 'application/octet-stream',
  };
}
