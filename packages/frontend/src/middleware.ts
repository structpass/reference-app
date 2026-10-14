import { NextResponse, type NextRequest } from 'next/server';

import { isHttpUrl, resolveHttpUrl } from '@/lib/url-guard';

// CSP の唯一の生成元（ref-0083・rete cmn-0298 からの移植）。next.config.ts の headers() には CSP を
// 置かない（二重生成元は nonce 無し応答の穴になるため）。他の security header は next.config.ts 側が持つ。
//
// nonce 配線は Next.js 15 標準: request header の Content-Security-Policy に nonce を含めて
// 渡すと、フレームワークが自身の出す <script> タグへ同じ nonce を自動付与する。
// 全ページは RootLayout の `export const dynamic = 'force-dynamic'` で動的描画に固定してあり、
// nonce 付き HTML が静的化・ISR で再利用されることはない。
//
// 本ファイルは認証誘導（従来の 3 経路）も引き続き担う。CSP のために matcher を全ルートへ広げたので、
// 認証誘導の発火面は AUTH_GUARDED_PATHS の明示分岐で従来 3 経路に限定する（広げると /login が
// 自分自身へリダイレクトし続ける・公開ページが閉じる等の挙動変化になるため）。

const AUTH_COOKIE_NAME = 'sp_access_token';

// env は他の接続先と同じ入口（lib/url-guard）で検証してから使う（v2-438）。`||` だけでは
// `javascript:` 等の危険値をそのまま connect-src の材料にしてしまうため、http(s) 以外は既定値へ落とす。
const API_URL = resolveHttpUrl(process.env.NEXT_PUBLIC_API_URL, 'http://localhost:3001/api/v1');
// ref-0037: rete backend の表示個人設定 API をログイン後に直接 fetch するため connect-src へ許可する。
const RETE_API_URL = resolveHttpUrl(
  process.env.NEXT_PUBLIC_RETE_API_URL,
  'http://localhost:3011/api/v1',
);

// safeOrigin / buildCsp は test seam として export する（src/__tests__/middleware.test.ts）。
// middleware の CSP 生成は本番の全 script 実行を左右するため、純関数部分をユニットテストで固定する。
export function safeOrigin(url: string): string {
  // 解釈できない値は '' を返す（connect-src へ無効なトークンを入れない・v2-438）。
  // **new URL の例外だけに頼らない**: `javascript:` / `data:` / `vbscript:` はパースに成功し、
  // opaque origin が文字列 'null' へ直列化される（実測 2026-10-10。buildCsp の connect-src が
  // `connect-src 'self' null null` になっていた）。スキーム判定は url-guard の正本
  // （isHttpUrl）を使い、この関数に第2の判定を置かない。これにより `blob:`（origin が中の
  // URL になる）のようにパースは成功するが http(s) でない値も落ちる。
  if (!isHttpUrl(url)) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

export function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const apiOrigin = safeOrigin(API_URL);
  const reteApiOrigin = safeOrigin(RETE_API_URL);
  // 開発時は React Refresh / dev overlay が inline・eval を使うため従来どおり許可し、
  // 本番だけ nonce + strict-dynamic で inline 注入を遮断する（ref-0083・写し元 rete cmn-0350）。
  // strict-dynamic: nonce 付きスクリプトが動的ロードする後続スクリプトへ信頼が自動伝搬する。
  // **第三者スクリプトを nonce 付きで入れると、そのスクリプトが読む全スクリプトが許可面に入る**＝
  // nonce は「1 枚の実行許可証」でなく「信頼の起点」になる。外部スクリプト導入時は必ずこの伝搬を考慮すること。
  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;
  // ref-0090（写し元 rete cmn-0351）: スタイルの持ち込みも三層に分離する（CSS exfiltration 対策）。
  // - style-src: 本番は 'self' + nonce（v2-419 で 'unsafe-inline' を外した）。style-src-elem と
  //   同じ値にするので、style-src-elem を解釈しないブラウザが style-src へ落ちても結果が変わらない。
  // - style-src-elem: <style>/<link> の注入は 'self' + リクエスト毎 nonce 付きのみ許可（本番）。
  //   reference で実行時に <style> を注入するのは goober（react-hot-toast の内部）だけで、
  //   goober は el.nonce = window.__nonce__ を設定する（goober src/core/get-sheet.js を実測）。
  //   window.__nonce__ は app/layout.tsx が nonce 付き inline script で設定する。
  //   Next.js が配信する CSS は _next/static/css/*.css の <link rel=stylesheet> で、'self' に一致する。
  //   写し元 rete が配線している react-colorful / Tiptap には reference は依存していない。
  // - style-src-attr: style 属性（自前 6 ファイル 10 箇所に加え、@dnd-kit の drag transform や
  //   react-hot-toast の toastOptions.style が実行時に生成する分）は 'unsafe-inline' のまま（本番）。
  //   対応前ブラウザ（Safari 15.4 未満・Firefox 108 未満等）は style-src-attr 未対応で
  //   style-src 側へフォールバックするが、本番の style-src は 'self' + nonce のため、その帯では
  //   動的な style 属性が遮断されうる（実機未検証。既知のトレードオフとして結果に明記する）。
  // 遮断が実効となる範囲（写し元 rete cmn-0383 / MDN browser-compat-data 実測）: Chrome 75+ /
  // Edge 79+ / Firefox 108+ / Safari 26.2+。Safari 15.4〜26.1 は style-src-elem をパースするだけで
  // 効果が無い（WebKit bug 276931）が、style-src が同じ 'self' + nonce のため nonce 付き <style> は
  // その帯でも通る（v2-419 の設計。アプリが壊れる下限は Safari 15.4+ を維持）。
  // dev は React Refresh / dev overlay が style 注入を行うため現状維持（style-src のみ）。
  // script-src / style-src 以外の directive は reference の従来 CSP（next.config.ts 旧 headers() 由来）を維持する。
  const styleElemSrc = isDev ? undefined : `'self' 'nonce-${nonce}'`;
  const styleSrc = isDev ? "'self' 'unsafe-inline'" : `'self' 'nonce-${nonce}'`;
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    ...(styleElemSrc ? [`style-src-elem ${styleElemSrc}`, "style-src-attr 'unsafe-inline'"] : []),
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}${reteApiOrigin ? ` ${reteApiOrigin}` : ''}${isDev ? ' ws: wss:' : ''}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // low-risk な追加 directive: 既存挙動を壊さない範囲で攻撃面を絞る（reference 固有・維持）
    "worker-src 'self' blob:", // Web Worker / Service Worker は自オリジンのみ。blob: は Workbox 等の inline worker 互換
    "manifest-src 'self'", // PWA manifest 制限
    "frame-src 'none'", // 自ページ内 iframe 禁止（埋め込みは無いため）
    "media-src 'self'", // <audio>/<video> 制限
  ];
  // upgrade-insecure-requests は prod のみ。dev は http://localhost が混ざるので付けない（従来どおり）。
  if (!isDev) {
    directives.push('upgrade-insecure-requests');
  }
  return directives.join('; ');
}

/** 認証誘導の対象（従来 matcher の 3 経路と同一集合・ref-0083 で matcher 全域化に伴い明示分岐へ移設）。 */
function isAuthGuardedPath(pathname: string): boolean {
  return (
    pathname === '/home' ||
    pathname === '/pending' ||
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/')
  );
}

export function middleware(request: NextRequest) {
  // nonce は CSP3 推奨の 128bit（16 バイト）を crypto.getRandomValues から直接引く
  // （写し元 rete cmn-0350）。base64 エンコードで 24 文字（16 bytes → ceil(16/3)*4 = 24）。
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  let nonce = '';
  for (const b of nonceBytes) nonce += String.fromCharCode(b);
  nonce = btoa(nonce);
  const csp = buildCsp(nonce);

  // 認証誘導（従来挙動を維持）: 対象 3 経路で Cookie が無ければ /login へ。値の検証は Backend が行う。
  const { pathname } = request.nextUrl;
  if (isAuthGuardedPath(pathname) && !request.cookies.get(AUTH_COOKIE_NAME)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    const redirect = NextResponse.redirect(loginUrl);
    // リダイレクト応答にもヘッダを付ける（描画は無いが、ヘッダ無し応答の経路を作らない）。
    redirect.headers.set('Content-Security-Policy', csp);
    return redirect;
  }

  const requestHeaders = new Headers(request.headers);
  // nonce の伝搬は request header の Content-Security-Policy 経由のみ（Next.js 15 がここから
  // 抽出して framework script へ付与）。x-nonce のような別経路は作らない（生成元を一本に保つ）。
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // 内部の静的資産（nonce 不要・cache 対象）を除く全ルートへ適用する（写し元 rete cmn-0350）。
      // 拡張子による除外は置かない（存在しないパスへの直接遷移＝404 エラーページがセキュリティ
      // ヘッダ無しで返る経路を残さない）。
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      // prefetch 応答は本描画で再利用されうるため nonce を発行しない。
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
