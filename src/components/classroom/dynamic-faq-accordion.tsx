'use client';

import * as React from 'react';
import { HelpCircle, BookOpen } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { FAQItem } from '@/domains/pedagogy/faq-builder';

const EMPTY_MESSAGE = 'Ainda não há dúvidas frequentes nesta sessão.';

interface DynamicFaqAccordionProps {
  faqs: FAQItem[];
  isLoading?: boolean;
}

export function DynamicFaqAccordion({ faqs, isLoading = false }: DynamicFaqAccordionProps) {
  return (
    <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-brand-teal">
          <HelpCircle className="h-5 w-5" />
          <CardTitle className="text-base">FAQ Dinâmico do Trecho da Aula</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : faqs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{EMPTY_MESSAGE}</p>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq) => (
              <AccordionItem key={faq.id} value={faq.id}>
                <AccordionTrigger className="text-left text-sm hover:no-underline">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-slate-600 dark:text-slate-300 space-y-2">
                  <p>{faq.shortAnswer}</p>
                  {faq.sourceChapter && (
                    <div className="flex items-center gap-1.5 text-xs text-brand-teal font-medium">
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>{faq.sourceChapter}</span>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
