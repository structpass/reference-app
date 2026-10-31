'use client';

import { useEffect, useState, useCallback } from 'react';
import type { User, UserRole } from '@struct-pass/shared';
import apiClient from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, Plus } from 'lucide-react';
import { getRoleLabel, isSysAdmin } from '@/lib/role-utils';
import { extractErrorMessage } from '@/lib/error-utils';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { canOrganizeGroup, groupScopeDenialMessage } from '../lib/membership-scope';
import toast from 'react-hot-toast';

interface GroupMember {
  id: string;
  userId: string;
  user: User;
}

interface GroupMembersProps {
  groupId: number;
  /**
   * 編成の対象になるグループのロール。系統の判定に使う（v2-462）。
   * 呼び出し元はグループ詳細・編集の両方で取得済みの `group.role` を渡す。
   */
  groupRole?: UserRole | null;
  readonly?: boolean;
}

export function GroupMembers({ groupId, groupRole, readonly }: GroupMembersProps) {
  const { user: currentUser } = useAuth();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await apiClient.get(`/groups/${groupId}/members`);
      setMembers(res.data.data ?? []);
    } catch {
      toast.error('メンバー一覧の取得に失敗しました');
    }
  }, [groupId]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await apiClient.get('/users', { params: { limit: 100 } });
      setAllUsers(res.data.data ?? []);
    } catch {
      toast.error('ユーザー一覧の取得に失敗しました');
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchMembers(), fetchUsers()]).then(() => setLoading(false));
  }, [fetchMembers, fetchUsers]);

  const addMember = async () => {
    if (!selectedUserId) return;
    try {
      await apiClient.post(`/groups/${groupId}/members`, { userId: selectedUserId });
      toast.success('メンバーを追加しました');
      setSelectedUserId('');
      fetchMembers();
    } catch (err) {
      // 拒否の理由（403「自分自身をグループへ追加することはできません」等）は API が返す。
      // 汎用文言に潰すと、操作者は何を直せばよいか分からない（v2-424）。
      toast.error(extractErrorMessage(err, 'メンバーの追加に失敗しました'));
    }
  };

  const removeMember = async (userId: string) => {
    try {
      await apiClient.delete(`/groups/${groupId}/members/${userId}`);
      toast.success('メンバーを削除しました');
      fetchMembers();
    } catch (err) {
      toast.error(extractErrorMessage(err, 'メンバーの削除に失敗しました'));
    }
  };

  const memberUserIds = new Set(members.map((m) => m.userId));
  // v2-424: 選ぶと必ず 403 になる候補を提示しない。所属の追加は「自分自身」（SYS_ADMIN 以外）と
  // 「SYS_ADMIN ロールのユーザー」（SYS_ADMIN 以外。groups.service.ts の assertSysAdminArea）を
  // 拒否するため、その2つを候補から外す。呼び出し元が SYS_ADMIN の時も同じ基準で外す
  // （API は SYS_ADMIN に許可しているが、画面は「選ぶと失敗しうる候補」を出さない側に倒す）。
  const availableUsers = allUsers.filter(
    (u) => !memberUserIds.has(u.id) && u.id !== currentUser?.id && !isSysAdmin(u.role),
  );

  // v2-462: 系統違いのグループでは編成そのものが 403 になるため、候補も追加操作も出さない。
  // 判定はサーバー側（constants/group-membership-scope.ts の canOrganizeGroup）と同じ軸で、
  // グループのロールが未取得の時は候補を出さない側へ倒す。
  const canOrganize = canOrganizeGroup(currentUser?.role, groupRole);
  const scopeDenialMessage = groupRole ? groupScopeDenialMessage(groupRole) : null;

  if (loading) {
    return <div className="py-4 text-center text-[var(--sp-text-warm-mute)]">読み込み中...</div>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-[var(--sp-text-warm)]">メンバー一覧</h3>

      {!readonly && !canOrganize && scopeDenialMessage && (
        <p className="rounded-md border border-[var(--sp-line-warm)] bg-[var(--sp-card)] px-3 py-2 text-sm text-[var(--sp-text-warm-mute)]">
          {scopeDenialMessage}
        </p>
      )}

      {!readonly && canOrganize && availableUsers.length > 0 && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-full" aria-label="追加するユーザーを選択">
                <SelectValue placeholder="ユーザーを選択" />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} ({getRoleLabel(user.role)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" size="sm" onClick={addMember} disabled={!selectedUserId}>
            <Plus className="mr-1 h-4 w-4" />
            追加
          </Button>
        </div>
      )}

      {members.length === 0 ? (
        <div className="py-4 text-center text-[var(--sp-text-warm-mute)]">
          メンバーが登録されていません
        </div>
      ) : (
        <div className="divide-y rounded-md border">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="font-medium text-[var(--sp-text-warm)]">{member.user.name}</span>
                <span className="ml-2 text-sm text-[var(--sp-text-warm-mute)]">
                  ({getRoleLabel(member.user.role)})
                </span>
              </div>
              {!readonly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMember(member.userId)}
                  aria-label="メンバー削除"
                  className="text-[var(--sp-text-warm-mute)] hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
