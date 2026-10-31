import { defineConfig } from 'vitest/config';

// d808: shared は test スクリプトも vitest 設定も持たず、frontend / backend の双方が
// import する型・定数（FEATURE_IDS・OBJECT_TYPE_PERMISSION_PREFIX・FieldType など）に
// 誰も見張りが無かった。値を消す・改名する・SSOT から外れる値を足す、のいずれかをしても
// 両パッケージの型検査と単体試験は「使っている側」しか見ないため緑のままになり得る。
//
// ここは frontend の設定（jsdom・msw・coverage の床）を写さない。shared は DOM を使わない
// 純粋な型と定数だけなので node 環境で足り、床を別に持つと二重管理になる（TESTING_STRATEGY の
// 「数値を二重保管しない」に従う）。対象は src 配下の *.test.ts に限る。
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
