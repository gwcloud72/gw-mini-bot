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
      <span className="brand-avatar-character" />
      <span className="brand-avatar-shine" />
    </div>
  );
}
