# マルチテナント設計方針

> 本リファレンス実装はマルチテナント機能を**実装していません**。
> 譲渡先で必要になった場合の選択肢と推奨方針を記録します。

---

## 1. 結論（Executive Summary）

- 本リファレンスは **単テナント設計**（譲渡先 1 社 = 1 instance）
- マルチテナント化が必要な場合の **第一推奨は Silo モデル**（instance / DB-per-tenant）
- Silo なら**現行コードを一切変更せず**、インフラ側のプロビジョニング自動化のみで実現可能
- Pool モデル（tenant_id 同居）が必要な場合は §4 の改修箇所を要参照

---

## 2. なぜリファレンスは単テナントなのか

| 理由                     | 内容                                                                             |
| ------------------------ | -------------------------------------------------------------------------------- |
| 設計の素直さを優先       | テナント分離コードが業務ロジックに混入すると、リファレンスとしての可読性が落ちる |
| 譲渡先の自由度           | 単テナント設計は Silo / Pool どちらの拡張にも踏み出しやすい中立な起点            |
| セキュリティ責務の明確化 | 「物理分離されている」は最も説明責任を果たしやすい状態                           |
| 12-factor 準拠           | `.env` で個別環境を組める設計は、そのまま Silo モデルの土台になる                |

---

## 3. マルチテナント実装パターン比較

### 3.1 4 パターンの分布

| パターン                        | 採用例                     | 同居度                      | 本実装との相性 |
| ------------------------------- | -------------------------- | --------------------------- | -------------- |
| **Row-level（tenant_id 同居）** | toC 寄り SaaS              | 1 DB に全社混在             | 改修大         |
| **Schema-per-tenant**           | 中規模 B2B SaaS            | 1 DB / 複数 schema          | 改修中         |
| **DB-per-tenant**               | 会計・金融系 SaaS          | 1 RDS instance / N database | 改修小         |
| **Instance-per-tenant（Silo）** | 銀行系・医療系・大企業 ERP | 顧客ごとにスタック丸ごと    | **改修ゼロ**   |

### 3.2 Silo vs Pool トレードオフ

| 観点                   | Silo（Instance別）                     | Pool（同居）                                      |
| ---------------------- | -------------------------------------- | ------------------------------------------------- |
| セキュリティ境界       | OS / VPC レベルで明確                  | アプリのコードに依存（バグれば即漏洩）            |
| バックアップ           | 顧客単位で完結。リストアもピンポイント | DB 全体を取らざるを得ず、特定顧客だけ巻き戻せない |
| ノイジーネイバー       | 影響なし                               | 1 顧客の重い query で全社遅延                     |
| 削除・撤退             | instance を terminate するだけ         | 全テーブルから tenant_id で DELETE（漏れリスク）  |
| 監査・コンプライアンス | 「物理分離」が最強                     | 論理分離の説明責任が重い                          |
| デプロイ運用           | テナント数 N 倍                        | 集約                                              |
| インフラコスト         | 高（小規模顧客でも instance 1 式）     | 低                                                |
| 実装コスト             | 低（アプリは単テナントのまま）         | 高（全 query にテナント分離）                     |

**まとめ**:

- Silo = **運用は重いがセキュリティは軽い**
- Pool = **コードは複雑だが運用は集約**

### 3.3 採用判断のフローチャート

```
顧客は法人 1 桁〜2 桁規模で、各顧客の規模が大きい？
├─ Yes → Silo を推奨
│
└─ No → 顧客は数百〜数千規模で、1 顧客あたり小規模？
    ├─ Yes → Pool（Row-level / Schema-per-tenant）を検討
    │
    └─ No → Silo を起点にハイブリッド設計を検討
```

---

## 4. Pool モデル（Row-level）が必要な場合の改修箇所

ここは譲渡先で Pool モデルを選んだ場合の参考メモ。本実装には**含まれていません**。

### 4.1 Prisma schema 改修

全業務テーブルに `tenantId` カラムを追加：

```prisma
model Product {
  id        String   @id @default(cuid())
  tenantId  String                    // ← 追加
  code      String
  name      String
  // ...
  tenant    Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, code])           // ← UNIQUE 制約を tenant 込みに変更
  @@index([tenantId])
}
```

対象テーブル候補（本実装で UNIQUE 制約を持つもの）:

- `products` (code)
- `categories` (code)
- `suppliers` (code)
- `carriers` (code)
- `warehouses` (code)
- `groups` (code)
- `users` (username, email)
- `orders` (orderNumber)
- `shipments` (shipmentNumber)
- `receivings` (receivingNumber)
- `stocktakings` (stocktakingNumber)
- `stocks` (warehouseId, productId 複合)

### 4.2 リクエストパイプラインに tenant 解決を注入

NestJS の場合：

```ts
// tenant.middleware.ts
// JWT / subdomain / header のいずれかから tenantId を抽出して
// CLS (cls-hooked / AsyncLocalStorage) に格納

// prisma.service.ts
// $extends で全 query に tenantId を強制注入
```

**重要**: middleware で**強制注入**しないと、開発者が tenantId を付け忘れた瞬間にデータ漏洩する。Prisma の `$extends` または middleware で WHERE / CREATE 双方を gate するのが鉄則。

### 4.3 認証・認可の二段化

現状の RBAC（permission matrix）に**テナント境界**を追加：

- ユーザーは必ず 1 つのテナントに属する（`users.tenantId`）
- SYS_ADMIN は「自テナント内の SYS_ADMIN」であり、他テナントを跨げない
- **プラットフォーム管理者**（全テナント横断）は別概念として独立させる（推奨：別テーブル / 別認証）

### 4.4 監査ログの隔離

`audit_logs.tenantId` を必須化。検索 UI は自テナント分しか見えないようにする。**プラットフォーム管理者専用の横断ビュー**は別 endpoint に分離。

### 4.5 セキュリティパターン爆発リスト

Pool モデルで設計時に**全項目チェック必須**：

| 観点               | リスク                              | 対策                                                 |
| ------------------ | ----------------------------------- | ---------------------------------------------------- |
| 横断 SELECT 漏れ   | A 社が B 社データを参照             | Prisma middleware で WHERE 強制                      |
| IDOR               | URL の id 直書きで他社レコード取得  | id だけでなく tenantId も照合                        |
| Bulk endpoint      | findMany / updateMany の WHERE 漏れ | E2E テストで他テナント混入を assert                  |
| File upload        | uploads 配下が共通ディレクトリ      | tenant 別 prefix `uploads/{tenantId}/...`            |
| Cache poisoning    | Redis key が tenant prefix なし     | 全 cache key に `tenantId:` prepend                  |
| Backup / Restore   | 全テナント混在 dump                 | tenant 単位で論理 dump 出力する script               |
| API rate limit     | グローバル制限で巻き込み            | tenant 別 quota                                      |
| Webhook / 外部連携 | コールバックで tenant 不明          | URL に tenant slug 含める                            |
| 削除 / 退会        | 全テーブル DELETE 漏れ              | `Tenant onDelete: Cascade` で物理削除 or soft delete |

---

## 5. Silo モデル（推奨）の運用設計

### 5.1 デプロイ単位

```
譲渡先 A: docker-compose / k8s namespace 一式（DB / API / UI 各 1 instance）
譲渡先 B: 完全に別環境
譲渡先 C: 完全に別環境
```

各 instance は本リファレンス実装の `.env` を切り替えるだけで起動可能。

### 5.2 自動化の選択肢

| 規模       | 推奨ツール                                                 |
| ---------- | ---------------------------------------------------------- |
| 数社程度   | docker-compose を顧客別 directory に複製                   |
| 10〜数十社 | Terraform module + Helm chart                              |
| 数十社以上 | Kubernetes Operator パターン（CRD で TenantInstance 定義） |

### 5.3 共通プラットフォーム機能

Silo でも以下は共通基盤として残すと運用が楽：

- **Identity Provider**: 共通 SSO（Auth0 / Keycloak / Cognito）
- **監視**: Datadog / Grafana で instance 横断ダッシュボード
- **ログ集約**: 各 instance の log を中央に転送（tenant tag 付き）
- **課金 / 契約管理**: 別 SaaS / 別 instance で管理

---

## 6. 譲渡先への引き渡し時のチェックリスト

譲渡先がマルチテナント要件を持つ場合、以下を確認：

- [ ] 顧客規模（1 桁 / 2 桁 / 3 桁以上）
- [ ] 顧客あたりの利用規模（小規模 / 中規模 / 大規模）
- [ ] コンプライアンス要件（医療 / 金融 / 政府 / 一般）
- [ ] データレジデンシー要件（国内 / EU / 米国）
- [ ] バックアップ・リストアの SLA（顧客単位 / 全体一括）
- [ ] 運用人員規模（インフラ運用工数の許容度）

これらが Silo / Pool の判断材料になる。

---

## 7. 関連ドキュメント

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 全体構成
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) — 現行スキーマ（単テナント前提）
- [USER_ROLES.md](./USER_ROLES.md) — RBAC 設計（テナント境界拡張時の起点）
