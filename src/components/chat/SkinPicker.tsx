import {
  Check,
  Flower2,
  Leaf,
  Palette,
  Snowflake,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import {
  CHAT_SKIN_DEFINITIONS,
  getSeasonalChatSkinId,
} from '@/constants/skins';
import type { ChatSkinId } from '@/types/skin';

interface SkinPickerProps {
  selectedSkinId: ChatSkinId;
  onSkinSelect: (skinId: ChatSkinId) => void;
}

const SKIN_ICONS: Readonly<Record<ChatSkinId, LucideIcon>> = {
  spring: Flower2,
  summer: Sun,
  autumn: Leaf,
  winter: Snowflake,
};

export function SkinPicker({ selectedSkinId, onSkinSelect }: SkinPickerProps) {
  const currentSeasonSkinId = getSeasonalChatSkinId();

  return (
    <section className="menu-section" aria-labelledby="skin-picker-title">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="skin-picker-icon inline-flex size-8 items-center justify-center rounded-full">
          <Palette className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="skin-picker-title" className="skin-picker-title">
            계절 스킨
          </h2>
          <p className="skin-picker-description mt-0.5">
            색감만 은은하게 바꿔요.
          </p>
        </div>
      </div>

      <div
        className="skin-option-list grid grid-cols-2 gap-2"
        role="radiogroup"
        aria-label="계절별 대화방 스킨 선택"
      >
        {CHAT_SKIN_DEFINITIONS.map((skinDefinition, skinIndex) => {
          const isSelected = selectedSkinId === skinDefinition.id;
          const isCurrentSeason = currentSeasonSkinId === skinDefinition.id;
          const SkinIcon = SKIN_ICONS[skinDefinition.id];

          return (
            <button
              key={skinDefinition.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSkinSelect(skinDefinition.id)}
              className={`skin-option skin-option-delay-${skinIndex} relative min-h-[118px] overflow-hidden p-3.5 text-left ${
                isSelected ? 'is-active' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="skin-icon inline-flex size-9 items-center justify-center rounded-[13px]" aria-hidden="true">
                  <SkinIcon className="size-4" />
                </span>
                <span
                  className={`skin-check inline-flex size-6 items-center justify-center rounded-full ${
                    isSelected ? 'is-visible' : ''
                  }`}
                  aria-hidden="true"
                >
                  <Check className="size-3.5" />
                </span>
              </div>

              <div className="mt-3 min-w-0">
                <div className="flex items-center gap-1.5">
                  <strong className="skin-option-title truncate">{skinDefinition.name}</strong>
                  {isCurrentSeason ? <span className="season-badge">지금</span> : null}
                </div>
                <span className="skin-option-description mt-0.5 block truncate">
                  {skinDefinition.description}
                </span>
              </div>

              <span className="mt-3 flex items-center justify-between gap-2" aria-hidden="true">
                <span className="flex -space-x-1">
                  {skinDefinition.swatches.map((swatchColor, swatchIndex) => (
                    <span
                      key={swatchColor}
                      className={`skin-swatch skin-swatch-${skinDefinition.id}-${swatchIndex} size-4 rounded-full`}
                    />
                  ))}
                </span>
                <span className="skin-period">{skinDefinition.periodLabel}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
