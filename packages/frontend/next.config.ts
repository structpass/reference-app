import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD ? 'standalone' : undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  devIndicators: false,
  eslint: {
    dirs: ['src'],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
  },
  experimental: {
    optimizePackageImports: [
      '@struct-pass/shared',
      'react-hot-toast',
      'react-hook-form',
      '@hookform/resolvers',
      'lucide-react',
    ],
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    // CSP は src/middleware.ts が唯一の生成元（ref-0083・rete cmn-0298 と同じ分担）。
    // ここへ CSP を戻すと二重生成元＝nonce 無し応答の穴になるため置かない。
    // 他の security header は従来どおり本ファイルが持つ。
    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
    ];

    // HSTS は prod のみ。dev (http://localhost) で送ると以後 HTTPS 強制となり開発が止まる。
    // max-age=63072000 (2y), includeSubDomains, preload — 主要ブラウザ preload list 申請可能な値
    if (!isDev) {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      });
    }

    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
