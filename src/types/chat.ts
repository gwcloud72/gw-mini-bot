export type ChatRole = 'user' | 'assistant';

export type ChatMessageStatus = 'complete' | 'streaming' | 'error' | 'cancelled';

export type ChatMessageKind = 'standard' | 'daily-quota-notice';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  status: ChatMessageStatus;
  isWelcome?: boolean;
  errorCode?: string;
  messageKind?: ChatMessageKind;
}

export interface ChatRequestMessage {
  role: ChatRole;
  content: string;
}

export interface ChatUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface ChatQuotaStatus {
  requestLimit: number;
  remainingRequests: number;
  resetAtEpochSeconds: number;
}

export interface ChatStreamCompletionMetadata {
  finishReason?: string;
  usage?: ChatUsageMetadata;
}

export type ChatConnectionState = 'checking' | 'online' | 'offline' | 'unconfigured';
