import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  applyReteDisplayPreference,
  fetchReteDisplayPreference,
} from '@/lib/rete-display-preference';

describe('applyReteDisplayPreference', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('html');
  });

  it('pref が null なら override 変数を削除する（rete 未到達・未ログイン時のフォールバック）', () => {
    root.style.setProperty('--sp-row-stripe-rete-override', '#E6F4EA');
    applyReteDisplayPreference(null, root);
    expect(root.style.getPropertyValue('--sp-row-stripe-rete-override')).toBe('');
  });

  it('stripeEnabled=false なら override 変数を transparent にする', () => {
    applyReteDisplayPreference({ stripeEnabled: false, stripeColor: '#E6F4EA' }, root);
    expect(root.style.getPropertyValue('--sp-row-stripe-rete-override')).toBe('transparent');
  });

  it('stripeEnabled=true かつ正しい #RRGGBB 形式なら override 変数へ色を反映する', () => {
    applyReteDisplayPreference({ stripeEnabled: true, stripeColor: '#E6F4EA' }, root);
    expect(root.style.getPropertyValue('--sp-row-stripe-rete-override')).toBe('#E6F4EA');
  });

  it('stripeColor が #RRGGBB 形式でなければ override 変数を削除する（信頼境界を跨ぐ値の防御）', () => {
    root.style.setProperty('--sp-row-stripe-rete-override', '#E6F4EA');
    applyReteDisplayPreference({ stripeEnabled: true, stripeColor: 'javascript:alert(1)' }, root);
    expect(root.style.getPropertyValue('--sp-row-stripe-rete-override')).toBe('');
  });

  it('本体の --sp-row-stripe には書き込まない（テーマ別配色を上書きしないための分離）', () => {
    applyReteDisplayPreference({ stripeEnabled: true, stripeColor: '#E6F4EA' }, root);
    expect(root.style.getPropertyValue('--sp-row-stripe')).toBe('');
  });
});

describe('fetchReteDisplayPreference', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('未ログイン扱いになるよう requireLogin を付けて問い合わせること（ブラウザ側の entrySettings 置換に載せる）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 204 });
    vi.stubGlobal('fetch', fetchMock);
    await fetchReteDisplayPreference();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit & { requireLogin?: boolean };
    expect(init.requireLogin).toBe(true);
    expect(init.credentials).toBe('include');
  });

  it('204（未ログイン時に置き換えられた応答）は null になること', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 }));
    await expect(fetchReteDisplayPreference()).resolves.toBeNull();
  });

  it('200 なら応答の data を返すこと', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { stripeEnabled: true, stripeColor: '#E6F4EA' } }),
      }),
    );
    await expect(fetchReteDisplayPreference()).resolves.toEqual({
      stripeEnabled: true,
      stripeColor: '#E6F4EA',
    });
  });

  it('requireLogin を解さないブラウザの 401 も例外にせず null にすること（CORS 設定に依らず静かに落ちる）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(fetchReteDisplayPreference()).resolves.toBeNull();
  });
});
