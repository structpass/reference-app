/**
 * rete の表示個人設定（明細の縞模様 / rete mdl-0022）を reference へ複製反映する（ref-0037）。
 * rete が正の設定・reference は参照する側（[[project_reference_subsystem_lookfeel_unify]]）。
 * ログイン確定後に rete backend の GET /accounts/me/display-preference を直接 fetch し、
 * rete と同一ロジック（display-preference-api.ts）で --sp-row-stripe-rete-override へ適用する。
 * 未ログイン・未保存・rete 到達不能はいずれもエラー表示せず現状の既定色へ静かにフォールバックする
 * （rete session-provider.tsx の best-effort 方針を踏襲）。
 */

import { resolveHttpUrl } from '@/lib/url-guard';

interface ReteDisplayPreferenceDto {
  stripeEnabled: boolean;
  stripeColor: string;
}

interface ReteApiResponse<T> {
  data: T;
}

const DEFAULT_RETE_API_URL = 'http://localhost:3011/api/v1';
// v2-420: ビルド時環境の汚染で javascript: 等の危険スキームが焼き込まれるのを防ぐ。
// 検証は共通の url-guard に寄せる（api-client.ts / app/login/page.tsx / auth-provider.tsx /
// global-nav.tsx と同一の入口を使い、ガードの実装が箇所ごとにずれないようにする）。
const RETE_API_URL = resolveHttpUrl(process.env.NEXT_PUBLIC_RETE_API_URL, DEFAULT_RETE_API_URL);

// rete 側 STRIPE_COLOR_PATTERN（packages/shared/src/types/display.ts）と同一パターン。
// 他サービス（rete backend）からの応答値をそのまま CSS カスタムプロパティへ書き込む前の防御的チェック
// （rete backend は保存時に検証済みだが、信頼境界を跨ぐ値なのでここでも形式を確認する）。
const STRIPE_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** rete backend から表示個人設定を取得する（未ログイン・未保存・非 200 応答はいずれも null）。 */
export async function fetchReteDisplayPreference(): Promise<ReteDisplayPreferenceDto | null> {
  const res = await fetch(`${RETE_API_URL}/accounts/me/display-preference`, {
    credentials: 'include',
  });
  if (!res.ok) return null;
  const body: ReteApiResponse<ReteDisplayPreferenceDto | null> = await res.json();
  return body.data;
}

/**
 * 表示個人設定を :root の CSS 変数へ反映する（rete の applyDisplayPreference と同一ロジック）。
 * `--sp-row-stripe` 本体でなく `--sp-row-stripe-rete-override` へ書き込む（globals.css の :root だけが
 * これを参照する）。plains/island/mountain/swamp/forest の5テーマは `--sp-row-stripe` を直接宣言し
 * この override 変数を参照しないため、documentElement への inline style がテーマ別配色を上書きしない
 * （decision 0015 の「テーマ別パレットは意図的な別着色のため据え置き」を構造的に保証する）。
 */
export function applyReteDisplayPreference(
  pref: ReteDisplayPreferenceDto | null,
  root: HTMLElement = document.documentElement,
): void {
  if (!pref) {
    root.style.removeProperty('--sp-row-stripe-rete-override');
    return;
  }
  if (!pref.stripeEnabled) {
    root.style.setProperty('--sp-row-stripe-rete-override', 'transparent');
    return;
  }
  if (!STRIPE_COLOR_PATTERN.test(pref.stripeColor)) {
    root.style.removeProperty('--sp-row-stripe-rete-override');
    return;
  }
  root.style.setProperty('--sp-row-stripe-rete-override', pref.stripeColor);
}
