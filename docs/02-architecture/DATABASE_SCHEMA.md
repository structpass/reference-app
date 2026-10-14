# データベーススキーマ

## ER 図

```
┌─────────────────────────────────────────────────────────────────────────┐
│  User / Auth                                                            │
│                                                                         │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐         │
│  │    users      │     │   groups      │     │  role_permissions │        │
│  │──────────────│     │──────────────│     │──────────────────│         │
│  │ id       PK  │◀─┐  │ id       PK  │     │ id           PK  │         │
│  │ oidc_sub     │  │  │ code         │     │ role             │         │
│  │ role         │  │  │ name         │     │ feature_id       │         │
│  │ ...          │  │  │ role         │     │ can_view/create.. │        │
│  └──────┬───────┘  │  │ ...          │     └──────────────────┘         │
│         │          │  └──────┬───────┘                                   │
│         │          │         │                                            │
│         │    ┌─────┴─────────┴────┐     ┌──────────────────┐            │
│         │    │    user_groups      │     │   permissions     │            │
│         │    │────────────────────│     │──────────────────│            │
│         │    │ id            PK   │     │ id           PK  │            │
│         │    │ user_id       FK  ─┤     │ user_id      FK ─┤            │
│         │    │ group_id      FK  ─┤     │ group_id     FK ─┤            │
│         │    └────────────────────┘     │ feature_id       │            │
│         │                               └──────────────────┘            │
│         │    ┌──────────────────┐                                        │
│         │    │  revoked_tokens   │                                        │
│         │    │──────────────────│                                        │
│         │    │ id           PK  │                                        │
│         │    │ jti              │                                        │
│         │    │ expires_at       │                                        │
│         │    └──────────────────┘                                        │
└─────────┼───────────────────────────────────────────────────────────────┘
          │
          │  created_by / updated_by
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Master                                                                  │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  categories   │  │  warehouses   │  │   carriers    │  │  suppliers  │ │
│  │──────────────│  │──────────────│  │──────────────│  │────────────│  │
│  │ id       PK  │  │ id       PK  │  │ id       PK  │  │ id      PK │  │
│  │ code         │  │ code         │  │ code         │  │ code       │  │
│  │ name         │  │ name         │  │ name         │  │ name       │  │
│  │ status       │  │ status       │  │ status       │  │ status     │  │
│  └──────┬───────┘  └──┬───┬───┬──┘  └──────┬───────┘  └──┬────┬───┘  │
│         │             │   │   │             │             │    │       │
└─────────┼─────────────┼───┼───┼─────────────┼─────────────┼────┼───────┘
          │             │   │   │             │             │    │
          ▼             ▼   │   ▼             ▼             ▼    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Transaction                                                             │
│                                                                         │
│  ┌──────────────────┐  category_id   ┌──────────────────┐               │
│  │    products       │◀──────────────│ (categories)      │               │
│  │──────────────────│               └──────────────────┘               │
│  │ id           PK  │                                                   │
│  │ code             │   ┌────────────────────┐  ┌───────────────────┐  │
│  │ category_id  FK  │   │   receivings        │  │  receiving_lines   │ │
│  │ ...              │   │────────────────────│  │───────────────────│  │
│  └─┬──┬──┬──┬──┬──┘   │ id            PK   │  │ id           PK   │  │
│    │  │  │  │  │       │ warehouse_id  FK  ─┤  │ receiving_id FK  ─┤  │
│    │  │  │  │  │       │ supplier_id   FK  ─┤  │ product_id   FK  ─┤  │
│    │  │  │  │  │       │ created_by    FK  ─┤  └───────────────────┘  │
│    │  │  │  │  │       └────────────────────┘                          │
│    │  │  │  │  │                                                        │
│    │  │  │  │  │       ┌────────────────────┐  ┌───────────────────┐  │
│    │  │  │  │  │       │   shipments         │  │  shipment_lines    │ │
│    │  │  │  │  │       │────────────────────│  │───────────────────│  │
│    │  │  │  │  │       │ id            PK   │  │ id           PK   │  │
│    │  │  │  │  │       │ warehouse_id  FK  ─┤  │ shipment_id  FK  ─┤  │
│    │  │  │  │  │       │ carrier_id    FK  ─┤  │ product_id   FK  ─┤  │
│    │  │  │  │  │       │ created_by    FK  ─┤  └───────────────────┘  │
│    │  │  │  │  │       └────────────────────┘                          │
│    │  │  │  │  │                                                        │
│    │  │  │  │  │       ┌────────────────────┐                          │
│    │  │  │  │  └──────▶│   stocks            │                          │
│    │  │  │  │          │────────────────────│                          │
│    │  │  │  │          │ id            PK   │                          │
│    │  │  │  │          │ warehouse_id  FK  ─┤                          │
│    │  │  │  │          │ product_id    FK  ─┤                          │
│    │  │  │  │          └────────────────────┘                          │
│    │  │  │  │                                                           │
│    │  │  │  │  ┌────────────────────┐  ┌───────────────────┐           │
│    │  │  │  └─▶│   stocktakings      │  │ stocktaking_items  │          │
│    │  │  │     │────────────────────│  │───────────────────│           │
│    │  │  │     │ id            PK   │  │ id            PK  │           │
│    │  │  │     │ warehouse_id  FK  ─┤  │ stocktaking_id FK─┤           │
│    │  │  │     │ created_by    FK  ─┤  │ product_id    FK ─┤           │
│    │  │  │     └────────────────────┘  └───────────────────┘           │
│    │  │  │                                                              │
│    │  │  │     ┌──────────────────────┐                                │
│    │  │  └────▶│  stock_adjustments    │                                │
│    │  │        │──────────────────────│                                │
│    │  │        │ id             PK    │                                │
│    │  │        │ warehouse_id   FK   ─┤                                │
│    │  │        │ product_id     FK   ─┤                                │
│    │  │        │ created_by     FK   ─┤                                │
│    │  │        └──────────────────────┘                                │
│    │  │                                                                 │
│    │  │        ┌────────────────────┐  ┌───────────────────┐           │
│    │  └───────▶│   orders            │  │   order_items      │          │
│    │           │────────────────────│  │───────────────────│           │
│    │           │ id            PK   │  │ id           PK   │           │
│    │           │ supplier_id   FK  ─┤  │ order_id     FK  ─┤           │
│    │           │ created_by    FK  ─┤  │ product_id   FK  ─┤           │
│    │           └────────────────────┘  └───────────────────┘           │
│    │                                                                    │
└────┼────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  System                                                                  │
│                                                                         │
│  ┌──────────────────┐     ┌──────────────────────┐                      │
│  │   audit_logs      │     │  system_parameters    │                      │
│  │──────────────────│     │──────────────────────│                      │
│  │ id           PK  │     │ id              PK   │                      │
│  │ user_id      FK ─┤     │ key                  │                      │
│  │ entity_type      │     │ updated_by_id   FK  ─┤                      │
│  │ entity_id        │     └──────────────────────┘                      │
│  │ action           │                                                    │
│  └──────────────────┘                                                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  Custom Object (Metamodel / ref-0013)                                    │
│                                                                         │
│  ┌──────────────────┐     ┌──────────────────────┐                      │
│  │   object_types    │     │     field_defs        │                      │
│  │──────────────────│     │──────────────────────│                      │
│  │ id           PK  │◀───│ object_type_id   FK ─┤                      │
│  │ key              │     │ key                   │                      │
│  │ name             │     │ type (FieldType)      │                      │
│  │ is_preset        │     └──────────────────────┘                      │
│  └──────┬───────────┘                                                    │
│         │                                                                │
│         │  object_type_id (RESTRICT)                                     │
│         ▼                                                                │
│  ┌──────────────────────┐                                                │
│  │   custom_records      │                                                │
│  │──────────────────────│                                                │
│  │ id              PK   │                                                │
│  │ object_type_id  FK  ─┤                                                │
│  │ data (JSON)          │                                                │
│  └──────────────────────┘                                                │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  Announcement (掲示板)                                                    │
│                                                                         │
│  ┌──────────────────┐     ┌──────────────────────────┐                  │
│  │  announcements    │     │   announcement_roles      │                  │
│  │──────────────────│     │──────────────────────────│                  │
│  │ id           PK  │◀───│ announcement_id      FK ─┤                  │
│  │ title            │     │ group_id             FK ─┤                  │
│  │ created_by_id FK │     └──────────────────────────┘                  │
│  └──────┬───────────┘                                                    │
│         │                                                                │
│         │  announcement_id (CASCADE)                                     │
│         ▼                                                                │
│  ┌────────────────────────────┐                                          │
│  │  announcement_attachments   │                                          │
│  │────────────────────────────│                                          │
│  │ id                    PK   │                                          │
│  │ announcement_id       FK  ─┤                                          │
│  │ created_by_id         FK  ─┤                                          │
│  └────────────────────────────┘                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### リレーション一覧

| 親テーブル    | 子テーブル                | FK カラム                    | 関係           |
| ------------- | ------------------------- | ---------------------------- | -------------- |
| users         | products                  | created_by, updated_by       | 1:N            |
| users         | audit_logs                | user_id                      | 1:N            |
| users         | user_groups               | user_id                      | 1:N            |
| users         | permissions               | user_id                      | 1:N            |
| users         | receivings                | created_by                   | 1:N            |
| users         | shipments                 | created_by                   | 1:N            |
| users         | stocktakings              | created_by                   | 1:N            |
| users         | stock_adjustments         | created_by                   | 1:N            |
| users         | orders                    | created_by                   | 1:N            |
| users         | system_parameters         | updated_by_id                | 1:N            |
| users         | table_pagination_settings | updated_by_id                | 1:N            |
| users         | user_table_column_widths  | user_id                      | 1:N (CASCADE)  |
| users         | announcements             | created_by_id, updated_by_id | 1:N            |
| users         | announcement_attachments  | created_by_id                | 1:N (SET NULL) |
| groups        | user_groups               | group_id                     | 1:N            |
| groups        | permissions               | group_id                     | 1:N            |
| groups        | announcement_roles        | group_id                     | 1:N (CASCADE)  |
| categories    | products                  | category_id                  | 1:N            |
| warehouses    | receivings                | warehouse_id                 | 1:N            |
| warehouses    | shipments                 | warehouse_id                 | 1:N            |
| warehouses    | stocks                    | warehouse_id                 | 1:N            |
| warehouses    | stocktakings              | warehouse_id                 | 1:N            |
| warehouses    | stock_adjustments         | warehouse_id                 | 1:N            |
| carriers      | shipments                 | carrier_id                   | 1:N            |
| suppliers     | receivings                | supplier_id                  | 1:N            |
| suppliers     | orders                    | supplier_id                  | 1:N            |
| products      | receiving_lines           | product_id                   | 1:N            |
| products      | shipment_lines            | product_id                   | 1:N            |
| products      | stocks                    | product_id                   | 1:N            |
| products      | stocktaking_items         | product_id                   | 1:N            |
| products      | stock_adjustments         | product_id                   | 1:N            |
| products      | order_items               | product_id                   | 1:N            |
| receivings    | receiving_lines           | receiving_id                 | 1:N (CASCADE)  |
| shipments     | shipment_lines            | shipment_id                  | 1:N (CASCADE)  |
| stocktakings  | stocktaking_items         | stocktaking_id               | 1:N (CASCADE)  |
| orders        | order_items               | order_id                     | 1:N (CASCADE)  |
| object_types  | field_defs                | object_type_id               | 1:N (CASCADE)  |
| object_types  | custom_records            | object_type_id               | 1:N (RESTRICT) |
| announcements | announcement_roles        | announcement_id              | 1:N (CASCADE)  |
| announcements | announcement_attachments  | announcement_id              | 1:N (CASCADE)  |

---

## テーブル定義

### User / Auth グループ

#### users

ユーザー情報を管理する。認証・認可の中心テーブル。

| カラム        | 型        | 制約                    | 説明                                                 |
| ------------- | --------- | ----------------------- | ---------------------------------------------------- |
| id            | UUID      | PK, DEFAULT uuid()      | ユーザー ID                                          |
| oidc_sub      | VARCHAR   | UNIQUE, NULLABLE        | rete（IdP）発行の OIDC sub リンクキー。JIT 時に set  |
| email         | VARCHAR   | UNIQUE, NOT NULL        | メールアドレス                                       |
| name          | VARCHAR   | NOT NULL                | 表示名（OIDC name claim 由来 / 欠落時は email 流用） |
| role          | UserRole  | NULLABLE                | ユーザーロール（null = 権限待ち / pending）          |
| is_active     | BOOLEAN   | NOT NULL, DEFAULT true  | アクティブフラグ                                     |
| last_login_at | TIMESTAMP | NULLABLE                | 最終ログイン日時                                     |
| created_at    | TIMESTAMP | NOT NULL, DEFAULT now() | 作成日時                                             |
| updated_at    | TIMESTAMP | NOT NULL, AUTO UPDATE   | 更新日時                                             |

#### groups

ユーザーグループを管理する。所属は `user_groups` の中間テーブルで表す。グループ単位の機能別権限を設定する API は撤去済みで、現行の認可はロール×機能（下記 `role_permissions`）で決まる。

| カラム      | 型           | 制約                      | 説明                       |
| ----------- | ------------ | ------------------------- | -------------------------- |
| id          | SERIAL       | PK, AUTO INCREMENT        | グループ ID                |
| code        | VARCHAR      | UNIQUE, NOT NULL          | グループコード             |
| name        | VARCHAR      | NOT NULL                  | グループ名                 |
| description | TEXT         | NULLABLE                  | 説明                       |
| role        | UserRole     | NOT NULL, DEFAULT WH_USER | グループのデフォルトロール |
| status      | ActiveStatus | NOT NULL, DEFAULT ACTIVE  | ステータス                 |
| created_at  | TIMESTAMP    | NOT NULL, DEFAULT now()   | 作成日時                   |
| updated_at  | TIMESTAMP    | NOT NULL, AUTO UPDATE     | 更新日時                   |

#### user_groups

ユーザーとグループの多対多リレーションを管理する中間テーブル。

| カラム     | 型        | 制約                      | 説明        |
| ---------- | --------- | ------------------------- | ----------- |
| id         | UUID      | PK, DEFAULT uuid()        | レコード ID |
| user_id    | UUID      | FK -> users.id, NOT NULL  | ユーザー ID |
| group_id   | INT       | FK -> groups.id, NOT NULL | グループ ID |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now()   | 作成日時    |

**ユニーク制約**: `(user_id, group_id)`

#### permissions

ユーザーまたはグループ単位の機能別アクセス権限を格納する旧テーブル。user_id と group_id はどちらか一方を使う想定（XOR）。**現行の認可からは参照されない**（有効権限はロール別の既定値・`role_permissions` のロール別の行・ユーザー定義台帳（非プリセット ObjectType）の動的権限で決まる）。この単位の権限 API は撤去済みで、書き込む経路も無い。テーブルと既存行は保持する。

| カラム     | 型      | 制約                      | 説明                              |
| ---------- | ------- | ------------------------- | --------------------------------- |
| id         | SERIAL  | PK, AUTO INCREMENT        | 権限 ID                           |
| user_id    | UUID    | FK -> users.id, NULLABLE  | ユーザー ID（ユーザー単位の場合） |
| group_id   | INT     | FK -> groups.id, NULLABLE | グループ ID（グループ単位の場合） |
| feature_id | VARCHAR | NOT NULL                  | 機能 ID                           |
| can_view   | BOOLEAN | NOT NULL, DEFAULT false   | 参照権限                          |

**インデックス**:

- `(user_id)`
- `(group_id)`
- `(feature_id)`

#### role_permissions

ロール別の CRUD 権限マスタ。

| カラム     | 型       | 制約                    | 説明           |
| ---------- | -------- | ----------------------- | -------------- |
| id         | SERIAL   | PK, AUTO INCREMENT      | レコード ID    |
| role       | UserRole | NOT NULL                | ユーザーロール |
| feature_id | VARCHAR  | NOT NULL                | 機能 ID        |
| can_view   | BOOLEAN  | NOT NULL, DEFAULT false | 参照権限       |
| can_create | BOOLEAN  | NOT NULL, DEFAULT false | 作成権限       |
| can_update | BOOLEAN  | NOT NULL, DEFAULT false | 更新権限       |
| can_delete | BOOLEAN  | NOT NULL, DEFAULT false | 削除権限       |

**ユニーク制約**: `(role, feature_id)`

#### revoked_tokens

JWT トークン無効化リスト。ログアウト時にトークンを失効させるために使用。

| カラム     | 型        | 制約                    | 説明                     |
| ---------- | --------- | ----------------------- | ------------------------ |
| id         | SERIAL    | PK, AUTO INCREMENT      | レコード ID              |
| jti        | VARCHAR   | UNIQUE, NOT NULL        | JWT ID（トークン識別子） |
| expires_at | TIMESTAMP | NOT NULL                | トークンの有効期限       |
| revoked_at | TIMESTAMP | NOT NULL, DEFAULT now() | 無効化日時               |

**インデックス**:

- `(expires_at)` — 期限切れトークンのクリーンアップ用

---

### Master グループ

#### products

商品マスタ。在庫管理・入出荷・発注の対象となる商品情報。

| カラム         | 型            | 制約                          | 説明             |
| -------------- | ------------- | ----------------------------- | ---------------- |
| id             | UUID          | PK, DEFAULT uuid()            | 商品 ID          |
| code           | VARCHAR       | UNIQUE, NOT NULL              | 商品コード       |
| name           | VARCHAR       | NOT NULL                      | 商品名           |
| description    | TEXT          | NULLABLE                      | 商品説明         |
| category_id    | INT           | FK -> categories.id, NOT NULL | カテゴリ ID      |
| price          | DECIMAL(10,2) | NOT NULL                      | 販売価格         |
| purchase_price | DECIMAL(10,2) | NULLABLE                      | 仕入価格         |
| unit           | VARCHAR       | NULLABLE                      | 単位             |
| stock_quantity | INT           | NOT NULL, DEFAULT 0           | 在庫数（サマリ） |
| status         | ProductStatus | NOT NULL, DEFAULT ACTIVE      | ステータス       |
| created_at     | TIMESTAMP     | NOT NULL, DEFAULT now()       | 作成日時         |
| updated_at     | TIMESTAMP     | NOT NULL, AUTO UPDATE         | 更新日時         |
| created_by     | UUID          | FK -> users.id, NULLABLE      | 作成者           |
| updated_by     | UUID          | FK -> users.id, NULLABLE      | 更新者           |

#### categories

商品カテゴリマスタ。

| カラム     | 型           | 制約                     | 説明           |
| ---------- | ------------ | ------------------------ | -------------- |
| id         | SERIAL       | PK, AUTO INCREMENT       | カテゴリ ID    |
| code       | VARCHAR      | UNIQUE, NOT NULL         | カテゴリコード |
| name       | VARCHAR      | NOT NULL                 | カテゴリ名     |
| status     | ActiveStatus | NOT NULL, DEFAULT ACTIVE | ステータス     |
| created_at | TIMESTAMP    | NOT NULL, DEFAULT now()  | 作成日時       |
| updated_at | TIMESTAMP    | NOT NULL, AUTO UPDATE    | 更新日時       |

#### warehouses

倉庫マスタ。在庫の保管場所を管理する。

| カラム     | 型           | 制約                     | 説明       |
| ---------- | ------------ | ------------------------ | ---------- |
| id         | SERIAL       | PK, AUTO INCREMENT       | 倉庫 ID    |
| code       | VARCHAR      | UNIQUE, NOT NULL         | 倉庫コード |
| name       | VARCHAR      | NOT NULL                 | 倉庫名     |
| address    | VARCHAR      | NULLABLE                 | 住所       |
| phone      | VARCHAR      | NULLABLE                 | 電話番号   |
| manager    | VARCHAR      | NULLABLE                 | 管理者名   |
| capacity   | INT          | NULLABLE                 | 保管容量   |
| status     | ActiveStatus | NOT NULL, DEFAULT ACTIVE | ステータス |
| created_at | TIMESTAMP    | NOT NULL, DEFAULT now()  | 作成日時   |
| updated_at | TIMESTAMP    | NOT NULL, AUTO UPDATE    | 更新日時   |

#### carriers

配送業者マスタ。出荷時の配送先を管理する。

| カラム         | 型           | 制約                     | 説明           |
| -------------- | ------------ | ------------------------ | -------------- |
| id             | SERIAL       | PK, AUTO INCREMENT       | 配送業者 ID    |
| code           | VARCHAR      | UNIQUE, NOT NULL         | 配送業者コード |
| name           | VARCHAR      | NOT NULL                 | 配送業者名     |
| address        | VARCHAR      | NULLABLE                 | 住所           |
| phone          | VARCHAR      | NULLABLE                 | 電話番号       |
| contact_person | VARCHAR      | NULLABLE                 | 担当者名       |
| email          | VARCHAR      | NULLABLE                 | メールアドレス |
| status         | ActiveStatus | NOT NULL, DEFAULT ACTIVE | ステータス     |
| created_at     | TIMESTAMP    | NOT NULL, DEFAULT now()  | 作成日時       |
| updated_at     | TIMESTAMP    | NOT NULL, AUTO UPDATE    | 更新日時       |

#### suppliers

仕入先マスタ。入荷・発注先の企業情報を管理する。

| カラム         | 型           | 制約                     | 説明           |
| -------------- | ------------ | ------------------------ | -------------- |
| id             | SERIAL       | PK, AUTO INCREMENT       | 仕入先 ID      |
| code           | VARCHAR      | UNIQUE, NOT NULL         | 仕入先コード   |
| name           | VARCHAR      | NOT NULL                 | 仕入先名       |
| address        | VARCHAR      | NULLABLE                 | 住所           |
| phone          | VARCHAR      | NULLABLE                 | 電話番号       |
| contact_person | VARCHAR      | NULLABLE                 | 担当者名       |
| email          | VARCHAR      | NULLABLE                 | メールアドレス |
| status         | ActiveStatus | NOT NULL, DEFAULT ACTIVE | ステータス     |
| created_at     | TIMESTAMP    | NOT NULL, DEFAULT now()  | 作成日時       |
| updated_at     | TIMESTAMP    | NOT NULL, AUTO UPDATE    | 更新日時       |

---

### Transaction グループ

#### receivings

入荷ヘッダ。仕入先からの商品受入を管理する。

| カラム         | 型              | 制約                          | 説明          |
| -------------- | --------------- | ----------------------------- | ------------- |
| id             | SERIAL          | PK, AUTO INCREMENT            | 入荷 ID       |
| receiving_no   | VARCHAR         | UNIQUE, NOT NULL              | 入荷番号      |
| receiving_date | DATE            | NOT NULL                      | 入荷日        |
| warehouse_id   | INT             | FK -> warehouses.id, NOT NULL | 入荷先倉庫 ID |
| supplier_id    | INT             | FK -> suppliers.id, NOT NULL  | 仕入先 ID     |
| status         | ReceivingStatus | NOT NULL, DEFAULT DRAFT       | ステータス    |
| created_by     | UUID            | FK -> users.id, NOT NULL      | 作成者        |
| deleted_at     | TIMESTAMP       | NULLABLE                      | 論理削除日時  |
| created_at     | TIMESTAMP       | NOT NULL, DEFAULT now()       | 作成日時      |
| updated_at     | TIMESTAMP       | NOT NULL, AUTO UPDATE         | 更新日時      |

#### receiving_lines

入荷明細行。入荷ごとの商品・数量を管理する。

| カラム       | 型     | 制約                                    | 説明     |
| ------------ | ------ | --------------------------------------- | -------- |
| id           | SERIAL | PK, AUTO INCREMENT                      | 明細 ID  |
| receiving_id | INT    | FK -> receivings.id (CASCADE), NOT NULL | 入荷 ID  |
| line_no      | INT    | NOT NULL                                | 行番号   |
| product_id   | UUID   | FK -> products.id, NOT NULL             | 商品 ID  |
| planned_qty  | INT    | NOT NULL                                | 予定数量 |
| actual_qty   | INT    | NULLABLE                                | 実績数量 |

**ユニーク制約**: `(receiving_id, line_no)`

**インデックス**: `(product_id)`

#### shipments

出荷ヘッダ。倉庫からの商品出荷を管理する。

| カラム        | 型             | 制約                          | 説明          |
| ------------- | -------------- | ----------------------------- | ------------- |
| id            | SERIAL         | PK, AUTO INCREMENT            | 出荷 ID       |
| shipment_no   | VARCHAR        | UNIQUE, NOT NULL              | 出荷番号      |
| shipment_date | DATE           | NOT NULL                      | 出荷日        |
| warehouse_id  | INT            | FK -> warehouses.id, NOT NULL | 出荷元倉庫 ID |
| destination   | VARCHAR        | NOT NULL                      | 出荷先        |
| carrier_id    | INT            | FK -> carriers.id, NULLABLE   | 配送業者 ID   |
| status        | ShipmentStatus | NOT NULL, DEFAULT DRAFT       | ステータス    |
| created_by    | UUID           | FK -> users.id, NOT NULL      | 作成者        |
| deleted_at    | TIMESTAMP      | NULLABLE                      | 論理削除日時  |
| created_at    | TIMESTAMP      | NOT NULL, DEFAULT now()       | 作成日時      |
| updated_at    | TIMESTAMP      | NOT NULL, AUTO UPDATE         | 更新日時      |

#### shipment_lines

出荷明細行。出荷ごとの商品・数量を管理する。

| カラム      | 型     | 制約                                   | 説明     |
| ----------- | ------ | -------------------------------------- | -------- |
| id          | SERIAL | PK, AUTO INCREMENT                     | 明細 ID  |
| shipment_id | INT    | FK -> shipments.id (CASCADE), NOT NULL | 出荷 ID  |
| line_no     | INT    | NOT NULL                               | 行番号   |
| product_id  | UUID   | FK -> products.id, NOT NULL            | 商品 ID  |
| planned_qty | INT    | NOT NULL                               | 予定数量 |
| actual_qty  | INT    | NULLABLE                               | 実績数量 |

**ユニーク制約**: `(shipment_id, line_no)`

**インデックス**: `(product_id)`

#### stocks

倉庫別商品在庫。倉庫と商品の組み合わせごとの現在庫数を保持する。

| カラム       | 型        | 制約                                 | 説明         |
| ------------ | --------- | ------------------------------------ | ------------ |
| id           | SERIAL    | PK, AUTO INCREMENT                   | 在庫 ID      |
| warehouse_id | INT       | FK -> warehouses.id, NOT NULL        | 倉庫 ID      |
| product_id   | UUID      | FK -> products.id, NOT NULL          | 商品 ID      |
| quantity     | INT       | NOT NULL, DEFAULT 0                  | 在庫数量     |
| updated_at   | TIMESTAMP | NOT NULL, DEFAULT now(), AUTO UPDATE | 最終更新日時 |

**ユニーク制約**: `(warehouse_id, product_id)`

#### stocktakings

棚卸ヘッダ。棚卸作業の実施記録を管理する。

| カラム           | 型                | 制約                          | 説明         |
| ---------------- | ----------------- | ----------------------------- | ------------ |
| id               | SERIAL            | PK, AUTO INCREMENT            | 棚卸 ID      |
| stocktaking_date | DATE              | NOT NULL                      | 棚卸日       |
| warehouse_id     | INT               | FK -> warehouses.id, NOT NULL | 対象倉庫 ID  |
| stocktaker       | VARCHAR           | NULLABLE                      | 棚卸担当者名 |
| status           | StocktakingStatus | NOT NULL, DEFAULT DRAFT       | ステータス   |
| created_by       | UUID              | FK -> users.id, NOT NULL      | 作成者       |
| created_at       | TIMESTAMP         | NOT NULL, DEFAULT now()       | 作成日時     |
| updated_at       | TIMESTAMP         | NOT NULL, AUTO UPDATE         | 更新日時     |

#### stocktaking_items

棚卸明細。棚卸対象の商品ごとの理論在庫・実在庫・差異を記録する。

| カラム            | 型      | 制約                                      | 説明                           |
| ----------------- | ------- | ----------------------------------------- | ------------------------------ |
| id                | SERIAL  | PK, AUTO INCREMENT                        | 明細 ID                        |
| stocktaking_id    | INT     | FK -> stocktakings.id (CASCADE), NOT NULL | 棚卸 ID                        |
| product_id        | UUID    | FK -> products.id, NOT NULL               | 商品 ID                        |
| theoretical_qty   | INT     | NOT NULL                                  | 理論在庫数                     |
| actual_qty        | INT     | NULLABLE                                  | 実在庫数                       |
| difference        | INT     | NULLABLE                                  | 差異数（actual - theoretical） |
| difference_reason | VARCHAR | NULLABLE                                  | 差異理由                       |

**ユニーク制約**: `(stocktaking_id, product_id)`

**インデックス**: `(product_id)`

#### stock_adjustments

在庫調整ログ。入荷・出荷・棚卸・手動調整による在庫変動の履歴を記録する。

| カラム          | 型             | 制約                          | 説明       |
| --------------- | -------------- | ----------------------------- | ---------- |
| id              | SERIAL         | PK, AUTO INCREMENT            | 調整 ID    |
| warehouse_id    | INT            | FK -> warehouses.id, NOT NULL | 倉庫 ID    |
| product_id      | UUID           | FK -> products.id, NOT NULL   | 商品 ID    |
| adjustment_type | AdjustmentType | NOT NULL                      | 調整種別   |
| quantity_before | INT            | NOT NULL                      | 調整前数量 |
| quantity_after  | INT            | NOT NULL                      | 調整後数量 |
| reason          | VARCHAR        | NULLABLE                      | 調整理由   |
| created_by      | UUID           | FK -> users.id, NOT NULL      | 作成者     |
| created_at      | TIMESTAMP      | NOT NULL, DEFAULT now()       | 作成日時   |

**インデックス**: `(warehouse_id, product_id, created_at)`

#### orders

発注ヘッダ。仕入先への発注を管理する。

| カラム                | 型            | 制約                         | 説明         |
| --------------------- | ------------- | ---------------------------- | ------------ |
| id                    | SERIAL        | PK, AUTO INCREMENT           | 発注 ID      |
| order_no              | VARCHAR       | UNIQUE, NOT NULL             | 発注番号     |
| order_date            | DATE          | NOT NULL                     | 発注日       |
| supplier_id           | INT           | FK -> suppliers.id, NOT NULL | 仕入先 ID    |
| desired_delivery_date | DATE          | NULLABLE                     | 希望納品日   |
| status                | OrderStatus   | NOT NULL, DEFAULT DRAFT      | ステータス   |
| total_qty             | INT           | NULLABLE                     | 合計数量     |
| total_amount          | DECIMAL(12,2) | NULLABLE                     | 合計金額     |
| created_by            | UUID          | FK -> users.id, NOT NULL     | 作成者       |
| deleted_at            | TIMESTAMP     | NULLABLE                     | 論理削除日時 |
| created_at            | TIMESTAMP     | NOT NULL, DEFAULT now()      | 作成日時     |
| updated_at            | TIMESTAMP     | NOT NULL, AUTO UPDATE        | 更新日時     |

#### order_items

発注明細行。発注ごとの商品・数量・金額を管理する。

| カラム     | 型            | 制約                                | 説明     |
| ---------- | ------------- | ----------------------------------- | -------- |
| id         | SERIAL        | PK, AUTO INCREMENT                  | 明細 ID  |
| order_id   | INT           | FK -> orders.id (CASCADE), NOT NULL | 発注 ID  |
| line_no    | INT           | NOT NULL                            | 行番号   |
| product_id | UUID          | FK -> products.id, NOT NULL         | 商品 ID  |
| order_qty  | INT           | NOT NULL                            | 発注数量 |
| unit_price | DECIMAL(10,2) | NOT NULL                            | 単価     |
| amount     | DECIMAL(12,2) | NOT NULL                            | 金額     |

**ユニーク制約**: `(order_id, line_no)`

---

### System グループ

#### audit_logs

操作の監査ログを記録する。エンティティの作成・更新・削除を追跡。

| カラム      | 型          | 制約                     | 説明                                      |
| ----------- | ----------- | ------------------------ | ----------------------------------------- |
| id          | UUID        | PK, DEFAULT uuid()       | ログ ID                                   |
| user_id     | UUID        | FK -> users.id, NOT NULL | 操作ユーザー                              |
| entity_type | VARCHAR     | NOT NULL                 | エンティティ種別（Product, Receiving 等） |
| entity_id   | VARCHAR     | NOT NULL                 | エンティティ ID                           |
| action      | AuditAction | NOT NULL                 | 操作種別                                  |
| old_values  | JSON        | NULLABLE                 | 変更前の値                                |
| new_values  | JSON        | NULLABLE                 | 変更後の値                                |
| created_at  | TIMESTAMP   | NOT NULL, DEFAULT now()  | 記録日時                                  |

**インデックス**:

- `(entity_type, entity_id)` — エンティティ別検索
- `(user_id)` — ユーザー別検索

#### system_parameters

システムパラメータ。アプリケーション全体の設定値をキーバリュー形式で管理する。

| カラム        | 型        | 制約                       | 説明                                 |
| ------------- | --------- | -------------------------- | ------------------------------------ |
| id            | UUID      | PK, DEFAULT uuid()         | パラメータ ID                        |
| key           | VARCHAR   | UNIQUE, NOT NULL           | パラメータキー                       |
| value         | VARCHAR   | NOT NULL                   | パラメータ値                         |
| value_type    | VARCHAR   | NOT NULL, DEFAULT 'STRING' | 値の型（STRING, NUMBER, BOOLEAN 等） |
| label         | VARCHAR   | NOT NULL                   | 表示ラベル                           |
| description   | TEXT      | NULLABLE                   | 説明                                 |
| category      | VARCHAR   | NOT NULL, DEFAULT 'system' | カテゴリ                             |
| sort_order    | INT       | NOT NULL, DEFAULT 0        | 表示順                               |
| created_at    | TIMESTAMP | NOT NULL, DEFAULT now()    | 作成日時                             |
| updated_at    | TIMESTAMP | NOT NULL, AUTO UPDATE      | 更新日時                             |
| updated_by_id | UUID      | FK -> users.id, NULLABLE   | 最終更新者                           |

**インデックス**:

- `(category)` — カテゴリ別検索

#### table_pagination_settings

一覧画面ごとのページサイズ設定。`tableId` をキーに per-list でデフォルト件数と表示件数選択肢を保持する。SYS_ADMIN が `/dashboard/list-preferences` から編集する。

| カラム            | 型        | 制約                     | 説明                                                              |
| ----------------- | --------- | ------------------------ | ----------------------------------------------------------------- |
| table_id          | VARCHAR   | PK                       | テーブル識別子（`@struct-pass/shared` の `TABLE_IDS` のいずれか） |
| default_page_size | INT       | NOT NULL                 | 初期表示件数                                                      |
| page_size_options | VARCHAR   | NOT NULL                 | 選択肢（例: `10,20,50,100`）                                      |
| created_at        | TIMESTAMP | NOT NULL, DEFAULT now()  | 作成日時                                                          |
| updated_at        | TIMESTAMP | NOT NULL, AUTO UPDATE    | 更新日時                                                          |
| updated_by_id     | UUID      | FK -> users.id, NULLABLE | 最終更新者                                                        |

**インデックス**:

- PK のみ（`table_id` は UNIQUE）

#### user_table_column_widths

ユーザーごとの一覧画面の列幅を永続化する。`(user_id, table_id, column_key)` の複合キーで 1 列幅 1 レコードを保持する。

| カラム     | 型        | 制約                                         | 説明           |
| ---------- | --------- | -------------------------------------------- | -------------- |
| user_id    | UUID      | PK(複合), FK -> users.id (CASCADE), NOT NULL | ユーザー ID    |
| table_id   | VARCHAR   | PK(複合), NOT NULL                           | テーブル識別子 |
| column_key | VARCHAR   | PK(複合), NOT NULL                           | 列キー         |
| width      | INT       | NOT NULL                                     | 列幅（px）     |
| updated_at | TIMESTAMP | NOT NULL, AUTO UPDATE                        | 更新日時       |

**主キー**: `(user_id, table_id, column_key)` 複合

**インデックス**:

- `(user_id, table_id)` — ユーザー × テーブル単位の列幅一括取得

---

### Custom Object グループ（Metamodel / ref-0013）

カスタムオブジェクト定義基盤（backend モジュール `object-types`。frontend の台帳管理画面（`/dashboard/object-types`）と自由定義レコード画面（`/dashboard/custom/<key>`）が、台帳定義の作成・更新 API と種別取得・自由定義レコード API を使う）。

#### object_types

種別定義（プリセット 5 種＋ユーザー定義）。カスタムオブジェクト機能の基盤テーブル。

| カラム     | 型        | 制約                    | 説明                 |
| ---------- | --------- | ----------------------- | -------------------- |
| id         | SERIAL    | PK, AUTO INCREMENT      | 種別 ID              |
| key        | VARCHAR   | UNIQUE, NOT NULL        | 種別キー             |
| name       | VARCHAR   | NOT NULL                | 種別名               |
| icon       | VARCHAR   | NULLABLE                | アイコン識別子       |
| sort_order | INT       | NOT NULL, DEFAULT 0     | 表示順               |
| is_preset  | BOOLEAN   | NOT NULL, DEFAULT false | プリセット種別フラグ |
| created_at | TIMESTAMP | NOT NULL, DEFAULT now() | 作成日時             |
| updated_at | TIMESTAMP | NOT NULL, AUTO UPDATE   | 更新日時             |

**インデックス**:

- `(sort_order)`

#### field_defs

フィールド定義。object_types に属するフィールドのスキーマを保持する。

| カラム         | 型        | 制約                                      | 説明           |
| -------------- | --------- | ----------------------------------------- | -------------- |
| id             | SERIAL    | PK, AUTO INCREMENT                        | フィールド ID  |
| object_type_id | INT       | FK -> object_types.id (CASCADE), NOT NULL | 所属種別 ID    |
| key            | VARCHAR   | NOT NULL                                  | フィールドキー |
| label          | VARCHAR   | NOT NULL                                  | 表示ラベル     |
| type           | FieldType | NOT NULL                                  | フィールド型   |
| required       | BOOLEAN   | NOT NULL, DEFAULT false                   | 必須フラグ     |
| sort_order     | INT       | NOT NULL, DEFAULT 0                       | 表示順         |
| created_at     | TIMESTAMP | NOT NULL, DEFAULT now()                   | 作成日時       |
| updated_at     | TIMESTAMP | NOT NULL, AUTO UPDATE                     | 更新日時       |

**ユニーク制約**: `(object_type_id, key)`

#### custom_records

ユーザー定義種別の汎用データ格納。`data`（JSONB）には現状 index なし（Phase 2 で JSONB 内条件検索を解禁時に GIN index 追加予定）。

| カラム         | 型        | 制約                                       | 説明                    |
| -------------- | --------- | ------------------------------------------ | ----------------------- |
| id             | SERIAL    | PK, AUTO INCREMENT                         | レコード ID             |
| object_type_id | INT       | FK -> object_types.id (RESTRICT), NOT NULL | 所属種別 ID             |
| data           | JSON      | NOT NULL                                   | レコードデータ（JSONB） |
| created_at     | TIMESTAMP | NOT NULL, DEFAULT now()                    | 作成日時                |
| updated_at     | TIMESTAMP | NOT NULL, AUTO UPDATE                      | 更新日時                |

**インデックス**:

- `(object_type_id)`

---

### Announcement グループ（掲示板）

#### announcements

掲示板の告知。役割別公開（announcement_roles）・添付ファイル（announcement_attachments）を持つ。

| カラム        | 型        | 制約                     | 説明             |
| ------------- | --------- | ------------------------ | ---------------- |
| id            | SERIAL    | PK, AUTO INCREMENT       | 告知 ID          |
| title         | VARCHAR   | NOT NULL                 | タイトル         |
| body_markdown | TEXT      | NOT NULL                 | 本文（Markdown） |
| is_new        | BOOLEAN   | NOT NULL, DEFAULT false  | 新着フラグ       |
| is_important  | BOOLEAN   | NOT NULL, DEFAULT false  | 重要フラグ       |
| notified_at   | TIMESTAMP | NOT NULL, DEFAULT now()  | 通知日時         |
| sort_order    | INT       | NOT NULL, DEFAULT 0      | 表示順           |
| created_by_id | UUID      | FK -> users.id, NOT NULL | 作成者           |
| updated_by_id | UUID      | FK -> users.id, NULLABLE | 最終更新者       |
| created_at    | TIMESTAMP | NOT NULL, DEFAULT now()  | 作成日時         |
| updated_at    | TIMESTAMP | NOT NULL, AUTO UPDATE    | 更新日時         |

**インデックス**:

- `(sort_order)`
- `(notified_at)`

#### announcement_roles

告知の公開対象グループを管理する中間テーブル。

| カラム          | 型  | 制約                                                 | 説明        |
| --------------- | --- | ---------------------------------------------------- | ----------- |
| announcement_id | INT | PK(複合), FK -> announcements.id (CASCADE), NOT NULL | 告知 ID     |
| group_id        | INT | PK(複合), FK -> groups.id (CASCADE), NOT NULL        | グループ ID |

**主キー**: `(announcement_id, group_id)` 複合

**インデックス**:

- `(group_id, announcement_id)`

#### announcement_attachments

告知の添付ファイル。

| カラム          | 型        | 制約                                       | 説明                    |
| --------------- | --------- | ------------------------------------------ | ----------------------- |
| id              | SERIAL    | PK, AUTO INCREMENT                         | 添付 ID                 |
| announcement_id | INT       | FK -> announcements.id (CASCADE), NOT NULL | 告知 ID                 |
| file_name       | VARCHAR   | NOT NULL                                   | ファイル名              |
| storage_path    | VARCHAR   | NOT NULL                                   | 保存パス                |
| mime_type       | VARCHAR   | NOT NULL                                   | MIME タイプ             |
| size_bytes      | INT       | NOT NULL                                   | ファイルサイズ（bytes） |
| sort_order      | INT       | NOT NULL, DEFAULT 0                        | 表示順                  |
| created_by_id   | UUID      | FK -> users.id (SET NULL), NULLABLE        | 添付者                  |
| created_at      | TIMESTAMP | NOT NULL, DEFAULT now()                    | 作成日時                |

**インデックス**:

- `(announcement_id)`
- `(created_by_id)`

---

## ENUM 定義

### UserRole

ユーザーの権限レベル。倉庫系（WH）とオフィス系（OF）に分類される。

| 値          | 説明                         |
| ----------- | ---------------------------- |
| `WH_USER`   | 倉庫一般ユーザー             |
| `WH_ADMIN`  | 倉庫管理者                   |
| `OF_USER`   | オフィス一般ユーザー         |
| `OF_ADMIN`  | オフィス管理者               |
| `SYS_ADMIN` | システム管理者（全操作可能） |

### ProductStatus

商品の状態を表す。

| 値             | 説明                     |
| -------------- | ------------------------ |
| `ACTIVE`       | 有効（通常利用可能）     |
| `INACTIVE`     | 無効（一時的に利用不可） |
| `DISCONTINUED` | 廃止（販売終了）         |

### ActiveStatus

マスタデータの有効/無効を表す汎用ステータス。warehouses, carriers, suppliers, categories, groups で使用。

| 値         | 説明 |
| ---------- | ---- |
| `ACTIVE`   | 有効 |
| `INACTIVE` | 無効 |

### AuditAction

監査ログの操作種別。

| 値       | 説明 |
| -------- | ---- |
| `CREATE` | 作成 |
| `UPDATE` | 更新 |
| `DELETE` | 削除 |

### ReceivingStatus

入荷伝票のステータス。

| 値          | 説明                       |
| ----------- | -------------------------- |
| `DRAFT`     | 下書き（編集可能）         |
| `CONFIRMED` | 確定（入荷予定として確定） |
| `COMPLETED` | 完了（入荷実績入力済み）   |

### ShipmentStatus

出荷伝票のステータス。

| 値          | 説明                       |
| ----------- | -------------------------- |
| `DRAFT`     | 下書き（編集可能）         |
| `CONFIRMED` | 確定（出荷予定として確定） |
| `SHIPPED`   | 出荷済み                   |

### StocktakingStatus

棚卸のステータス。

| 値          | 説明                                 |
| ----------- | ------------------------------------ |
| `DRAFT`     | 下書き（棚卸中）                     |
| `CONFIRMED` | 確定（棚卸結果を確定・在庫反映済み） |

### OrderStatus

発注伝票のステータス。

| 値                   | 説明                 |
| -------------------- | -------------------- |
| `DRAFT`              | 下書き（編集可能）   |
| `ORDERED`            | 発注済み             |
| `PARTIALLY_RECEIVED` | 一部入荷済み         |
| `COMPLETED`          | 完了（全数入荷済み） |

### AdjustmentType

在庫調整の種別。どの業務プロセスによって在庫が変動したかを記録する。

| 値            | 説明           |
| ------------- | -------------- |
| `STOCKTAKING` | 棚卸による調整 |
| `RECEIVING`   | 入荷による増加 |
| `SHIPMENT`    | 出荷による減少 |
| `MANUAL`      | 手動調整       |

### FieldType

カスタムオブジェクトのフィールド型（field_defs.type で使用）。

| 値        | 説明     |
| --------- | -------- |
| `TEXT`    | テキスト |
| `NUMBER`  | 数値     |
| `DATE`    | 日付     |
| `SELECT`  | 選択     |
| `BOOLEAN` | ブール値 |

---

## シードデータ

### ユーザー（6名）

| oidc_sub                             | email                          | name           | role      | is_active |
| ------------------------------------ | ------------------------------ | -------------- | --------- | --------- |
| 00000000-0000-4000-a000-000000000001 | `admin@struct-pass.example`    | システム管理者 | SYS_ADMIN | true      |
| 00000000-0000-4000-a000-000000000002 | `wh-user@struct-pass.example`  | 倉庫 一郎      | WH_USER   | true      |
| 00000000-0000-4000-a000-000000000003 | `wh-admin@struct-pass.example` | 倉庫 管理太郎  | WH_ADMIN  | true      |
| 00000000-0000-4000-a000-000000000004 | `of-user@struct-pass.example`  | 事務 花子      | OF_USER   | true      |
| 00000000-0000-4000-a000-000000000005 | `of-admin@struct-pass.example` | 事務 管理子    | OF_ADMIN  | true      |
| 00000000-0000-4000-a000-000000000006 | `tanaka@struct-pass.example`   | 田中 太郎      | WH_ADMIN  | true      |
