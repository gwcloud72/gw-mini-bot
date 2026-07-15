import { Sparkles } from 'lucide-react';
import { BrandAvatar } from '@/components/common/BrandAvatar';
import { QuickPrompts } from './QuickPrompts';

interface ConversationIntroProps {
  isDisabled: boolean;
  onPromptSelect: (promptText: string) => void;
}

export function ConversationIntro({
  isDisabled,
  onPromptSelect,
}: ConversationIntroProps) {
  return (
    <section className="conversation-intro flex w-full flex-1 flex-col justify-center py-8 sm:py-12">
      <div className="conversation-intro-copy mx-auto flex w-full max-w-2xl flex-col items-center text-center">
        <div className="intro-avatar-wrap relative">
          <BrandAvatar size="lg" className="intro-avatar" />
          <span className="intro-sparkle inline-flex items-center justify-center" aria-hidden="true">
            <Sparkles className="size-3.5" />
          </span>
        </div>
        <p className="intro-eyebrow mt-5">편하게 시작해요</p>
        <h2 className="intro-title mt-2">무엇을 같이 해볼까요?</h2>
        <p className="intro-description mt-3 max-w-[34rem]">
          생각 정리, 문장 다듬기, 아이디어 확장처럼 지금 필요한 일을 대화하듯 이어가 보세요.
        </p>
      </div>

      <QuickPrompts onPromptSelect={onPromptSelect} isDisabled={isDisabled} />
    </section>
  );
}
