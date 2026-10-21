import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/constants/routes';

/** Índice sem conteúdo próprio: as agendas deste tipo são listadas no painel. */
export default function Index(): never {
  redirect(ROUTES.DASHBOARD);
}
