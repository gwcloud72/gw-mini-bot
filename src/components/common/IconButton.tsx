import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  size?: 'sm' | 'md';
}

export function IconButton({
  label,
  children,
  className = '',
  size = 'md',
  type = 'button',
  ...buttonProps
}: IconButtonProps) {
  const buttonSizeClassName = size === 'sm' ? 'size-9' : 'size-10';

  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`icon-button ${buttonSizeClassName} inline-flex shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
