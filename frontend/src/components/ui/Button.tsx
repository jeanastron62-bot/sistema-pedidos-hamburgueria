import { type ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary border border-primary/40 hover:bg-primary-hover text-white',
  secondary: 'bg-neutral-850 border border-neutral-750 text-neutral-300 hover:text-white hover:bg-neutral-800',
  danger: 'bg-red-700 border border-red-600/40 hover:bg-red-800 text-white',
  ghost: 'bg-transparent hover:bg-neutral-850 text-neutral-300 hover:text-white border border-neutral-800',
};

const sizeClasses: Record<Size, string> = {
  md: 'h-12 px-4 text-base',
  lg: 'h-14 px-6 text-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={twMerge(
        clsx(
          'rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
        ),
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
