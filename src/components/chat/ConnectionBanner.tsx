import { AlertCircle, RefreshCw, ServerOff, X } from 'lucide-react';
import { memo } from 'react';
import type { ChatConnectionState } from '@/types/chat';

interface ConnectionBannerProps {
  connectionStatus: ChatConnectionState;
  errorMessage: string | null;
  onRetryConnection: () => void;
  onDismissError: () => void;
}

export const ConnectionBanner = memo(function ConnectionBanner({
  connectionStatus,
  errorMessage,
  onRetryConnection,
  onDismissError,
}: ConnectionBannerProps) {
  const isUnconfigured = connectionStatus === 'unconfigured';
  const shouldShowBanner =
    Boolean(errorMessage) || connectionStatus === 'offline' || isUnconfigured;

  if (!shouldShowBanner) {
    return null;
  }

  const bannerMessage =
    errorMessage ??
    (isUnconfigured
      ? '대화 서버 주소를 연결하면 바로 시작할 수 있어요.'
      : '대화 서버와 잠시 연결되지 않았어요.');

  return (
    <div
      className="connection-banner mx-3 mt-3 rounded-[18px] px-3.5 py-3 sm:mx-5 sm:px-4"
      role={errorMessage ? 'alert' : 'status'}
      data-variant={isUnconfigured ? 'setup' : 'error'}
    >
      <div className="connection-banner-content mx-auto flex max-w-[790px] items-center gap-2.5">
        <span className="connection-banner-icon inline-flex size-8 shrink-0 items-center justify-center rounded-full">
          {isUnconfigured ? (
            <ServerOff className="size-4" aria-hidden="true" />
          ) : (
            <AlertCircle className="size-4" aria-hidden="true" />
          )}
        </span>
        <p className="min-w-0 flex-1">{bannerMessage}</p>
        {!isUnconfigured && (
          <button
            type="button"
            onClick={onRetryConnection}
            className="banner-action inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5"
          >
            <RefreshCw className="size-3" aria-hidden="true" />
            재연결
          </button>
        )}
        {errorMessage && (
          <button
            type="button"
            onClick={onDismissError}
            className="banner-close inline-flex size-8 shrink-0 items-center justify-center rounded-full"
            aria-label="알림 닫기"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
});
