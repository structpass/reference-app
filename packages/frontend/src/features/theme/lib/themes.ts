/**
 * UI カラーテーマ定義。
 *
 * Backend `system.ui.theme` 設定値と同期させること。
 * 値が増減した際は backend `UI_THEME_VALUES`（system-settings.service.ts）も更新する。
 *
 * 配色は MTG 基本土地 5 色をモチーフに以下を globals.css の [data-theme="..."] ブロックで定義：
 *   - Plains（平地）   = 暖かい乳白＋金麦色（草原）
 *   - Island（島）     = 深い海緑青＋シアン（水面）
 *   - Mountain（山）   = 砂岩ベージュ＋溶岩赤茶（岩肌）
 *   - Swamp（沼）      = 退色紫グレー＋暗紫＋苔緑（腐敗）
 *   - Forest（森）     = 苔アイボリー＋深緑＋若葉（森林）
 */

export const THEME_IDS = ['default', 'plains', 'island', 'mountain', 'swamp', 'forest'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_KEY = 'system.ui.theme';
export const DEFAULT_THEME: ThemeId = 'default';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
  /** 5 色 swatch（プレビュー用）。background / accent / sidebar / line / text */
  swatches: [string, string, string, string, string];
}

export const THEME_META: Record<ThemeId, ThemeMeta> = {
  default: {
    id: 'default',
    label: 'デフォルト（青グレー）',
    description: 'Struct Pass 標準。青グレー基調 + ティール / ピンクアクセント',
    swatches: ['#F6F8FC', '#1FB6A2', '#1A2545', '#C5D0E0', '#132028'],
  },
  plains: {
    id: 'plains',
    label: 'Plains（平地）',
    description: '暖かい乳白 + 金麦色 + 深いオーカー。日差しが差す草原のイメージ',
    swatches: ['#F7F0DC', '#D4A437', '#5A4524', '#E5D9B5', '#3D2D17'],
  },
  island: {
    id: 'island',
    label: 'Island（島）',
    description: '深い海青 + シアン + 銀白。穏やかな海と空のイメージ',
    swatches: ['#E2EEF7', '#1A6FA0', '#0C3D70', '#B5CDE0', '#0E2236'],
  },
  mountain: {
    id: 'mountain',
    label: 'Mountain（山）',
    description: '砂岩ベージュ + 溶岩赤茶 + 焦茶。岩肌と夕焼けのイメージ',
    swatches: ['#F4E4D6', '#C04B2C', '#5D2418', '#D4B099', '#3D1A0F'],
  },
  swamp: {
    id: 'swamp',
    label: 'Swamp（沼）',
    description: '黒ベース + 微紫 + 苔緑アクセント。重さを抑えた沼地のイメージ',
    swatches: ['#D7D4D9', '#4F4458', '#181318', '#9D97A2', '#14101A'],
  },
  forest: {
    id: 'forest',
    label: 'Forest（森）',
    description: '苔アイボリー + 深緑 + 若葉。森林と木陰のイメージ',
    swatches: ['#D9E3D3', '#3F7A4A', '#1B3A24', '#94B07A', '#0E2614'],
  },
};

export function isThemeId(value: string | undefined | null): value is ThemeId {
  return value !== undefined && value !== null && (THEME_IDS as readonly string[]).includes(value);
}

export function normalizeThemeId(value: string | undefined | null): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME;
}
