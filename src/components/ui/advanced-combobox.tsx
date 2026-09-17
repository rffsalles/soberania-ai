'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Search, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface ComboboxItem {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;
}

export { AdvancedMultiCombobox } from './advanced-multi-combobox';
export type { AdvancedMultiComboboxProps } from './advanced-multi-combobox';

export interface AdvancedComboboxProps {
  id?: string;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  items: ComboboxItem[];
  selectedId: string | null;
  onSelect: (id: string, item?: ComboboxItem) => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  addNewLabel?: string;
  onAddNewClick?: () => void;
}

export function AdvancedCombobox({
  id,
  label,
  placeholder = 'Selecione uma opção...',
  searchPlaceholder = 'Pesquisar...',
  emptyMessage = 'Nenhum resultado encontrado.',
  items,
  selectedId,
  onSelect,
  icon,
  disabled = false,
  className,
  addNewLabel,
  onAddNewClick,
}: AdvancedComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const uniqueItems = React.useMemo(() => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [items]);

  const selectedItem = React.useMemo(() => {
    return uniqueItems.find((item) => item.id === selectedId) || null;
  }, [uniqueItems, selectedId]);

  const filteredItems = React.useMemo(() => {
    if (!searchQuery.trim()) return uniqueItems;
    const query = searchQuery.toLowerCase().trim();
    return uniqueItems.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(query);
      const matchSubtitle = item.subtitle ? item.subtitle.toLowerCase().includes(query) : false;
      const matchBadge = item.badge ? item.badge.toLowerCase().includes(query) : false;
      return matchTitle || matchSubtitle || matchBadge;
    });
  }, [uniqueItems, searchQuery]);

  const handleSelectItem = (item: ComboboxItem) => {
    onSelect(item.id, item);
    setOpen(false);
    setSearchQuery('');
  };

  const handleAddNew = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    if (onAddNewClick) {
      onAddNewClick();
    }
  };

  return (
    <div className={cn('space-y-1.5 w-full', className)}>
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
        >
          {icon}
          <span>{label}</span>
        </label>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'w-full justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-left text-xs sm:text-sm font-normal cursor-pointer hover:border-brand-teal/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 min-h-[44px]',
              !selectedItem && 'text-slate-400'
            )}
          >
            <div className="flex flex-col items-start truncate text-left pr-2">
              {selectedItem ? (
                <>
                  <span className="font-semibold text-slate-900 dark:text-white truncate">
                    {selectedItem.title}
                  </span>
                  {selectedItem.subtitle && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {selectedItem.subtitle}
                    </span>
                  )}
                </>
              ) : (
                <span>{placeholder}</span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-50 overflow-hidden"
          align="start"
          onWheel={(e) => e.stopPropagation()}
        >
          {/* Search Input Box */}
          <div className="flex items-center border-b border-slate-200 dark:border-slate-800 px-3 py-2 bg-slate-50/50 dark:bg-slate-950/50">
            <Search className="h-4 w-4 shrink-0 text-slate-400 mr-2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 border-none bg-transparent text-xs sm:text-sm focus-visible:ring-0 focus-visible:ring-offset-0 px-0 shadow-none"
            />
          </div>

          {/* Results List */}
          <div
            className="max-h-60 overflow-y-auto overscroll-contain p-1.5 space-y-1"
            onWheel={(e) => e.stopPropagation()}
          >
            {filteredItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                {emptyMessage}
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectItem(item)}
                    className={cn(
                      'w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-colors cursor-pointer text-xs sm:text-sm',
                      isSelected
                        ? 'bg-brand-teal/10 text-brand-teal font-medium dark:bg-brand-teal/20'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                    )}
                  >
                    <div className="flex flex-col truncate pr-2">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">
                        {item.title}
                      </span>
                      {item.subtitle && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {item.subtitle}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {item.badge && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 h-5"
                        >
                          {item.badge}
                        </Badge>
                      )}
                      {isSelected && (
                        <Check className="h-4 w-4 text-brand-teal" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Inline Action Footer: Add New Record Modal Trigger */}
          {onAddNewClick && (
            <div className="p-1.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddNew}
                className="w-full justify-start text-xs font-semibold text-brand-teal hover:text-brand-teal-dark hover:bg-brand-teal/10 gap-2 cursor-pointer rounded-lg h-9"
              >
                <PlusCircle className="h-4 w-4 shrink-0 text-brand-teal" />
                <span>{addNewLabel || 'Adicionar novo registro...'}</span>
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
