import { describe, it, expect, beforeEach } from 'vitest';
import { applyReteDisplayPreference } from '@/lib/rete-display-preference';

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
