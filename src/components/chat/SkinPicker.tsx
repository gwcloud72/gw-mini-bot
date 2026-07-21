import {
  Check,
  Flower2,
  Leaf,
  Palette,
  Snowflake,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import {
  CHAT_SKIN_DEFINITIONS,
  getChatSkinDefinition,
  getChatSkinPeriodLabel,
  getSeasonalChatSkinId,
} from '@/constants/skins';
import type { ChatSkinId } from '@/types/skin';

interface SkinPickerProps {
  selectedSkinId: ChatSkinId;
  isAutomaticSkin: boolean;
  onAutomaticSkinSelect: () => void;
  onSkinSelect: (skinId: ChatSkinId) => void;
}

const SKIN_ICONS: Readonly<Record<ChatSkinId, LucideIcon>> = {
  spring: Flower2,
  summer: Sun,
  autumn: Leaf,
  winter: Snowflake,
};

export function SkinPicker({
  selectedSkinId,
  isAutomaticSkin,
  onAutomaticSkinSelect,
  onSkinSelect,
}: SkinPickerProps) {
  const currentSeasonSkinId = getSeasonalChatSkinId();
  const currentSeasonDefinition = getChatSkinDefinition(currentSeasonSkinId);

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
            자동 또는 원하는 계절을 선택해요.
          </p>
        </div>
      </div>

      <div
        className="skin-option-list grid grid-cols-2 gap-2"
        role="radiogroup"
        aria-label="계절별 대화방 스킨 선택"
      >
        <button
          type="button"
          role="radio"
          aria-checked={isAutomaticSkin}
          onClick={onAutomaticSkinSelect}
          className={`skin-option skin-option-auto col-span-2 min-h-[104px] overflow-hidden p-3.5 text-left ${
            isAutomaticSkin ? 'is-active' : ''
          }`}
        >
          <div className="relative z-[2] flex items-start justify-between gap-3">
            <span
              className="skin-icon inline-flex size-9 items-center justify-center rounded-[13px]"
              aria-hidden="true"
            >
              <Sparkles className="size-4" />
            </span>
            <span
              className={`skin-check inline-flex size-6 items-center justify-center rounded-full ${
                isAutomaticSkin ? 'is-visible' : ''
              }`}
              aria-hidden="true"
            >
              <Check className="size-3.5" />
            </span>
          </div>

          <div className="relative z-[2] mt-3 flex items-end justify-between gap-3 pr-28">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <strong className="skin-option-title">자동</strong>
                <span className="season-badge">
                  현재 {currentSeasonDefinition.name}
                </span>
              </div>
              <span className="skin-option-description mt-0.5 block">
                날짜에 맞춰 계절과 캐릭터를 함께 바꿔요.
              </span>
            </div>
            <span className="skin-period shrink-0">
              {getChatSkinPeriodLabel(currentSeasonDefinition)}
            </span>
          </div>

          <span className="skin-auto-character-list" aria-hidden="true">
            {CHAT_SKIN_DEFINITIONS.map((skinDefinition) => (
              <span
                key={skinDefinition.id}
                className={`skin-auto-character skin-auto-character-${skinDefinition.id}`}
              />
            ))}
          </span>
        </button>

        {CHAT_SKIN_DEFINITIONS.map((skinDefinition, skinIndex) => {
          const isSelected =
            !isAutomaticSkin && selectedSkinId === skinDefinition.id;
          const isCurrentSeason = currentSeasonSkinId === skinDefinition.id;
          const SkinIcon = SKIN_ICONS[skinDefinition.id];

          return (
            <button
              key={skinDefinition.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSkinSelect(skinDefinition.id)}
              data-skin-option={skinDefinition.id}
              className={`skin-option skin-option-season skin-option-delay-${skinIndex} relative min-h-[132px] overflow-hidden p-3.5 pr-[4.6rem] text-left ${
                isSelected ? 'is-active' : ''
              }`}
            >
              <div className="relative z-[2] flex items-start justify-between gap-2">
                <span
                  className="skin-icon inline-flex size-9 items-center justify-center rounded-[13px]"
                  aria-hidden="true"
                >
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

              <div className="relative z-[2] mt-3 min-w-0">
                <div className="flex items-center gap-1.5">
                  <strong className="skin-option-title truncate">
                    {skinDefinition.name}
                  </strong>
                  {isCurrentSeason ? (
                    <span className="season-badge">지금</span>
                  ) : null}
                </div>
                <span className="skin-option-description mt-0.5 block truncate">
                  {skinDefinition.description}
                </span>
              </div>

              <span
                className="relative z-[2] mt-3 flex items-center justify-between gap-2"
                aria-hidden="true"
              >
                <span className="flex -space-x-1">
                  {skinDefinition.swatches.map((swatchColor, swatchIndex) => (
                    <span
                      key={swatchColor}
                      className={`skin-swatch skin-swatch-${skinDefinition.id}-${swatchIndex} size-4 rounded-full`}
                    />
                  ))}
                </span>
                <span className="skin-period">
                  {getChatSkinPeriodLabel(skinDefinition)}
                </span>
              </span>

              <span className="skin-character-preview" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
