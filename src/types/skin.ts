export const CHAT_SKIN_IDS = [
  'spring',
  'summer',
  'autumn',
  'winter',
] as const;

export type ChatSkinId = (typeof CHAT_SKIN_IDS)[number];

export type ChatSkinPreference =
  | { mode: 'auto' }
  | { mode: 'manual'; skinId: ChatSkinId };
