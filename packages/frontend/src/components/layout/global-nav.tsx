'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from 'react';
import { cn } from '@/lib/utils';
import { resolveHttpUrl } from '@/lib/url-guard';

const DEFAULT_RETE_URL = 'http://localhost:3010';

// v2-420: ビルド時環境の汚染で javascript: 等の危険スキームが href に焼き込まれるのを防ぐ。
// 検証は共通の url-guard に寄せる（他の接続先と同一の入口）。
const RETE_URL = resolveHttpUrl(process.env.NEXT_PUBLIC_RETE_URL, DEFAULT_RETE_URL);

interface GlobalNavTab {
  key: string;
  label: string;
  /**
   * Rete 側のパス。null の意味は disabled の有無で分かれる:
   * - disabled なし + null → 本システム（アクティブ表示・リンクなし）
   * - disabled: true → 準備中（retePath は使われない）
   */
  retePath: string | null;
  disabled?: boolean;
}

/**
 * rete packages/frontend/src/features/shell/lib/nav-config.ts の SHELL_TABS と同順・同ラベルを維持する
 * （Home / Desk / File / System / Mock / Setting / Model / Backlog・ref-0011）。
 * ラベルは英語・単数形（rete cmn-0114 準拠・ref-0020 で追随）。英語化はグローバルメニューのみで、
 * 各画面内タイトルは日本語のまま（スコープ限定）。
 * - system は本システム自身なので retePath=null（リンクせず現在地としてアクティブ表示・位置のみ Rete に合わせ4番目）。
 * - mock は準備中（disabled）。位置のみ Rete に合わせる。
 * - model は Rete の /model（共通仕様カタログ）へ external 遷移（他の Rete 行きリンクと同方式）。
 */
const GLOBAL_NAV_TABS: GlobalNavTab[] = [
  { key: 'home', label: 'Home', retePath: '/hub' },
  { key: 'desk', label: 'Desk', retePath: '/desk' },
  { key: 'files', label: 'File', retePath: '/files' },
  { key: 'system', label: 'System', retePath: null },
  { key: 'mock', label: 'Mock', retePath: null, disabled: true },
  { key: 'settings', label: 'Setting', retePath: '/settings' },
  { key: 'model', label: 'Model', retePath: '/model' },
  { key: 'backlog', label: 'Backlog', retePath: '/backlog' },
];

/**
 * Rete 共通のグローバルタブメニュー（struct-pass-reference-dashboard-0003 / ref-0018）。
 * rete 側 AppHeader のタブナビと同一の並び・見た目で、本システム（システムタブ）以外は
 * Rete（NEXT_PUBLIC_RETE_URL）へのフルページ遷移リンクとして描画する。
 * Rete とは別システムであることを利用者に意識させない（rete-desk-0145 と同方針）。
 *
 * タブナビは「マグネティック・ピル」（brd-0190 / ref-0018）: 白ピル（.nav-pill）は選択中タブ
 * （本システム=system）へ被せたまま動かさず、ホバーには別要素の薄グレー帯（.nav-hoverband）を
 * スライドさせる（rete AppHeader の開発統括指示 2026-07-18 追随。旧: 単一ピルが hover 先へも追従）。
 * per-tab の個別背景/枠線は持たない。ピル/帯の位置は
 * 各要素（.tab-link・data-idx）の offsetLeft/offsetWidth を測って inline style へ反映する
 * （a/span/button 全要素種別で動作する＝querySelector('[data-idx]') はタグ非依存）。
 * 位置は transform: translate3d(x, y, 0) で駆動する。縦は CSS の top:50%+translateY(-50%)
 * に頼らず、対象タブの offsetTop を測って y に載せる（rete AppHeader と同型・帯内非対称ズレ防止）。
 *
 * 「動きが滑らかでない」の真因は OS の prefers-reduced-motion: reduce が transition を none
 * にしていたこと（hom-0114 で確定）。ここ（JS）は目標値の計測だけを担い、動きの質は
 * globals.css の --sp-nav-motion-* トークンが決める。
 *
 * 初回マウント時は nav-pill-init で transition を殺し、rAF で settled 化（左からスライド
 * インしてくる誤アニメを防ぐ）。
 */
export function GlobalNav() {
  const navRef = useRef<HTMLElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pill, setPill] = useState({ left: 0, top: 0, width: 0 });
  // 初回の位置決めが済むまでピルの transition を殺す。タブは page 遷移で再マウントされ、
  // ピルは left:0/width:0 で一度描かれてから計測値へ跳ぶため。
  const [settled, setSettled] = useState(false);

  // 本システム（system）タブが「アクティブ」。retePath === null かつ disabled でないタブが唯一の
  // アクティブ表示対象（現状実装の踏襲・新たな判断ではない）。
  const activeIdx = GLOBAL_NAV_TABS.findIndex((tab) => !tab.disabled && tab.retePath === null);
  // rete 開発統括指示 2026-07-18 追随: 白ピルはアクティブタブへ被せたまま動かさない。
  // hover の表現は別要素の薄グレー帯（.nav-hoverband・下記 band）が担う。
  const targetIdx = activeIdx >= 0 ? activeIdx : 0;

  // hover 帯（.nav-hoverband）の測位（rete AppHeader と同型）。hover 中のタブを測って単一要素を
  // スライドさせる。nav の外から入った最初の 1 回はその場に即時表示し（transition none）、
  // 以降のタブ間移動でスライドする。
  const [band, setBand] = useState<{ left: number; top: number; width: number } | null>(null);
  const bandShown = useRef(false);
  useLayoutEffect(() => {
    if (hoverIdx === null) {
      bandShown.current = false;
      setBand(null);
      return;
    }
    const el = navRef.current?.querySelector<HTMLElement>(`[data-idx="${hoverIdx}"]`);
    if (!el) return;
    setBand((prev) => {
      const next = { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth };
      return prev && prev.left === next.left && prev.top === next.top && prev.width === next.width
        ? prev
        : next;
    });
  }, [hoverIdx]);
  useEffect(() => {
    if (band) bandShown.current = true;
  }, [band]);

  const measurePill = useCallback(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>(`[data-idx="${targetIdx}"]`);
    if (!el) return;
    const left = el.offsetLeft;
    const top = el.offsetTop;
    const width = el.offsetWidth;
    setPill((prev) =>
      prev.left === left && prev.top === top && prev.width === width ? prev : { left, top, width },
    );
  }, [targetIdx]);

  const measurePillRef = useRef(measurePill);
  useLayoutEffect(() => {
    measurePillRef.current = measurePill;
  });

  useLayoutEffect(() => {
    measurePill();
  }, [measurePill]);

  // 計測後の最初のフレームで transition を復帰させる（rAF はペイント前に走る）。
  // width が 0 のまま（タブが 1 つも measurable でない）なら settled は立たないままでよい
  // （アニメーションが出ないだけで壊れないので、リトライは要らない）。
  useEffect(() => {
    if (settled || pill.width === 0) return;
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, [settled, pill.width]);

  // 静的購読はマウント時 1 回だけ張る。最新の measurePill は ref 経由で呼ぶ。
  useLayoutEffect(() => {
    const remeasure = () => measurePillRef.current();
    window.addEventListener('resize', remeasure);
    document.fonts?.ready?.then(remeasure);
    return () => window.removeEventListener('resize', remeasure);
  }, []);

  // フォーカス移動が nav 内の別タブへ抜ける時は、その onFocus が次の対象を立てるので
  // ここで null に戻さない（戻すと選択中タブへ一瞬ピルが跳ねる）。
  const handleTabBlur = useCallback(
    (event: FocusEvent<HTMLButtonElement | HTMLAnchorElement | HTMLSpanElement>) => {
      const next = event.relatedTarget;
      if (next instanceof Node && navRef.current?.contains(next)) return;
      setHoverIdx(null);
    },
    [],
  );

  return (
    // モバイル（md 未満）は意図的に非表示（rete との差異）。タブ 7 個は狭幅に収まらず、
    // モバイル導線はハンバーガー → サイドバーに寄せる。
    // hom-0064: viewport の 50% に幅を制限する絶対中央配置(left-1/2)は8タブが収まらず折り返す
    // 原因だったため廃止。flex-1 + justify-center で残り幅いっぱいに中央寄せする。
    // ref-0020: 全タブ等間隔。gap は globals.css の .nav-tabs（--sp-nav-tab-gap）が単一ソース
    // （Tailwind gap-* を書くとセパレータ ::before の left と手動同期になるため書かない）。
    // ref-0026: 行 grid（1fr auto 1fr・app-shell）の中央セルとして真中央固定（rete cmn-0119 と同型）。
    <nav
      ref={navRef}
      className="nav-tabs hidden h-full min-h-0 items-center justify-center md:flex"
      aria-label="グローバルメニュー"
      onMouseLeave={() => setHoverIdx(null)}
    >
      {/* hover 帯はピルの直前（＝下層）に描く。アクティブタブ上では白ピルに覆われて見えない。 */}
      {band ? (
        <div
          aria-hidden="true"
          className="nav-hoverband"
          style={{
            transform: `translate3d(${band.left}px, ${band.top}px, 0)`,
            width: band.width,
            transition: bandShown.current ? undefined : 'none',
          }}
        />
      ) : null}
      <div
        className={cn('nav-pill', !settled && 'nav-pill-init')}
        aria-hidden="true"
        style={{
          transform: `translate3d(${pill.left}px, ${pill.top}px, 0)`,
          width: pill.width,
        }}
      />
      {GLOBAL_NAV_TABS.map((tab, idx) => {
        const isActive = !tab.disabled && tab.retePath === null;
        const lensed = hoverIdx === null ? isActive : hoverIdx === idx;
        const className = cn(
          'tab-link',
          isActive && 'tab-active',
          lensed && 'tab-lensed',
          tab.disabled && 'disabled',
        );
        const dataIdx = { 'data-idx': idx } as const;
        // ゴースト（高さ0・不可視・太字）が太字時の幅を常時予約する。アクティブ化の
        // font-weight 500→700 でラベル幅が変わりタブ列が微シフトし、rete とタブ絶対位置が
        // ズレるのを防ぐ（rete mdl-0038 の移植・ref-0026）。
        const labelEl = (
          <span className="tab-link-label">
            {tab.label}
            <span className="tab-link-bold-ghost" aria-hidden="true">
              {tab.label}
            </span>
          </span>
        );

        if (tab.disabled) {
          return (
            <button
              key={tab.key}
              type="button"
              className={className}
              disabled
              aria-disabled
              title="準備中"
              onMouseEnter={() => setHoverIdx(idx)}
              onFocus={() => setHoverIdx(idx)}
              onBlur={handleTabBlur}
              {...dataIdx}
            >
              {labelEl}
            </button>
          );
        }
        if (tab.retePath === null) {
          return (
            <span
              key={tab.key}
              className={className}
              aria-current="page"
              onMouseEnter={() => setHoverIdx(idx)}
              onFocus={() => setHoverIdx(idx)}
              onBlur={handleTabBlur}
              {...dataIdx}
            >
              {labelEl}
            </span>
          );
        }
        return (
          <a
            key={tab.key}
            className={className}
            href={`${RETE_URL}${tab.retePath}`}
            rel="noopener noreferrer"
            onMouseEnter={() => setHoverIdx(idx)}
            onFocus={() => setHoverIdx(idx)}
            onBlur={handleTabBlur}
            {...dataIdx}
          >
            {labelEl}
          </a>
        );
      })}
    </nav>
  );
}
