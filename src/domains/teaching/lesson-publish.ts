/** Pure rules (no DB imports): shared by the service and the client editor. */
export function publishBlockReason(lesson: {
  classNumber: number;
  topicTitle: string;
  dailyObjective: string;
  timeScript: unknown;
}): string | null {
  if (lesson.topicTitle.trim() === `Aula ${lesson.classNumber}`) return 'Defina um título diferente de "Aula N".';
  if (lesson.dailyObjective.trim() === '') return 'Preencha o objetivo da aula.';
  if (!Array.isArray(lesson.timeScript) || lesson.timeScript.length === 0) {
    return 'Adicione ao menos uma etapa ao roteiro.';
  }
  return null;
}
