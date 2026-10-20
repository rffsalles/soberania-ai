import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface AdaptiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function AdaptiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: AdaptiveModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-print-root className={cn('max-h-[90vh] overflow-y-auto border-brand-orange/30', className)}>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold font-heading text-slate-900 dark:text-white">
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="py-2">{children}</div>
        {footer && <DialogFooter className="gap-2 mt-4">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
