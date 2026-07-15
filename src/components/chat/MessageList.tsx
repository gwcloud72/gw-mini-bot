import { ArrowDown } from 'lucide-react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { formatConversationDate } from '@/lib/chat';
import type { ChatMessage } from '@/types/chat';
import { ConversationIntro } from './ConversationIntro';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  chatMessages: ChatMessage[];
  isStreaming: boolean;
  onQuickPromptSelect: (promptText: string) => void;
  onRetryMessage: (messageId: string) => void;
}

function getAccessibleScrollBehavior(preferredBehavior: ScrollBehavior): ScrollBehavior {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return prefersReducedMotion ? 'auto' : preferredBehavior;
}

export function MessageList({
  chatMessages,
  isStreaming,
  onQuickPromptSelect,
  onRetryMessage,
}: MessageListProps) {
  const messageViewportRef = useRef<HTMLDivElement>(null);
  const isViewportPinnedRef = useRef(true);
  const previousMessageCountRef = useRef(chatMessages.length);
  const [isJumpButtonVisible, setIsJumpButtonVisible] = useState(false);
  const visibleMessages = chatMessages.filter(
    (chatMessage) => !chatMessage.isWelcome,
  );
  const hasConversationMessages = visibleMessages.length > 0;

  const scrollToLatestMessage = useCallback(
    (preferredBehavior: ScrollBehavior = 'smooth') => {
      const messageViewport = messageViewportRef.current;
      if (!messageViewport) {
        return;
      }

      messageViewport.scrollTo({
        top: messageViewport.scrollHeight,
        behavior: getAccessibleScrollBehavior(preferredBehavior),
      });
      isViewportPinnedRef.current = true;
      setIsJumpButtonVisible(false);
    },
    [],
  );

  useLayoutEffect(() => {
    const previousMessageCount = previousMessageCountRef.current;
    const newlyAddedMessages = chatMessages.slice(previousMessageCount);
    previousMessageCountRef.current = chatMessages.length;

    if (newlyAddedMessages.some((chatMessage) => chatMessage.role === 'user')) {
      isViewportPinnedRef.current = true;
    }

    if (isViewportPinnedRef.current) {
      scrollToLatestMessage(isStreaming ? 'auto' : 'smooth');
    }
  }, [chatMessages, isStreaming, scrollToLatestMessage]);

  const handleViewportScroll = () => {
    const messageViewport = messageViewportRef.current;
    if (!messageViewport) {
      return;
    }

    const distanceFromLatestMessage =
      messageViewport.scrollHeight - messageViewport.scrollTop - messageViewport.clientHeight;
    const isViewportPinned = distanceFromLatestMessage < 96;
    isViewportPinnedRef.current = isViewportPinned;
    setIsJumpButtonVisible(!isViewportPinned);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={messageViewportRef}
        onScroll={handleViewportScroll}
        className="chat-wallpaper h-full overflow-y-auto overscroll-contain px-4 py-4 sm:px-7 sm:py-6"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-busy={isStreaming}
      >
        <div
          className={`message-stage relative z-[1] mx-auto flex min-h-full w-full max-w-[790px] flex-col ${
            hasConversationMessages ? 'gap-5' : ''
          }`}
        >
          {!hasConversationMessages ? (
            <ConversationIntro
              isDisabled={isStreaming}
              onPromptSelect={onQuickPromptSelect}
            />
          ) : (
            <>
              <div className="date-chip self-center px-3 py-1.5">
                {formatConversationDate()}
              </div>

              {visibleMessages.map((chatMessage, messageIndex) => (
                <MessageBubble
                  key={chatMessage.id}
                  chatMessage={chatMessage}
                  canRetry={
                    messageIndex === visibleMessages.length - 1 &&
                    !isStreaming &&
                    chatMessage.messageKind !== 'daily-quota-notice'
                  }
                  entranceDelayIndex={Math.min(messageIndex, 5)}
                  onRetryMessage={onRetryMessage}
                />
              ))}

              <div className="h-2" aria-hidden="true" />
            </>
          )}
        </div>
      </div>

      {isJumpButtonVisible && (
        <button
          type="button"
          onClick={() => scrollToLatestMessage()}
          className="jump-button absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-2"
        >
          <ArrowDown className="size-3.5" aria-hidden="true" />
          최신 메시지
        </button>
      )}
    </div>
  );
}
