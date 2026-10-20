export const RETENTION_THRESHOLDS = {
  GREEN_ABOVE: 80,
  YELLOW_FROM: 50,
} as const;

export type RetentionColor = 'green' | 'yellow' | 'red';

/** Cor do indicador de retenção/engajamento: verde > 80, amarelo 50–80, vermelho < 50. */
export function retentionColor(score: number): RetentionColor {
  if (score > RETENTION_THRESHOLDS.GREEN_ABOVE) return 'green';
  if (score >= RETENTION_THRESHOLDS.YELLOW_FROM) return 'yellow';
  return 'red';
}
