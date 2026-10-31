import { Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import {
  ProductsRepository,
  BulkUpsertProductRow,
} from '../../products/repositories/products.repository';
import { CategoriesRepository } from '../../categories/repositories/categories.repository';
import { ImportRowError } from '../dto/import-result.dto';
import { ImportTarget, ImportValidationResult } from './importer.interface';

/** products テンプレートの期待ヘッダー（日本語、列順厳守 — spec §4.1）。 */
export const PRODUCT_TEMPLATE_HEADERS = [
  '商品コード',
  '商品名',
  '説明',
  'カテゴリーコード',
  '価格',
  '仕入価格',
  '単位',
  'ステータス',
] as const;

// 列インデックス
const COL = {
  code: 0,
  name: 1,
  description: 2,
  categoryCode: 3,
  price: 4,
  purchasePrice: 5,
  unit: 6,
  status: 7,
} as const;

/** CSV 表記 → ProductStatus enum（既存 Excel export の statusMap と統一 — spec §4.2）。 */
const STATUS_MAP: Record<string, ProductStatus> = {
  有効: ProductStatus.ACTIVE,
  無効: ProductStatus.INACTIVE,
  廃止: ProductStatus.DISCONTINUED,
};

const MAX_LEN = {
  code: 50,
  name: 200,
  description: 1000,
  unit: 20,
} as const;

/**
 * products の CSV 取込実装。`ImportTarget` interface の最初の実装。
 *
 * 検証エラーは値として収集し `ImportRowError[]` で返す（try/catch を散らさない — architecture-invariants §4）。
 * ORM には直接触れず、`ProductsRepository` / `CategoriesRepository` 経由で DB にアクセスする（§2）。
 */
@Injectable()
export class ProductImporter implements ImportTarget<BulkUpsertProductRow> {
  readonly key = 'products';
  readonly templateHeaders = PRODUCT_TEMPLATE_HEADERS;

  constructor(
    private readonly productsRepo: ProductsRepository,
    private readonly categoriesRepo: CategoriesRepository,
  ) {}

  async validate(dataRows: string[][]): Promise<ImportValidationResult<BulkUpsertProductRow>> {
    const errors: ImportRowError[] = [];
    const validated: BulkUpsertProductRow[] = [];
    const seenCodes = new Set<string>();
    // category code → id の解決キャッシュ（同一 code の重複 DB ヒットを避ける）
    const categoryCache = new Map<string, number | null>();

    for (let i = 0; i < dataRows.length; i++) {
      const rowNum = i + 1; // データ行番号（ヘッダー除く 1 始まり）
      const cells = dataRows[i];

      // 列数チェック — 不一致行はファイル全体を中断せず行レベルエラーにする
      if (cells.length !== this.templateHeaders.length) {
        errors.push({
          row: rowNum,
          message: `列数が不正です（期待 ${this.templateHeaders.length} 列、実際 ${cells.length} 列）`,
        });
        continue;
      }

      const rowErrors: ImportRowError[] = [];
      const get = (idx: number) => cells[idx].trim();

      // --- 商品コード（必須・≤50） ---
      // 長さ超過などコード自体が無効な行は seenCodes に積まない。
      // 積むと、後続の正当な同一コード行が「重複」と誤判定され、無効行を有効な
      // 先行レコードと取り違えるため（CODE-M1）。重複判定は「妥当なコードを持つ行」
      // どうしでのみ成立させる。
      const code = get(COL.code);
      const codeValid = code !== '' && code.length <= MAX_LEN.code;
      if (!code) {
        rowErrors.push({ row: rowNum, column: '商品コード', message: '必須項目です' });
      } else if (code.length > MAX_LEN.code) {
        rowErrors.push({
          row: rowNum,
          column: '商品コード',
          message: `${MAX_LEN.code} 文字以内で入力してください`,
        });
      } else if (seenCodes.has(code)) {
        rowErrors.push({
          row: rowNum,
          column: '商品コード',
          message: `商品コード '${code}' がファイル内で重複しています`,
        });
      }
      if (codeValid) seenCodes.add(code);

      // --- 商品名（必須・≤200） ---
      const name = get(COL.name);
      if (!name) {
        rowErrors.push({ row: rowNum, column: '商品名', message: '必須項目です' });
      } else if (name.length > MAX_LEN.name) {
        rowErrors.push({
          row: rowNum,
          column: '商品名',
          message: `${MAX_LEN.name} 文字以内で入力してください`,
        });
      }

      // --- 説明（任意・≤1000） ---
      const descriptionRaw = get(COL.description);
      if (descriptionRaw.length > MAX_LEN.description) {
        rowErrors.push({
          row: rowNum,
          column: '説明',
          message: `${MAX_LEN.description} 文字以内で入力してください`,
        });
      }
      const description = descriptionRaw === '' ? null : descriptionRaw;

      // --- 価格（必須・≥0・小数 2 桁まで） ---
      const price = this.parseDecimalCell(get(COL.price), '価格', rowNum, true, rowErrors);

      // --- 仕入価格（任意・≥0・小数 2 桁まで） ---
      const purchasePrice = this.parseDecimalCell(
        get(COL.purchasePrice),
        '仕入価格',
        rowNum,
        false,
        rowErrors,
      );

      // --- 単位（任意・≤20） ---
      const unitRaw = get(COL.unit);
      if (unitRaw.length > MAX_LEN.unit) {
        rowErrors.push({
          row: rowNum,
          column: '単位',
          message: `${MAX_LEN.unit} 文字以内で入力してください`,
        });
      }
      const unit = unitRaw === '' ? null : unitRaw;

      // --- ステータス（任意・空欄は ACTIVE） ---
      const statusRaw = get(COL.status);
      let status: ProductStatus = ProductStatus.ACTIVE;
      if (statusRaw !== '') {
        const mapped = STATUS_MAP[statusRaw];
        if (!mapped) {
          rowErrors.push({
            row: rowNum,
            column: 'ステータス',
            message: `'${statusRaw}' は不正な値です（有効 / 無効 / 廃止 のいずれか）`,
          });
        } else {
          status = mapped;
        }
      }

      // --- カテゴリーコード（必須・既存 Category の code） ---
      const categoryCode = get(COL.categoryCode);
      let categoryId: number | null = null;
      if (!categoryCode) {
        rowErrors.push({
          row: rowNum,
          column: 'カテゴリーコード',
          message: '必須項目です',
        });
      } else {
        if (!categoryCache.has(categoryCode)) {
          const category = await this.categoriesRepo.findByCode(categoryCode);
          categoryCache.set(categoryCode, category ? category.id : null);
        }
        categoryId = categoryCache.get(categoryCode) ?? null;
        if (categoryId === null) {
          rowErrors.push({
            row: rowNum,
            column: 'カテゴリーコード',
            message: `カテゴリーコード '${categoryCode}' が存在しません`,
          });
        }
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      validated.push({
        code,
        name,
        description,
        categoryId: categoryId as number,
        price: price as number,
        purchasePrice,
        unit,
        status,
      });
    }

    // all-or-nothing — エラーが 1 件でもあれば validated は使わない
    if (errors.length > 0) {
      return { errors, validated: [] };
    }
    return { errors: [], validated };
  }

  async commit(
    rows: BulkUpsertProductRow[],
    userId: string,
  ): Promise<{ created: number; updated: number }> {
    return this.productsRepo.bulkUpsertByCode(rows, userId);
  }

  async dryRunCounts(rows: BulkUpsertProductRow[]): Promise<{ created: number; updated: number }> {
    const existing = await this.productsRepo.findExistingCodes(rows.map((r) => r.code));
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      if (existing.has(row.code)) updated++;
      else created++;
    }
    return { created, updated };
  }

  /**
   * 数値セルをパースする。空欄なら必須判定、非空なら数値・範囲・小数桁を検証。
   * 戻り値: 検証 OK で非空なら数値 / 任意列の空欄なら null / 検証 NG なら null（rowErrors に追記済）。
   */
  private parseDecimalCell(
    raw: string,
    column: string,
    rowNum: number,
    required: boolean,
    rowErrors: ImportRowError[],
  ): number | null {
    if (raw === '') {
      if (required) {
        rowErrors.push({ row: rowNum, column, message: '必須項目です' });
      }
      return null;
    }
    // 整数部 + 任意で小数 2 桁まで（先頭 + は許容しない）
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
      if (!/^-?\d*\.?\d+$/.test(raw)) {
        rowErrors.push({
          row: rowNum,
          column,
          message: '数値として解釈できません',
        });
        return null;
      }
      const num = Number(raw);
      if (num < 0) {
        rowErrors.push({ row: rowNum, column, message: '0 以上の値を入力してください' });
        return null;
      }
      // 0 以上だが小数 3 桁以上 等
      rowErrors.push({
        row: rowNum,
        column,
        message: '小数第 2 位までで入力してください',
      });
      return null;
    }
    return Number(raw);
  }
}
