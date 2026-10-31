'use client';

import { Eye, Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CrudCellProps {
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  crudSupport: { view: boolean; create: boolean; update: boolean; delete: boolean };
  readOnly?: boolean;
  writeDisabled?: boolean;
  onToggle: (action: 'canView' | 'canCreate' | 'canUpdate' | 'canDelete') => void;
}

const ACTIONS = [
  { key: 'canView' as const, icon: Eye, label: '参照', onClass: 'bg-info text-info-foreground' },
  {
    key: 'canCreate' as const,
    icon: Plus,
    label: '登録',
    onClass: 'bg-success text-success-foreground',
  },
  {
    key: 'canUpdate' as const,
    icon: Pencil,
    label: '修正',
    onClass: 'bg-warning text-warning-foreground',
  },
  {
    key: 'canDelete' as const,
    icon: Trash2,
    label: '削除',
    onClass: 'bg-destructive text-destructive-foreground',
  },
] as const;

export function CrudCell({
  canView,
  canCreate,
  canUpdate,
  canDelete,
  crudSupport,
  readOnly,
  writeDisabled = false,
  onToggle,
}: CrudCellProps) {
  const values = { canView, canCreate, canUpdate, canDelete };
  const supportMap = {
    canView: crudSupport.view,
    canCreate: crudSupport.create,
    canUpdate: crudSupport.update,
    canDelete: crudSupport.delete,
  };

  return (
    <div className="flex items-center gap-0.5">
      {ACTIONS.map(({ key, icon: Icon, label, onClass }) => {
        if (!supportMap[key]) return <div key={key} className="h-6 w-6" />;
        const isOn = values[key];
        const disabled = readOnly || (writeDisabled && key !== 'canView');
        return (
          <button
            key={key}
            type="button"
            title={`${label}${isOn ? ' ON' : ' OFF'}`}
            disabled={disabled}
            onClick={() => !disabled && onToggle(key)}
            className={cn(
              'rounded p-1 transition-colors',
              isOn ? onClass : 'bg-muted text-muted-foreground/40',
              !disabled && 'cursor-pointer hover:opacity-80',
              disabled && 'cursor-default',
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
