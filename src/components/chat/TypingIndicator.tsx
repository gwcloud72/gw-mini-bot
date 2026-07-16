const TYPING_DOT_DELAYS_MS = [0, 90, 180] as const;

interface TypingIndicatorProps {
  statusLabel?: string;
}

export function TypingIndicator({
  statusLabel = '답변 준비 중…',
}: TypingIndicatorProps) {
  return (
    <span
      className="typing-indicator inline-flex h-5 items-center gap-2 px-0.5"
      aria-label={statusLabel}
    >
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        {TYPING_DOT_DELAYS_MS.map((typingDotDelayMs) => (
          <span
            key={typingDotDelayMs}
            className={`typing-dot typing-dot-delay-${typingDotDelayMs}`}
          />
        ))}
      </span>
      <span key={statusLabel} className="typing-status-label">{statusLabel}</span>
    </span>
  );
}
