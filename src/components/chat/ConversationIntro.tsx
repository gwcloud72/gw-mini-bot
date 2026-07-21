import { Sparkles } from 'lucide-react';
import type { ChatSkinId } from '@/types/skin';
import { QuickPrompts } from './QuickPrompts';
import { SeasonalCharacter } from './SeasonalCharacter';

interface ConversationIntroProps {
  activeSkinId: ChatSkinId;
  isDisabled: boolean;
  onPromptSelect: (promptText: string) => void;
}

export function ConversationIntro({
  activeSkinId,
  isDisabled,
  onPromptSelect,
}: ConversationIntroProps) {
  return (
    <section className="conversation-intro flex w-full flex-1 flex-col justify-center py-6 sm:py-10">
      <div className="season-hero-card relative mx-auto grid w-full max-w-[740px] overflow-hidden px-5 py-6 sm:grid-cols-[minmax(0,1fr)_230px] sm:items-center sm:px-8 sm:py-7">
        <div className="season-hero-copy relative z-[2] min-w-0 text-center sm:text-left">
          <span className="season-hero-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
            <Sparkles className="size-3.5" aria-hidden="true" />
            계절과 함께 가볍게 시작해요
          </span>
          <p className="intro-eyebrow mt-4">오늘의 미니챗</p>
          <h2 className="intro-title mt-2">무엇을 같이 해볼까요?</h2>
          <p className="intro-description mt-3 max-w-[31rem] sm:pr-3">
            생각 정리, 문장 다듬기, 아이디어 확장처럼 지금 필요한 일을 대화하듯 이어가 보세요.
          </p>
        </div>

        <SeasonalCharacter
          key={activeSkinId}
          skinId={activeSkinId}
          className="mx-auto mt-5 sm:mt-0"
        />
      </div>

      <QuickPrompts onPromptSelect={onPromptSelect} isDisabled={isDisabled} />
    </section>
  );
}
