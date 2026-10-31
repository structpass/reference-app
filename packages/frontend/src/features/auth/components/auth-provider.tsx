'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User } from '@struct-pass/shared';
import { AuthContext } from '@/features/auth/hooks/use-auth';
import apiClient from '@/lib/api-client';
import { resetColumnWidthsStore } from '@/features/user-table-column-widths';
import {
  applyReteDisplayPreference,
  fetchReteDisplayPreference,
} from '@/lib/rete-display-preference';
import toast from 'react-hot-toast';
import { resolveHttpUrl } from '@/lib/url-guard';

// identity SoT は rete (OIDC IdP)。ログアウト後は reference 側の /login（自動SSO再開があるため
// rete のセッションが生きていると即再ログインされてしまう）を経由せず、rete 自身のログイン画面へ
// フルページ遷移する（ref-0031）。rete /login はセッション有無に関わらずフォームを表示するため、
// 開発統括の意思で再ログインするまで確実にログイン画面が保たれる。
const DEFAULT_RETE_URL = 'http://localhost:3010';
// v2-420: ビルド時環境の汚染で javascript: 等の危険スキームが href に焼き込まれるのを防ぐ。
// 検証は共通の url-guard に寄せる（global-nav.tsx と同型・同一の入口）。
const RETE_URL = resolveHttpUrl(process.env.NEXT_PUBLIC_RETE_URL, DEFAULT_RETE_URL);
const RETE_LOGIN_URL = `${RETE_URL}/login`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Always try to fetch current user via cookie-based auth
    apiClient
      .get('/auth/me')
      .then((res) => setUser(res.data.data))
      .catch(() => {
        // No valid cookie — user is not authenticated
      })
      .finally(() => setLoading(false));
  }, []);

  // rete の表示個人設定（縞模様 / ref-0037）はログイン確定後に 1 回だけ :root へ反映する。
  // rete session-provider.tsx と同一パターン：取得失敗・未ログイン・rete到達不能はエラー表示せず
  // 既定色のまま静かにフォールバックする（best-effort）。
  useEffect(() => {
    if (!user) {
      applyReteDisplayPreference(null);
      return;
    }
    let active = true;
    fetchReteDisplayPreference()
      .then((pref) => {
        if (active) applyReteDisplayPreference(pref);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  const refreshUser = useCallback(async () => {
    const res = await apiClient.get('/auth/me');
    setUser(res.data.data);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Clear client state even if server call fails
    }
    resetColumnWidthsStore();
    setUser(null);
    toast.success('ログアウトしました');
    window.location.href = RETE_LOGIN_URL;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
