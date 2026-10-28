'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PlanHeaderControls } from './PlanHeaderControls';
import { PlanBibliographyCard } from './PlanBibliographyCard';
import { PlanUnitsCard } from './PlanUnitsCard';
import { z } from 'zod';
import { planUnitSchema, type PlanUnit } from '@/lib/validators/teaching-plan.validator';
import { PlanEditorForm, type SyllabusSource } from './PlanEditorForm';
import { PlanNdeComplianceCard, hoursMatchWorkload } from './PlanNdeComplianceCard';
import { PlanTelemetryCard } from './PlanTelemetryCard';
import { PlanFooterDock } from './PlanFooterDock';
import { ReferenceSelectionModal } from './ReferenceSelectionModal';
import { DEFAULT_NDE_COMPLIANCE_STATUS } from '@/lib/constants/teaching';
import { API_ROUTES, ROUTES } from '@/lib/constants/routes';
import type {
  OfferingOption,
  DocumentReference,
  NdeComplianceData,
  ReferenceKindValue,
} from '../types';

/**
 * Reabre a bibliografia do plano. Com `plan.references` (materialId + tipo), monta as referências pelo id do acervo;
 * material que saiu do acervo é omitido. Planos antigos, sem `references`, têm o texto "Título (Autor) [Categoria]"
 * casado com o acervo pelo título; o que não existe mais no acervo fica sem id real.
 */
async function restoreReferences(plan: {
  references?: { materialId: string; kind: ReferenceKindValue }[];
  basicBibliography: string[];
  complementaryBiblio: string[];
}): Promise<{ refs: DocumentReference[]; ok: boolean }> {
  const byId = Array.isArray(plan.references) && plan.references.length > 0;
  const parseText = (items: string[], kind: ReferenceKindValue, offset: number): DocumentReference[] =>
    items.map((item, index) => ({
      id: `ref-loaded-${offset + index}`,
      title: item.replace(/\s*\(.*?\).*/, '').trim() || item,
      author: item.match(/\((.*?)\)/)?.[1] || '',
      category: item.match(/\[(.*?)\]/)?.[1] || 'Geral',
      kind,
    }));
  const basic = plan.basicBibliography ?? [];
  // Sempre calculado: se a restauração por id falhar, o texto salvo evita zerar a bibliografia.
  const parsed = [...parseText(basic, 'BASIC', 0), ...parseText(plan.complementaryBiblio ?? [], 'COMPLEMENTARY', basic.length)];
  try {
    const res = await fetch(`${API_ROUTES.LIBRARY}/documents`);
    const data = await res.json();
    const library: DocumentReference[] = data.success && Array.isArray(data.documents) ? data.documents : [];
    if (byId) {
      if (!data.success) return { refs: parsed, ok: false };
      return {
        ok: true,
        refs: plan.references!.flatMap(({ materialId, kind }) => {
          const doc = library.find((d) => d.id === materialId);
          return doc ? [{ ...doc, kind }] : [];
        }),
      };
    }
    return {
      ok: true,
      refs: parsed.map((ref) => {
        const match = library.find((doc) => doc.title.trim().toLowerCase() === ref.title.toLowerCase());
        return match ? { ...ref, id: match.id, author: match.author, category: match.category } : ref;
      }),
    };
  } catch (err) {
    console.warn('Não foi possível conferir as referências no acervo:', err);
    return { refs: parsed, ok: !byId };
  }
}

export default function TeachingPlanNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingPlanId = searchParams.get('id');

  // Ofertas do professor (disciplina + turma + período); a oferta do plano salvo vem de plan.subject.
  const [offerings, setOfferings] = React.useState<OfferingOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = React.useState<string>('');
  const [units, setUnits] = React.useState<PlanUnit[]>([]);
  const [unitsEdited, setUnitsEdited] = React.useState(false);
  const [savedOffering, setSavedOffering] = React.useState<OfferingOption | null>(null);

  // References: Starts clean or loaded from DB
  const [references, setReferences] = React.useState<DocumentReference[]>([]);
  // Enquanto a restauração por id não conclui (ou falhou), não enviamos `references`: omitir mantém os vínculos do banco.
  const [referencesUntrusted, setReferencesUntrusted] = React.useState(false);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  // Form Fields
  const [syllabus, setSyllabus] = React.useState('');
  const [syllabusSource, setSyllabusSource] = React.useState<SyllabusSource>(null);
  const [generalObjectives, setGeneralObjectives] = React.useState('');
  const [bloomBadges, setBloomBadges] = React.useState<string[]>([]);
  const [methodology, setMethodology] = React.useState('');
  const [citations, setCitations] = React.useState<string[]>([]);

  // Conformidade NDE / MEC: a carga total vem da matriz; teórica e prática começam vazias e o professor informa.
  const [ndeCompliance, setNdeCompliance] = React.useState<NdeComplianceData>({
    theoryHours: null,
    practiceHours: null,
    ndeComplianceStatus: DEFAULT_NDE_COMPLIANCE_STATUS,
  });

  // UI Loading & feedback states
  const [isGeneratingAI, setIsGeneratingAI] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [unitsError, setUnitsError] = React.useState<string | null>(null);
  const [saveStatusMessage, setSaveStatusMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch(API_ROUTES.ADMIN_SUBJECTS)
      .then((res) => res.json())
      .then((data) => {
        // Plano novo não pré-seleciona oferta: a escolha é do professor e define o conteúdo gerado.
        if (data.success && Array.isArray(data.subjects) && data.subjects.length > 0) {
          setOfferings(data.subjects);
        }
      })
      .catch((err) => {
        console.warn('Erro ao carregar as ofertas:', err);
      });
  }, [editingPlanId]);

  // Fetch existing plan details if editingPlanId is present
  React.useEffect(() => {
    if (!editingPlanId) return;

    fetch(`${API_ROUTES.TEACHER_PLANS}/${editingPlanId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.plan) {
          const plan = data.plan;
          if (plan.subjectId) setSelectedSubjectId(plan.subjectId);
          if (plan.subject) setSavedOffering(plan.subject);
          if (plan.syllabus) {
            setSyllabus(plan.syllabus);
            setSyllabusSource('saved');
          }
          if (plan.generalObjectives) setGeneralObjectives(plan.generalObjectives);
          if (plan.methodology) setMethodology(plan.methodology);
          const parsedUnits = z.array(planUnitSchema).safeParse(plan.unitsContent);
          setUnits(parsedUnits.success ? parsedUnits.data : []);
          const hasText = (plan.basicBibliography?.length ?? 0) + (plan.complementaryBiblio?.length ?? 0) > 0;
          if (hasText || plan.references?.length > 0) {
            if (plan.references?.length > 0) setReferencesUntrusted(true);
            void restoreReferences({
              references: plan.references,
              basicBibliography: plan.basicBibliography ?? [],
              complementaryBiblio: plan.complementaryBiblio ?? [],
            }).then(({ refs, ok }) => {
              setReferences(refs);
              if (ok) setReferencesUntrusted(false);
            });
          }
          setNdeCompliance({
            theoryHours: plan.theoryHours ?? null,
            practiceHours: plan.practiceHours ?? null,
            ndeComplianceStatus: plan.ndeComplianceStatus || DEFAULT_NDE_COMPLIANCE_STATUS,
          });
        }
      })
      .catch((err) => {
        console.warn('Erro ao carregar dados do plano de ensino:', err);
      });
  }, [editingPlanId]);

  // Na edição, a oferta do plano entra na lista mesmo que a API não a devolva mais.
  const offeringOptions = React.useMemo(() => {
    if (!savedOffering || offerings.some((o) => o.id === savedOffering.id)) return offerings;
    return [savedOffering, ...offerings];
  }, [offerings, savedOffering]);

  const activeOffering = React.useMemo(
    () => offeringOptions.find((o) => o.id === selectedSubjectId) || null,
    [offeringOptions, selectedSubjectId]
  );

  // Gating da IA: exige oferta e ao menos 1 referência
  const isAiLocked = !selectedSubjectId || references.length === 0;

  const lockReason = React.useMemo(() => {
    if (!selectedSubjectId) return 'Selecione uma oferta.';
    if (references.length === 0) return 'Adicione ao menos 1 documento na biblioteca RAG.';
    return undefined;
  }, [selectedSubjectId, references.length]);

  const workloadHours = activeOffering?.discipline.workloadHours ?? null;
  const hoursValid = hoursMatchWorkload(ndeCompliance, workloadHours);

  // As citações refletem a última geração da IA; ao mudar as referências elas deixam de corresponder.
  const updateCitationsFromReferences = (refs: DocumentReference[]) => {
    if (refs.length === 0) setCitations([]);
  };

  // Handler: Add references from modal
  const handleAddReferences = (newRefs: DocumentReference[]) => {
    setReferences((prev) => {
      const existingIds = new Set(prev.map((r) => r.id));
      const filtered = newRefs.filter((r) => !existingIds.has(r.id));
      const updated = [...prev, ...filtered];
      updateCitationsFromReferences(updated);
      return updated;
    });
  };

  // Handler: Remove reference
  const handleRemoveReference = (id: string) => {
    setReferences((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      updateCitationsFromReferences(updated);
      return updated;
    });
  };

  // Handler: AI Generation with RAG
  const handleGenerateAI = async () => {
    if (isAiLocked || !activeOffering) return;

    try {
      setIsGeneratingAI(true);
      const res = await fetch(`${API_ROUTES.TEACHER_PLANS}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId: selectedSubjectId,
          // Referências recarregadas de um plano salvo não têm id de material no acervo.
          selectedReferences: references.map(({ id, title, author, category }) => ({
            id: id.startsWith('ref-loaded-') ? undefined : id,
            title,
            author,
            category,
          })),
        }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        setSyllabus(data.data.syllabus);
        setSyllabusSource('ai');
        setGeneralObjectives(data.data.generalObjectives);
        if (Array.isArray(data.data.bloomLevels)) {
          setBloomBadges(data.data.bloomLevels);
        }
        setMethodology(data.data.methodology);
        setCitations(Array.isArray(data.data.citations) ? data.data.citations : []);
        setSaveStatusMessage(
          data.data.citations?.length > 0
            ? 'Sugestão gerada pela IA com base nos trechos do acervo.'
            : 'Sugestão gerada pela IA. Nenhum trecho indexado foi encontrado para as referências selecionadas.'
        );
      } else {
        setSaveStatusMessage(data.error || 'Falha ao gerar sugestão com a IA.');
      }
      setTimeout(() => setSaveStatusMessage(null), 6000);
    } catch (err) {
      console.error('Falha ao gerar plano com IA:', err);
      setSaveStatusMessage('Falha ao contatar o servidor para gerar a sugestão.');
      setTimeout(() => setSaveStatusMessage(null), 6000);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Handler: Save / Update Plan
  const handleSavePlan = async (status: 'DRAFT' | 'APPROVED') => {
    if (!selectedSubjectId) {
      alert('Por favor, selecione uma oferta.');
      return;
    }

    if (unitsEdited) {
      const emptyIndex = units.findIndex((u) => !u.title.trim());
      if (emptyIndex !== -1) {
        setUnitsError(`Informe o título da unidade ${units[emptyIndex].unitNumber}.`);
        return;
      }
    }
    setUnitsError(null);

    try {
      setIsSaving(true);
      const url = editingPlanId
        ? `${API_ROUTES.TEACHER_PLANS}/${editingPlanId}`
        : API_ROUTES.TEACHER_PLANS;
      const method = editingPlanId ? 'PUT' : 'POST';

      const textOf = (kind: ReferenceKindValue) =>
        references
          .filter((r) => (r.kind ?? 'BASIC') === kind)
          .map((r) => `${r.title} (${r.author}) [${r.category}]`);
      const complementary = references.filter((r) => r.kind === 'COMPLEMENTARY');
      const linkedReferences = references
        .filter((r) => !r.id.startsWith('ref-loaded-'))
        .map((r) => ({ materialId: r.id, kind: r.kind ?? 'BASIC' }));

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingPlanId ? {} : { subjectId: selectedSubjectId }),
          syllabus,
          generalObjectives,
          methodology,
          basicBibliography: textOf('BASIC'),
          // Plano novo sem complementar não envia as chaves; na edição, [] limpa o que havia.
          ...(editingPlanId || complementary.length > 0 ? { complementaryBiblio: textOf('COMPLEMENTARY') } : {}),
          ...(!referencesUntrusted && (editingPlanId || linkedReferences.length > 0) ? { references: linkedReferences } : {}),
          theoryHours: ndeCompliance.theoryHours ?? undefined,
          practiceHours: ndeCompliance.practiceHours ?? undefined,
          ndeComplianceStatus: ndeCompliance.ndeComplianceStatus,
          status,
          ...(unitsEdited
            ? {
                unitsContent: units.map((u) => ({
                  ...u,
                  topics: u.topics.map((t) => t.trim()).filter(Boolean),
                })),
              }
            : {}),
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (status === 'APPROVED') {
          router.push(ROUTES.TEACHER_SCHEDULES);
        } else {
          router.push(ROUTES.TEACHER_PLANS);
        }
      } else {
        alert(data.error || 'Erro ao salvar plano.');
      }
    } catch (err) {
      console.error('Erro ao submeter plano:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 mx-auto space-y-6">
      {/* Header Controls: combobox de oferta + cartão de contexto + gatilho da IA */}
      <PlanHeaderControls
        offerings={offeringOptions}
        selectedOfferingId={selectedSubjectId}
        onSelectOffering={setSelectedSubjectId}
        activeOffering={activeOffering}
        offeringLocked={Boolean(editingPlanId)}
        isAiLocked={isAiLocked}
        lockReason={lockReason}
        isGeneratingAI={isGeneratingAI}
        onGenerateAI={handleGenerateAI}
      />

      {/* Bibliographic References Section (Pre-AI Generation) */}
      <PlanBibliographyCard
        references={references}
        onOpenModal={() => setIsModalOpen(true)}
        onRemoveReference={handleRemoveReference}
      />

      {/* Main Grid: Left Form (2 cols) & Right Telemetry/NDE (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form Fields */}
        <div className="lg:col-span-2 space-y-6">
          <PlanEditorForm
            syllabus={syllabus}
            onChangeSyllabus={(value) => {
              setSyllabus(value);
              setSyllabusSource(value.trim() ? 'edited' : null);
            }}
            syllabusSource={syllabusSource}
            citationsCount={citations.length}
            generalObjectives={generalObjectives}
            onChangeGeneralObjectives={setGeneralObjectives}
            bloomBadges={bloomBadges}
            methodology={methodology}
            onChangeMethodology={setMethodology}
            isAiLocked={isAiLocked}
          />
          {editingPlanId && (
            <PlanUnitsCard
              planId={editingPlanId}
              units={units}
              onChange={(next) => {
                setUnits(next);
                setUnitsEdited(true);
              }}
            />
          )}
        </div>

        {/* Right Column: NDE / Citations & LGPD */}
        <div className="space-y-6">
          <PlanNdeComplianceCard
            data={ndeCompliance}
            workloadHours={workloadHours}
            onChange={setNdeCompliance}
          />

          <PlanTelemetryCard
            citations={citations}
          />
        </div>
      </div>

      {unitsError && (
        <p role="alert" className="text-sm text-danger">
          {unitsError}
        </p>
      )}

      {/* Docked Footer Bar */}
      <PlanFooterDock
        isSaving={isSaving}
        saveStatusMessage={saveStatusMessage}
        onSaveDraft={() => handleSavePlan('DRAFT')}
        onApprove={() => handleSavePlan('APPROVED')}
        canSave={Boolean(selectedSubjectId) && hoursValid}
      />

      {/* Modal de Seleção e Ingestão de Referências Bibliográficas */}
      <ReferenceSelectionModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        alreadySelectedIds={references.map((r) => r.id)}
        onAddReferences={handleAddReferences}
      />
    </div>
  );
}
