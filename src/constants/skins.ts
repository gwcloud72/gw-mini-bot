import type { ChatSkinId } from '@/types/skin';

export interface ChatSkinDefinition {
  id: ChatSkinId;
  name: string;
  periodLabel: string;
  description: string;
  swatches: readonly [string, string, string];
  themeColor: string;
}

export const CHAT_SKIN_DEFINITIONS: readonly ChatSkinDefinition[] = [
  {
    id: 'spring',
    name: '봄',
    periodLabel: '3–5월',
    description: '블러시 핑크',
    swatches: ['#fbf8fa', '#e45d8c', '#f2d9e2'],
    themeColor: '#f7f5f7',
  },
  {
    id: 'summer',
    name: '여름',
    periodLabel: '6–8월',
    description: '클리어 블루',
    swatches: ['#f7fafb', '#2a8db4', '#d6edf4'],
    themeColor: '#f3f7f8',
  },
  {
    id: 'autumn',
    name: '가을',
    periodLabel: '9–11월',
    description: '웜 테라코타',
    swatches: ['#faf8f5', '#c56c3d', '#efdfd1'],
    themeColor: '#f7f4f1',
  },
  {
    id: 'winter',
    name: '겨울',
    periodLabel: '12–2월',
    description: '쿨 인디고',
    swatches: ['#f7f8fb', '#6674d2', '#dfe3f7'],
    themeColor: '#f4f5f9',
  },
] as const;

export const DEFAULT_CHAT_SKIN_ID: ChatSkinId = 'spring';
export const CHAT_SKIN_STORAGE_KEY = 'minichat:skin:v1';
export const LEGACY_CHAT_SKIN_STORAGE_KEYS = [
  'moa:skin:v2',
  'moa:skin:v1',
] as const;

const LEGACY_CHAT_SKIN_ID_MAP: Readonly<Record<string, ChatSkinId>> = {
  apricot: 'autumn',
  lilac: 'spring',
  forest: 'summer',
};

export function isChatSkinId(candidateValue: unknown): candidateValue is ChatSkinId {
  return CHAT_SKIN_DEFINITIONS.some(
    (skinDefinition) => skinDefinition.id === candidateValue,
  );
}

export function migrateLegacyChatSkinId(candidateValue: unknown): ChatSkinId | null {
  if (typeof candidateValue !== 'string') {
    return null;
  }

  return LEGACY_CHAT_SKIN_ID_MAP[candidateValue] ?? null;
}

export function getSeasonalChatSkinId(referenceDate = new Date()): ChatSkinId {
  const monthNumber = referenceDate.getMonth() + 1;

  if (monthNumber >= 3 && monthNumber <= 5) {
    return 'spring';
  }

  if (monthNumber >= 6 && monthNumber <= 8) {
    return 'summer';
  }

  if (monthNumber >= 9 && monthNumber <= 11) {
    return 'autumn';
  }

  return 'winter';
}

export function getChatSkinDefinition(skinId: ChatSkinId): ChatSkinDefinition {
  const matchingSkinDefinition = CHAT_SKIN_DEFINITIONS.find(
    (skinDefinition) => skinDefinition.id === skinId,
  );

  return matchingSkinDefinition ?? CHAT_SKIN_DEFINITIONS[0]!;
}
