import { getPublicAppConfig } from '@/config/publicAppConfig';
import { CHATBOT_DISPLAY_NAME } from '../../shared/brand';

const publicAppConfig = getPublicAppConfig();

export { CHATBOT_DISPLAY_NAME } from '../../shared/brand';
export const CHATBOT_ONLINE_STATUS_LABEL = '온라인';

export const WELCOME_MESSAGE_TEXT = [
  `안녕하세요, ${CHATBOT_DISPLAY_NAME}이에요.`,
  '생각 정리부터 문장 다듬기까지, 필요한 내용을 편하게 남겨주세요.',
].join('\n');

export const QUICK_PROMPT_DEFINITIONS = [
  {
    id: 'plan',
    title: '오늘 할 일 정리',
    description: '흩어진 일정을 우선순위로 정리해요',
    prompt: '오늘 할 일을 우선순위로 정리해줘',
  },
  {
    id: 'rewrite',
    title: '문장 자연스럽게',
    description: '어색한 표현을 매끄럽게 다듬어요',
    prompt: '이 문장을 자연스럽게 다듬어줘',
  },
  {
    id: 'idea',
    title: '아이디어 펼치기',
    description: '새로운 관점으로 선택지를 넓혀요',
    prompt: '새로운 아이디어 세 가지만 제안해줘',
  },
  {
    id: 'debug',
    title: '문제 같이 풀기',
    description: '코드와 오류를 차근차근 살펴봐요',
    prompt: '코드 오류를 같이 찾아줘',
  },
] as const;

export const MAX_MESSAGE_INPUT_LENGTH = publicAppConfig.maxMessageLength;
export const MAX_PERSISTED_MESSAGE_COUNT = publicAppConfig.maxPersistedMessages;
export const MAX_CONTEXT_MESSAGE_COUNT = publicAppConfig.maxContextMessages;
export const CHAT_HISTORY_STORAGE_KEY = 'minichat:conversation:v1';
export const LEGACY_CHAT_HISTORY_STORAGE_KEYS = [
  'moa:conversation:v2',
  'mini-bot:conversation:v1',
] as const;
