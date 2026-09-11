/** Client-safe constants shared by the applicant form and the server. */
export const SUPPORT_CATEGORIES = ['food', 'education', 'health', 'livelihood'] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_LABELS: Record<SupportCategory, string> = {
  food: 'Food & rations',
  education: 'Education',
  health: 'Health',
  livelihood: 'Livelihood',
};
