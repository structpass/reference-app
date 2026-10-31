import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export interface ExcelColumn {
  header: string;
  width?: number;
}

@Injectable()
export class ExcelService {
  async generate(
    sheetName: string,
    columns: ExcelColumn[],
    rows: (string | number | Date | null)[][],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Struct Pass';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(sheetName);

    worksheet.columns = columns.map((col) => ({
      header: col.header,
      width: col.width ?? Math.max(col.header.length * 2 + 4, 12),
    }));

    // ヘッダースタイル
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // データ行追加
    for (const row of rows) {
      worksheet.addRow(row);
    }

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
    if (rows.length > 0) {
      const lastCol = String.fromCharCode(64 + columns.length);
      worksheet.autoFilter = {
        from: 'A1',
        to: `${lastCol}${rows.length + 1}`,
      };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
