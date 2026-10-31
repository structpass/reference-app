import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

import type { config as middlewareConfig } from '@/middleware';

// NODE_ENV 等はモジュールロード時に固定されるため、env ごとに再 import する（rete 写し元と同型・ref-0083）。
// 旧テストは NextResponse.next を `.headers` を持たない作りものへ差し替えていたが、CSP 移植で
// middleware が response.headers.set へ接触するため、モックせず実物の NextResponse を使う。
async function loadMiddleware(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  return import('@/middleware');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

function createRequest(pathname: string, hasCookie: boolean): NextRequest {
  const url = new URL(pathname, 'http://localhost:3000');
  if (hasCookie) {
    const headers = new Headers();
    headers.set('cookie', 'sp_access_token=test-token');
    return new NextRequest(url, { headers });
  }
  return new NextRequest(url);
}

describe('middleware（認証誘導・従来挙動の維持）', () => {
  it('/loginパスはCookieなしでもリダイレクトされないこと', async () => {
    const { middleware } = await loadMiddleware();
    const res = middleware(createRequest('/login', false));
    expect(res.status).toBe(200);
  });

  it('/dashboardパスでCookieなしの場合、/loginにリダイレクトされること', async () => {
    const { middleware } = await loadMiddleware();
    const res = middleware(createRequest('/dashboard', false));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('redirect')).toBe('/dashboard');
  });

  it('/dashboardパスでCookieありの場合、素通りすること', async () => {
    const { middleware } = await loadMiddleware();
    const res = middleware(createRequest('/dashboard', true));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('/pendingパスでCookieなしの場合、ログインにリダイレクトされること', async () => {
    const { middleware } = await loadMiddleware();
    const res = middleware(createRequest('/pending', false));
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('redirect')).toBe('/pending');
  });

  it('/pendingパスでCookieありの場合、素通りすること', async () => {
    const { middleware } = await loadMiddleware();
    const res = middleware(createRequest('/pending', true));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('/dashboard/productsのようなサブパスでもCookieチェックが効くこと', async () => {
    const { middleware } = await loadMiddleware();
    const res = middleware(createRequest('/dashboard/products', false));
    expect(res.headers.get('location')).not.toBeNull();
  });

  // ref-0083: matcher を CSP のため全ルートへ広げたので、認証誘導が従来の 3 経路の外へ漏れて
  // いないことを固定する（限定を忘れても既存ケースだけでは緑のまま通るため）。
  it('認証誘導は従来 3 経路に限定される（/ や未定義パスは Cookie なしでも redirect しない）', async () => {
    const { middleware } = await loadMiddleware();
    for (const pathname of ['/', '/unknown-path', '/dashboard-like', '/homework']) {
      const res = middleware(createRequest(pathname, false));
      expect(res.headers.get('location')).toBeNull();
    }
  });

  it('/login のリダイレクト先自身は誘導対象外（自分自身へ飛び続けない）', async () => {
    const { middleware } = await loadMiddleware();
    const res = middleware(createRequest('/login', false));
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('buildCsp（本番・ref-0083 写し元 rete cmn-0298/0350）', () => {
  it('script-src は nonce + strict-dynamic で、unsafe-inline / unsafe-eval は出ない', async () => {
    const { buildCsp } = await loadMiddleware({ NODE_ENV: 'production' });
    const csp = buildCsp('TESTNONCE123');
    expect(csp).toContain("script-src 'self' 'nonce-TESTNONCE123' 'strict-dynamic'");
    const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src '))!;
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });

  it('reference 固有 directive が維持される（worker/manifest/frame/media・UIR・criteria 8）', async () => {
    const { buildCsp } = await loadMiddleware({ NODE_ENV: 'production' });
    const csp = buildCsp('n');
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("manifest-src 'self'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("media-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('本番は style-src を三層に分離する（ref-0090・v2-419）: style-src と style-src-elem が同じ nonce・style-src-attr は unsafe-inline', async () => {
    const { buildCsp } = await loadMiddleware({ NODE_ENV: 'production' });
    const csp = buildCsp('TESTNONCE123');
    const styleElem = csp.split('; ').find((d) => d.startsWith('style-src-elem '))!;
    expect(styleElem).toBe("style-src-elem 'self' 'nonce-TESTNONCE123'");
    expect(styleElem).not.toContain('unsafe-inline');
    const styleAttr = csp.split('; ').find((d) => d.startsWith('style-src-attr '))!;
    expect(styleAttr).toBe("style-src-attr 'unsafe-inline'");
    // v2-419: style-src から 'unsafe-inline' を外す。style-src-elem と同じ値にして、style-src-elem を
    // 解釈しない Safari 15.4〜26.1 が style-src へ落ちても nonce 付き <style> が通るようにする。
    const styleSrc = csp.split('; ').find((d) => d.startsWith('style-src '))!;
    expect(styleSrc).toBe("style-src 'self' 'nonce-TESTNONCE123'");
    expect(styleSrc).not.toContain('unsafe-inline');
    // 属性用の指定は残す（style 属性は style-src の管轄ではない）。
    expect(csp).not.toContain("style-src 'self' 'unsafe-inline'");
  });

  it('connect-src に自 backend と rete backend の 2 オリジンが導出される（ref-0037 維持）', async () => {
    const { buildCsp } = await loadMiddleware({
      NODE_ENV: 'production',
      NEXT_PUBLIC_API_URL: 'https://api.example.com/api/v1',
      NEXT_PUBLIC_RETE_API_URL: 'https://rete.example.com/api/v1',
    });
    const csp = buildCsp('n');
    expect(csp).toContain("connect-src 'self' https://api.example.com https://rete.example.com");
    expect(csp).not.toContain('ws:');
  });

  it('不正な env URL は空文字へ縮退し、undefined 混入も起きない', async () => {
    const { buildCsp, safeOrigin } = await loadMiddleware({
      NODE_ENV: 'production',
      NEXT_PUBLIC_API_URL: 'not a url',
    });
    expect(safeOrigin('not a url')).toBe('');
    const csp = buildCsp('n');
    expect(csp).not.toContain('undefined');
    expect(csp).toContain("connect-src 'self'");
  });

  // v2-438: safeOrigin は「解釈できない値は空文字」という設計だったが、new URL の例外だけを
  // 見ていたため危険スキームで literal の 'null' を返し、connect-src に無効トークンが混ざっていた。
  const dangerousValues = [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'blob:https://example.com/uuid',
    '//evil.example.com',
    '/api/v1',
    'api/v1',
    'not a url',
    ' javascript:alert(1)',
    '',
    '   ',
  ];

  it('解釈できない値では safeOrigin が空文字を返す（literal の null を返さない・v2-438）', async () => {
    const { safeOrigin } = await loadMiddleware({ NODE_ENV: 'production' });
    // 変更前の原因を実物で押さえる（new URL は javascript: のパースに成功し origin が 'null'）。
    expect(new URL('javascript:alert(1)').origin).toBe('null');
    for (const value of dangerousValues) {
      expect(safeOrigin(value), `safeOrigin(${JSON.stringify(value)})`).toBe('');
    }
  });

  it('正常な http(s) は origin へ正規化する（大文字スキームは lowercase へ・v2-438）', async () => {
    const { safeOrigin } = await loadMiddleware({ NODE_ENV: 'production' });
    expect(safeOrigin('https://api.example.com/api/v1')).toBe('https://api.example.com');
    expect(safeOrigin('http://localhost:3001/api/v1')).toBe('http://localhost:3001');
    expect(safeOrigin('HTTP://A.COM/path')).toBe('http://a.com');
  });

  it('汚染された env では connect-src に null が入らず、既定オリジンへフォールバックする（v2-438）', async () => {
    const { buildCsp } = await loadMiddleware({
      NODE_ENV: 'production',
      NEXT_PUBLIC_API_URL: 'javascript:alert(1)',
      NEXT_PUBLIC_RETE_API_URL: 'data:text/html,x',
    });
    const connectSrc = buildCsp('n')
      .split('; ')
      .find((d) => d.startsWith('connect-src '))!;
    // env の検証は url-guard の入口（resolveHttpUrl）を通るので、危険値は既定値へ落ちる。
    expect(connectSrc).toBe("connect-src 'self' http://localhost:3001 http://localhost:3011");
    expect(connectSrc).not.toContain('null');
  });

  it('env が未設定でも connect-src は既定の2オリジンを持つ（v2-438）', async () => {
    const { buildCsp } = await loadMiddleware({ NODE_ENV: 'production' });
    const connectSrc = buildCsp('n')
      .split('; ')
      .find((d) => d.startsWith('connect-src '))!;
    expect(connectSrc).toBe("connect-src 'self' http://localhost:3001 http://localhost:3011");
    expect(connectSrc).not.toContain('null');
  });
});

describe('buildCsp（開発）', () => {
  it('dev は React Refresh 用に unsafe-inline / unsafe-eval を維持し nonce は出ない', async () => {
    const { buildCsp } = await loadMiddleware({ NODE_ENV: 'development' });
    const csp = buildCsp('DEVNONCE');
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).not.toContain('DEVNONCE');
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('dev は style-src を分離しない（ref-0090・React Refresh / dev overlay が style 注入するため）', async () => {
    const { buildCsp } = await loadMiddleware({ NODE_ENV: 'development' });
    const csp = buildCsp('DEVNONCE');
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain('style-src-elem');
    expect(csp).not.toContain('style-src-attr');
  });

  it('dev は HMR 用の ws/wss を許可する', async () => {
    const { buildCsp } = await loadMiddleware({ NODE_ENV: 'development' });
    const csp = buildCsp('n');
    expect(csp).toContain('ws: wss:');
  });
});

describe('middleware（nonce 運用・ref-0083 写し元 rete cmn-0350）', () => {
  it('CSP 応答ヘッダに生成 nonce が含まれ、128bit（base64 24 文字）である', async () => {
    const { middleware } = await loadMiddleware({ NODE_ENV: 'production' });
    const res = middleware(new NextRequest('http://localhost:3000/login'));
    const csp = res.headers.get('content-security-policy');
    expect(csp).toBeTruthy();
    const m = csp!.match(/'nonce-([A-Za-z0-9+/=]+)'/);
    expect(m).not.toBeNull();
    // 16 バイト → base64 24 文字（CSP3 推奨 128bit）。
    expect(m![1].length).toBe(24);
  });

  it('nonce はリクエストごとに新鮮（2回連続で異なる値）', async () => {
    const { middleware } = await loadMiddleware({ NODE_ENV: 'production' });
    const nonceOf = (res: ReturnType<typeof middleware>) =>
      res.headers.get('content-security-policy')!.match(/'nonce-([A-Za-z0-9+/=]+)'/)![1];
    const a = nonceOf(middleware(new NextRequest('http://localhost:3000/login')));
    const b = nonceOf(middleware(new NextRequest('http://localhost:3000/login')));
    expect(a).not.toBe(b);
  });

  it('認証リダイレクト応答にも CSP ヘッダが付く（ヘッダ無し応答の経路を作らない）', async () => {
    const { middleware } = await loadMiddleware({ NODE_ENV: 'production' });
    const res = middleware(createRequest('/dashboard', false));
    expect(res.headers.get('location')).not.toBeNull();
    expect(res.headers.get('content-security-policy')).toBeTruthy();
  });
});

describe('config（matcher 形状ピン・ref-0083 写し元 rete cmn-0350）', () => {
  it('_next 静的資産を除外し、prefetch には nonce を発行しない', async () => {
    const mod = await loadMiddleware();
    const config = mod.config as typeof middlewareConfig;
    const rule = config.matcher[0] as { source: string; missing: Array<{ key: string }> };
    // 全体を完全一致で固定する（部分一致だと拡張子除外が変形して再挿入されても検出漏れになる）。
    expect(rule.source).toBe('/((?!_next/static|_next/image|favicon.ico).*)');
    const keys = rule.missing.map((m) => m.key);
    expect(keys).toContain('next-router-prefetch');
    expect(keys).toContain('purpose');
  });
});
