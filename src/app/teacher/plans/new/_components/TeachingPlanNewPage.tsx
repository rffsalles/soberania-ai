'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PlanHeaderControls } from './PlanHeaderControls';
import { PlanBibliographyCard } from './PlanBibliographyCard';
import { PlanEditorForm, type SyllabusSource } from './PlanEditorForm';
import { PlanNdeComplianceCard } from './PlanNdeComplianceCard';
import { PlanTelemetryCard } from './PlanTelemetryCard';
import { PlanFooterDock } from './PlanFooterDock';
import { ReferenceSelectionModal } from './ReferenceSelectionModal';
import { DEFAULT_NDE_COMPLIANCE_STATUS } from '@/lib/constants/teaching';
import type {
  SubjectOption,
  AcademicPeriodOption,
  DocumentReference,
  NdeComplianceData,
} from '../types';

/**
 * A bibliografia é salva como texto "Título (Autor) [Categoria]"; ao reabrir o plano, procura cada obra no acervo
 * pelo título para recuperar o material real (id, autor, categoria). O que não existe mais no acervo fica sem id.
 */
async function restoreReferences(bibliography: string[]): Promise<DocumentReference[]> {
  const parsed = bibliography.map((item, index) => ({
    id: `ref-loaded-${index}`,
    title: item.replace(/\s*\(.*?\).*/, '').trim() || item,
    author: item.match(/\((.*?)\)/)?.[1] || '',
    category: item.match(/\[(.*?)\]/)?.[1] || 'Geral',
  }));
  try {
    const res = await fetch('/api/v1/library/documents');
    const data = await res.json();
    const library: DocumentReference[] = data.success && Array.isArray(data.documents) ? data.documents : [];
    return parsed.map((ref) => {
      const match = library.find((doc) => doc.title.trim().toLowerCase() === ref.title.toLowerCase());
      return match ? { ...ref, id: match.id, author: match.author, category: match.category } : ref;
    });
  } catch (err) {
    console.warn('Não foi possível conferir as referências no acervo:', err);
    return parsed;
  }
}

export default function TeachingPlanNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingPlanId = searchParams.get('id');

  // Dynamic Subjects & Academic Periods from DB
  const [subjects, setSubjects] = React.useState<SubjectOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = React.useState<string>('');

  const [periods, setPeriods] = React.useState<AcademicPeriodOption[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = React.useState<string>('');

  // References: Starts clean or loaded from DB
  const [references, setReferences] = React.useState<DocumentReference[]>([]);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  // Form Fields
  const [syllabus, setSyllabus] = React.useState('');
  const [syllabusSource, setSyllabusSource] = React.useState<SyllabusSource>(null);
  const [generalObjectives, setGeneralObjectives] = React.useState('');
  const [bloomBadges, setBloomBadges] = React.useState<string[]>([]);
  const [methodology, setMethodology] = React.useState('');
  const [citations, setCitations] = React.useState<string[]>([]);

  // Conformidade NDE / MEC: valores iniciais do formulário, editáveis pelo professor antes de salvar.
  const [ndeCompliance, setNdeCompliance] = React.useState<NdeComplianceData>({
    totalHours: 80,
    theoryHours: 60,
    practiceHours: 20,
    ndeComplianceStatus: DEFAULT_NDE_COMPLIANCE_STATUS,
  });

  // UI Loading & feedback states
  const [isGeneratingAI, setIsGeneratingAI] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveStatusMessage, setSaveStatusMessage] = React.useState<string | null>(null);

  // Fetch initial subjects and academic periods on mount
  React.useEffect(() => {
    // 1. Fetch Subjects
    fetch('/api/v1/admin/subjects')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.subjects) && data.subjects.length > 0) {
          setSubjects(data.subjects);
          if (!editingPlanId) {
            setSelectedSubjectId(data.subjects[0].id);
          }
        }
      })
      .catch((err) => {
        console.warn('Erro ao carregar catálogo de disciplinas:', err);
      });

    // 2. Fetch Academic Periods
    fetch('/api/v1/academic-periods')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.periods) && data.periods.length > 0) {
          setPeriods(data.periods);
          if (!editingPlanId) {
            setSelectedPeriodId(data.periods[0].id);
          }
        }
      })
      .catch((err) => {
        console.warn('Erro ao carregar períodos letivos:', err);
      });
  }, [editingPlanId]);

  // Fetch existing plan details if editingPlanId is present
  React.useEffect(() => {
    if (!editingPlanId) return;

    fetch(`/api/v1/teacher/plans/${editingPlanId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.plan) {
          const plan = data.plan;
          if (plan.subjectId) setSelectedSubjectId(plan.subjectId);
          if (plan.academicPeriodId) setSelectedPeriodId(plan.academicPeriodId);
          if (plan.syllabus) {
            setSyllabus(plan.syllabus);
            setSyllabusSource('saved');
          }
          if (plan.generalObjectives) setGeneralObjectives(plan.generalObjectives);
          if (plan.methodology) setMethodology(plan.methodology);
          if (Array.isArray(plan.basicBibliography) && plan.basicBibliography.length > 0) {
            void restoreReferences(plan.basicBibliography).then(setReferences);
          }
          setNdeCompliance({
            totalHours: plan.totalHours ?? 0,
            theoryHours: plan.theoryHours ?? 0,
            practiceHours: plan.practiceHours ?? 0,
            ndeComplianceStatus: plan.ndeComplianceStatus || DEFAULT_NDE_COMPLIANCE_STATUS,
          });
        }
      })
      .catch((err) => {
        console.warn('Erro ao carregar dados do plano de ensino:', err);
      });
  }, [editingPlanId]);

  // Active Subject details
  const activeSubject = React.useMemo(() => {
    return subjects.find((s) => s.id === selectedSubjectId) || null;
  }, [subjects, selectedSubjectId]);

  // Active Period details
  const activePeriod = React.useMemo(() => {
    return periods.find((p) => p.id === selectedPeriodId) || null;
  }, [periods, selectedPeriodId]);

  // Gating AI Generation: requires subject, period and at least 1 reference
  const isAiLocked = !selectedSubjectId || !selectedPeriodId || references.length === 0;

  const lockReason = React.useMemo(() => {
    if (!selectedSubjectId) return 'Selecione uma disciplina vinculada.';
    if (!selectedPeriodId) return 'Selecione o período letivo.';
    if (references.length === 0) return 'Adicione ao menos 1 documento na biblioteca RAG.';
    return undefined;
  }, [selectedSubjectId, selectedPeriodId, references.length]);

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

  // Handler: Add newly created period
  const handlePeriodCreated = (newPeriod: AcademicPeriodOption) => {
    setPeriods((prev) => [newPeriod, ...prev]);
  };

  // Handler: AI Generation with RAG
  const handleGenerateAI = async () => {
    if (isAiLocked || !activeSubject) return;

    try {
      setIsGeneratingAI(true);
      const res = await fetch('/api/v1/teacher/plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectName: activeSubject.name,
          courseName: activeSubject.courseName,
          academicPeriod: activePeriod?.name,
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
      alert('Por favor, selecione uma disciplina.');
      return;
    }

    try {
      setIsSaving(true);
      const url = editingPlanId
        ? `/api/v1/teacher/plans/${editingPlanId}`
        : '/api/v1/teacher/plans';
      const method = editingPlanId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId: selectedSubjectId,
          academicPeriodId: selectedPeriodId || undefined,
          syllabus,
          generalObjectives,
          methodology,
          basicBibliography: references.map((r) => `${r.title} (${r.author}) [${r.category}]`),
          totalHours: ndeCompliance.totalHours,
          theoryHours: ndeCompliance.theoryHours,
          practiceHours: ndeCompliance.practiceHours,
          ndeComplianceStatus: ndeCompliance.ndeComplianceStatus,
          status,
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (status === 'APPROVED') {
          router.push('/teacher/schedules');
        } else {
          router.push('/teacher/plans');
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
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Controls: Disciplina & Período Letivo Comboboxes + AI Trigger */}
      <PlanHeaderControls
        subjects={subjects}
        selectedSubjectId={selectedSubjectId}
        onSelectSubjectId={setSelectedSubjectId}
        activeSubject={activeSubject}
        periods={periods}
        selectedPeriodId={selectedPeriodId}
        onSelectPeriodId={setSelectedPeriodId}
        onPeriodCreated={handlePeriodCreated}
        effectivePeriodName={activePeriod ? `${activePeriod.name} (${activePeriod.code})` : ''}
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
        </div>

        {/* Right Column: NDE / Citations & LGPD */}
        <div className="space-y-6">
          <PlanNdeComplianceCard
            data={ndeCompliance}
            onChange={setNdeCompliance}
          />

          <PlanTelemetryCard
            citations={citations}
          />
        </div>
      </div>

      {/* Docked Footer Bar */}
      <PlanFooterDock
        isSaving={isSaving}
        saveStatusMessage={saveStatusMessage}
        onSaveDraft={() => handleSavePlan('DRAFT')}
        onApprove={() => handleSavePlan('APPROVED')}
        canSave={Boolean(selectedSubjectId)}
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
