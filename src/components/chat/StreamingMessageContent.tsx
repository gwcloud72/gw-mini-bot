import { memo } from 'react';

interface StreamingMessageContentProps {
  messageContent: string;
}

export const StreamingMessageContent = memo(
  function StreamingMessageContent({
    messageContent,
  }: StreamingMessageContentProps) {
    return (
      <p className="message-copy streaming-message-copy whitespace-pre-wrap">
        {messageContent}
        <span className="streaming-cursor" aria-hidden="true" />
      </p>
    );
  },
);
