export type OfferingLabelInput = {
  discipline: { code: string; name: string };
  class: { semester: number; course: { code: string; academicLevel: string }; academicPeriod: { code: string } };
};

/** Rótulo único de oferta (código · disciplina · posição curso · período), usado pela UI do professor. */
export function formatOfferingLabel(offering: OfferingLabelInput): string {
  const { discipline, class: turma } = offering;
  const level = turma.course.academicLevel;
  const unit = level === 'HIGH_SCHOOL' || level === 'ELEMENTARY' ? 'Ano' : 'Sem';
  return `${discipline.code} · ${discipline.name} · ${turma.semester}º ${unit} ${turma.course.code} · ${turma.academicPeriod.code}`;
}
