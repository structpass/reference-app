import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCarrierDto } from '../carriers/dto/create-carrier.dto';
import { UpdateCarrierDto } from '../carriers/dto/update-carrier.dto';
import { CreateSupplierDto } from '../suppliers/dto/create-supplier.dto';
import { UpdateSupplierDto } from '../suppliers/dto/update-supplier.dto';
import { CreateWarehouseDto } from '../warehouses/dto/create-warehouse.dto';
import { UpdateWarehouseDto } from '../warehouses/dto/update-warehouse.dto';
import { CreateCategoryDto } from '../categories/dto/create-category.dto';
import { UpdateCategoryDto } from '../categories/dto/update-category.dto';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { UpdateProductDto } from '../products/dto/update-product.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { CreateAnnouncementDto } from '../announcements/dto/create-announcement.dto';
import { UpdateAnnouncementDto } from '../announcements/dto/update-announcement.dto';
import { UpdateTablePaginationSettingDto } from '../list-pagination-settings/dto/update-table-pagination-setting.dto';
import { UpdateShipmentDto } from '../shipments/dto/update-shipment.dto';
import { UpdateReceivingDto } from '../receivings/dto/update-receiving.dto';
import { UpdateStocktakingDto } from '../stocktakings/dto/update-stocktaking.dto';
import { UpdateOrderDto } from '../orders/dto/update-order.dto';

/**
 * v2-456: 書き込み DTO の null 境界を横断で固定する。
 *
 * `@IsOptional()` は `null` と `undefined` の両方で検証を飛ばし、`PartialType` は全項目へ
 * `@IsOptional()` を付けるため、JSON の明示 `null` が DB の非 null 列へ届いて
 * 500 INTERNAL_ERROR になっていた（実 API 実測で 25 経路）。ここが緩むと同じ 500 が戻るため、
 * 「undefined は可 / null は不可 / nullable 列の null は可」を DTO ごとに固定する。
 *
 * 実 HTTP の応答（400 VALIDATION_ERROR）は `test/null-guard-write.e2e-spec.ts` が持つ。
 */
type Case = {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dto: new () => any;
  /** 検証を通る最小の本文（必須項目を埋める）。 */
  base: Record<string, unknown>;
  /** DB の非 null 列に付く任意項目（null を弾く）。 */
  nonNullOptional: string[];
  /** 列が nullable な任意項目（null を受け付ける）。 */
  nullableOptional: string[];
};

const CASES: Case[] = [
  {
    name: 'CreateCarrierDto',
    dto: CreateCarrierDto,
    base: { code: 'C-1', name: 'c' },
    nonNullOptional: ['status'],
    nullableOptional: ['address', 'phone', 'contactPerson', 'email'],
  },
  {
    name: 'UpdateCarrierDto',
    dto: UpdateCarrierDto,
    base: {},
    nonNullOptional: ['status', 'code', 'name'],
    nullableOptional: ['address', 'phone', 'contactPerson', 'email'],
  },
  {
    name: 'CreateSupplierDto',
    dto: CreateSupplierDto,
    base: { code: 'S-1', name: 's' },
    nonNullOptional: ['status'],
    nullableOptional: ['address', 'phone', 'contactPerson', 'email'],
  },
  {
    name: 'UpdateSupplierDto',
    dto: UpdateSupplierDto,
    base: {},
    nonNullOptional: ['status', 'code', 'name'],
    nullableOptional: ['address', 'phone', 'contactPerson', 'email'],
  },
  {
    name: 'CreateWarehouseDto',
    dto: CreateWarehouseDto,
    base: { code: 'W-1', name: 'w' },
    nonNullOptional: ['status'],
    nullableOptional: ['address', 'phone', 'manager', 'capacity'],
  },
  {
    name: 'UpdateWarehouseDto',
    dto: UpdateWarehouseDto,
    base: {},
    nonNullOptional: ['status', 'code', 'name'],
    nullableOptional: ['address', 'phone', 'manager', 'capacity'],
  },
  {
    name: 'CreateCategoryDto',
    dto: CreateCategoryDto,
    base: { code: 'K-1', name: 'k' },
    nonNullOptional: ['status'],
    nullableOptional: [],
  },
  {
    name: 'UpdateCategoryDto',
    dto: UpdateCategoryDto,
    base: {},
    nonNullOptional: ['status', 'code', 'name'],
    nullableOptional: [],
  },
  {
    name: 'CreateProductDto',
    dto: CreateProductDto,
    base: { code: 'P-1', name: 'p', categoryId: 1, price: 100 },
    nonNullOptional: ['status', 'stockQuantity'],
    // purchasePrice は nullable 列。null は「未設定・クリア」として通し、Decimal へ通さない。
    nullableOptional: ['description', 'unit', 'purchasePrice'],
  },
  {
    name: 'UpdateProductDto',
    dto: UpdateProductDto,
    base: {},
    nonNullOptional: ['status', 'stockQuantity', 'name', 'code', 'categoryId', 'price'],
    nullableOptional: ['description', 'unit', 'purchasePrice'],
  },
  {
    name: 'UpdateUserDto',
    dto: UpdateUserDto,
    base: {},
    nonNullOptional: ['name', 'email', 'isActive', 'allowOidcLink'],
    // role は UserRole?（pending = null が正しい値）。
    nullableOptional: ['role'],
  },
  {
    name: 'CreateAnnouncementDto',
    dto: CreateAnnouncementDto,
    base: { title: 't', bodyMarkdown: 'b', roleGroupIds: [] },
    nonNullOptional: ['isNew', 'isImportant'],
    // notifiedAt はサービス側の三項演算子で既定値へ落ちる（null でも 500 にならない）。
    nullableOptional: ['notifiedAt'],
  },
  {
    name: 'UpdateAnnouncementDto',
    dto: UpdateAnnouncementDto,
    base: {},
    // roleGroupIds は配列。null は @IsArray に落ちて 400 になる（従来は素通りして
    // repository の `if (!roleGroupIds)` が「変更しない」として黙って無視していた。ADR 0028）。
    nonNullOptional: ['isNew', 'isImportant', 'title', 'roleGroupIds'],
    nullableOptional: ['notifiedAt'],
  },
  {
    name: 'UpdateTablePaginationSettingDto',
    dto: UpdateTablePaginationSettingDto,
    base: {},
    nonNullOptional: ['defaultPageSize', 'pageSizeOptions'],
    nullableOptional: [],
  },
  {
    name: 'UpdateShipmentDto',
    dto: UpdateShipmentDto,
    base: {},
    // carrierId は列が nullable でも service が connect{id:null} を作り 500 になるため弾く。
    nonNullOptional: ['warehouseId', 'destination', 'carrierId'],
    nullableOptional: [],
  },
  {
    name: 'UpdateReceivingDto',
    dto: UpdateReceivingDto,
    base: {},
    nonNullOptional: ['warehouseId', 'supplierId'],
    nullableOptional: [],
  },
  {
    name: 'UpdateStocktakingDto',
    dto: UpdateStocktakingDto,
    base: {},
    nonNullOptional: ['warehouseId'],
    // stocktaker は列が nullable（クリアできる）。
    nullableOptional: ['stocktaker'],
  },
  {
    name: 'UpdateOrderDto',
    dto: UpdateOrderDto,
    base: {},
    nonNullOptional: ['supplierId'],
    // desiredDeliveryDate は列が nullable（クリアできる）。
    nullableOptional: ['desiredDeliveryDate'],
  },
];

describe('書き込み DTO の null 境界（v2-456）', () => {
  describe('CreateUserDto（作成側の規則は変更していない）', () => {
    const validateDto = (body: Record<string, unknown>) =>
      validate(plainToInstance(CreateUserDto, body), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

    it('role の null は通ること（pending = 権限待ちの正しい値・nullable 列）', async () => {
      expect(await validateDto({ name: 'n', email: 'a@b.example', role: null })).toHaveLength(0);
    });

    it('name / email の null は弾くこと（必須項目）', async () => {
      for (const field of ['name', 'email']) {
        const errors = await validateDto({ name: 'n', email: 'a@b.example', [field]: null });
        expect(errors.map((error) => error.property)).toContain(field);
      }
    });
  });

  for (const c of CASES) {
    describe(c.name, () => {
      const validateDto = (body: Record<string, unknown>) =>
        validate(plainToInstance(c.dto, body), { whitelist: true, forbidNonWhitelisted: true });
      const propertiesOf = async (body: Record<string, unknown>) =>
        (await validateDto(body)).map((error) => error.property);

      it('必須項目だけの本文（任意項目は未指定）は検証を通ること', async () => {
        expect(await validateDto(c.base)).toHaveLength(0);
      });

      for (const field of c.nonNullOptional) {
        it(`${field} の null を弾くこと（DB の非 null 列・500 の根因）`, async () => {
          expect(await propertiesOf({ ...c.base, [field]: null })).toContain(field);
        });

        it(`${field} の未指定（undefined）は通ること（変更しない・既定値）`, async () => {
          const body = { ...c.base };
          expect(await validateDto(body)).toHaveLength(0);
        });
      }

      for (const field of c.nullableOptional) {
        it(`${field} の null は通ること（nullable 列・値のクリア）`, async () => {
          expect(await validateDto({ ...c.base, [field]: null })).toHaveLength(0);
        });
      }
    });
  }
});
