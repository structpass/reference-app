'use client';

import { useEffect } from 'react';
import { useSystemConfig } from '@/features/system-settings';
import { THEME_KEY, normalizeThemeId, type ThemeId } from '@/features/theme/lib/themes';

/**
 * SystemConfig から `system.ui.theme` を読み、`<html data-theme>` を同期する。
 *
 * SSR 時は `<html data-theme="default">` 固定（layout.tsx で初期値）。
 * CSR でこの hook が SystemConfig 取得後に最終テーマへ書き換える。
 * env 識別が用途のため数百 ms の FOUC は許容範囲。
 */
export function useTheme(): { theme: ThemeId } {
  const { config, loaded } = useSystemConfig();
  const theme = normalizeThemeId(config[THEME_KEY]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return { theme: loaded ? theme : 'default' };
}
