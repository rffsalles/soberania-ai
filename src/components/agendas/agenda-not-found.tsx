import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/constants/routes';

interface AgendaNotFoundProps {
  message?: string;
}

export function AgendaNotFound({ message }: AgendaNotFoundProps) {
  return (
    <Card className="rounded-2xl max-w-xl mx-auto">
      <CardHeader>
        <CardTitle>Sessão não encontrada</CardTitle>
        <CardDescription>
          {message ?? 'Esta sessão não existe ou não está disponível para o seu perfil.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href={ROUTES.DASHBOARD}>
          <Button variant="outline">Voltar ao painel</Button>
        </Link>
      </CardContent>
    </Card>
  );
}
