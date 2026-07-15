export const CHAT_DAILY_QUOTA_MAX_REQUESTS = 10;
export const CHAT_DAILY_QUOTA_WINDOW_SECONDS = 86_400;
export const CHAT_DAILY_QUOTA_TIME_ZONE = 'Asia/Seoul' as const;
export const CHAT_DAILY_QUOTA_TIME_ZONE_LABEL = '한국 시간' as const;

export const CHAT_DAILY_QUOTA_NOTICE_MESSAGE =
  `오늘 이용 가능한 ${CHAT_DAILY_QUOTA_MAX_REQUESTS}회를 모두 사용했어요. 임시 운영 중이라 한국 시간 자정부터 다시 대화할 수 있어요.` as const;

export const CHAT_DAILY_QUOTA_EXCEEDED_MESSAGE =
  CHAT_DAILY_QUOTA_NOTICE_MESSAGE;
