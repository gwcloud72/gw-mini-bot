import {
  ArrowUpRight,
  Bug,
  Lightbulb,
  ListChecks,
  PenLine,
  type LucideIcon,
} from 'lucide-react';
import { QUICK_PROMPT_DEFINITIONS } from '@/constants/chat';

interface QuickPromptsProps {
  onPromptSelect: (promptText: string) => void;
  isDisabled: boolean;
}

const QUICK_PROMPT_ICONS: Record<
  (typeof QUICK_PROMPT_DEFINITIONS)[number]['id'],
  LucideIcon
> = {
  plan: ListChecks,
  rewrite: PenLine,
  idea: Lightbulb,
  debug: Bug,
};

export function QuickPrompts({ onPromptSelect, isDisabled }: QuickPromptsProps) {
  return (
    <div className="quick-prompts mx-auto mt-8 w-full max-w-2xl" aria-label="추천 질문">
      <p className="quick-prompt-heading mb-3 px-1">추천 시작점</p>
      <div className="quick-prompt-grid grid grid-cols-2 gap-2.5 sm:gap-3">
        {QUICK_PROMPT_DEFINITIONS.map((quickPrompt, promptIndex) => {
          const QuickPromptIcon = QUICK_PROMPT_ICONS[quickPrompt.id];

          return (
            <button
              key={quickPrompt.id}
              type="button"
              disabled={isDisabled}
              onClick={() => onPromptSelect(quickPrompt.prompt)}
              className={`quick-prompt quick-prompt-delay-${promptIndex} group relative min-h-[112px] overflow-hidden p-4 text-left sm:min-h-[122px] sm:p-5`}
              aria-label={quickPrompt.prompt}
            >
              <span className="quick-prompt-icon inline-flex size-9 items-center justify-center">
                <QuickPromptIcon className="size-4" aria-hidden="true" />
              </span>
              <strong className="quick-prompt-title mt-4 block">{quickPrompt.title}</strong>
              <span className="quick-prompt-description mt-1.5 block">
                {quickPrompt.description}
              </span>
              <span className="quick-prompt-arrow absolute right-3.5 top-3.5 inline-flex size-7 items-center justify-center" aria-hidden="true">
                <ArrowUpRight className="size-3.5" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
