'use client';

import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, STATUS_VARIANTS } from '@/lib/constants';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] ?? status;
  const variant = STATUS_VARIANTS[status] ?? 'secondary';

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
