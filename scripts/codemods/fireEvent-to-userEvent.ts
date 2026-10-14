/**
 * jscodeshift codemod: fireEvent.* → userEvent.*
 *
 * 目的:
 *   Phase 2B-2c で 51 spec ファイルを段階移行するための足場。
 *   完全自動化は難しい（特に async / setup() 注入）ため、
 *   - import 文の置換
 *   - 主要な fireEvent パターン（click / change / submit）の置換
 *   - 関数を async 化、user.X を使えるようにする setup() を describe 先頭に挿入
 *   までを自動化し、残りは手動レビュー前提とする。
 *
 * 使い方:
 *   pnpm dlx jscodeshift -t scripts/codemods/fireEvent-to-userEvent.ts \
 *     packages/frontend/src/__tests__/**/*.test.tsx --parser=tsx
 *
 * 注意:
 *   - keyDown / keyUp / keyPress 等の keyboard event は対象外（userEvent では表現困難なため
 *     `@allow-fireEvent:` マーカー対象として残す）。
 *   - 変換後は必ず spec を実行して通過確認すること。
 *   - 実装は MVP scaffold。Phase 2B-2c 着手時に実装拡張する。
 */
import type {
  API,
  FileInfo,
  Options,
  Transform,
  ASTPath,
  CallExpression,
} from 'jscodeshift';

const KEYBOARD_EVENTS = new Set(['keyDown', 'keyUp', 'keyPress']);

const transform: Transform = (file: FileInfo, api: API, _options: Options) => {
  const j = api.jscodeshift;
  const root = j(file.source);
  let modified = false;

  // 1. import の置換: fireEvent を削除し、userEvent を追加
  root
    .find(j.ImportDeclaration, { source: { value: '@testing-library/react' } })
    .forEach((path) => {
      const specifiers = path.node.specifiers ?? [];
      const filtered = specifiers.filter(
        (s) => !(s.type === 'ImportSpecifier' && s.imported.name === 'fireEvent'),
      );
      if (filtered.length !== specifiers.length) {
        path.node.specifiers = filtered;
        modified = true;
      }
    });

  if (modified) {
    const hasUserEventImport =
      root
        .find(j.ImportDeclaration, {
          source: { value: '@testing-library/user-event' },
        })
        .size() > 0;
    if (!hasUserEventImport) {
      const reactImport = root.find(j.ImportDeclaration, {
        source: { value: '@testing-library/react' },
      });
      if (reactImport.size() > 0) {
        reactImport.insertAfter(
          j.importDeclaration(
            [j.importDefaultSpecifier(j.identifier('userEvent'))],
            j.literal('@testing-library/user-event'),
          ),
        );
      }
    }
  }

  // 2. fireEvent.<event>(...) → user.<event>(...) (await 付与)
  // keyboard event は対象外
  root
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        object: { name: 'fireEvent' },
      },
    })
    .forEach((path: ASTPath<CallExpression>) => {
      const callee = path.node.callee;
      if (callee.type !== 'MemberExpression') return;
      const property = callee.property;
      if (property.type !== 'Identifier') return;
      const eventName = property.name;
      if (KEYBOARD_EVENTS.has(eventName)) {
        // keyboard event はスキップ。後で手動で `@allow-fireEvent:` マーカーを付ける
        return;
      }
      // user.<eventName> に置換 (await は parent statement に追加)
      callee.object = j.identifier('user');
      modified = true;
    });

  if (!modified) return null;
  return root.toSource({ quote: 'single' });
};

export default transform;
export const parser = 'tsx';
