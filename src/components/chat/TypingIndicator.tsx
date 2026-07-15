const TYPING_DOT_DELAYS_MS = [0, 140, 280] as const;

export function TypingIndicator() {
  return (
    <span className="typing-indicator inline-flex h-5 items-center gap-1 px-0.5" aria-label="답변 작성 중">
      {TYPING_DOT_DELAYS_MS.map((typingDotDelayMs) => (
        <span
          key={typingDotDelayMs}
          className={`typing-dot typing-dot-delay-${typingDotDelayMs}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
