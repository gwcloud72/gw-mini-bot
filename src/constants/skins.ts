import {
  CHAT_SKIN_IDS,
  type ChatSkinId,
  type ChatSkinPreference,
} from '@/types/skin';

export interface ChatSkinDefinition {
  id: ChatSkinId;
  name: string;
  startMonth: number;
  endMonth: number;
  description: string;
  swatches: readonly [string, string, string];
  themeColor: string;
}

const CHAT_SKIN_DEFINITION_BY_ID: Readonly<
  Record<ChatSkinId, ChatSkinDefinition>
> = {
  spring: {
    id: 'spring',
    name: '봄',
    startMonth: 3,
    endMonth: 5,
    description: '벚꽃 산책',
    swatches: ['#fff8fa', '#e56f88', '#f4dce4'],
    themeColor: '#fff7fa',
  },
  summer: {
    id: 'summer',
    name: '여름',
    startMonth: 6,
    endMonth: 8,
    description: '맑은 해변',
    swatches: ['#f4fbfd', '#2e9fc6', '#d4f0f5'],
    themeColor: '#f3fbfd',
  },
  autumn: {
    id: 'autumn',
    name: '가을',
    startMonth: 9,
    endMonth: 11,
    description: '단풍 서재',
    swatches: ['#fff9f2', '#c96a38', '#eedac7'],
    themeColor: '#fbf5ee',
  },
  winter: {
    id: 'winter',
    name: '겨울',
    startMonth: 12,
    endMonth: 2,
    description: '눈꽃 밤',
    swatches: ['#f6f9ff', '#6077c8', '#dce5f8'],
    themeColor: '#f3f7ff',
  },
};

export const CHAT_SKIN_DEFINITIONS: readonly ChatSkinDefinition[] =
  CHAT_SKIN_IDS.map((skinId) => CHAT_SKIN_DEFINITION_BY_ID[skinId]);

export const CHAT_SKIN_STORAGE_KEY = 'minichat:skin:v2';
export const LEGACY_AUTO_SAVED_CHAT_SKIN_STORAGE_KEY = 'minichat:skin:v1';
export const LEGACY_CHAT_SKIN_STORAGE_KEYS = [
  LEGACY_AUTO_SAVED_CHAT_SKIN_STORAGE_KEY,
  'moa:skin:v2',
  'moa:skin:v1',
] as const;

const LEGACY_CHAT_SKIN_ID_MAP: Readonly<Record<string, ChatSkinId>> = {
  apricot: 'autumn',
  lilac: 'spring',
  forest: 'summer',
};

export function isChatSkinId(candidateValue: unknown): candidateValue is ChatSkinId {
  return (
    typeof candidateValue === 'string' &&
    CHAT_SKIN_IDS.includes(candidateValue as ChatSkinId)
  );
}

export function isChatSkinPreference(
  candidateValue: unknown,
): candidateValue is ChatSkinPreference {
  if (
    !candidateValue ||
    typeof candidateValue !== 'object' ||
    Array.isArray(candidateValue)
  ) {
    return false;
  }

  const candidatePreference = candidateValue as {
    mode?: unknown;
    skinId?: unknown;
  };

  return (
    candidatePreference.mode === 'auto' ||
    (candidatePreference.mode === 'manual' &&
      isChatSkinId(candidatePreference.skinId))
  );
}

export function createManualChatSkinPreference(
  skinId: ChatSkinId,
): ChatSkinPreference {
  return { mode: 'manual', skinId };
}

export function migrateLegacyChatSkinId(
  candidateValue: unknown,
): ChatSkinId | null {
  if (typeof candidateValue !== 'string') {
    return null;
  }

  return LEGACY_CHAT_SKIN_ID_MAP[candidateValue] ?? null;
}

export function isMonthInChatSkinPeriod(
  monthNumber: number,
  skinDefinition: ChatSkinDefinition,
): boolean {
  if (skinDefinition.startMonth <= skinDefinition.endMonth) {
    return (
      monthNumber >= skinDefinition.startMonth &&
      monthNumber <= skinDefinition.endMonth
    );
  }

  return (
    monthNumber >= skinDefinition.startMonth ||
    monthNumber <= skinDefinition.endMonth
  );
}

export function getChatSkinPeriodLabel(
  skinDefinition: ChatSkinDefinition,
): string {
  return `${skinDefinition.startMonth}–${skinDefinition.endMonth}월`;
}

export function getSeasonalChatSkinId(referenceDate = new Date()): ChatSkinId {
  const monthNumber = referenceDate.getMonth() + 1;
  const matchingSkinDefinition = CHAT_SKIN_DEFINITIONS.find((skinDefinition) =>
    isMonthInChatSkinPeriod(monthNumber, skinDefinition),
  );

  if (!matchingSkinDefinition) {
    throw new RangeError(`계절 스킨을 찾을 수 없는 월입니다: ${monthNumber}`);
  }

  return matchingSkinDefinition.id;
}

export function resolveChatSkinPreference(
  skinPreference: ChatSkinPreference,
  referenceDate = new Date(),
): ChatSkinId {
  return skinPreference.mode === 'auto'
    ? getSeasonalChatSkinId(referenceDate)
    : skinPreference.skinId;
}

export function getChatSkinDefinition(
  skinId: ChatSkinId,
): ChatSkinDefinition {
  return CHAT_SKIN_DEFINITION_BY_ID[skinId];
}
