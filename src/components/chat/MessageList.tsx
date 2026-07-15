import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const messageStageRef = useRef<HTMLDivElement>(null);
  const isViewportPinnedRef = useRef(true);
  const previousMessageCountRef = useRef(chatMessages.length);
  const scheduledScrollFrameRef = useRef<number | null>(null);
  const [isJumpButtonVisible, setIsJumpButtonVisible] = useState(false);
  const visibleMessages = chatMessages.filter(
    (chatMessage) => !chatMessage.isWelcome,
  );
  const hasConversationMessages = visibleMessages.length > 0;

  const hideJumpButton = useCallback(() => {
    setIsJumpButtonVisible((isVisible) => (isVisible ? false : isVisible));
  }, []);

  const scrollToLatestImmediately = useCallback(() => {
    const messageViewport = messageViewportRef.current;
    if (!messageViewport || !isViewportPinnedRef.current) {
      return;
    }

    messageViewport.scrollTop = messageViewport.scrollHeight;
    hideJumpButton();
  }, [hideJumpButton]);

  const schedulePinnedScroll = useCallback(() => {
    if (
      scheduledScrollFrameRef.current !== null ||
      !isViewportPinnedRef.current
    ) {
      return;
    }

    scheduledScrollFrameRef.current = window.requestAnimationFrame(() => {
      scheduledScrollFrameRef.current = null;
      scrollToLatestImmediately();
    });
  }, [scrollToLatestImmediately]);

  const scrollToLatestMessage = useCallback(() => {
    const messageViewport = messageViewportRef.current;
    if (!messageViewport) {
      return;
    }

    isViewportPinnedRef.current = true;
    messageViewport.scrollTo({
      top: messageViewport.scrollHeight,
      behavior: getAccessibleScrollBehavior('smooth'),
    });
    hideJumpButton();
  }, [hideJumpButton]);

  useEffect(() => {
    const currentMessageCount = chatMessages.length;
    if (currentMessageCount !== previousMessageCountRef.current) {
      previousMessageCountRef.current = currentMessageCount;
      isViewportPinnedRef.current = true;
      schedulePinnedScroll();
    }
  }, [chatMessages.length, schedulePinnedScroll]);

  useEffect(() => {
    const messageStage = messageStageRef.current;
    if (!messageStage || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const messageStageResizeObserver = new ResizeObserver(() => {
      schedulePinnedScroll();
    });
    messageStageResizeObserver.observe(messageStage);

    return () => messageStageResizeObserver.disconnect();
  }, [schedulePinnedScroll]);

  useEffect(
    () => () => {
      if (scheduledScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scheduledScrollFrameRef.current);
      }
    },
    [],
  );

  const handleViewportScroll = () => {
    const messageViewport = messageViewportRef.current;
    if (!messageViewport) {
      return;
    }

    const distanceFromLatestMessage =
      messageViewport.scrollHeight - messageViewport.scrollTop - messageViewport.clientHeight;
    const isViewportPinned = distanceFromLatestMessage < 96;
    isViewportPinnedRef.current = isViewportPinned;
    setIsJumpButtonVisible((isVisible) => {
      const shouldShowJumpButton = !isViewportPinned;
      return isVisible === shouldShowJumpButton ? isVisible : shouldShowJumpButton;
    });
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
          ref={messageStageRef}
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
          onClick={scrollToLatestMessage}
          className="jump-button absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-2"
        >
          <ArrowDown className="size-3.5" aria-hidden="true" />
          최신 메시지
        </button>
      )}
    </div>
  );
}
