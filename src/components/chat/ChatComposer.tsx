import { ArrowUp, Square } from 'lucide-react';
import { MAX_MESSAGE_INPUT_LENGTH } from '@/constants/chat';

interface ChatComposerProps {
  draftText: string;
  isStreaming: boolean;
  isDailyQuotaExhausted: boolean;
  onDraftTextChange: (nextDraftText: string) => void;
  onSendMessage: () => void;
  onStopGeneration: () => void;
}

export function ChatComposer({
  draftText,
  isStreaming,
  isDailyQuotaExhausted,
  onDraftTextChange,
  onSendMessage,
  onStopGeneration,
}: ChatComposerProps) {
  const shouldShowCharacterCount = draftText.length >= MAX_MESSAGE_INPUT_LENGTH * 0.8;
  const isSendEnabled =
    draftText.trim().length > 0 && !isStreaming && !isDailyQuotaExhausted;

  const handleFormSubmit = (formSubmitEvent: React.FormEvent<HTMLFormElement>) => {
    formSubmitEvent.preventDefault();
    if (isSendEnabled) {
      onSendMessage();
    }
  };

  const handleComposerKeyDown = (keyboardEvent: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      keyboardEvent.key === 'Enter' &&
      !keyboardEvent.shiftKey &&
      !keyboardEvent.nativeEvent.isComposing &&
      isSendEnabled
    ) {
      keyboardEvent.preventDefault();
      onSendMessage();
    }
  };

  const handleDraftTextChange = (textChangeEvent: React.ChangeEvent<HTMLTextAreaElement>) => {
    onDraftTextChange(textChangeEvent.target.value);
  };

  return (
    <div className="composer-bar safe-bottom px-3 pb-3 pt-2 sm:px-5 sm:pb-5 sm:pt-3">
      <form
        onSubmit={handleFormSubmit}
        className="composer-controls mx-auto flex max-w-[790px] items-end gap-2 p-2 pl-4"
      >
        <div className="composer-input-shell relative min-w-0 flex-1 py-1.5">
          <textarea
            value={draftText}
            rows={1}
            maxLength={MAX_MESSAGE_INPUT_LENGTH}
            disabled={isDailyQuotaExhausted}
            onChange={handleDraftTextChange}
            onKeyDown={handleComposerKeyDown}
            placeholder={
              isDailyQuotaExhausted
                ? '오늘 대화는 모두 사용했어요'
                : isStreaming
                  ? '답변을 작성하고 있어요'
                  : '무엇이든 편하게 적어보세요'
            }
            className="composer-textarea block max-h-36 w-full resize-none overflow-y-auto bg-transparent pr-2 outline-none"
            aria-label="메시지 입력"
          />
          {shouldShowCharacterCount && (
            <span className="character-count absolute -top-6 right-0">
              {draftText.length.toLocaleString()} / {MAX_MESSAGE_INPUT_LENGTH.toLocaleString()}
            </span>
          )}
        </div>

        {isStreaming ? (
          <button
            type="button"
            onClick={onStopGeneration}
            className="stop-button inline-flex size-10 shrink-0 items-center justify-center rounded-[15px]"
            aria-label="답변 생성 중단"
            title="답변 생성 중단"
          >
            <Square className="size-3.5 fill-current" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!isSendEnabled}
            className={`send-button inline-flex size-10 shrink-0 items-center justify-center rounded-[15px] ${
              isSendEnabled ? 'is-ready' : ''
            }`}
            aria-label="메시지 보내기"
            title="메시지 보내기"
          >
            <ArrowUp className="size-[18px]" aria-hidden="true" />
          </button>
        )}
      </form>
    </div>
  );
}
