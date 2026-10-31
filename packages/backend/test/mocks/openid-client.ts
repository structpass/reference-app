/**
 * e2e 用 openid-client スタブ。
 *
 * openid-client v6 は ESM-only で、e2e の ts-jest（CommonJS 出力・node_modules 非変換）では
 * `import * as client from 'openid-client'` を解釈できず AppModule の読み込み自体が失敗する。
 * 本スタブを jest-e2e.json の moduleNameMapper で差し替えることで e2e app を起動可能にする
 * （unit test の `jest.mock('openid-client')` の e2e 版）。
 *
 * e2e は {@link issueToken} で JWT を直接発行して「認証済みセッション」を再現し、実 OIDC 往復
 * （rete /authorize → callback → token 交換）は踏まない。したがって以下の関数が呼ばれることはなく、
 * 万一呼ばれた場合は設計逸脱として throw で検知する。実 SSO 往復は /chk の手動スモークで検証する。
 */
const notInE2E =
  (name: string) =>
  (..._args: unknown[]): never => {
    throw new Error(
      `openid-client.${name} は e2e スタブです（OIDC 往復は e2e 対象外）。実 SSO 往復は /chk の手動スモークで検証してください。`,
    );
  };

export const discovery = notInE2E('discovery');
export const randomPKCECodeVerifier = notInE2E('randomPKCECodeVerifier');
export const calculatePKCECodeChallenge = notInE2E('calculatePKCECodeChallenge');
export const randomState = notInE2E('randomState');
export const randomNonce = notInE2E('randomNonce');
export const buildAuthorizationUrl = notInE2E('buildAuthorizationUrl');
export const authorizationCodeGrant = notInE2E('authorizationCodeGrant');
// discover() 内で options.execute に積まれるだけで e2e では評価されない。
export const allowInsecureRequests = notInE2E('allowInsecureRequests');
