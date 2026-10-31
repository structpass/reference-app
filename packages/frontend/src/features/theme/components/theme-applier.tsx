'use client';

import { useTheme } from '@/features/theme/hooks/use-theme';

/**
 * `<html data-theme>` 同期専用のサイドエフェクトコンポーネント。
 * dashboard/layout.tsx の SystemConfigProvider 配下に 1 つ配置すればよい。
 */
export function ThemeApplier() {
  useTheme();
  return null;
}
