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

export function DynamicFaqAccordion() {
  const faqs = [
    {
      id: 'faq-1',
      question: 'Por que usamos INNER JOIN em vez de WHERE tabelaA.id = tabelaB.id?',
      answer:
        'O INNER JOIN segue o padrão ANSI SQL-92, separando nitidamente a condição de junção estrutural das condições de filtro no WHERE. Isso evita acidentes de produto cartesiano desnecessário e melhora a legibilidade do código.',
      citation: 'Apostila Oficial BD · Cap. 4, pág. 58',
    },
    {
      id: 'faq-2',
      question: 'O que acontece com tuplas sem par no LEFT JOIN?',
      answer:
        'A linha da tabela à esquerda é preservada no resultado. Todos os atributos vindos da tabela à direita que não possuem correspondência são preenchidos com o valor NULL.',
      citation: 'Apostila Oficial BD · Cap. 4, pág. 62',
    },
    {
      id: 'faq-3',
      question: 'Como saber se uma relação está violando a 3ª Forma Normal?',
      answer:
        'Basta verificar se existe dependência transitiva: se a coluna A determina B, e B determina C (onde nem B nem C são chaves primárias), a relação está na 2FN mas NÃO na 3FN.',
      citation: 'Apostila Oficial BD · Cap. 6, pág. 112',
    },
  ];

  return (
    <Card className="rounded-2xl border-slate-200 dark:border-slate-800">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-brand-teal">
          <HelpCircle className="h-5 w-5" />
          <CardTitle className="text-base">FAQ Dinâmico do Trecho da Aula</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq) => (
            <AccordionItem key={faq.id} value={faq.id}>
              <AccordionTrigger className="text-left text-sm hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-slate-600 dark:text-slate-300 space-y-2">
                <p>{faq.answer}</p>
                <div className="flex items-center gap-1.5 text-xs text-brand-teal font-medium">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>{faq.citation}</span>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
