import { Plus, SlidersHorizontal } from 'lucide-react';
import { memo } from 'react';
import { BrandAvatar } from '@/components/common/BrandAvatar';
import { IconButton } from '@/components/common/IconButton';
import { CHATBOT_DISPLAY_NAME, CHATBOT_ONLINE_STATUS_LABEL } from '@/constants/chat';
import type { ChatConnectionState } from '@/types/chat';

interface ChatHeaderProps {
  connectionStatus: ChatConnectionState;
  onStartNewConversation: () => void;
  onOpenSettings: () => void;
}

const CONNECTION_STATUS_LABELS: Record<ChatConnectionState, string> = {
  checking: '연결 확인 중',
  online: CHATBOT_ONLINE_STATUS_LABEL,
  offline: '연결 끊김',
  unconfigured: '연결 필요',
};

export const ChatHeader = memo(function ChatHeader({
  connectionStatus,
  onStartNewConversation,
  onOpenSettings,
}: ChatHeaderProps) {
  const isOnline = connectionStatus === 'online';
  const isCheckingConnection = connectionStatus === 'checking';

  return (
    <header className="chat-header relative z-20 flex h-[72px] shrink-0 items-center gap-3 px-4 sm:h-[78px] sm:px-6">
      <BrandAvatar size="md" className="header-avatar" />

      <div className="header-title-block min-w-0 flex-1">
        <h1 className="chat-title truncate">{CHATBOT_DISPLAY_NAME}</h1>
        <div className="chat-status mt-0.5 flex items-center gap-1.5">
          <span
            className={`status-dot ${isOnline ? 'is-online' : ''} ${
              isCheckingConnection ? 'is-checking' : ''
            }`}
            aria-hidden="true"
          />
          <span>{CONNECTION_STATUS_LABELS[connectionStatus]}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onStartNewConversation}
        className="new-chat-button inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 sm:px-3.5"
        aria-label="새 대화 시작"
        title="새 대화 시작"
      >
        <Plus className="size-[17px]" aria-hidden="true" />
        <span className="new-chat-button-label hidden sm:inline">새 대화</span>
      </button>

      <IconButton label="설정 열기" onClick={onOpenSettings} className="header-icon-button">
        <SlidersHorizontal className="size-[19px]" aria-hidden="true" />
      </IconButton>
    </header>
  );
});
