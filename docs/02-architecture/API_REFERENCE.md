# API リファレンス

## 基本情報

- **ベース URL**: `http://localhost:3001/api/v1`
- **認証方式**: JWT Bearer Token（Cookie `sp_token` または `Authorization` ヘッダー）
- **レスポンス形式**: JSON

## 共通ページネーションパラメータ

一覧取得エンドポイントは共通の `PaginationDto` を継承しています。

| パラメータ | 型     | デフォルト | 説明                            |
| ---------- | ------ | ---------- | ------------------------------- |
| `page`     | number | 1          | ページ番号（1始まり）           |
| `limit`    | number | 200        | 1ページあたりの件数（最大1000） |
| `sort`     | string | createdAt  | ソートキー                      |
| `order`    | string | desc       | ソート順（asc / desc）          |

## 共通レスポンス形式

### 一覧レスポンス

```json
{
  "data": [ ... ],
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 200,
    "totalPages": 1
  }
}
```

### 成功レスポンス（Auth系）

```json
{
  "success": true,
  "data": { ... }
}
```

### エラーレスポンス

全エンドポイント共通。`AllExceptionsFilter`（`common/filters/http-exception.filter.ts`）が以下の形に整形します（旧 NestJS default の `{ statusCode, message }` ではありません）。

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "エラーメッセージ",
    "details": { ... }
  }
}
```

`details` は省略可能（class-validator のバリデーションエラーや CSV 取込の行検証エラーなど、構造化情報がある場合のみ付与）。HTTP ステータスと `error.code` の対応は末尾「[エラーレスポンス形式](#エラーレスポンス形式)」を参照。

## 書き込みリクエストの任意項目（未指定と null）

作成・更新のリクエストボディで任意の項目は、**キーを送らない（未指定）** と「既定値を使う（作成）」または「変更しない（更新）」になります。一方、**JSON の明示 `null` は「未指定」と同じ扱いにしません** — DB の列が `null` を受け付けられない場合、`400 VALIDATION_ERROR` として拒否します（`500 INTERNAL_ERROR` にはなりません）。

| 項目の種類                                                                                | 未指定（キーなし）       | `null`                                         |
| ----------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------- |
| DB の非 null 列（例: `status` / `code` / `name` / 必須の外部キー）                        | 既定値を使う・変更しない | `400 VALIDATION_ERROR`                         |
| DB の nullable 列（例: carrier の `address` / product の `description`・`purchasePrice`） | 既定値を使う・変更しない | 受け付けます（作成は未設定、更新は値のクリア） |
| サービス側で既定値へ落とす項目（例: announcement の `notifiedAt`）                        | 既定値を使う             | 既定値を使います                               |

例外: `PUT /api/v1/shipments/:id` の `carrierId` は列が nullable ですが `null` を受け付けません（運送会社の紐付けを外す操作は未提供。未指定は「変更しない」）。

---

## エンドポイント一覧

### 1. ヘルスチェック

#### `GET /api/v1/health`

サーバーの稼働状態を確認します。

**レスポンス** `200 OK`

```json
{
  "status": "ok"
}
```

---

### 2. 認証 (Auth)

認証は rete を IdP とする OIDC Authorization Code Flow（PKCE / state / nonce）で行う。reference はパスワードを保持せず、callback で自前の JWT を Cookie に発行する。

#### `GET /api/v1/auth/oidc/login`

SSO ログインを開始します。PKCE/state/nonce を発行して署名 Cookie に退避し、rete の `/authorize` へ 302 リダイレクトします。ブラウザの top-level ナビゲーション用エンドポイント。

**レスポンス** `302 Found` → rete `/authorize`

---

#### `GET /api/v1/auth/oidc/callback`

rete からのリダイレクトを受け、認可コードをトークンに交換します。OIDC claims から JIT プロビジョニング（`oidc_sub` でリンク）し、reference 自前の JWT を HttpOnly Cookie に発行します。

- role 割当済み → frontend `/dashboard` へ 302
- role 未割当（pending / 承認待ち）→ frontend `/pending` へ 302
- OIDC 由来のエラー → frontend `/login?error=sso` へ 302

**レスポンス** `302 Found`

---

#### `POST /api/v1/auth/logout` 🔒

ログアウトします。トークンを拒否リストに追加し、Cookie を削除します。

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```

---

#### `GET /api/v1/auth/me` 🔒

現在のユーザー情報を取得します。

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "管理者",
    "email": "admin@example.com",
    "role": "SYS_ADMIN"
  }
}
```

---

### 3. ユーザー (Users)

全エンドポイント 🔒（JWT認証必須）

#### `GET /api/v1/users`

ユーザー一覧を取得します（グループ統合検索対応）。

**クエリパラメータ**（共通ページネーション + 以下）

| パラメータ | 型      | 説明                                                                    |
| ---------- | ------- | ----------------------------------------------------------------------- |
| `search`   | string  | ユーザー名・メール・グループ名で検索                                    |
| `role`     | string  | ロールフィルター（WH_USER / WH_ADMIN / OF_USER / OF_ADMIN / SYS_ADMIN） |
| `isActive` | boolean | 有効フラグフィルター                                                    |

**レスポンス** `200 OK`

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "管理者",
      "email": "admin@example.com",
      "role": "SYS_ADMIN",
      "isActive": true,
      "lastLoginAt": "2026-01-01T00:00:00.000Z",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 10, "page": 1, "limit": 200, "totalPages": 1 }
}
```

---

#### `GET /api/v1/users/export` 🔒 (ADMIN)

ユーザー一覧を Excel ファイルとしてエクスポートします。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**クエリパラメータ**: `GET /api/v1/users` と同一

**レスポンス**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### `GET /api/v1/users/:id`

ユーザー詳細を取得します。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `POST /api/v1/users` 🔒 (ADMIN)

ユーザーを作成します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**（認証情報は rete が保持するため username / password は扱わない）

```json
{
  "name": "山田 太郎",
  "email": "user@example.com",
  "role": "WH_USER",
  "isActive": true
}
```

`role` は任意（未指定 = 権限待ち）。

**レスポンス** `201 Created`

---

#### `PUT /api/v1/users/:id` 🔒 (ADMIN)

ユーザーを更新します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**: 更新するフィールドのみ（Partial）

未指定（キーを送らない）は「変更しない」です。`null` は「未指定」ではなく入れられない値として扱い、DB の非 null 列へ送ると `400 VALIDATION_ERROR` になります（nullable 列は値のクリアとして受け付けます。冒頭「書き込みリクエストの任意項目」を参照）。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `DELETE /api/v1/users/:id` 🔒 (SYS_ADMIN)

ユーザーを削除します。SYS_ADMIN のみ。

**レスポンス** `200 OK` / `404 Not Found`

---

### 4. グループ (Groups)

全エンドポイント 🔒（JWT認証必須）

#### `GET /api/v1/groups`

グループ一覧を取得します。

**クエリパラメータ**（共通ページネーション + 以下）

| パラメータ | 型     | 説明                                      |
| ---------- | ------ | ----------------------------------------- |
| `search`   | string | グループ名・コードで検索                  |
| `status`   | string | ステータスフィルター（ACTIVE / INACTIVE） |

**レスポンス** `200 OK`

```json
{
  "data": [
    {
      "id": 1,
      "code": "GRP-001",
      "name": "東京倉庫チーム",
      "description": "東京エリアの倉庫担当",
      "role": "WH_USER",
      "status": "ACTIVE",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 5, "page": 1, "limit": 200, "totalPages": 1 }
}
```

---

#### `GET /api/v1/groups/export`

グループ一覧を Excel ファイルとしてエクスポートします。

**レスポンス**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### `GET /api/v1/groups/:id`

グループ詳細を取得します（メンバー情報含む）。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `POST /api/v1/groups` 🔒 (ADMIN)

グループを作成します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

`role` に `SYS_ADMIN` を指定できるのは SYS_ADMIN だけです（それ以外は `403 Forbidden`）。SYS_ADMIN 領域（`role=SYS_ADMIN` のグループ）は所属変更の境界の前提になるため、同じ権限で作れないようにしています。

**リクエストボディ**

```json
{
  "code": "GRP-001",
  "name": "東京倉庫チーム",
  "description": "東京エリアの倉庫担当",
  "role": "WH_USER",
  "status": "ACTIVE"
}
```

`status` は省略できます（省略時は `ACTIVE`）。`status` に `null` を送るのは「未指定」ではなく入れられない値として扱い、`400 VALIDATION_ERROR` になります。nullable 列の `description` だけは `null` を受け付けます。

**レスポンス** `201 Created` / `400 Bad Request` / `403 Forbidden`

---

#### `PUT /api/v1/groups/:id` 🔒 (ADMIN)

グループを更新します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

`role=SYS_ADMIN` のグループの変更、および `role` を `SYS_ADMIN` へ変更する操作は SYS_ADMIN のみです（それ以外は `403 Forbidden`）。

**リクエストボディ**: 更新するフィールドのみ（Partial）

未指定（キーを送らない）は「変更しない」です。`null` は「未指定」ではなく入れられない値として扱い、DB の非 null 列（`code` / `name` / `role` / `status`）へ `null` を送ると `400 VALIDATION_ERROR` になります。nullable 列の `description` だけは `null` を受け付けます（説明のクリア）。

他のグループと同じ `code` へ変更すると `409 Conflict` になります。

同じグループへ同時に `DELETE` が届いても `500` は返しません。更新も同じで、対象行の固定（`SELECT ... FOR NO KEY UPDATE`）を取った後に存在を確かめるため、先行が削除した後にロック待ちから戻った更新は、逐次で再送した時と同じ `404 Not Found`（`Group not found`）になります（更新は反映されません）。

固定の待ちには上限があり（60 秒）、**それを超えて待たされた場合は `503 Service Unavailable`（再送可）** になります。通常の操作では起きません（同じ行を 60 秒超保持し続ける書き込みが前提で、API 自身の削除も短い上限の中で終わります）。

**レスポンス** `200 OK` / `400 Bad Request` / `403 Forbidden` / `404 Not Found` / `409 Conflict`

---

#### `DELETE /api/v1/groups/:id` 🔒 (ADMIN)

グループを削除します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

`role=SYS_ADMIN` のグループの削除は SYS_ADMIN のみです（それ以外は `403 Forbidden`）。依存データが残る場合は `409 Conflict` で拒否し、理由を出し分けます。

- **そのグループを宛先に持つ掲示がある**: 宛先グループを削除すると宛先の行が連鎖削除され、宛先が空になった掲示は全ユーザーへ公開される状態へ変わる（本文と添付が誰でも読めるようになる）ため拒否します。宛先の変更は SYS_ADMIN のみです。
- **所属ユーザーが残っている**: 先に所属を外してください。

依存の数え直しと削除は同一トランザクションで行い、対象グループ行を固定してから数えるため、数えた後に宛先が追加される競合でも降格は起きません。

同じグループへ同時に `DELETE` が届いても `500` は返しません。行の固定（`FOR UPDATE`）を取った後に存在を確かめるため、先行が削除した後にロック待ちから戻った後続は、逐次で再送した時と同じ `404 Not Found`（`Group not found`）になります（成功するのは 1 本だけです）。

固定の待ちには上限があり（60 秒）、**それを超えて待たされた場合は `503 Service Unavailable`（再送可）** になります。通常の操作では起きません（同じ行を 60 秒超保持し続ける書き込みが前提で、API 自身の削除も短い上限の中で終わります）。更新（`PUT`）と同じ上限・同じ扱いです。

**レスポンス** `200 OK` / `403 Forbidden` / `404 Not Found` / `409 Conflict`

---

#### `GET /api/v1/groups/:id/members`

グループメンバー一覧を取得します。

**レスポンス** `200 OK`

```json
[
  {
    "id": "uuid",
    "name": "ユーザー1",
    "email": "user1@example.com",
    "role": "WH_USER"
  }
]
```

---

#### `POST /api/v1/groups/:id/members` 🔒 (ADMIN)

グループにメンバーを追加します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

所属は掲示の公開範囲を決めるため、呼び出し元の権限で次の2つを拒否します（`403 Forbidden`）。

- **自分自身の追加**: 宛先グループへ自分を足して、本来読めない掲示の本文と添付を取る経路になるため（SYS_ADMIN を除く）。
- **SYS_ADMIN 領域の変更**: `role=SYS_ADMIN` のグループ、または SYS_ADMIN ロールのユーザーに対する所属変更（SYS_ADMIN を除く）。

存在しないグループ・ユーザーは `404 Not Found`、既にメンバーの場合は `409 Conflict` です。`userId` は UUID 形式のみ受け付けます（それ以外は `400 VALIDATION_ERROR`）。自分自身の追加判定は、本文の表記ではなく DB から引いた正準の id で行います。

**リクエストボディ**

```json
{
  "userId": "uuid"
}
```

**レスポンス** `201 Created` / `400 Bad Request` / `403 Forbidden` / `404 Not Found` / `409 Conflict`

---

#### `DELETE /api/v1/groups/:id/members/:userId` 🔒 (ADMIN)

グループからメンバーを削除します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

`POST` と同じく SYS_ADMIN 領域（`role=SYS_ADMIN` のグループ・SYS_ADMIN ロールのユーザー）の削除は `403 Forbidden` です（SYS_ADMIN を除く）。自分自身の削除は拒否しません（可視範囲が狭まるだけで、権限の昇格にならないため）。

グループまたは所属が存在しない場合は `404 Not Found`（どちらが無いかは区別しません）。所属はあるがユーザー行が引けない場合は `404 Not Found`（所属を残したまま消さない側へ倒しています）。

**レスポンス** `200 OK` / `403 Forbidden` / `404 Not Found`

---

### 5. 権限 (Permissions)

全エンドポイント 🔒（JWT認証必須）

#### `GET /api/v1/permissions/roles` 🔒 (SYS_ADMIN)

ロール別権限マトリクスを取得します。SYS_ADMIN のみ。権限マトリクス自体を操作するエンドポイントのため、マトリクスを誤って空にしても復旧できるよう `@RequireRole(SYS_ADMIN)` に固定しています。カタログに無い `featureId` の行は返しません。

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "role": "WH_USER",
      "featureId": "products",
      "canView": true,
      "canCreate": false,
      "canUpdate": false,
      "canDelete": false
    }
  ]
}
```

---

#### `PUT /api/v1/permissions/roles` 🔒 (SYS_ADMIN)

ロール別権限を一括保存します。SYS_ADMIN のみ。同じ `role` と `featureId` の重複、およびカタログに無い `featureId` は `400 Bad Request`（`BAD_REQUEST`）になります。SYS_ADMIN 専用機能（`permissions` / `system-parameters` / `object-types`）を非 SYS_ADMIN ロールへ付与する入力（4 つの権限のいずれかが `true`）も `400 Bad Request` です。これらの機能は非 SYS_ADMIN では既定の NONE で固定され、DB 行が残っていても実効権限には反映されません（全フィールド `false` の行は通常の保存として受理します）。

**リクエストボディ**

```json
{
  "permissions": [
    {
      "role": "WH_USER",
      "featureId": "products",
      "canView": true,
      "canCreate": false,
      "canUpdate": false,
      "canDelete": false
    }
  ]
}
```

**レスポンス** `200 OK`（保存後の行の配列。`GET /api/v1/permissions/roles` と同じ形）

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "role": "WH_USER",
      "featureId": "products",
      "canView": true,
      "canCreate": false,
      "canUpdate": false,
      "canDelete": false
    }
  ]
}
```

---

#### `GET /api/v1/permissions/my-permissions`

自分の有効権限を取得します（メニュー表示制御用）。4 つの権限がすべて false の機能は返しません（frontend は項目の不在を権限なしとして扱います）。

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": {
    "permissions": [
      {
        "featureId": "products",
        "canView": true,
        "canCreate": false,
        "canUpdate": false,
        "canDelete": false
      },
      {
        "featureId": "receivings",
        "canView": true,
        "canCreate": true,
        "canUpdate": true,
        "canDelete": false
      }
    ]
  }
}
```

---

### 6. 商品 (Products)

全エンドポイント 🔒（JWT認証必須）

#### `GET /api/v1/products`

商品一覧を取得します。

**クエリパラメータ**（共通ページネーション + 以下）

| パラメータ   | 型     | 説明                                                     |
| ------------ | ------ | -------------------------------------------------------- |
| `search`     | string | 商品名・コードで検索                                     |
| `categoryId` | number | カテゴリーIDフィルター                                   |
| `status`     | string | ステータスフィルター（ACTIVE / INACTIVE / DISCONTINUED） |

**レスポンス** `200 OK`

```json
{
  "data": [
    {
      "id": "uuid",
      "code": "PRD-001",
      "name": "商品名",
      "description": "商品説明",
      "categoryId": 1,
      "category": { "id": 1, "name": "電子機器" },
      "price": 10000,
      "purchasePrice": 8000,
      "stockQuantity": 100,
      "unit": "個",
      "status": "ACTIVE",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z",
      "creator": { "id": "uuid", "name": "管理者" },
      "updater": null
    }
  ],
  "meta": { "total": 50, "page": 1, "limit": 200, "totalPages": 1 }
}
```

---

#### `GET /api/v1/products/export/excel` 🔒 (ADMIN)

商品一覧を Excel ファイルとしてエクスポートします。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**クエリパラメータ**: `GET /api/v1/products` と同一

**レスポンス**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### `GET /api/v1/products/:id`

商品詳細を取得します。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `POST /api/v1/products` 🔒 (ADMIN)

商品を作成します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**

```json
{
  "code": "PRD-100",
  "name": "新商品",
  "description": "商品の説明",
  "categoryId": 1,
  "price": 10000,
  "purchasePrice": 8000,
  "stockQuantity": 50,
  "unit": "個",
  "status": "ACTIVE"
}
```

**レスポンス** `201 Created`

---

#### `PUT /api/v1/products/:id` 🔒 (ADMIN)

商品を更新します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**: 更新するフィールドのみ（Partial）

未指定（キーを送らない）は「変更しない」です。`null` は「未指定」ではなく入れられない値として扱い、DB の非 null 列へ送ると `400 VALIDATION_ERROR` になります（nullable 列は値のクリアとして受け付けます。冒頭「書き込みリクエストの任意項目」を参照）。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `DELETE /api/v1/products/:id` 🔒 (ADMIN)

商品を削除します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス** `200 OK` / `404 Not Found`

---

### 6.5 ファイル取込 (CSV Imports)

全エンドポイント 🔒（JWT認証必須）。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみアクセス可能（`file-import` 権限）。

#### `GET /api/v1/imports/:target/template`

取込テンプレート CSV（ヘッダー行のみ）をダウンロードします。

**パラメータ**

| パラメータ | 説明                             |
| ---------- | -------------------------------- |
| `target`   | 取込対象キー（現状: `products`） |

**レスポンス** `200 OK`

```
content-type: text/csv; charset=utf-8
body: CSV形式（ヘッダー行のみ）
例: 商品コード,商品名,説明,カテゴリーコード,価格,仕入価格,単位,ステータス
```

---

#### `POST /api/v1/imports/:target`

CSV ファイルを取込みます。検証後、`dryRun` パラメータで「検証のみ」または「実行」を選択可能。

**パラメータ**

| パラメータ | 型              | 説明                                                     |
| ---------- | --------------- | -------------------------------------------------------- |
| `target`   | string (path)   | 取込対象キー（現状: `products`）                         |
| `dryRun`   | boolean (query) | `true` で検証のみ、`false` で確定（デフォルト: `false`） |

**リクエストボディ** (multipart/form-data)

```
file: CSV ファイル（最大 10MB）
```

**レスポンス成功** `200 OK`

```json
{
  "success": true,
  "data": {
    "target": "products",
    "dryRun": false,
    "created": 10,
    "updated": 5
  }
}
```

**レスポンス検証エラー** `400 Bad Request`

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "CSV取込の検証に失敗しました",
    "details": {
      "rows": [
        {
          "row": 2,
          "column": "商品コード",
          "message": "必須項目です"
        }
      ]
    }
  }
}
```

**エラー種別**

| ケース                                 | ステータス | エラーコード       |
| -------------------------------------- | ---------- | ------------------ |
| ファイルが未アップロード               | 400        | `VALIDATION_ERROR` |
| CSV パースエラー                       | 400        | `VALIDATION_ERROR` |
| ヘッダー不一致                         | 400        | `VALIDATION_ERROR` |
| データ行の検証失敗                     | 400        | `VALIDATION_ERROR` |
| 対象キー不存在（例: `target=unknown`） | 404        | `NOT_FOUND`        |

---

### 7. カテゴリー (Categories)

全エンドポイント 🔒（JWT認証必須）

#### `GET /api/v1/categories`

カテゴリー一覧を取得します。

**クエリパラメータ**（共通ページネーション + 以下）

| パラメータ | 型     | 説明                                      |
| ---------- | ------ | ----------------------------------------- |
| `search`   | string | カテゴリー名・コードで検索                |
| `status`   | string | ステータスフィルター（ACTIVE / INACTIVE） |

**レスポンス** `200 OK`

```json
{
  "data": [
    {
      "id": 1,
      "code": "CAT-001",
      "name": "電子機器",
      "status": "ACTIVE",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 10, "page": 1, "limit": 200, "totalPages": 1 }
}
```

---

#### `GET /api/v1/categories/export`

カテゴリー一覧を Excel ファイルとしてエクスポートします。

**レスポンス**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### `GET /api/v1/categories/:id`

カテゴリー詳細を取得します。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `POST /api/v1/categories` 🔒 (ADMIN)

カテゴリーを作成します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**

```json
{
  "code": "CAT-001",
  "name": "電子機器",
  "status": "ACTIVE"
}
```

`status` は省略できます（省略時は `ACTIVE`）。`status` に `null` を送ると `400 VALIDATION_ERROR` です（非 null 列）。

**レスポンス** `201 Created` / `400 Bad Request`

---

#### `PUT /api/v1/categories/:id` 🔒 (ADMIN)

カテゴリーを更新します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**: 更新するフィールドのみ（Partial）

未指定（キーを送らない）は「変更しない」です。`null` は「未指定」ではなく入れられない値として扱い、DB の非 null 列へ送ると `400 VALIDATION_ERROR` になります（nullable 列は値のクリアとして受け付けます。冒頭「書き込みリクエストの任意項目」を参照）。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `DELETE /api/v1/categories/:id` 🔒 (ADMIN)

カテゴリーを削除します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス** `200 OK` / `404 Not Found`

---

### 8. 倉庫 (Warehouses)

全エンドポイント 🔒（JWT認証必須）

#### `GET /api/v1/warehouses`

倉庫一覧を取得します。

**クエリパラメータ**（共通ページネーション + 以下）

| パラメータ | 型     | 説明                                      |
| ---------- | ------ | ----------------------------------------- |
| `search`   | string | 倉庫名・コードで検索                      |
| `status`   | string | ステータスフィルター（ACTIVE / INACTIVE） |

**レスポンス** `200 OK`

```json
{
  "data": [
    {
      "id": 1,
      "code": "WH-001",
      "name": "東京第一倉庫",
      "address": "東京都江東区...",
      "phone": "03-1234-5678",
      "manager": "田中太郎",
      "capacity": 10000,
      "status": "ACTIVE",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 3, "page": 1, "limit": 200, "totalPages": 1 }
}
```

---

#### `GET /api/v1/warehouses/export`

倉庫一覧を Excel ファイルとしてエクスポートします。

**レスポンス**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### `GET /api/v1/warehouses/:id`

倉庫詳細を取得します。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `POST /api/v1/warehouses` 🔒 (ADMIN)

倉庫を作成します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**

```json
{
  "code": "WH-001",
  "name": "東京第一倉庫",
  "address": "東京都江東区...",
  "phone": "03-1234-5678",
  "manager": "田中太郎",
  "capacity": 10000,
  "status": "ACTIVE"
}
```

`status` は省略できます（省略時は `ACTIVE`）。`status` に `null` を送ると `400 VALIDATION_ERROR` です（非 null 列）。`address` / `phone` / `manager` / `capacity` は nullable 列なので `null` を受け付けます。

**レスポンス** `201 Created` / `400 Bad Request`

---

#### `PUT /api/v1/warehouses/:id` 🔒 (ADMIN)

倉庫を更新します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**: 更新するフィールドのみ（Partial）

未指定（キーを送らない）は「変更しない」です。`null` は「未指定」ではなく入れられない値として扱い、DB の非 null 列へ送ると `400 VALIDATION_ERROR` になります（nullable 列は値のクリアとして受け付けます。冒頭「書き込みリクエストの任意項目」を参照）。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `DELETE /api/v1/warehouses/:id` 🔒 (ADMIN)

倉庫を削除します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス** `200 OK` / `404 Not Found`

---

### 9. 運送会社 (Carriers)

全エンドポイント 🔒（JWT認証必須）

#### `GET /api/v1/carriers`

運送会社一覧を取得します。

**クエリパラメータ**（共通ページネーション + 以下）

| パラメータ | 型     | 説明                                      |
| ---------- | ------ | ----------------------------------------- |
| `search`   | string | 運送会社名・コードで検索                  |
| `status`   | string | ステータスフィルター（ACTIVE / INACTIVE） |

**レスポンス** `200 OK`

```json
{
  "data": [
    {
      "id": 1,
      "code": "CR-001",
      "name": "ヤマト運輸",
      "address": "東京都中央区...",
      "phone": "03-1234-5678",
      "contactPerson": "山田花子",
      "email": "yamada@example.com",
      "status": "ACTIVE",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 5, "page": 1, "limit": 200, "totalPages": 1 }
}
```

---

#### `GET /api/v1/carriers/export`

運送会社一覧を Excel ファイルとしてエクスポートします。

**レスポンス**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### `GET /api/v1/carriers/:id`

運送会社詳細を取得します。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `POST /api/v1/carriers` 🔒 (ADMIN)

運送会社を作成します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**

```json
{
  "code": "CR-001",
  "name": "ヤマト運輸",
  "address": "東京都中央区...",
  "phone": "03-1234-5678",
  "contactPerson": "山田花子",
  "email": "yamada@example.com",
  "status": "ACTIVE"
}
```

`status` は省略できます（省略時は `ACTIVE`）。`status` に `null` を送ると `400 VALIDATION_ERROR` です（非 null 列）。`address` / `phone` / `contactPerson` / `email` は nullable 列なので `null` を受け付けます。

**レスポンス** `201 Created` / `400 Bad Request`

---

#### `PUT /api/v1/carriers/:id` 🔒 (ADMIN)

運送会社を更新します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**: 更新するフィールドのみ（Partial）

未指定（キーを送らない）は「変更しない」です。`null` は「未指定」ではなく入れられない値として扱い、DB の非 null 列へ送ると `400 VALIDATION_ERROR` になります（nullable 列は値のクリアとして受け付けます。冒頭「書き込みリクエストの任意項目」を参照）。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `DELETE /api/v1/carriers/:id` 🔒 (ADMIN)

運送会社を削除します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス** `200 OK` / `404 Not Found`

---

### 10. 仕入先 (Suppliers)

全エンドポイント 🔒（JWT認証必須）

#### `GET /api/v1/suppliers`

仕入先一覧を取得します。

**クエリパラメータ**（共通ページネーション + 以下）

| パラメータ | 型     | 説明                                      |
| ---------- | ------ | ----------------------------------------- |
| `search`   | string | 仕入先名・コードで検索                    |
| `status`   | string | ステータスフィルター（ACTIVE / INACTIVE） |

**レスポンス** `200 OK`

```json
{
  "data": [
    {
      "id": 1,
      "code": "SUP-001",
      "name": "株式会社山田商事",
      "address": "大阪府大阪市...",
      "phone": "06-1234-5678",
      "contactPerson": "山田太郎",
      "email": "yamada@supplier.com",
      "status": "ACTIVE",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 8, "page": 1, "limit": 200, "totalPages": 1 }
}
```

---

#### `GET /api/v1/suppliers/export`

仕入先一覧を Excel ファイルとしてエクスポートします。

**レスポンス**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### `GET /api/v1/suppliers/:id`

仕入先詳細を取得します。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `POST /api/v1/suppliers` 🔒 (ADMIN)

仕入先を作成します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**

```json
{
  "code": "SUP-001",
  "name": "株式会社山田商事",
  "address": "大阪府大阪市...",
  "phone": "06-1234-5678",
  "contactPerson": "山田太郎",
  "email": "yamada@supplier.com",
  "status": "ACTIVE"
}
```

`status` は省略できます（省略時は `ACTIVE`）。`status` に `null` を送ると `400 VALIDATION_ERROR` です（非 null 列）。`address` / `phone` / `contactPerson` / `email` は nullable 列なので `null` を受け付けます。

**レスポンス** `201 Created` / `400 Bad Request`

---

#### `PUT /api/v1/suppliers/:id` 🔒 (ADMIN)

仕入先を更新します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**: 更新するフィールドのみ（Partial）

未指定（キーを送らない）は「変更しない」です。`null` は「未指定」ではなく入れられない値として扱い、DB の非 null 列へ送ると `400 VALIDATION_ERROR` になります（nullable 列は値のクリアとして受け付けます。冒頭「書き込みリクエストの任意項目」を参照）。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `DELETE /api/v1/suppliers/:id` 🔒 (ADMIN)

仕入先を削除します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス** `200 OK` / `404 Not Found`

---

### 11. 入荷 (Receivings)

全エンドポイント 🔒（JWT認証必須）

#### `GET /api/v1/receivings`

入荷一覧を取得します。

**クエリパラメータ**（共通ページネーション + 以下）

| パラメータ    | 型     | 説明                                                  |
| ------------- | ------ | ----------------------------------------------------- |
| `search`      | string | 入荷番号・仕入先で検索                                |
| `status`      | string | ステータスフィルター（DRAFT / CONFIRMED / COMPLETED） |
| `warehouseId` | number | 倉庫IDフィルター                                      |

**レスポンス** `200 OK`

```json
{
  "data": [
    {
      "id": 1,
      "receivingNo": "RCV-20260316-001",
      "receivingDate": "2026-03-16T00:00:00.000Z",
      "warehouseId": 1,
      "warehouse": { "id": 1, "name": "東京第一倉庫" },
      "supplierId": 1,
      "supplier": { "id": 1, "name": "株式会社山田商事" },
      "status": "DRAFT",
      "lines": [
        {
          "lineNo": 1,
          "productId": "uuid",
          "product": { "id": "uuid", "code": "PRD-001", "name": "商品名" },
          "plannedQty": 100,
          "actualQty": null
        }
      ],
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 20, "page": 1, "limit": 200, "totalPages": 1 }
}
```

---

#### `GET /api/v1/receivings/export` 🔒 (ADMIN)

入荷一覧を Excel ファイルとしてエクスポートします。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### `GET /api/v1/receivings/:id`

入荷詳細を取得します（明細行含む）。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `POST /api/v1/receivings` 🔒 (ADMIN)

入荷を作成します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。ステータスは DRAFT で作成されます。

**リクエストボディ**

```json
{
  "receivingDate": "2026-03-16",
  "warehouseId": 1,
  "supplierId": 1,
  "lines": [
    {
      "lineNo": 1,
      "productId": "uuid",
      "plannedQty": 100,
      "actualQty": 100
    }
  ]
}
```

**レスポンス** `201 Created`

---

#### `PUT /api/v1/receivings/:id` 🔒 (ADMIN)

入荷を更新します（DRAFT 時のみ）。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**: 更新するフィールドのみ（Partial）

未指定（キーを送らない）は「変更しない」です。`null` は「未指定」ではなく入れられない値として扱い、DB の非 null 列へ送ると `400 VALIDATION_ERROR` になります（nullable 列は値のクリアとして受け付けます。冒頭「書き込みリクエストの任意項目」を参照）。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `PUT /api/v1/receivings/:id/confirm` 🔒 (ADMIN)

入荷を確定します（DRAFT → CONFIRMED）。在庫が加算されます。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス** `200 OK`

---

#### `PUT /api/v1/receivings/:id/complete` 🔒 (ADMIN)

入荷を完了にします（CONFIRMED → COMPLETED）。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス** `200 OK`

---

#### `DELETE /api/v1/receivings/:id` 🔒 (ADMIN)

入荷を削除します（ソフトデリート）。CONFIRMED 時は在庫が減算されます。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス** `200 OK` / `404 Not Found`

---

### 12. 出荷 (Shipments)

全エンドポイント 🔒（JWT認証必須）

#### `GET /api/v1/shipments`

出荷一覧を取得します。

**クエリパラメータ**（共通ページネーション + 以下）

| パラメータ    | 型     | 説明                                                |
| ------------- | ------ | --------------------------------------------------- |
| `search`      | string | 出荷番号・出荷先で検索                              |
| `status`      | string | ステータスフィルター（DRAFT / CONFIRMED / SHIPPED） |
| `warehouseId` | number | 倉庫IDフィルター                                    |

**レスポンス** `200 OK`

```json
{
  "data": [
    {
      "id": 1,
      "shipmentNo": "SHP-20260316-001",
      "shipmentDate": "2026-03-16T00:00:00.000Z",
      "warehouseId": 1,
      "warehouse": { "id": 1, "name": "東京第一倉庫" },
      "destination": "大阪支店",
      "carrierId": 1,
      "carrier": { "id": 1, "name": "ヤマト運輸" },
      "status": "DRAFT",
      "lines": [
        {
          "lineNo": 1,
          "productId": "uuid",
          "product": { "id": "uuid", "code": "PRD-001", "name": "商品名" },
          "plannedQty": 50,
          "actualQty": null
        }
      ],
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 15, "page": 1, "limit": 200, "totalPages": 1 }
}
```

---

#### `GET /api/v1/shipments/export` 🔒 (ADMIN)

出荷一覧を Excel ファイルとしてエクスポートします。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### `GET /api/v1/shipments/:id`

出荷詳細を取得します（明細行含む）。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `POST /api/v1/shipments` 🔒 (ADMIN)

出荷を作成します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。ステータスは DRAFT で作成されます。

**リクエストボディ**

```json
{
  "shipmentDate": "2026-03-16",
  "warehouseId": 1,
  "destination": "大阪支店",
  "carrierId": 1,
  "lines": [
    {
      "lineNo": 1,
      "productId": "uuid",
      "plannedQty": 50,
      "actualQty": 50
    }
  ]
}
```

**レスポンス** `201 Created`

---

#### `PUT /api/v1/shipments/:id` 🔒 (ADMIN)

出荷を更新します（DRAFT 時のみ）。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**: 更新するフィールドのみ（Partial）

未指定（キーを送らない）は「変更しない」です。`null` は「未指定」ではなく入れられない値として扱い、DB の非 null 列へ送ると `400 VALIDATION_ERROR` になります（nullable 列は値のクリアとして受け付けます。冒頭「書き込みリクエストの任意項目」を参照）。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `PUT /api/v1/shipments/:id/confirm` 🔒 (ADMIN)

出荷を確定します（DRAFT → CONFIRMED）。在庫が減算されます。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス** `200 OK`

---

#### `PUT /api/v1/shipments/:id/ship` 🔒 (ADMIN)

出荷完了にします（CONFIRMED → SHIPPED）。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス** `200 OK`

---

#### `DELETE /api/v1/shipments/:id` 🔒 (ADMIN)

出荷を削除します（ソフトデリート）。CONFIRMED 時は在庫が加算されます。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス** `200 OK` / `404 Not Found`

---

### 13. 入出荷統合 (Shipping)

全エンドポイント 🔒（JWT認証必須）

入荷と出荷を統合した読み取り専用ビューです。

#### `GET /api/v1/shipping`

入出荷統合一覧を取得します。

**クエリパラメータ**（共通ページネーション + 以下）

| パラメータ    | 型     | 説明                                   |
| ------------- | ------ | -------------------------------------- |
| `search`      | string | 伝票番号・仕入先/出荷先で検索          |
| `type`        | string | 種別フィルター（RECEIVING / SHIPMENT） |
| `warehouseId` | number | 倉庫IDフィルター                       |

**レスポンス** `200 OK`

```json
{
  "data": [
    {
      "type": "RECEIVING",
      "documentNo": "RCV-20260316-001",
      "date": "2026-03-16T00:00:00.000Z",
      "warehouseId": 1,
      "warehouseName": "東京第一倉庫",
      "counterparty": "株式会社山田商事",
      "status": "CONFIRMED"
    },
    {
      "type": "SHIPMENT",
      "documentNo": "SHP-20260316-001",
      "date": "2026-03-16T00:00:00.000Z",
      "warehouseId": 1,
      "warehouseName": "東京第一倉庫",
      "counterparty": "大阪支店",
      "status": "DRAFT"
    }
  ],
  "meta": { "total": 35, "page": 1, "limit": 200, "totalPages": 1 }
}
```

---

#### `GET /api/v1/shipping/export`

入出荷データを Excel ファイルとしてエクスポートします。

**レスポンス**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

### 14. 在庫 (Stocks)

全エンドポイント 🔒（JWT認証必須）

読み取り専用の在庫参照エンドポイントです。在庫の増減は入荷確定・出荷確定・棚卸確定で自動的に行われます。

#### `GET /api/v1/stocks`

倉庫別在庫一覧を取得します。

**クエリパラメータ**（共通ページネーション + 以下）

| パラメータ    | 型     | 説明                 |
| ------------- | ------ | -------------------- |
| `search`      | string | 商品名・コードで検索 |
| `warehouseId` | number | 倉庫IDフィルター     |
| `category`    | string | カテゴリーフィルター |

**レスポンス** `200 OK`

```json
{
  "data": [
    {
      "id": 1,
      "warehouseId": 1,
      "warehouse": { "id": 1, "code": "WH-001", "name": "東京第一倉庫" },
      "productId": "uuid",
      "product": {
        "id": "uuid",
        "code": "PRD-001",
        "name": "商品名",
        "unit": "個",
        "category": { "name": "電子機器" }
      },
      "quantity": 100
    }
  ],
  "meta": { "total": 200, "page": 1, "limit": 200, "totalPages": 1 }
}
```

---

#### `GET /api/v1/stocks/export` 🔒 (ADMIN)

在庫データを Excel ファイルとしてエクスポートします。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### `GET /api/v1/stocks/forecast`

予測在庫一覧を取得します。確定済みの入荷予定・出荷予定を加味した将来在庫を算出します。

**クエリパラメータ**（共通ページネーション + 以下）

| パラメータ    | 型     | 説明                 |
| ------------- | ------ | -------------------- |
| `search`      | string | 商品名・コードで検索 |
| `warehouseId` | number | 倉庫IDフィルター     |

**レスポンス** `200 OK`

```json
{
  "data": [
    {
      "warehouse": { "code": "WH-001", "name": "東京第一倉庫" },
      "product": { "code": "PRD-001", "name": "商品名" },
      "quantity": 100,
      "incomingQty": 50,
      "outgoingQty": 30,
      "forecastQty": 120,
      "alert": ""
    }
  ],
  "meta": { "total": 200, "page": 1, "limit": 200, "totalPages": 1 }
}
```

---

#### `GET /api/v1/stocks/forecast/export` 🔒 (ADMIN)

予測在庫データを Excel ファイルとしてエクスポートします。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

### 15. 棚卸 (Stocktakings)

全エンドポイント 🔒（JWT認証必須）

#### `GET /api/v1/stocktakings`

棚卸一覧を取得します。

**クエリパラメータ**（共通ページネーション + 以下）

| パラメータ    | 型     | 説明                                      |
| ------------- | ------ | ----------------------------------------- |
| `status`      | string | ステータスフィルター（DRAFT / CONFIRMED） |
| `warehouseId` | number | 倉庫IDフィルター                          |

**レスポンス** `200 OK`

```json
{
  "data": [
    {
      "id": 1,
      "stocktakingDate": "2026-03-16T00:00:00.000Z",
      "warehouseId": 1,
      "warehouse": { "id": 1, "name": "東京第一倉庫" },
      "stocktaker": "田中太郎",
      "status": "DRAFT",
      "items": [
        {
          "productId": "uuid",
          "product": { "id": "uuid", "code": "PRD-001", "name": "商品名" },
          "theoreticalQty": 100,
          "actualQty": 98,
          "differenceReason": "破損2個"
        }
      ],
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 5, "page": 1, "limit": 200, "totalPages": 1 }
}
```

---

#### `GET /api/v1/stocktakings/export`

棚卸一覧を Excel ファイルとしてエクスポートします。

**レスポンス**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### `GET /api/v1/stocktakings/:id`

棚卸詳細を取得します（明細含む）。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `POST /api/v1/stocktakings` 🔒 (ADMIN)

棚卸を作成します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。ステータスは DRAFT で作成されます。

**リクエストボディ**

```json
{
  "stocktakingDate": "2026-03-16",
  "warehouseId": 1,
  "stocktaker": "田中太郎",
  "items": [
    {
      "productId": "uuid",
      "theoreticalQty": 100,
      "actualQty": 98,
      "differenceReason": "破損2個"
    }
  ]
}
```

**レスポンス** `201 Created`

---

#### `PUT /api/v1/stocktakings/:id` 🔒 (ADMIN)

棚卸を更新します（DRAFT 時のみ）。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**: 更新するフィールドのみ（Partial）

未指定（キーを送らない）は「変更しない」です。`null` は「未指定」ではなく入れられない値として扱い、DB の非 null 列へ送ると `400 VALIDATION_ERROR` になります（nullable 列は値のクリアとして受け付けます。冒頭「書き込みリクエストの任意項目」を参照）。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `PUT /api/v1/stocktakings/:id/confirm` 🔒 (ADMIN)

棚卸を確定します（DRAFT → CONFIRMED）。在庫が実数量で上書きされます。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス** `200 OK`

---

#### `DELETE /api/v1/stocktakings/:id` 🔒 (ADMIN)

棚卸を削除します（DRAFT 時のみ）。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス** `200 OK` / `404 Not Found`

---

### 16. 発注 (Orders)

全エンドポイント 🔒（JWT認証必須）

#### `GET /api/v1/orders`

発注一覧を取得します。

**クエリパラメータ**（共通ページネーション + 以下）

| パラメータ | 型     | 説明                                                                     |
| ---------- | ------ | ------------------------------------------------------------------------ |
| `search`   | string | 発注番号・仕入先で検索                                                   |
| `status`   | string | ステータスフィルター（DRAFT / ORDERED / PARTIALLY_RECEIVED / COMPLETED） |

**レスポンス** `200 OK`

```json
{
  "data": [
    {
      "id": 1,
      "orderNo": "ORD-20260316-001",
      "orderDate": "2026-03-16T00:00:00.000Z",
      "supplierId": 1,
      "supplier": { "id": 1, "name": "株式会社山田商事" },
      "desiredDeliveryDate": "2026-03-23T00:00:00.000Z",
      "totalAmount": 500000,
      "status": "DRAFT",
      "items": [
        {
          "lineNo": 1,
          "productId": "uuid",
          "product": { "id": "uuid", "code": "PRD-001", "name": "商品名" },
          "orderQty": 50,
          "unitPrice": 10000
        }
      ],
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 12, "page": 1, "limit": 200, "totalPages": 1 }
}
```

---

#### `GET /api/v1/orders/export`

発注一覧を Excel ファイルとしてエクスポートします。

**レスポンス**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

---

#### `GET /api/v1/orders/:id`

発注詳細を取得します（明細含む）。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `POST /api/v1/orders` 🔒 (ADMIN)

発注を作成します。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。ステータスは DRAFT で作成されます。

**リクエストボディ**

```json
{
  "orderDate": "2026-03-16",
  "supplierId": 1,
  "desiredDeliveryDate": "2026-03-23",
  "items": [
    {
      "lineNo": 1,
      "productId": "uuid",
      "orderQty": 50,
      "unitPrice": 10000
    }
  ]
}
```

**レスポンス** `201 Created`

---

#### `PUT /api/v1/orders/:id` 🔒 (ADMIN)

発注を更新します（DRAFT 時のみ）。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**リクエストボディ**: 更新するフィールドのみ（Partial）

未指定（キーを送らない）は「変更しない」です。`null` は「未指定」ではなく入れられない値として扱い、DB の非 null 列へ送ると `400 VALIDATION_ERROR` になります（nullable 列は値のクリアとして受け付けます。冒頭「書き込みリクエストの任意項目」を参照）。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `PUT /api/v1/orders/:id/confirm` 🔒 (ADMIN)

発注を確定します（DRAFT → ORDERED）。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス** `200 OK`

---

#### `DELETE /api/v1/orders/:id` 🔒 (ADMIN)

発注を削除します（ソフトデリート）。WH_ADMIN / OF_ADMIN / SYS_ADMIN のみ。

**レスポンス** `200 OK` / `404 Not Found`

---

### 17. システム設定 (System Settings)

全エンドポイント 🔒（JWT認証必須）

#### `GET /api/v1/system-settings/public/config`

フロントエンド用の公開設定を取得します。認証済みユーザーであれば誰でもアクセス可能。

**レスポンス** `200 OK`

```json
{
  "system.app_name": "StructPass",
  "system.locale": "ja"
}
```

---

#### `GET /api/v1/system-settings` 🔒 (SYS_ADMIN)

システムパラメータ一覧を取得します。SYS_ADMIN のみ。

**レスポンス** `200 OK`

```json
[
  {
    "key": "system.app_name",
    "value": "StructPass",
    "description": "アプリケーション名",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
]
```

---

#### `GET /api/v1/system-settings/:key` 🔒 (SYS_ADMIN)

指定キーのシステムパラメータを取得します。SYS_ADMIN のみ。

**レスポンス** `200 OK` / `404 Not Found`

---

#### `PUT /api/v1/system-settings/:key` 🔒 (SYS_ADMIN)

指定キーのシステムパラメータを更新します。SYS_ADMIN のみ。

**リクエストボディ**

```json
{
  "value": "新しい値"
}
```

**レスポンス** `200 OK`

---

#### `PUT /api/v1/system-settings` 🔒 (SYS_ADMIN)

システムパラメータを一括更新します。SYS_ADMIN のみ。

**リクエストボディ**

```json
{
  "updates": [
    { "key": "system.app_name", "value": "StructPass v2" },
    { "key": "system.locale", "value": "en" }
  ]
}
```

**レスポンス** `200 OK`

---

### 17.5 一覧ページサイズ設定 (Table Pagination Settings)

一覧画面ごとのデフォルト件数 / 表示件数選択肢を per-tableId で管理。GET は全認証ユーザー（dashboard 配下の Provider が起動時に取得）、PUT は SYS_ADMIN のみ。

#### `GET /api/v1/list-pagination-settings` 🔒

全 tableId 分の設定を返します。

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "tableId": "products",
      "defaultPageSize": 50,
      "pageSizeOptions": "20,50,100,200",
      "updatedAt": "...",
      "updatedBy": null
    }
  ]
}
```

#### `GET /api/v1/list-pagination-settings/:tableId` 🔒

単一 tableId の設定を返します。

#### `PUT /api/v1/list-pagination-settings/:tableId` 🔒 (SYS_ADMIN)

**リクエストボディ**

```json
{ "defaultPageSize": 100, "pageSizeOptions": "20,50,100,200" }
```

#### `PUT /api/v1/list-pagination-settings` 🔒 (SYS_ADMIN)

一括更新。

**リクエストボディ**

```json
{
  "updates": [{ "tableId": "products", "defaultPageSize": 100, "pageSizeOptions": "20,50,100,200" }]
}
```

---

### 17.7 列幅設定 (User Table Column Widths)

ユーザー × テーブルごとの列幅を per-columnKey で永続化。全エンドポイント 🔒（JWT認証必須）。自身の個人設定のため監査ログ対象外（`@SkipAudit`）。レスポンスは列ごとに平坦化した配列（`{ tableId, columnKey, width, updatedAt }`）で、ネストした `widths[columnKey]` マップではない。`userId` は自分自身のデータのため返さない。

#### `GET /api/v1/user-table-column-widths/:tableId` 🔒

指定テーブルの保存済み列幅一覧を取得します。`tableId` は `TABLE_IDS` のいずれか（不正値は `400`）。

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": [{ "tableId": "products", "columnKey": "name", "width": 240, "updatedAt": "..." }]
}
```

#### `PUT /api/v1/user-table-column-widths/:tableId/:columnKey` 🔒

列幅を upsert（追加 or 更新）します。`columnKey` は英数字 / `-` `_` `.` `:`、1〜64 文字（`__proto__` / `constructor` / `prototype` は拒否）。`width` は `40`〜`2000` の整数。drag リサイズの高頻度アクセス対策として **60 req / 60s** にスロットリング。

**リクエストボディ**

```json
{ "width": 240 }
```

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": { "tableId": "products", "columnKey": "name", "width": 240, "updatedAt": "..." }
}
```

---

### 18. 掲示板 (Announcements)

全エンドポイント 🔒（JWT認証必須）

#### `GET /api/v1/announcements/config`

添付ファイル制限値（最大サイズ MB / 最大件数 / 許可拡張子）を取得します。

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": { "maxSizeMB": 20, "maxFiles": 4, "allowedExtensions": ["pdf", "png", "jpg"] }
}
```

設定値はシステム設定から読み、未設定時の既定は `maxSizeMB=20` / `maxFiles=4` / `allowedExtensions` は pdf・png・jpg・jpeg・gif・webp・xlsx・docx・pptx・zip・csv・txt・md です。`maxSizeMB` は 1〜500、`maxFiles` は 1〜20 に丸め、許可拡張子からは実行ファイル系（exe / bat / cmd / com / sh / ps1 / js / jse / vbs / vbe / msi / scr / dll）を除外します。

---

#### `GET /api/v1/announcements`

自身が所属するグループに公開された掲示一覧を取得します。全件返却でページネーションはありません。

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "リリースのお知らせ",
      "bodyMarkdown": "## 内容",
      "isNew": true,
      "isImportant": false,
      "notifiedAt": "2026-05-01T00:00:00.000Z",
      "sortOrder": -1
    }
  ]
}
```

---

#### `GET /api/v1/announcements/manage` 🔒 (SYS_ADMIN)

管理画面用の全件取得。下書き含む。レスポンスは `GET /api/v1/announcements` と同じ一覧項目です。

---

#### `GET /api/v1/announcements/manage/:id` 🔒 (SYS_ADMIN)

管理画面用の掲示詳細を取得します。公開グループによる制限を受けずに取得でき、レスポンスは `GET /api/v1/announcements/:id` と同じ形です。

---

#### `GET /api/v1/announcements/:id`

掲示の詳細を取得します。公開グループが設定された掲示は、自身がそのグループに属さない場合 `404 Not Found` になります。存在しない掲示と同じ応答に揃えており（不在と非可視を区別しない）、応答の差から宛先グループを推測できません。

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "リリースのお知らせ",
    "bodyMarkdown": "## 内容",
    "isNew": true,
    "isImportant": false,
    "notifiedAt": "2026-05-01T00:00:00.000Z",
    "sortOrder": -1,
    "roles": [{ "groupId": 2, "groupCode": "WH", "groupName": "倉庫担当" }],
    "attachments": [
      {
        "id": 10,
        "fileName": "manual.pdf",
        "mimeType": "application/pdf",
        "sizeBytes": 12345,
        "createdById": "usr_1",
        "createdAt": "2026-05-01T00:00:00.000Z"
      }
    ],
    "createdBy": "usr_1",
    "updatedBy": null,
    "creator": { "id": "usr_1", "name": "山田 太郎" },
    "updater": null,
    "createdAt": "2026-05-01T00:00:00.000Z",
    "updatedAt": "2026-05-01T00:00:00.000Z"
  }
}
```

---

#### `POST /api/v1/announcements` 🔒 (SYS_ADMIN)

掲示を新規作成します。

**リクエスト**

```json
{
  "title": "リリースのお知らせ",
  "bodyMarkdown": "## 内容",
  "isNew": true,
  "isImportant": false,
  "notifiedAt": "2026-05-01T00:00:00.000Z",
  "roleGroupIds": [2, 3]
}
```

| フィールド     | 必須 | 内容                                            |
| -------------- | ---- | ----------------------------------------------- |
| `title`        | ○    | 200文字以内                                     |
| `bodyMarkdown` | ○    | 50000文字以内（Markdown 本文）                  |
| `isNew`        |      | New ラベル。既定 `false`                        |
| `isImportant`  |      | 重要ラベル。既定 `false`                        |
| `notifiedAt`   |      | 通知日時（ISO 8601）。未指定時は作成時刻        |
| `roleGroupIds` | ○    | 表示対象グループ ID の配列。重複不可・最大100件 |

`sortOrder` はサーバーが既存の最小値から1を引いて採番します。未知のフィールドは `400 BadRequest` になります。レスポンスは詳細（`GET /api/v1/announcements/:id`）と同じ形です。

---

#### `PATCH /api/v1/announcements/reorder` 🔒 (SYS_ADMIN)

並び順を一括更新します。`items` は1〜500件で、`id` が重複していると `400 BadRequest` になります。

**リクエスト**

```json
{ "items": [{ "id": 1, "sortOrder": 10 }] }
```

**レスポンス** `200 OK`

```json
{ "success": true, "data": { "message": "Announcements reordered" } }
```

---

#### `PUT /api/v1/announcements/:id` 🔒 (SYS_ADMIN)

掲示を更新します。本文は `POST /api/v1/announcements` と同じフィールドを部分指定でき、未指定の項目は変更しません。レスポンスは詳細（`GET /api/v1/announcements/:id`）と同じ形です。

---

#### `DELETE /api/v1/announcements/:id` 🔒 (SYS_ADMIN)

掲示を削除します（添付ファイルもカスケード削除）。

**レスポンス** `200 OK`

```json
{ "success": true, "data": { "message": "Announcement deleted successfully" } }
```

---

#### `POST /api/v1/announcements/:id/attachments` 🔒 (SYS_ADMIN)

添付ファイルを追加します。`multipart/form-data` の `file` フィールドで送信します。MIME / 拡張子 / サイズはサーバー側で再検証し、拡張子なし・実行ファイル系・許可外拡張子・上限超過は `400 BadRequest` になります。

**レスポンス** `201 Created`

```json
{
  "success": true,
  "data": {
    "id": 10,
    "fileName": "manual.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 12345,
    "createdById": "usr_1",
    "createdAt": "2026-05-01T00:00:00.000Z"
  }
}
```

---

#### `GET /api/v1/announcements/:id/attachments/:attId/download`

添付ファイルをダウンロードします。応答はファイル本体で、`Content-Type` / `Content-Disposition` / `Content-Length` を返します。許可外 MIME はサーバー側で `application/octet-stream` に正規化します。公開グループ外の掲示は `404 Not Found` になります（SYS_ADMIN は取得可）。存在しない掲示と同じ応答に揃えており（不在と非可視を区別しない）、応答の差から宛先グループを推測できません。

---

#### `DELETE /api/v1/announcements/:id/attachments/:attId` 🔒 (SYS_ADMIN)

添付ファイルを削除します。

**レスポンス** `200 OK`

```json
{ "success": true, "data": { "message": "Attachment deleted" } }
```

---

### 19. 監査ログ (Audit)

監査ログはコントローラーを持たず、`AuditInterceptor` により自動記録されます。
CUD 操作（Create / Update / Delete）を行うと、対象エンティティの変更前後の値が `audit_logs` テーブルに保存されます。

**記録される情報:**

| フィールド   | 説明                                       |
| ------------ | ------------------------------------------ |
| `userId`     | 操作を行ったユーザーID                     |
| `entityType` | エンティティ種別（例: Product, Warehouse） |
| `entityId`   | 対象レコードのID                           |
| `action`     | 操作種別（CREATE / UPDATE / DELETE）       |
| `oldValues`  | 変更前の値（JSON、CREATE時はnull）         |
| `newValues`  | 変更後の値（JSON、DELETE時はnull）         |
| `createdAt`  | 記録日時                                   |

> 監査ログの参照APIは現在未実装です。データベースから直接参照してください。

---

### 20. ダッシュボード (Dashboard)

各機能（マスタ・トランザクション）の登録件数をまとめて返します。ログイン必須。**権限で絞った結果を返す**のが特徴で、閲覧権限の無い機能は「0 件」ではなく要素ごと配列から落ちます（例: 一覧画面のダッシュボードに表示されない）。

#### `GET /api/v1/dashboard/counts` 🔒

各機能の登録件数（`featureId` ごと）を権限フィルタ付きで返します。

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": {
    "counts": [
      { "featureId": "products", "count": 128 },
      { "featureId": "warehouses", "count": 5 }
    ]
  }
}
```

権限の無い機能は `counts` 配列に現れません。

---

### 21. オブジェクト種別 (Object Types)

メタモデルの種別定義（例: `product`, `warehouse`）を扱います。ログイン必須です。台帳定義の作成・更新は固定の `object-types` 権限、種別の取得と自由定義レコード操作は、プリセットなら固定の `object-types` 権限、ユーザー定義なら台帳ごとの動的権限を使います。

#### `POST /api/v1/object-types` 🔒 (object-types: create)

ユーザー定義の台帳と項目定義を作成します。`isPreset` はサーバー側で常に `false` になり、`fieldDefs` の配列順が表示順として保存されます。

**リクエスト**

```json
{
  "key": "supplier-score",
  "name": "仕入先評価",
  "icon": "clipboard-check",
  "sortOrder": 6,
  "fieldDefs": [
    { "key": "name", "label": "仕入先名", "type": "TEXT", "required": true },
    { "key": "reviewedOn", "label": "評価日", "type": "DATE" }
  ]
}
```

`key` は100文字以内のkebab-case、`fieldDefs[].key` は100文字以内のlower camel caseです。`fieldDefs` は1〜100件、`type` は `TEXT | NUMBER | DATE | SELECT | BOOLEAN` のいずれかです。

**レスポンス** `201 Created`

```json
{
  "success": true,
  "data": {
    "id": 10,
    "key": "supplier-score",
    "name": "仕入先評価",
    "icon": "clipboard-check",
    "sortOrder": 6,
    "isPreset": false,
    "fieldDefs": [
      {
        "id": 20,
        "objectTypeId": 10,
        "key": "name",
        "label": "仕入先名",
        "type": "TEXT",
        "required": true,
        "sortOrder": 1
      },
      {
        "id": 21,
        "objectTypeId": 10,
        "key": "reviewedOn",
        "label": "評価日",
        "type": "DATE",
        "required": false,
        "sortOrder": 2
      }
    ],
    "createdAt": "2026-08-24T00:00:00.000Z",
    "updatedAt": "2026-08-24T00:00:00.000Z"
  }
}
```

**エラー**: 入力形式または同一リクエスト内の項目キー重複は `400 VALIDATION_ERROR / BAD_REQUEST`、既存の台帳キーとの重複は `409 CONFLICT` を返します。

#### `PUT /api/v1/object-types/:key` 🔒 (object-types: update)

ユーザー定義の台帳表示情報と項目定義を完全置換します。URLの`:key`は不変で、リクエストbodyには含めません。`name`と1件以上の`fieldDefs`は必須です。`icon`の省略または`null`はアイコン解除、`sortOrder`の省略は`0`として保存されます。

```json
{
  "name": "仕入先評価 改訂",
  "icon": null,
  "sortOrder": 6,
  "fieldDefs": [
    { "key": "name", "label": "仕入先名", "type": "TEXT", "required": true },
    { "key": "rating", "label": "評点", "type": "NUMBER", "required": false },
    { "key": "memo", "label": "メモ", "type": "TEXT", "required": false }
  ]
}
```

CustomRecordがない台帳では項目定義を自由に置換できます。1件以上ある場合、既存項目の削除・key変更・type変更・optionalからrequiredへの変更、およびrequiredな新規項目追加は`409 CONFLICT`です。表示名・並び順、requiredからoptionalへの緩和、optionalな項目追加は許可されます。プリセット種別は`403 FORBIDDEN`、不存在は`404 NOT_FOUND`です。

更新時にFieldDefを入れ替えるため、項目の安定識別子は`key`です。`id`、`createdAt`、`updatedAt`は更新ごとに変わり得るため、クライアントの参照キーとして使用しないでください。並行更新競合が内部再試行後も解消しない場合は`503 SERVICE_UNAVAILABLE`と`Retry-After`を返します。

#### `GET /api/v1/object-types` 🔒 (台帳ごとのview権限)

種別定義の一覧を返します。`SYS_ADMIN` は全件、それ以外のロールは、`object-types.view` を持つプリセット種別と、`object-type:<key>.view` を持つユーザー定義種別だけが返ります。機械認証の `GET /api/v1/integration/object-types` はこの絞り込みを行わず、従来どおり全件を返します。

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "key": "product",
      "name": "商品",
      "icon": null,
      "sortOrder": 1,
      "isPreset": true,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

#### `GET /api/v1/object-types/:key` 🔒 (台帳ごとのview権限)

キー指定で1件の種別定義を項目定義（`fieldDefs`・`sortOrder` 昇順）込みで返します。プリセット種別は `object-types.view`、ユーザー定義種別は `object-type:<key>.view` で判定します。

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": {
    "id": 1,
    "key": "product",
    "name": "商品",
    "icon": null,
    "sortOrder": 1,
    "isPreset": true,
    "fieldDefs": [],
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

**エラー**: `key` がkebab-caseでない、または100文字を超えると `400 BAD_REQUEST`、存在しないキーは `404 NOT_FOUND` を返します。ユーザー定義種別は、view権限がない場合も存在推測を防ぐため `404 NOT_FOUND` です。プリセット種別の権限不足は従来どおり `403 FORBIDDEN` です。

#### `GET /api/v1/object-types/:key/records` 🔒 (台帳ごとのview権限)

種別キーに属する自由定義データ（CustomRecord）をページング形式で一覧返します。プリセット種別（商品・倉庫・運送会社・仕入先・カテゴリー）は `object-types.view` を使い、常に空ページを返します（既存マスタの二重表示を防ぐ）。ユーザー定義種別は `object-type:<key>.view` を使います。

**クエリ**: `page`（既定 1、最大 10000）/ `limit`（既定 200、最大 1000）

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "objectTypeId": 10,
      "data": { "name": "仕入先01", "rating": 80, "reviewedOn": "2026-08-01" },
      "createdAt": "2026-08-01T00:00:00.000Z",
      "updatedAt": "2026-08-01T00:00:00.000Z"
    }
  ],
  "meta": { "total": 25, "page": 1, "limit": 200, "totalPages": 1 }
}
```

**エラー**: `key` がkebab-caseでない、または100文字を超えると `400 BAD_REQUEST`、存在しないキーは `404 NOT_FOUND` です。ユーザー定義種別は、view権限がない場合も存在推測を防ぐため `404 NOT_FOUND`、プリセット種別の権限不足は `403 FORBIDDEN` です（`GET /api/v1/object-types/:key` と同じ切り分け）。

#### `GET /api/v1/object-types/:key/records/:id` 🔒 (台帳ごとのview権限)

種別キーに属する自由定義データ（CustomRecord）を1件返します。一覧のページ窓（`skip` / `take`）を通らないため、2ページ目以降のレコードでも id を指定して直接取得できます。プリセット種別は `object-types.view`、ユーザー定義種別は `object-type:<key>.view` で判定します。

**パスパラメータ**: `id` は整数です。数値でない場合は `400 BAD_REQUEST` です。

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": {
    "id": 51,
    "objectTypeId": 10,
    "data": { "name": "仕入先51", "rating": 71, "reviewedOn": "2026-08-21" },
    "createdAt": "2026-08-01T00:00:00.000Z",
    "updatedAt": "2026-08-01T00:00:00.000Z"
  }
}
```

**エラー**: 存在しない id と、指定の種別（`:key`）に属さない id は区別せず `404 NOT_FOUND` です（更新・削除と同じ所属境界）。プリセット種別は専用マスタが正本でレコードを持たないため `404 NOT_FOUND` です。ユーザー定義種別の権限不足も存在推測を防ぐため `404 NOT_FOUND`、プリセット種別の権限不足は `403 FORBIDDEN`、存在しないキーは `404 NOT_FOUND`、`key` がkebab-caseでない、または100文字を超える場合は `400 BAD_REQUEST` です。

#### `POST /api/v1/object-types/:key/records` 🔒 (台帳ごとのcreate + view権限)

非プリセット種別に自由定義データ（CustomRecord）を作成します。`data` は persist 済み FieldDef を正本に動的検証されます。ユーザー定義種別では `object-type:<key>.create` と `object-type:<key>.view` の両方が必要です。プリセット種別は従来の `object-types.create` で判定しますが、専用マスタとの二重書込みを避けるためサービス側で拒否します。

**リクエスト**

```json
{
  "data": { "name": "仕入先01", "rating": 80, "reviewedOn": "2026-08-01" }
}
```

**レスポンス** `201 Created`

```json
{
  "success": true,
  "data": {
    "id": 51,
    "objectTypeId": 10,
    "data": { "name": "仕入先01", "rating": 80, "reviewedOn": "2026-08-01" },
    "createdAt": "2026-08-01T00:00:00.000Z",
    "updatedAt": "2026-08-01T00:00:00.000Z"
  }
}
```

**検証ルール**: FieldDef に存在しない未知キー・`required=true` フィールドの欠落（または `null`）・FieldType ごとの型不一致（TEXT=string / NUMBER=number(有限値) / DATE=`YYYY-MM-DD` string / SELECT=string / BOOLEAN=boolean）は `400 BAD_REQUEST` です。SELECT 型は FieldDef に選択肢定義（options）列が無いため選択肢検証は行いません（既知の制約）。

**エラー**: 存在しないキー、またはユーザー定義種別の権限不足は `404 NOT_FOUND`、形式不正なキーは `400 BAD_REQUEST`、プリセット種別への書込みは `403 FORBIDDEN` です。並行更新競合が内部再試行後も解消しない場合は `503 SERVICE_UNAVAILABLE` と `Retry-After` を返します。

#### `PUT /api/v1/object-types/:key/records/:id` 🔒 (台帳ごとのupdate + view権限)

既存の自由定義データの `data` を完全置換（full replacement）で更新します。ユーザー定義種別では `object-type:<key>.update` と `object-type:<key>.view` の両方が必要です。検証ルール・エラーは POST と同一です。

**リクエスト**

```json
{
  "data": { "name": "仕入先01改", "rating": 85, "reviewedOn": "2026-08-02" }
}
```

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": {
    "id": 51,
    "objectTypeId": 10,
    "data": { "name": "仕入先01改", "rating": 85, "reviewedOn": "2026-08-02" },
    "createdAt": "2026-08-01T00:00:00.000Z",
    "updatedAt": "2026-08-02T00:00:00.000Z"
  }
}
```

**エラー**: 対象 id が存在しない、または指定の ObjectType（`:key`）に属さない場合は `404 NOT_FOUND` です。ユーザー定義種別で権限がない場合も `404 NOT_FOUND` です。

#### `DELETE /api/v1/object-types/:key/records/:id` 🔒 (台帳ごとのdelete + view権限)

既存の自由定義データを削除します。ユーザー定義種別では `object-type:<key>.delete` と `object-type:<key>.view` の両方が必要です。プリセット種別は `object-types.delete` で判定しますが、サービス側で拒否します。

**レスポンス** `200 OK`

```json
{
  "success": true,
  "data": { "message": "CustomRecord deleted" }
}
```

**エラー**: 対象 id が存在しない、または指定の ObjectType（`:key`）に属さない場合は `404 NOT_FOUND`、ユーザー定義種別の権限不足も `404 NOT_FOUND`、形式不正なキーは `400 BAD_REQUEST`、プリセット種別は `403 FORBIDDEN` です。

---

## エラーレスポンス形式

すべてのエラーは「[共通レスポンス形式 › エラーレスポンス](#エラーレスポンス)」の統一フォーマット（`{ success: false, error: { code, message, details? } }`）で返却されます。HTTP ステータスと `error.code` の対応は以下。

### 主なステータスコードと `error.code`

| ステータス | `error.code`                       | 説明                                                                                           |
| ---------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `200`      | —（成功）                          | 成功                                                                                           |
| `201`      | —（成功）                          | 作成成功                                                                                       |
| `400`      | `BAD_REQUEST` / `VALIDATION_ERROR` | リクエスト不正。class-validator 由来は `VALIDATION_ERROR`（`details.validationErrors` に配列） |
| `401`      | `UNAUTHORIZED`                     | 認証エラー（トークン未提供・無効）                                                             |
| `403`      | `FORBIDDEN`                        | 権限不足（ロール不足）                                                                         |
| `404`      | `NOT_FOUND`                        | リソース未発見                                                                                 |
| `409`      | `CONFLICT`                         | 競合（コード重複など）                                                                         |
| `429`      | `TOO_MANY_REQUESTS`                | レートリミット超過（`@nestjs/throttler` 由来）                                                 |
| `500`      | `INTERNAL_ERROR`                   | サーバー内部エラー（`message` は `An unexpected error occurred`）                              |

## 認証

🔒 マークのエンドポイントは認証が必要です。

```
Authorization: Bearer <access_token>
```

または Cookie `sp_token` にトークンが自動設定されます。

トークンは OIDC SSO ログイン（`GET /api/v1/auth/oidc/login` → rete 認証 → callback）完了時に Cookie `sp_token` へ自動発行されます。

### ロール一覧

| ロール      | 説明               |
| ----------- | ------------------ |
| `WH_USER`   | 倉庫担当（一般）   |
| `WH_ADMIN`  | 倉庫担当（管理者） |
| `OF_USER`   | 事務担当（一般）   |
| `OF_ADMIN`  | 事務担当（管理者） |
| `SYS_ADMIN` | システム管理者     |

- **(ADMIN)** = WH_ADMIN / OF_ADMIN / SYS_ADMIN のいずれか
- **(SYS_ADMIN)** = SYS_ADMIN のみ
