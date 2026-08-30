import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-brand-teal text-white shadow hover:bg-brand-teal/80',
        secondary:
          'border-brand-orange/30 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20',
        destructive:
          'border-destructive/30 bg-destructive/10 text-destructive',
        outline: 'text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700',
        success:
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        amber:
          'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
        teal:
          'border-brand-teal/30 bg-brand-teal/10 text-brand-teal',
        indigo:
          'border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
