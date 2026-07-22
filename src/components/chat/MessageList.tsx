import { ArrowDown } from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  formatConversationDate,
  getConversationDateKey,
} from '@/lib/chat';
import {
  cancelVisualFrame,
  getMotionAwareScrollBehavior,
  requestVisualFrame,
} from '@/lib/browserMotion';
import type { ChatMessage } from '@/types/chat';
import type { ChatSkinId } from '@/types/skin';
import { ConversationIntro } from './ConversationIntro';
import { MessageBubble } from './MessageBubble';
import { SeasonalScene } from './SeasonalScene';

interface MessageListProps {
  activeSkinId: ChatSkinId;
  chatMessages: ChatMessage[];
  isStreaming: boolean;
  onQuickPromptSelect: (promptText: string) => void;
  onRetryMessage: (messageId: string) => void;
}

function scrollViewportTo(
  messageViewport: HTMLDivElement,
  topPosition: number,
  scrollBehavior: ScrollBehavior,
): void {
  try {
    messageViewport.scrollTo({
      top: topPosition,
      behavior: scrollBehavior,
    });
  } catch {
    messageViewport.scrollTop = topPosition;
  }
}

function getLiveStatusMessage(
  visibleMessages: ChatMessage[],
  isStreaming: boolean,
): string {
  let latestAssistantMessage: ChatMessage | undefined;

  for (let messageIndex = visibleMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const candidateMessage = visibleMessages[messageIndex];
    if (candidateMessage?.role === 'assistant') {
      latestAssistantMessage = candidateMessage;
      break;
    }
  }

  if (!latestAssistantMessage) {
    return '';
  }

  if (isStreaming || latestAssistantMessage.status === 'streaming') {
    return latestAssistantMessage.progressMessage ?? '답변 작성 중…';
  }

  if (latestAssistantMessage.status === 'complete') {
    return '답변이 완료됐어요.';
  }

  if (latestAssistantMessage.status === 'error') {
    return latestAssistantMessage.isRetryable === false
      ? '답변을 완료하지 못했어요.'
      : '답변 생성에 실패했어요. 다시 시도할 수 있어요.';
  }

  if (latestAssistantMessage.status === 'cancelled') {
    return '답변 생성을 중단했어요.';
  }

  return '';
}

export function MessageList({
  activeSkinId,
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
  const latestMessageContentLength = chatMessages.at(-1)?.content.length ?? 0;
  const liveStatusMessage = getLiveStatusMessage(
    visibleMessages,
    isStreaming,
  );

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
      !hasConversationMessages ||
      scheduledScrollFrameRef.current !== null ||
      !isViewportPinnedRef.current
    ) {
      return;
    }

    scheduledScrollFrameRef.current = requestVisualFrame(() => {
      scheduledScrollFrameRef.current = null;
      scrollToLatestImmediately();
    });
  }, [hasConversationMessages, scrollToLatestImmediately]);

  const scrollToLatestMessage = useCallback(() => {
    const messageViewport = messageViewportRef.current;
    if (!messageViewport) {
      return;
    }

    isViewportPinnedRef.current = true;
    scrollViewportTo(
      messageViewport,
      messageViewport.scrollHeight,
      getMotionAwareScrollBehavior('smooth'),
    );
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
    if (
      hasConversationMessages &&
      (isStreaming || latestMessageContentLength > 0)
    ) {
      schedulePinnedScroll();
    }
  }, [
    hasConversationMessages,
    isStreaming,
    latestMessageContentLength,
    schedulePinnedScroll,
  ]);

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
        cancelVisualFrame(scheduledScrollFrameRef.current);
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
      messageViewport.scrollHeight -
      messageViewport.scrollTop -
      messageViewport.clientHeight;
    const isViewportPinned = distanceFromLatestMessage < 96;
    isViewportPinnedRef.current = isViewportPinned;
    setIsJumpButtonVisible((isVisible) => {
      const shouldShowJumpButton = !isViewportPinned;
      return isVisible === shouldShowJumpButton
        ? isVisible
        : shouldShowJumpButton;
    });
  };

  return (
    <div className="message-area relative min-h-0 flex-1 overflow-hidden">
      <SeasonalScene key={activeSkinId} skinId={activeSkinId} />
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatusMessage}
      </p>
      <div
        ref={messageViewportRef}
        onScroll={handleViewportScroll}
        className="chat-wallpaper relative z-[1] h-full overflow-y-auto overscroll-contain px-4 py-4 sm:px-7 sm:py-6"
        role="log"
        aria-label="대화 내용"
        aria-live="off"
        aria-relevant="additions"
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
              activeSkinId={activeSkinId}
              isDisabled={isStreaming}
              onPromptSelect={onQuickPromptSelect}
            />
          ) : (
            <>
              {visibleMessages.map((chatMessage, messageIndex) => {
                const currentDateKey = getConversationDateKey(
                  chatMessage.createdAt,
                );
                const previousDateKey =
                  messageIndex > 0
                    ? getConversationDateKey(
                        visibleMessages[messageIndex - 1]?.createdAt ?? '',
                      )
                    : '';
                const shouldShowDateChip =
                  currentDateKey.length > 0 &&
                  currentDateKey !== previousDateKey;

                return (
                  <Fragment key={chatMessage.id}>
                    {shouldShowDateChip ? (
                      <div className="date-chip self-center px-3 py-1.5">
                        {formatConversationDate(
                          new Date(chatMessage.createdAt),
                        )}
                      </div>
                    ) : null}
                    <MessageBubble
                      chatMessage={chatMessage}
                      canRetry={
                        messageIndex === visibleMessages.length - 1 &&
                        !isStreaming &&
                        chatMessage.messageKind !== 'daily-quota-notice' &&
                        chatMessage.isRetryable !== false
                      }
                      onRetryMessage={onRetryMessage}
                    />
                  </Fragment>
                );
              })}

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
