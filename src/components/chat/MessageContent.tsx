import { memo, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageContentProps {
  messageContent: string;
}

function isExternalUrl(linkHref: string | undefined): boolean {
  return Boolean(linkHref && /^https?:\/\//i.test(linkHref));
}

type MarkdownComponents = NonNullable<ComponentProps<typeof ReactMarkdown>['components']>;

const MARKDOWN_COMPONENTS: MarkdownComponents = {
  a: ({ href: linkHref, children, ...anchorProps }) => (
    <a
      href={linkHref}
      target={isExternalUrl(linkHref) ? '_blank' : undefined}
      rel={isExternalUrl(linkHref) ? 'noreferrer noopener' : undefined}
      {...anchorProps}
    >
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <div className="code-block">
      <pre>{children}</pre>
    </div>
  ),
  table: ({ children }) => (
    <div className="table-scroll">
      <table>{children}</table>
    </div>
  ),
  p: ({ children }) => <p>{children as ReactNode}</p>,
};

export const MessageContent = memo(function MessageContent({
  messageContent,
}: MessageContentProps) {
  return (
    <div className="message-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {messageContent}
      </ReactMarkdown>
    </div>
  );
});
