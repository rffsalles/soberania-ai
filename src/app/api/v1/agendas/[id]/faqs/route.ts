import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-user';
import { apiError } from '@/lib/api/api-error';
import { FAQ_DEFAULT_LIMIT } from '@/domains/pedagogy/faq-builder';
import { getAgendaFaqs } from '@/domains/pedagogy/services/faq-service';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(req);
    const { id } = await params;
    const raw = new URL(req.url).searchParams.get('limit');
    const faqs = await getAgendaFaqs(user, id, raw ? Number(raw) : FAQ_DEFAULT_LIMIT);
    return NextResponse.json({ success: true, faqs });
  } catch (error) {
    return apiError(error);
  }
}
