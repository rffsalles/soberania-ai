import LiveClassPage from './_components/LiveClassPage';

export default async function TeacherLivePage({ params }: { params: Promise<{ agendaId: string }> }) {
  const { agendaId } = await params;
  return <LiveClassPage agendaId={agendaId} />;
}
