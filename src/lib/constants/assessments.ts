export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;

export type OptionKey = (typeof OPTION_KEYS)[number];
