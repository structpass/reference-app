'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AnnouncementRoleRef } from '@struct-pass/shared';
import apiClient from '@/lib/api-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check } from 'lucide-react';

interface GroupOption {
  id: number;
  code: string;
  name: string;
}

interface RolePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedGroupIds: number[];
  onApply: (roles: AnnouncementRoleRef[]) => void;
}

export function RolePickerDialog({
  open,
  onOpenChange,
  selectedGroupIds,
  onApply,
}: RolePickerDialogProps) {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(selectedGroupIds));
    setQuery('');
  }, [open, selectedGroupIds]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await apiClient.get('/groups', { params: { limit: 500 } });
        if (!cancelled) {
          const items: GroupOption[] = (res.data.data ?? []).map(
            (g: { id: number; code: string; name: string }) => ({
              id: g.id,
              code: g.code,
              name: g.name,
            }),
          );
          setGroups(items);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return groups;
    const q = query.toLowerCase();
    return groups.filter(
      (g) => g.code.toLowerCase().includes(q) || g.name.toLowerCase().includes(q),
    );
  }, [groups, query]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = () => {
    const byId = new Map(groups.map((g) => [g.id, g]));
    const roles: AnnouncementRoleRef[] = Array.from(selected).flatMap((id) => {
      const g = byId.get(id);
      // groups にロード済の id だけ返す（未ロードの id は dialog 経由で選べない前提）
      return g ? [{ groupId: g.id, groupCode: g.code, groupName: g.name }] : [];
    });
    onApply(roles);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>表示対象グループを選択</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="コード・名前で絞り込み"
          />
          <div className="h-[320px] overflow-y-auto rounded border border-border">
            {loading ? (
              <p className="p-4 text-sm text-[var(--sp-text-warm-mute)]">読み込み中...</p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-sm text-[var(--sp-text-warm-mute)]">
                対象グループがありません
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((g) => {
                  const isSelected = selected.has(g.id);
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => toggle(g.id)}
                        className={
                          'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ' +
                          (isSelected ? 'bg-brand-teal/10' : 'hover:bg-muted/50')
                        }
                      >
                        <span>{g.name}</span>
                        {isSelected && <Check className="h-4 w-4 text-brand-teal" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex justify-between text-xs text-[var(--sp-text-warm-mute)]">
            <span>選択中: {selected.size} 件</span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="underline hover:text-[var(--sp-text-warm)]"
            >
              クリア
            </button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button onClick={handleApply}>確定</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
