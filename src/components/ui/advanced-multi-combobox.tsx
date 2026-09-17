'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Search, PlusCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { ComboboxItem } from './advanced-combobox';

export interface AdvancedMultiComboboxProps {
  id?: string;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  items: ComboboxItem[];
  selectedIds: string[];
  onSelectionChange: (selectedIds: string[], selectedItems: ComboboxItem[]) => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  addNewLabel?: string;
  onAddNewClick?: () => void;
  maxDisplayCount?: number;
}

export function AdvancedMultiCombobox({
  id,
  label,
  placeholder = 'Selecione uma ou mais opções...',
  searchPlaceholder = 'Pesquisar...',
  emptyMessage = 'Nenhum resultado encontrado.',
  items,
  selectedIds,
  onSelectionChange,
  icon,
  disabled = false,
  className,
  addNewLabel,
  onAddNewClick,
  maxDisplayCount = 2,
}: AdvancedMultiComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const generatedId = React.useId();
  const listboxId = `${id || generatedId}-listbox`;

  const uniqueItems = React.useMemo(() => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [items]);

  const uniqueSelectedIds = React.useMemo(() => {
    return Array.from(new Set(selectedIds || []));
  }, [selectedIds]);

  const selectedItems = React.useMemo(() => {
    const selectedSet = new Set(uniqueSelectedIds);
    return uniqueItems.filter((item) => selectedSet.has(item.id));
  }, [uniqueItems, uniqueSelectedIds]);

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

  const handleToggleItem = (item: ComboboxItem) => {
    const isSelected = uniqueSelectedIds.includes(item.id);
    let newIds: string[];
    let newItems: ComboboxItem[];

    if (isSelected) {
      newIds = uniqueSelectedIds.filter((id) => id !== item.id);
      newItems = selectedItems.filter((i) => i.id !== item.id);
    } else {
      newIds = [...uniqueSelectedIds, item.id];
      newItems = [...selectedItems, item];
    }

    onSelectionChange(newIds, newItems);
  };

  const handleRemoveChip = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    const newIds = uniqueSelectedIds.filter((id) => id !== itemId);
    const newItems = selectedItems.filter((i) => i.id !== itemId);
    onSelectionChange(newIds, newItems);
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange([], []);
  };

  const handleAddNew = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    if (onAddNewClick) {
      onAddNewClick();
    }
  };

  const displayedChips = selectedItems.slice(0, maxDisplayCount);
  const hiddenCount = selectedItems.length - maxDisplayCount;

  return (
    <div className={cn('space-y-1.5 w-full', className)}>
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
        >
          {icon}
          <span>{label}</span>
          {uniqueSelectedIds.length > 0 && (
            <span className="text-[10px] font-normal text-slate-500">
              ({uniqueSelectedIds.length} selecionado{uniqueSelectedIds.length > 1 ? 's' : ''})
            </span>
          )}
        </label>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div
            id={id}
            role="combobox"
            tabIndex={disabled ? -1 : 0}
            aria-expanded={open}
            aria-controls={listboxId}
            aria-disabled={disabled}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                e.preventDefault();
                setOpen((prev) => !prev);
              }
            }}
            className={cn(
              'w-full justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-left text-xs sm:text-sm font-normal cursor-pointer hover:border-brand-teal/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 min-h-[44px] h-auto flex items-center flex-wrap gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/40 transition-all select-none',
              disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
              selectedItems.length === 0 && 'text-slate-400'
            )}
          >
            <div className="flex flex-wrap items-center gap-1.5 flex-1 py-0.5">
              {selectedItems.length === 0 ? (
                <span className="text-slate-400">{placeholder}</span>
              ) : (
                <>
                  {displayedChips.map((item) => (
                    <Badge
                      key={item.id}
                      variant="secondary"
                      className="text-xs px-2 py-0.5 bg-brand-teal/10 text-brand-teal border border-brand-teal/20 flex items-center gap-1 font-medium max-w-[200px] truncate"
                    >
                      <span className="truncate">{item.title}</span>
                      <button
                        type="button"
                        onClick={(e) => handleRemoveChip(e, item.id)}
                        className="rounded-full p-0.5 hover:bg-brand-teal/20 text-brand-teal cursor-pointer"
                        aria-label={`Remover ${item.title}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  {hiddenCount > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[11px] px-1.5 py-0.5 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                    >
                      +{hiddenCount} mais
                    </Badge>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-1">
              {uniqueSelectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                  title="Limpar seleção"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          </div>
        </PopoverTrigger>

        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[320px] p-0 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-50 overflow-hidden"
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
            id={listboxId}
            role="listbox"
            className="max-h-60 overflow-y-auto overscroll-contain p-1.5 space-y-1"
            onWheel={(e) => e.stopPropagation()}
          >
            {filteredItems.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                {emptyMessage}
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = uniqueSelectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleToggleItem(item)}
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
                      <div
                        className={cn(
                          'h-4 w-4 rounded border flex items-center justify-center transition-colors',
                          isSelected
                            ? 'bg-brand-teal border-brand-teal text-white'
                            : 'border-slate-300 dark:border-slate-700'
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
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
