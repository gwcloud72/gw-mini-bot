import type { ChatSkinId } from '@/types/skin';

const SEASONAL_PARTICLE_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7] as const;

interface SeasonalSceneProps {
  skinId: ChatSkinId;
}

export function SeasonalScene({ skinId }: SeasonalSceneProps) {
  return (
    <div
      className="seasonal-scene absolute inset-0 overflow-hidden"
      data-seasonal-scene={skinId}
      aria-hidden="true"
    >
      <span className="seasonal-scene-gradient seasonal-scene-gradient-primary" />
      <span className="seasonal-scene-gradient seasonal-scene-gradient-secondary" />
      <span className="seasonal-scene-pattern" />
      {SEASONAL_PARTICLE_INDEXES.map((particleIndex) => (
        <span
          key={particleIndex}
          className={`seasonal-particle seasonal-particle-${particleIndex}`}
        />
      ))}
    </div>
  );
}
