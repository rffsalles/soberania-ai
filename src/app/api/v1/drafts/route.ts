import path from 'path';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { DomainError } from '@/lib/api/domain-error';
import { DRAFT_ALLOWED_EXTENSIONS } from '@/lib/constants/assessments';
import { listDraftsQuerySchema, submitDraftSchema } from '@/lib/validators/draft.validator';
import { validateFileSafety } from '@/domains/rag/file-parser';
import { listMyDrafts, submitDraft, type DraftInput } from '@/domains/assessments/services/draft-service';

const MULTIPART = 'multipart/form-data';
const INVALID_EXTENSION = `Formato não suportado. Envie ${DRAFT_ALLOWED_EXTENSIONS.join(', ')}.`;

async function readInput(req: Request): Promise<DraftInput> {
  if (!req.headers.get('content-type')?.includes(MULTIPART)) {
    return submitDraftSchema.parse(await req.json());
  }
  const form = await req.formData();
  const { agendaId, content } = submitDraftSchema.parse({
    agendaId: form.get('agendaId') ?? undefined,
    content: typeof form.get('content') === 'string' ? form.get('content') : undefined,
  });
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { agendaId, content };

  const extension = path.extname(file.name).toLowerCase();
  if (!(DRAFT_ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new DomainError(400, INVALID_EXTENSION);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const safety = validateFileSafety(buffer, file.name);
  if (!safety.isValid) throw new DomainError(400, safety.error ?? INVALID_EXTENSION);
  return { agendaId, file: { buffer, name: safety.sanitizedFilename } };
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const result = await submitDraft(user, await readInput(req));
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const { agendaId } = listDraftsQuerySchema.parse({
      agendaId: new URL(req.url).searchParams.get('agendaId') ?? undefined,
    });
    const drafts = await listMyDrafts(user, agendaId);
    return NextResponse.json({ success: true, drafts });
  } catch (error) {
    return apiError(error);
  }
}
