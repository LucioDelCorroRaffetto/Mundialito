export const ALLOWED_REACTIONS = ['😂', '🔥', '💀', '🎯', '🤡', '⚽'] as const;
export type AllowedReaction = (typeof ALLOWED_REACTIONS)[number];
