import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FormCardProps {
  children: ReactNode;
  className?: string;
}

/**
 * Struct Pass v2.1 標準フォームカード。
 * sp-line-warm 枠 + sp-card 背景 + p-6 のラッパー。
 */
export function FormCard({ children, className }: FormCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--sp-line-warm)] bg-[var(--sp-card)] p-6',
        className,
      )}
    >
      {children}
    </div>
  );
}
