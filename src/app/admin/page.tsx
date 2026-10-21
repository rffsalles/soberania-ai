import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/constants/routes';

/** Índice da área administrativa. */
export default function AdminIndex(): never {
  redirect(ROUTES.ADMIN_SUBJECTS);
}
