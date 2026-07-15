interface BrandAvatarProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const AVATAR_SIZE_CLASS_NAMES = {
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-14',
} as const;

export function BrandAvatar({ size = 'md', className = '' }: BrandAvatarProps) {
  return (
    <div
      className={`brand-avatar ${AVATAR_SIZE_CLASS_NAMES[size]} ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" className="size-[70%]" fill="none">
        <path
          className="brand-avatar-bubble"
          d="M10.5 13h25.2a7.3 7.3 0 0 1 7.3 7.3v8.1a7.3 7.3 0 0 1-7.3 7.3H25.2l-7.8 5.8v-5.8h-6.9a7.3 7.3 0 0 1-7.3-7.3v-8.1A7.3 7.3 0 0 1 10.5 13Z"
        />
        <circle className="brand-avatar-eye" cx="17.2" cy="24.5" r="2" />
        <circle className="brand-avatar-eye" cx="29.8" cy="24.5" r="2" />
        <path
          className="brand-avatar-sparkle"
          d="M38.1 7.2c.45 2.1 1.75 3.4 3.9 3.9-2.15.5-3.45 1.8-3.9 3.9-.5-2.1-1.8-3.4-3.9-3.9 2.1-.5 3.4-1.8 3.9-3.9Z"
        />
      </svg>
    </div>
  );
}
