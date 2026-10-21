import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/constants/routes';

/** Índice da área do professor. */
export default function TeacherIndex(): never {
  redirect(ROUTES.TEACHER_PLANS);
}
