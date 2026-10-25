import type { PlanOption } from '@/components/assessments/use-assessments';
import type { ComboboxItem } from '@/components/ui/advanced-combobox';

export function planToComboboxItem(p: PlanOption): ComboboxItem {
  const { discipline, class: turma } = p.subject;
  const subtitle = [turma.course?.name, turma.name, turma.academicPeriod?.name].filter(Boolean).join(' · ');
  const split = p.theoryHours != null && p.practiceHours != null ? ` (${p.theoryHours}T/${p.practiceHours}P)` : '';
  return {
    id: p.id,
    title: `${discipline.code} · ${discipline.name}`,
    subtitle: subtitle || undefined,
    badge: p.totalHours != null ? `${p.totalHours}h${split}` : undefined,
  };
}
