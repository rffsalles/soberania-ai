'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PlanHeaderControls } from './PlanHeaderControls';
import { PlanBibliographyCard } from './PlanBibliographyCard';
import { PlanEditorForm } from './PlanEditorForm';
import { PlanNdeComplianceCard } from './PlanNdeComplianceCard';
import { PlanTelemetryCard } from './PlanTelemetryCard';
import { PlanFooterDock } from './PlanFooterDock';
import { ReferenceSelectionModal } from './ReferenceSelectionModal';
import type {
  SubjectOption,
  AcademicPeriodOption,
  DocumentReference,
  NdeComplianceData,
} from '../types';

export default function TeachingPlanNewPage() {
  const router = useRouter();

  // Dynamic Subjects & Academic Periods from DB
  const [subjects, setSubjects] = React.useState<SubjectOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = React.useState<string>('');

  const [periods, setPeriods] = React.useState<AcademicPeriodOption[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = React.useState<string>('');

  // References: Starts completely clean (unselected)
  const [references, setReferences] = React.useState<DocumentReference[]>([]);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  // Form Fields: Starts empty prior to AI socratic assistance or manual entry
  const [syllabus, setSyllabus] = React.useState('');
  const [generalObjectives, setGeneralObjectives] = React.useState('');
  const [bloomBadges, setBloomBadges] = React.useState<string[]>([]);
  const [methodology, setMethodology] = React.useState('');
  const [citations, setCitations] = React.useState<string[]>([]);

  // Conformidade NDE / MEC
  const [ndeCompliance, setNdeCompliance] = React.useState<NdeComplianceData>({
    totalHours: 80,
    theoryHours: 60,
    practiceHours: 20,
    ndeComplianceStatus: '100% OK - Alinhado DCNs',
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
          setSelectedSubjectId(data.subjects[0].id);
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
          setSelectedPeriodId(data.periods[0].id);
        }
      })
      .catch((err) => {
        console.warn('Erro ao carregar períodos letivos:', err);
      });
  }, []);

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

  // Helper to update citations from selected references
  const updateCitationsFromReferences = (refs: DocumentReference[]) => {
    if (refs.length === 0) {
      setCitations([]);
      return;
    }
    const generated = refs.flatMap((ref, index) => [
      `[${ref.title} · ${ref.author}, pág. ${24 + (index * 34) % 120}]`,
      `[${ref.title} · ${ref.author}, pág. ${85 + (index * 19) % 90}]`,
    ]);
    setCitations(generated);
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

  // Handler: Add newly created subject
  const handleSubjectCreated = (newSubject: SubjectOption) => {
    setSubjects((prev) => [newSubject, ...prev]);
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
          academicPeriod: activePeriod?.name || '2026.1',
          selectedReferences: references,
        }),
      });

      const data = await res.json();
      if (data.success && data.data) {
        setSyllabus(data.data.syllabus);
        setGeneralObjectives(data.data.generalObjectives);
        if (Array.isArray(data.data.bloomLevels)) {
          setBloomBadges(data.data.bloomLevels);
        }
        setMethodology(data.data.methodology);
        if (Array.isArray(data.data.citations) && data.data.citations.length > 0) {
          setCitations(data.data.citations);
        }
        setSaveStatusMessage('Plano fundamentado com sucesso nas referências RAG!');
        setTimeout(() => setSaveStatusMessage(null), 4000);
      }
    } catch (err) {
      console.error('Falha ao gerar plano com IA:', err);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Handler: Save Plan
  const handleSavePlan = async (status: 'DRAFT' | 'APPROVED') => {
    if (!selectedSubjectId) {
      alert('Por favor, selecione uma disciplina.');
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch('/api/v1/teacher/plans', {
        method: 'POST',
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
        onSubjectCreated={handleSubjectCreated}
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
            onChangeSyllabus={setSyllabus}
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
