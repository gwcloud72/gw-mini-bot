import type { ChatSkinId } from '@/types/skin';

interface SeasonalCharacterProps {
  skinId: ChatSkinId;
  className?: string;
}

export function SeasonalCharacter({
  skinId,
  className = '',
}: SeasonalCharacterProps) {
  return (
    <div
      className={`seasonal-character ${className}`}
      data-seasonal-character={skinId}
      aria-hidden="true"
    >
      <span className="seasonal-character-halo" />
      <span className="seasonal-character-image" />
      <span className="seasonal-character-shadow" />
    </div>
  );
}
