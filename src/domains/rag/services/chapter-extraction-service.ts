import { Role, type ChapterSource, type Prisma } from '@prisma/client';
import { DomainError } from '@/lib/api/domain-error';
import { loggedStreamChat, type StreamChatFn } from '@/domains/telemetry/services/logged-stream-chat';
import { parseDocumentFile, readPdfNavigation } from '@/domains/rag/file-parser';
import { findMaterial } from '@/domains/rag/services/material-repository';
import { storageService } from '@/domains/storage/storage-service';
import type { PdfNavigation, RawDocumentPage } from '@/domains/rag/types';
import { CHAPTER_TOC_PAGES } from '@/domains/rag/constants';
import {
  alignDraftsToText,
  chunkAssignmentsFromRows,
  draftsToTree,
  findChapterTreeError,
  headingsToDrafts,
  isValidChapterTree,
  normalizeRelinks,
  outlineToDrafts,
  relinkByTitle,
  toChapterRows,
  type ChapterDraft,
  type ChapterNode,
} from '@/domains/rag/chapters';
import {
  buildChapterExtractionMessages,
  parseChapterExtraction,
} from '@/domains/agents/prompts/chapter-extraction-prompt';
import {
  listChapterLinkDetails,
  listChapterLinks,
  listChapters,
  replaceChapters,
  type ChapterDTO,
  type ChapterLinkConflict,
} from '@/domains/rag/services/chapter-repository';
import { collectStream } from '@/domains/agents/collect-stream';

export const CHAPTERS_PDF_ONLY = 'A extração de capítulos está disponível apenas para PDF.';
export const LINKS_CONFLICT_MESSAGE = 'Esta alteração desfaz vínculos de aulas de outros professores.';
export const FORCE_ADMIN_ONLY_MESSAGE = 'Apenas administradores podem forçar a alteração dos capítulos.';

export type ChapterWriteOptions = { user: { id: string; role: Role }; force?: boolean };

export type ChapterExtractionDeps = {
  readNavigation(buffer: Buffer): Promise<PdfNavigation>;
  streamChat: StreamChatFn;
  repo: {
    listChapters: typeof listChapters;
    listChapterLinks: typeof listChapterLinks;
    listChapterLinkDetails: typeof listChapterLinkDetails;
    replaceChapters: typeof replaceChapters;
  };
  materials: {
    findMaterial(id: string): Promise<{
      id: string;
      totalPages: number;
      mimeType: string | null;
      filePath: string;
      originalFilename: string | null;
    } | null>;
  };
  files: { getFileBuffer(path: string): Promise<{ buffer: Buffer }> };
};

export type ExtractionInput = { buffer: Buffer; pages: RawDocumentPage[]; totalPages: number };
export type ChapterSaveResult = { source: ChapterSource | null; chapters: ChapterDTO[]; lostLessonLinks: number };

const defaultDeps: ChapterExtractionDeps = {
  readNavigation: readPdfNavigation,
  streamChat: loggedStreamChat,
  repo: { listChapters, listChapterLinks, listChapterLinkDetails, replaceChapters },
  materials: { findMaterial },
  files: { getFileBuffer: (path) => storageService.getFileBuffer(path) },
};

const EXTRACTION_TEMPERATURE = 0.1;
const EXTRACTION_MAX_TOKENS = 1200;

async function askModel(
  input: ExtractionInput,
  nav: PdfNavigation,
  deps: ChapterExtractionDeps,
): Promise<ChapterNode[] | null> {
  try {
    const tocPages = input.pages.slice(0, CHAPTER_TOC_PAGES).map((p) => ({
      pageNumber: p.pageNumber,
      label: nav.pageLabels?.[p.pageNumber - 1] ?? undefined,
      text: p.text,
    }));
    const messages = buildChapterExtractionMessages({ pages: tocPages, totalPages: input.totalPages });
    const { text, fallback } = await collectStream(deps.streamChat, messages, {
      temperature: EXTRACTION_TEMPERATURE,
      maxTokens: EXTRACTION_MAX_TOKENS,
    });
    return fallback ? null : parseChapterExtraction(text);
  } catch (err) {
    console.warn('[chapters] falha ao extrair capítulos com a IA', err);
    return null;
  }
}

/** Cascata: outline do PDF, títulos no texto, depois IA sobre o sumário, depois nada. Nunca lança. */
export async function extractChapterDrafts(
  input: ExtractionInput,
  deps: ChapterExtractionDeps = defaultDeps,
): Promise<{ source: ChapterSource; tree: ChapterNode[] } | null> {
  let nav: PdfNavigation = { outline: [], pageLabels: null };
  try {
    nav = await deps.readNavigation(input.buffer);
  } catch (err) {
    console.warn('[chapters] falha ao ler a navegação do PDF', err);
  }

  // Ponte da fase 1: extratores planos → árvore sem filhos. Fase 2 troca por extração em árvore.
  const accept = (drafts: ChapterDraft[] | null): ChapterNode[] | null => {
    if (!drafts) return null;
    const tree = draftsToTree(drafts);
    return isValidChapterTree(tree, input.totalPages, 2) ? tree : null;
  };

  const fromOutline = accept(outlineToDrafts(nav.outline));
  if (fromOutline) return { source: 'OUTLINE', tree: fromOutline };

  let fromHeadings: ChapterDraft[] | null = null;
  try {
    fromHeadings = headingsToDrafts(input.pages);
  } catch (err) {
    console.warn('[chapters] falha ao detectar títulos no texto', err);
  }
  const headingsTree = accept(fromHeadings);
  if (headingsTree) return { source: 'HEADINGS', tree: headingsTree };

  const rawAi = await askModel(input, nav, deps);
  let fromAi = rawAi;
  if (rawAi) {
    try {
      fromAi = alignDraftsToText(rawAi, input.pages);
    } catch (err) {
      console.warn('[chapters] Falha ao realinhar capítulos; usando páginas da IA', err);
    }
  }
  const aiTree = accept(fromAi);
  if (aiTree) return { source: 'AI', tree: aiTree };
  return null;
}

async function saveDrafts(
  materialId: string,
  tree: ChapterNode[],
  totalPages: number,
  source: ChapterSource,
  deps: ChapterExtractionDeps,
  opts?: ChapterWriteOptions,
): Promise<ChapterSaveResult> {
  const oldChapters = await deps.repo.listChapters(materialId);
  const oldLinks = await deps.repo.listChapterLinks(materialId);
  const rows = toChapterRows(tree, totalPages);
  const relinked = relinkByTitle(oldChapters, rows, oldLinks);
  const { lostLessonLinks, lostLessonPlanIds } = relinked;
  const relinks = normalizeRelinks(relinked.relinks, rows);
  const assignments = chunkAssignmentsFromRows(rows, totalPages);
  const beforeWrite =
    opts && !opts.force && lostLessonPlanIds.length > 0
      ? async (tx: Prisma.TransactionClient) => {
          const details = await deps.repo.listChapterLinkDetails(materialId, tx);
          const foreign = details.filter((d) => lostLessonPlanIds.includes(d.lessonPlanId) && d.teacherId !== opts.user.id);
          if (foreign.length > 0) {
            const conflicts: ChapterLinkConflict[] = foreign.map((d) => ({
              disciplina: d.disciplina,
              turma: d.turma,
              classNumber: d.classNumber,
              topicTitle: d.topicTitle,
              professor: d.professor,
            }));
            throw new DomainError(409, LINKS_CONFLICT_MESSAGE, conflicts);
          }
        }
      : undefined;
  const chapters = await deps.repo.replaceChapters(materialId, rows, source, relinks, assignments, beforeWrite);
  return { source, chapters, lostLessonLinks };
}

export async function extractAndSaveChapters(
  materialId: string,
  input: ExtractionInput,
  deps: ChapterExtractionDeps = defaultDeps,
  opts?: ChapterWriteOptions,
): Promise<ChapterSaveResult> {
  const found = await extractChapterDrafts(input, deps);
  if (!found) {
    return { source: null, chapters: await deps.repo.listChapters(materialId), lostLessonLinks: 0 };
  }
  return saveDrafts(materialId, found.tree, input.totalPages, found.source, deps, opts);
}

type MaterialRecord = NonNullable<Awaited<ReturnType<ChapterExtractionDeps['materials']['findMaterial']>>>;

async function loadPdfMaterial(materialId: string, deps: ChapterExtractionDeps): Promise<MaterialRecord> {
  const material = await deps.materials.findMaterial(materialId);
  if (!material) throw new DomainError(404, 'Material não encontrado.');
  const isPdf =
    material.mimeType === 'application/pdf' || (material.originalFilename ?? '').toLowerCase().endsWith('.pdf');
  if (!isPdf) throw new DomainError(400, CHAPTERS_PDF_ONLY);
  return material;
}

function assertForceAllowed(opts: ChapterWriteOptions): void {
  if (opts.force && opts.user.role !== Role.ADMIN) throw new DomainError(403, FORCE_ADMIN_ONLY_MESSAGE);
}

export async function reextractMaterialChapters(
  materialId: string,
  opts: ChapterWriteOptions,
  deps: ChapterExtractionDeps = defaultDeps,
): Promise<ChapterSaveResult> {
  assertForceAllowed(opts);
  const material = await loadPdfMaterial(materialId, deps);
  const { buffer } = await deps.files.getFileBuffer(material.filePath);
  const parsed = await parseDocumentFile(buffer, material.originalFilename ?? 'material.pdf', {
    skipOcr: true,
  });
  return extractAndSaveChapters(materialId, { buffer, pages: parsed.pages, totalPages: material.totalPages }, deps, opts);
}

export async function replaceManualChapters(
  materialId: string,
  tree: ChapterNode[],
  opts: ChapterWriteOptions,
  deps: ChapterExtractionDeps = defaultDeps,
): Promise<ChapterSaveResult> {
  assertForceAllowed(opts);
  const material = await loadPdfMaterial(materialId, deps);
  const error = findChapterTreeError(tree, material.totalPages, 0);
  if (error) throw new DomainError(400, error.message);
  return saveDrafts(materialId, tree, material.totalPages, 'MANUAL', deps, opts);
}

export function listMaterialChapters(
  materialId: string,
  deps: ChapterExtractionDeps = defaultDeps,
): Promise<ChapterDTO[]> {
  return deps.repo.listChapters(materialId);
}
