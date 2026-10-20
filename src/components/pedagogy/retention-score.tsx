import { retentionColor, type RetentionColor } from '@/lib/constants/pedagogy';
import { cn } from '@/lib/utils';

const COLOR_CLASS: Record<RetentionColor, string> = {
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  yellow: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
};

/** Selo percentual colorido pela faixa de retenção/engajamento. */
export function RetentionScore({ score }: { score: number }) {
  const color = retentionColor(score);
  return (
    <span
      data-retention={color}
      className={cn('inline-block rounded-md px-1.5 py-0.5 font-bold text-xs font-mono', COLOR_CLASS[color])}
    >
      {score}%
    </span>
  );
}
