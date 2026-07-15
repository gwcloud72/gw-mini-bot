import { Check, Clock3, Copy, RotateCcw } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { BrandAvatar } from '@/components/common/BrandAvatar';
import { CHATBOT_DISPLAY_NAME } from '@/constants/chat';
import { formatMessageTime } from '@/lib/chat';
import type { ChatMessage } from '@/types/chat';
import { MessageContent } from './MessageContent';
import { TypingIndicator } from './TypingIndicator';

interface MessageBubbleProps {
  chatMessage: ChatMessage;
  canRetry: boolean;
  onRetryMessage: (messageId: string) => void;
}

async function tryClipboardApiCopy(messageText: string): Promise<boolean> {
  if (!window.isSecureContext || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(messageText);
    return true;
  } catch {
    return false;
  }
}

async function copyMessageText(messageText: string): Promise<void> {
  if (await tryClipboardApiCopy(messageText)) {
    return;
  }

  const fallbackTextarea = document.createElement('textarea');
  fallbackTextarea.value = messageText;
  fallbackTextarea.className = 'clipboard-fallback-textarea';
  document.body.appendChild(fallbackTextarea);

  try {
    fallbackTextarea.select();
    const isFallbackCopySuccessful = document.execCommand('copy');
    if (!isFallbackCopySuccessful) {
      throw new Error('메시지를 클립보드에 복사하지 못했습니다.');
    }
  } finally {
    fallbackTextarea.remove();
  }
}

export const MessageBubble = memo(function MessageBubble({
  chatMessage,
  canRetry,
  onRetryMessage,
}: MessageBubbleProps) {
  const [isCopied, setIsCopied] = useState(false);
  const isUserMessage = chatMessage.role === 'user';
  const isWaitingForFirstChunk =
    chatMessage.status === 'streaming' && chatMessage.content.length === 0;
  const isDailyQuotaMessage =
    chatMessage.messageKind === 'daily-quota-notice' ||
    chatMessage.errorCode === 'DAILY_QUOTA_EXCEEDED';
  const formattedMessageTime = formatMessageTime(chatMessage.createdAt);

  useEffect(() => {
    if (!isCopied) {
      return undefined;
    }

    const copyResetTimeoutId = window.setTimeout(() => setIsCopied(false), 1_500);
    return () => window.clearTimeout(copyResetTimeoutId);
  }, [isCopied]);

  const handleCopyMessage = async () => {
    try {
      await copyMessageText(chatMessage.content);
      setIsCopied(true);
    } catch {
      setIsCopied(false);
    }
  };

  return (
    <article
      className={`message-row group flex w-full items-start gap-2.5 ${
        isUserMessage ? 'justify-end' : 'justify-start'
      }`}
      aria-label={isUserMessage ? '내 메시지' : `${CHATBOT_DISPLAY_NAME} 메시지`}
      data-role={chatMessage.role}
      data-status={chatMessage.status}
      data-error-code={chatMessage.errorCode}
    >
      {!isUserMessage && <BrandAvatar size="sm" className="message-avatar mt-0.5" />}

      <div
        className={`flex max-w-[88%] items-end gap-2 sm:max-w-[76%] ${
          isUserMessage ? 'flex-row-reverse' : ''
        }`}
      >
        <div className="min-w-0">
          <div
            className={`message-bubble relative min-w-10 px-4 py-3 ${
              isUserMessage
                ? 'user-bubble rounded-[22px] rounded-br-[7px]'
                : 'assistant-bubble rounded-[22px] rounded-bl-[7px]'
            } ${chatMessage.status === 'error' ? 'message-error' : ''} ${
              chatMessage.status === 'streaming' ? 'is-streaming' : ''
            } ${isDailyQuotaMessage ? 'is-daily-quota' : ''}`}
          >
            {isWaitingForFirstChunk ? (
              <TypingIndicator />
            ) : isDailyQuotaMessage ? (
              <div className="quota-message flex items-start gap-3">
                <span className="quota-message-icon mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full">
                  <Clock3 className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <strong className="quota-message-title block">오늘은 여기까지예요</strong>
                  <p className="quota-message-copy mt-1">{chatMessage.content}</p>
                </div>
              </div>
            ) : isUserMessage ? (
              <p className="message-copy whitespace-pre-wrap">{chatMessage.content}</p>
            ) : chatMessage.status === 'streaming' ? (
              <>
                <p className="message-copy whitespace-pre-wrap">
                  {chatMessage.content}
                </p>
                <span className="streaming-cursor" aria-hidden="true" />
              </>
            ) : (
              <MessageContent messageContent={chatMessage.content} />
            )}
          </div>

          {!isUserMessage && chatMessage.status === 'error' && canRetry && (
            <button
              type="button"
              onClick={() => onRetryMessage(chatMessage.id)}
              className="retry-button mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              다시 답변받기
            </button>
          )}

          {!isUserMessage && chatMessage.status === 'cancelled' && (
            <p className="message-status mt-1.5 px-1">생성을 중단했어요</p>
          )}
        </div>

        <div
          className={`mb-0.5 flex shrink-0 flex-col ${
            isUserMessage ? 'items-end' : 'items-start'
          }`}
        >
          {!isUserMessage &&
            chatMessage.content &&
            chatMessage.status !== 'streaming' &&
            !isDailyQuotaMessage && (
              <button
                type="button"
                onClick={() => void handleCopyMessage()}
                className={`copy-button mb-1 inline-flex size-8 items-center justify-center rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 ${
                  isCopied ? 'is-copied' : ''
                }`}
                aria-label={isCopied ? '복사됨' : '답변 복사'}
                title={isCopied ? '복사됨' : '답변 복사'}
              >
                {isCopied ? (
                  <Check className="copy-success-icon size-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="size-3.5" aria-hidden="true" />
                )}
              </button>
            )}
          <time className="message-time whitespace-nowrap" dateTime={chatMessage.createdAt}>
            {formattedMessageTime}
          </time>
        </div>
      </div>
    </article>
  );
});
