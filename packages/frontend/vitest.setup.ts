import '@testing-library/jest-dom';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './src/__tests__/mocks/server';
import { configure } from '@testing-library/react';

// coverage 実行時は並列負荷で 1 秒以内に API レスポンスが返らないことがあるため、
// waitFor のデフォルトタイムアウトを 10 秒へ拡大（ref-0094・vitest 3 化後の安定化）
configure({ asyncUtilTimeout: 10000 });

// ref-0082: jsdom 未実装 API の polyfill（Radix / pointerEvents 前提の menu 部品テストを可能にする）。
// hasPointerCapture 系は @dnd-kit / Radix が呼ぶ。scrollIntoView は jsdom 未実装。
if (typeof Element.prototype.hasPointerCapture !== 'function') {
  Element.prototype.hasPointerCapture = () => false;
}
if (typeof Element.prototype.setPointerCapture !== 'function') {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== 'function') {
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}

// Phase 2B-1 で MSW を導入。Phase 2B-3 (integration spec) で本格利用。
// 現状 handlers.ts は空なので既存 spec への影響はゼロ。
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
