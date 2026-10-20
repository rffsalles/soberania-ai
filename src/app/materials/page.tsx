import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/constants/routes';

/** Rota legada: o acervo agora vive em /teacher/materials. */
export default function LegacyMaterialsPage(): never {
  redirect(ROUTES.TEACHER_MATERIALS);
}
