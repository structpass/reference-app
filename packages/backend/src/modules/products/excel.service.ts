import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ProductResponseDto } from './dto/product-response.dto';

@Injectable()
export class ExcelService {
  async generateProductExcel(products: ProductResponseDto[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Struct Pass';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('商品一覧', {
      headerFooter: {
        firstHeader: '&B商品一覧',
      },
    });

    // ヘッダー定義
    worksheet.columns = [
      { header: '商品コード', key: 'code', width: 15 },
      { header: '商品名', key: 'name', width: 30 },
      { header: '説明', key: 'description', width: 40 },
      { header: 'カテゴリー', key: 'category', width: 15 },
      { header: '価格', key: 'price', width: 12 },
      { header: '在庫数', key: 'stockQuantity', width: 10 },
      { header: 'ステータス', key: 'status', width: 15 },
      { header: '作成者', key: 'creator', width: 15 },
      { header: '作成日', key: 'createdAt', width: 20 },
      { header: '更新日', key: 'updatedAt', width: 20 },
    ];

    // ヘッダースタイル
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // ステータス日本語変換
    const statusMap: Record<string, string> = {
      ACTIVE: '有効',
      INACTIVE: '無効',
      DISCONTINUED: '廃止',
    };

    // データ行追加
    for (const product of products) {
      worksheet.addRow({
        code: product.code,
        name: product.name,
        description: product.description || '',
        category: product.category?.name ?? '',
        price: product.price,
        stockQuantity: product.stockQuantity,
        status: statusMap[product.status] || product.status,
        creator: product.creator?.name || '-',
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      });
    }

    // 価格列のフォーマット
    worksheet.getColumn('price').numFmt = '#,##0';
    worksheet.getColumn('createdAt').numFmt = 'yyyy/mm/dd hh:mm';
    worksheet.getColumn('updatedAt').numFmt = 'yyyy/mm/dd hh:mm';

    // ボーダー適用
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
      if (rowNumber > 1) {
        row.alignment = { vertical: 'middle' };
      }
    });

    // オートフィルター
    worksheet.autoFilter = {
      from: 'A1',
      to: `J${products.length + 1}`,
    };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
