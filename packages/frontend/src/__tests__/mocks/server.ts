/**
 * MSW node server — vitest.setup.ts から起動される。
 *
 * spec 内では `server.use(...)` で per-test override を行う。
 * デフォルトは handlers.ts に定義された共通モックのみ。
 */
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
