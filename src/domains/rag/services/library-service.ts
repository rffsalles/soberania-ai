import { DomainError } from '@/lib/api/domain-error';
import {
  DEFAULT_CATEGORY_COLOR,
  GENERAL_CATEGORY,
  MATERIAL_STATUS,
  type MaterialStatus,
} from '@/lib/constants/library';
import { embedTexts, EmbeddingUnavailableError } from '@/lib/embeddings';
import { storageService } from '@/domains/storage';
import { validateFileSafety, parseDocumentFile } from '../file-parser';
import { documentIngestionService } from '../ingestion';
import type { RawDocumentPage } from '../types';
import * as materialRepo from './material-repository';
import * as chunkRepo from './chunk-repository';
import * as categoryRepo from './category-repository';

type MaterialRecord = Awaited<ReturnType<typeof materialRepo.createMaterial>>;

export interface LibraryDeps {
  storage: { uploadFile(buffer: Buffer, name: string, mime: string): Promise<{ filePath: string }> };
  materials: {
    createMaterial(data: Parameters<typeof materialRepo.createMaterial>[0]): Promise<MaterialRecord>;
    updateMaterialStatus(id: string, status: string): Promise<void>;
    findMaterial(id: string): Promise<{ id: string } | null>;
  };
  chunks: {
    createChunks(materialId: string, chunks: chunkRepo.NewChunk[]): Promise<chunkRepo.StoredChunk[]>;
    setEmbeddings(rows: chunkRepo.ChunkEmbedding[]): Promise<void>;
    listChunksByMaterial(materialId: string): Promise<chunkRepo.StoredChunk[]>;
  };
  categories: { upsertCategoryByName(name: string): Promise<{ id: string } | null> };
  embed(texts: string[]): Promise<number[][]>;
}

const defaultDeps: LibraryDeps = {
  storage: storageService,
  materials: materialRepo,
  chunks: chunkRepo,
  categories: categoryRepo,
  embed: (texts) => embedTexts(texts),
};

export interface UploadMeta {
  title: string;
  author: string;
  edition?: string;
  categories: string[];
}

const SAMPLE_EXCERPT_LENGTH = 160;
const TEXT_FILE_EXTENSION = '.txt';
const TEXT_FILE_FALLBACK_NAME = 'documento';
const TEXT_PAGE_SEPARATOR = '\n\n';

/** Ensures the categories exist and returns the ids of the ones that could be resolved. */
export async function registerCategories(
  names: string[],
  deps: Pick<LibraryDeps, 'categories'> = defaultDeps
): Promise<string[]> {
  const ids: string[] = [];
  for (const name of names) {
    if (name && name !== GENERAL_CATEGORY) {
      const category = await deps.categories.upsertCategoryByName(name);
      if (category) ids.push(category.id);
    }
  }
  return ids;
}

/**
 * Embeds the chunks and stores the vectors. When the embedding provider is unavailable the
 * material stays searchable through full-text only (`INDEXED_LEXICAL_ONLY`).
 */
async function indexEmbeddings(
  materialId: string,
  chunks: chunkRepo.StoredChunk[],
  deps: Pick<LibraryDeps, 'chunks' | 'materials' | 'embed'>
): Promise<MaterialStatus> {
  let status: MaterialStatus = MATERIAL_STATUS.INDEXED;
  if (chunks.length > 0) {
    try {
      const vectors = await deps.embed(chunks.map((c) => c.content));
      await deps.chunks.setEmbeddings(chunks.map((c, i) => ({ id: c.id, embedding: vectors[i] })));
    } catch (err) {
      if (!(err instanceof EmbeddingUnavailableError)) throw err;
      console.warn(
        `[LibraryService] Embeddings indisponíveis para o material ${materialId}; indexado apenas para busca léxica:`,
        err.message
      );
      status = MATERIAL_STATUS.INDEXED_LEXICAL_ONLY;
    }
  }
  await deps.materials.updateMaterialStatus(materialId, status);
  return status;
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

  const categoryIds = await registerCategories(categoriesList, deps);

  // Parse antes do upload: um arquivo sem texto extraível não vira material nem ocupa o storage.
  const parsed = await parseDocumentFile(file.buffer, file.name);
  if (parsed.pages.length === 0) {
    throw new DomainError(400, 'Não foi possível extrair texto do arquivo enviado.');
  }

  const stored = await deps.storage.uploadFile(
    file.buffer,
    validation.sanitizedFilename,
    validation.mimeType
  );

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
    status: MATERIAL_STATUS.PARSING,
    categories: { connect: categoryIds.map((id) => ({ id })) },
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

  let status: MaterialStatus;
  try {
    const storedChunks = await deps.chunks.createChunks(material.id, ingest.createdChunks ?? []);
    status = await indexEmbeddings(material.id, storedChunks, deps);
  } catch (err) {
    await deps.materials.updateMaterialStatus(material.id, MATERIAL_STATUS.ERROR).catch(() => undefined);
    throw err;
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
      ocrPartial: parsed.ocrPartial ?? false,
      status,
      sampleExcerpt: parsed.pages[0]?.text.slice(0, SAMPLE_EXCERPT_LENGTH) + '...',
      createdAt: material.createdAt,
    },
  };
}

/** Re-embeds every chunk of a material (e.g. after the embedding provider comes back). */
export async function reindexMaterial(id: string, deps: LibraryDeps = defaultDeps) {
  const material = await deps.materials.findMaterial(id);
  if (!material) throw new DomainError(404, 'Material não encontrado.');

  const chunks = await deps.chunks.listChunksByMaterial(id);
  const status = await indexEmbeddings(id, chunks, deps);
  return { status, chunks: chunks.length };
}

export interface TextDocumentInput {
  title: string;
  author: string;
  edition?: string;
  categories: string[];
  text?: string;
  pages?: RawDocumentPage[];
}

function textFileName(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${slug || TEXT_FILE_FALLBACK_NAME}${TEXT_FILE_EXTENSION}`;
}

/** Pasted text (or structured pages) is stored as a generated `.txt` file and ingested like any upload. */
export async function ingestTextDocument(input: TextDocumentInput, deps: LibraryDeps = defaultDeps) {
  let content = '';
  if (Array.isArray(input.pages) && input.pages.length > 0) {
    content = input.pages.map((p) => p.text).join(TEXT_PAGE_SEPARATOR);
  } else if (typeof input.text === 'string') {
    content = input.text;
  }
  if (!content.trim()) {
    const categories = input.categories.length > 0 ? input.categories.join(', ') : GENERAL_CATEGORY;
    content = `Documento de referência: ${input.title}, por ${input.author}. Categoria(s): ${categories}.`;
  }

  return uploadAndIngest(
    { buffer: Buffer.from(content, 'utf-8'), name: textFileName(input.title) },
    { title: input.title, author: input.author, edition: input.edition, categories: input.categories },
    deps
  );
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

const sumChunks = (materials: { _count: { chunks: number } }[]) =>
  materials.reduce((acc, m) => acc + m._count.chunks, 0);

export async function getLibraryOverview(filter: { category?: string | null; search?: string | null }) {
  const [materials, dbCategories] = await Promise.all([
    materialRepo.listMaterialsWithSample(),
    categoryRepo.listCategoriesWithCounts(),
  ]);

  const categories: LibraryCategorySummary[] = dbCategories.map((c) => ({
    name: c.name,
    documentCount: c._count.materials,
    chunkCount: sumChunks(c.materials),
  }));

  const uncategorized = materials.filter((m) => m.categories.length === 0);
  if (uncategorized.length > 0) {
    const general = categories.find((c) => c.name === GENERAL_CATEGORY);
    if (general) {
      general.documentCount += uncategorized.length;
      general.chunkCount += sumChunks(uncategorized);
    } else {
      categories.push({
        name: GENERAL_CATEGORY,
        documentCount: uncategorized.length,
        chunkCount: sumChunks(uncategorized),
      });
    }
  }

  let filtered = materials;
  if (filter.category && filter.category !== 'ALL') {
    const wanted = filter.category.toLowerCase();
    filtered = filtered.filter((mat) => {
      const names = mat.categories.length > 0 ? mat.categories.map((c) => c.name) : [mat.subject || GENERAL_CATEGORY];
      return names.some((name) => name.toLowerCase() === wanted);
    });
  }

  let documents: LibraryDocumentSummary[] = filtered.map((mat) => ({
    id: mat.id,
    title: mat.title,
    author: mat.author,
    category: mat.subject || GENERAL_CATEGORY,
    totalChunks: mat._count.chunks,
    sampleExcerpt: mat.chunks[0]
      ? mat.chunks[0].content.slice(0, SAMPLE_EXCERPT_LENGTH) + '...'
      : `${mat.title} (${mat.totalPages} páginas)...`,
  }));
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
  const categories = await categoryRepo.listCategoriesWithCounts();
  return categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    description: cat.description,
    color: cat.color,
    documentCount: cat._count.materials,
    chunkCount: sumChunks(cat.materials),
    createdAt: cat.createdAt,
  }));
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
      originalFilename: m.originalFilename,
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
