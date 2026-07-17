export const MINICHAT_STREAM_PROTOCOL_VERSION = '1' as const;
export const MINICHAT_STREAM_PROTOCOL_HEADER =
  'X-Minichat-Protocol-Version' as const;

export const MINICHAT_STREAM_EVENT = {
  ready: 'ready',
  status: 'status',
  chunk: 'chunk',
  done: 'done',
  error: 'error',
} as const;

export const MINICHAT_STREAM_PHASE = {
  generating: 'generating',
} as const;
