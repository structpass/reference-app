# Architecture invariants

この文書は、Referenceの実装で継続して守る構造上の境界をまとめた正本です。例外を採用する場合は、理由と影響を`docs/decisions/`へ記録します。

## HTTP and DTO boundary

- ControllerはHTTP入力、認証・認可デコレーター、DTO validation、レスポンス境界を担当する。
- PrismaのEntityや内部例外をHTTPへ直接公開しない。
- EntityからResponse DTOへの変換は各モジュールのmapperを使い、Serviceが呼び出す。

## Data access boundary

- 依存方向は`Controller -> Service -> Repository -> Prisma`とする。
- Serviceは業務判断を担当し、Prisma Clientを直接利用しない。
- Repositoryはクエリ、永続化、DB transactionを所有する。
- raw SQLなどの例外はRepository内へ閉じ、必要性と安全性をADRへ記録する。

## Duplication and shared sources

- 同じ業務構造のコピーを増やす前に、共通化する責務と製品上あえて分ける責務を判断する。
- 意図的な重複はADRへ記録し、将来の一律統合で業務境界を壊さないようにする。
- 複数パッケージが同じ識別子を使う場合は`packages/shared`の定数を正本とし、各層へ複製しない。

## Error handling

- 想定内の業務エラーはNestJSの具体的なHTTP exceptionで表す。
- 想定外例外とPrisma例外は共通filterで一元処理する。
- ログを出すだけのtry/catchや、原因を失う汎用例外への置換を各モジュールへ散らさない。

## Authentication and authorization

- identityの正本はRete IdPとし、Referenceはパスワードを保持しない。
- 認証はOIDC callbackとReferenceのHttpOnly Cookie境界、認可はroleとpermission guardで強制する。
- UI上の非表示だけを認可にしない。API境界で拒否する。

## Verification

- 変更した境界に対応するunit、integration、E2Eまたは実画面検証を行う。
- Responseの成功フラグだけでなく、DTO shape、認可、永続化後の状態を確認する。
- 機械的に強制できる規則はAGENTSへ重ねず、型、test、lint、CIへ置く。
