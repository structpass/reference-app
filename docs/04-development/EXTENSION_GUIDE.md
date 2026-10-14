# 拡張ガイド — 新しい機能の作り方

> このドキュメントは、既存の 30 機能のうちマスタ管理機能（3 画面セット）と同じパターンで新しい CRUD 機能を追加する手順を説明します。
> 「運送会社管理」（carriers）を実例として使います。

---

## 全体の流れ

新しいマスタ管理機能を追加する場合、以下の順序で作業します。

```
1. Prisma にテーブルを定義する
2. バックエンドにモジュールを作る
3. shared に型を追加する
4. フロントエンドにページ・フォームを作る
5. サイドバーにメニューを追加する
6. 権限を設定する
7. テストを書く
```

依存関係があるため、この順序を守ってください。後の手順は前の手順の成果物に依存します。

---

## 1. Prisma にテーブルを定義する

**ファイル**: `packages/backend/prisma/schema.prisma`

```prisma
model NewEntity {
  id            Int          @id @default(autoincrement())
  code          String       @unique
  name          String
  description   String?
  status        ActiveStatus @default(ACTIVE)
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")

  @@map("new_entities")
}
```

**守るべきパターン**:

| 項目           | ルール                              | 例                                  |
| -------------- | ----------------------------------- | ----------------------------------- |
| ID             | `Int @id @default(autoincrement())` | 全テーブル共通                      |
| コード         | `String @unique`                    | 業務上の識別子                      |
| ステータス     | `ActiveStatus @default(ACTIVE)`     | 有効/無効の切り替え                 |
| タイムスタンプ | `@default(now())` + `@updatedAt`    | 自動管理                            |
| テーブル名     | `@@map("snake_case")`               | PostgreSQL の命名規則に合わせる     |
| カラム名       | `@map("snake_case")`                | camelCase → snake_case のマッピング |

マイグレーションを作成:

```bash
pnpm --filter @struct-pass/backend prisma:migrate
# マイグレーション名を入力（例: add_new_entity）
```

---

## 2. バックエンドにモジュールを作る

### ファイル構成

```
packages/backend/src/modules/new-entities/
├── new-entities.module.ts
├── new-entities.controller.ts
├── new-entities.service.ts
└── dto/
    ├── create-new-entity.dto.ts
    ├── update-new-entity.dto.ts
    ├── find-new-entities.dto.ts
    └── index.ts
```

### DTO（バリデーション）

`create-new-entity.dto.ts`:

```typescript
import { IsString, IsNotEmpty, MaxLength, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActiveStatus } from '@prisma/client';

export class CreateNewEntityDto {
  @ApiProperty({ description: 'コード', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiProperty({ description: '名前', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: '説明' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: ActiveStatus })
  @IsEnum(ActiveStatus)
  @IsOptional()
  status?: ActiveStatus;
}
```

`update-new-entity.dto.ts`:

```typescript
import { PartialType } from '@nestjs/swagger';
import { CreateNewEntityDto } from './create-new-entity.dto';

export class UpdateNewEntityDto extends PartialType(CreateNewEntityDto) {}
```

`find-new-entities.dto.ts`:

```typescript
import { IsString, IsOptional, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ActiveStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindNewEntitiesDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: ActiveStatus })
  @IsEnum(ActiveStatus)
  @IsOptional()
  status?: ActiveStatus;
}
```

### Service（ビジネスロジック）

`new-entities.service.ts` の主要メソッド:

```typescript
@Injectable()
export class NewEntitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindNewEntitiesDto) {
    const { page = 1, limit = 200, sort = 'createdAt', order = 'desc', search, status } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.NewEntityWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;

    const allowedSortFields = ['code', 'name', 'status', 'createdAt', 'updatedAt'];
    const orderBy = allowedSortFields.includes(sort) ? { [sort]: order } : { createdAt: 'desc' };

    const [data, total] = await Promise.all([
      this.prisma.newEntity.findMany({ where, skip, take: limit, orderBy }),
      this.prisma.newEntity.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const entity = await this.prisma.newEntity.findUnique({ where: { id } });
    if (!entity) throw new NotFoundException('データが見つかりません');
    return { success: true, data: entity };
  }

  async create(dto: CreateNewEntityDto) {
    const existing = await this.prisma.newEntity.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('このコードは既に使用されています');

    const data = await this.prisma.newEntity.create({ data: dto });
    return { success: true, data };
  }

  async update(id: number, dto: UpdateNewEntityDto) {
    await this.findOne(id); // 存在確認
    if (dto.code) {
      const existing = await this.prisma.newEntity.findFirst({
        where: { code: dto.code, NOT: { id } },
      });
      if (existing) throw new ConflictException('このコードは既に使用されています');
    }

    const data = await this.prisma.newEntity.update({ where: { id }, data: dto });
    return { success: true, data };
  }

  async remove(id: number) {
    await this.findOne(id); // 存在確認
    await this.prisma.newEntity.delete({ where: { id } });
    return { success: true, data: null };
  }
}
```

**共通パターン**:

- `findAll`: `Promise.all` でデータ取得とカウントを並列実行
- `findOne`: 存在しなければ `NotFoundException`
- `create`: コード重複で `ConflictException`
- `update`: 存在確認 → コード重複チェック → 更新
- レスポンス形式: `{ success: true, data, meta? }`

### Controller（ルーティング）

```typescript
@ApiTags('new-entities')
@Controller('new-entities')
@UseGuards(JwtAuthGuard)
export class NewEntitiesController {
  constructor(private readonly service: NewEntitiesService) {}

  @Get()
  findAll(@Query() query: FindNewEntitiesDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.WH_ADMIN, UserRole.OF_ADMIN, UserRole.SYS_ADMIN)
  create(@Body() dto: CreateNewEntityDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.WH_ADMIN, UserRole.OF_ADMIN, UserRole.SYS_ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateNewEntityDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.WH_ADMIN, UserRole.OF_ADMIN, UserRole.SYS_ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
```

**認可ルール**: GET は認証のみ。POST / PUT / DELETE は ADMIN ロール必須。

### Module 登録

`new-entities.module.ts`:

```typescript
@Module({
  controllers: [NewEntitiesController],
  providers: [NewEntitiesService],
  exports: [NewEntitiesService],
})
export class NewEntitiesModule {}
```

`app.module.ts` の `imports` 配列に追加:

```typescript
imports: [
  // ... 既存モジュール ...
  NewEntitiesModule,  // ← 追加
],
```

---

## 3. shared に型を追加する

**ファイル**: `packages/shared/src/types/new-entity.ts`

```typescript
import { ActiveStatus } from './warehouse';

export interface NewEntity {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  status: ActiveStatus;
  createdAt: Date;
  updatedAt: Date;
}
```

`packages/shared/src/types/index.ts` にエクスポートを追加:

```typescript
export * from './new-entity';
```

shared をビルド:

```bash
pnpm --filter @struct-pass/shared build
```

---

## 4. フロントエンドにページ・フォームを作る

### バリデーションスキーマ

`packages/frontend/src/features/new-entities/lib/validations.ts`:

```typescript
import { z } from 'zod';

export const newEntitySchema = z.object({
  code: z.string().min(1, 'コードは必須です'),
  name: z.string().min(1, '名前は必須です'),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export type NewEntityFormData = z.infer<typeof newEntitySchema>;
```

### フォームコンポーネント

`packages/frontend/src/features/new-entities/components/new-entity-form.tsx`:

- `mode: 'create' | 'edit' | 'view'` で表示を切り替え
- `react-hook-form` + `zodResolver` でバリデーション
- view モードでは全フィールド `disabled`
- code フィールドは edit モードでも `disabled`（変更不可）
- 編集ページの sticky footer 対応として `formId?: string` と `hideActions?: boolean` を props に持つ

既存の `carrier-form.tsx` をコピーして、フィールドを差し替えるのが最速です。

### ページコンポーネント

```
packages/frontend/src/app/dashboard/new-entities/
├── page.tsx              # 一覧
├── new/page.tsx          # 新規登録
├── [id]/page.tsx         # 編集
└── [id]/view/page.tsx    # 詳細表示
```

各ページの役割と使用するレイアウト primitive:

| ページ | フック                           | レイアウト primitive                                    |
| ------ | -------------------------------- | ------------------------------------------------------- |
| 一覧   | `useListPage`                    | `PageShell` + `FilterBarCard` + `DataTableCard`         |
| 新規   | `useCrudApi.create`              | `PageShell` + `FormCard`                                |
| 編集   | `useCrudApi.fetchOne` + `update` | `EditPageShell`（sticky footer）+ `FormCard` + `formId` |
| 詳細   | `useCrudApi.fetchOne`            | `PageShell` + `FormCard`（form は view モード）         |

既存の `app/dashboard/carriers/` をコピーして、パスとコンポーネント名を差し替えるのが最速です。

### UI primitive 早見表

`packages/frontend/src/components/shared/` に標準 primitive が揃っています。

| コンポーネント  | 用途                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `PageShell`     | 一覧 / 新規 / 詳細ページの外枠（タイトル + actions + 内容）。背景は `--sp-paper`                     |
| `EditPageShell` | 編集ページ専用。画面高さいっぱいの flex column + sticky footer。`actions` に submit/戻るボタンを置く |
| `FormCard`      | フォームを `--sp-card` 背景 + `--sp-line-warm` 枠で囲む                                              |
| `FilterBarCard` | 一覧上部のフィルタバー枠（カード化）                                                                 |
| `DataTableCard` | テーブル + ローディングスピナー + ページネーションを 1 つのカードにまとめる                          |

### Button variant 早見表

`packages/frontend/src/components/ui/button.tsx` で定義:

| variant      | 用途                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| `sp-action`  | 透過 ghost + 桜色 hover。一覧の Excel 出力 / 新規登録 / 編集 footer の更新・一覧へ戻る等、二次アクション全般 |
| `sp-primary` | サイドバー青の塗り。login / change-password の主 CTA                                                         |
| `sp-outline` | サイドバー青の枠線のみ。確認系                                                                               |
| `default`    | 通常の primary。既存実装互換                                                                                 |

### ラベル統一

| シーン       | マスタ系                                     | トランザクション系                                           |
| ------------ | -------------------------------------------- | ------------------------------------------------------------ |
| 新規登録     | 「マスタ登録」                               | 業務語（「発注登録」「入荷登録」「出荷登録」「棚卸登録」等） |
| 更新         | 「マスタ更新」                               | 業務語（「発注更新」等）                                     |
| 一覧へ戻る   | 「一覧へ戻る」（`router.push`、`List` icon） | 同左                                                         |
| 詳細から戻る | 「戻る」（`router.back`）                    | 同左                                                         |

### 編集ページの sticky footer パターン

`form` を別の領域に置き、`<Button form={FORM_ID} type="submit">` で submit 可能にする:

```tsx
const FORM_ID = 'new-entity-edit-form';
return (
  <EditPageShell
    title="新エンティティ編集"
    actions={
      <>
        <Button type="submit" form={FORM_ID} variant="sp-action" loading={submitting}>
          <Save className="mr-1 h-4 w-4" />
          マスタ更新
        </Button>
        <Button type="button" variant="sp-action" onClick={() => router.push('/dashboard/new-entities')}>
          <List className="mr-1 h-4 w-4" />
          一覧へ戻る
        </Button>
      </>
    }
  >
    <FormCard>
      <NewEntityForm formId={FORM_ID} hideActions mode="edit" {...} />
    </FormCard>
  </EditPageShell>
);
```

参照実装: `app/dashboard/carriers/[id]/page.tsx` / `app/dashboard/products/[id]/page.tsx`

---

## 5. サイドバーにメニューを追加する

**ファイル**: `packages/frontend/src/components/layout/sidebar.tsx`

`navCategories` 配列の該当カテゴリに項目を追加:

```typescript
{
  href: '/dashboard/new-entities',
  label: '新エンティティ管理',
  icon: Box,  // lucide-react から選択
  featureId: 'new-entities',
},
```

アイコンは [lucide.dev](https://lucide.dev) から選択し、import を追加します。

---

## 6. 権限を設定する

### フロントエンド

`packages/frontend/src/lib/constants.ts` の `LOGICAL_FEATURE_IDS` に追加:

```typescript
export const LOGICAL_FEATURE_IDS = {
  // ... 既存 ...
  NEW_ENTITIES: 'new-entities',
} as const;
```

### データベース

`role_permissions` テーブルにロールごとの権限を INSERT（シードデータまたはマイグレーション）。

---

## 7. テストを書く

### バックエンド

| ファイル                          | 内容                                            |
| --------------------------------- | ----------------------------------------------- |
| `new-entities.service.spec.ts`    | Service のユニットテスト（Prisma をモック）     |
| `new-entities.controller.spec.ts` | Controller のユニットテスト（Service をモック） |
| `test/new-entities.e2e-spec.ts`   | E2E テスト（実DB、認証付き）                    |

### フロントエンド

| ファイル                                                   | 内容                               |
| ---------------------------------------------------------- | ---------------------------------- |
| `__tests__/features/new-entities/validations.test.ts`      | Zod スキーマのバリデーションテスト |
| `__tests__/features/new-entities/new-entity-form.test.tsx` | フォームのレンダリング・操作テスト |

テストは実装の**前に**書きます（TDD）。詳細は [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) を参照。

---

## チェックリスト

新しい CRUD 機能を追加する際の確認項目:

- [ ] Prisma スキーマにモデルを追加し、マイグレーションを作成した
- [ ] DTO に class-validator のバリデーションルールを定義した
- [ ] Service に CRUD + 検索 + ページングを実装した
- [ ] Controller に認可ガード（`@Roles`）を設定した
- [ ] `app.module.ts` にモジュールを登録した
- [ ] shared に型定義を追加し、ビルドした
- [ ] フロントエンドに Zod スキーマを定義した
- [ ] フォームコンポーネントを作成した（create / edit / view 対応）
- [ ] 4つのページを作成した（一覧 / 新規 / 編集 / 詳細）
- [ ] サイドバーにメニュー項目を追加した
- [ ] 権限（`LOGICAL_FEATURE_IDS` + `role_permissions`）を設定した
- [ ] バックエンドのテストを書いた（Service + Controller + E2E）
- [ ] フロントエンドのテストを書いた（バリデーション + フォーム）
- [ ] カバレッジ 80%+ を維持している

---

## 応用: マスタ管理以外のパターン

入出荷（receivings / shipments）や棚卸し（stocktakings）は、マスタ管理より複雑です。主な違い:

| 観点       | マスタ管理        | トランザクション系            |
| ---------- | ----------------- | ----------------------------- |
| ステータス | ACTIVE / INACTIVE | DRAFT → CONFIRMED → COMPLETED |
| 明細行     | なし              | 1対多（ReceivingItem 等）     |
| 在庫影響   | なし              | `stock_adjustments` に反映    |
| 排他制御   | 不要              | 悲観的ロック（`FOR UPDATE`）  |

これらのパターンは、既存の `receivings` や `shipments` モジュールを参照してください。

---

## 関連ドキュメント

| ドキュメント                                                | 内容                         |
| ----------------------------------------------------------- | ---------------------------- |
| [ARCHITECTURE.md](../02-architecture/ARCHITECTURE.md)       | モジュール構成、データフロー |
| [DATABASE_SCHEMA.md](../02-architecture/DATABASE_SCHEMA.md) | テーブル定義、ER図           |
| [API_REFERENCE.md](../02-architecture/API_REFERENCE.md)     | API エンドポイント仕様       |
| [USER_ROLES.md](../02-architecture/USER_ROLES.md)           | 権限マトリクス               |
| [TESTING_STRATEGY.md](./TESTING_STRATEGY.md)                | テスト設計方針               |
