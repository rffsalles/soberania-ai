import type { TeacherStruggleHeatmap } from './types';

export function getTeacherStruggleHeatmap(): TeacherStruggleHeatmap[] {
  return [
    {
      topic: 'LEFT OUTER JOIN com tratamento de nulos (NULL)',
      strugglePercentage: 54.2,
      affectedStudentsCount: 19,
      suggestedAction:
        'A Profª. Luci sugere dedicar os primeiros 15 minutos da próxima aula a um diagrama visual comparando INNER vs LEFT JOIN com exemplos práticos.',
    },
    {
      topic: 'Identificação de Dependência Transitiva (3FN)',
      strugglePercentage: 42.8,
      affectedStudentsCount: 15,
      suggestedAction:
        'Disponibilizar 3 exercícios guiados no Grupo de Estudos sobre decomposição de tabelas não-normalizadas.',
    },
    {
      topic: 'Diferença entre Agrupamento (GROUP BY) e Filtro (HAVING)',
      strugglePercentage: 28.5,
      affectedStudentsCount: 10,
      suggestedAction:
        'Recomendar a leitura da pág. 78 da apostila oficial e propor desafio relâmpago no Plantão de Dúvidas.',
    },
    {
      topic: 'Cálculo de Custo de Execução (Index Scan vs Seq Scan)',
      strugglePercentage: 16.0,
      affectedStudentsCount: 6,
      suggestedAction:
        'Tópico dominado pela maioria da turma. Manter o cronograma planejado.',
    },
  ];
}
