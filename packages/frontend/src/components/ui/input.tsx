'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-[var(--sp-input-h)] w-full rounded-md border border-input bg-input-bg px-3 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--sp-text-warm-mute)] focus-visible:border-[var(--sp-focus-border)] focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-[var(--sp-disabled-bg)] disabled:text-[var(--sp-text-warm-mute)]',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
