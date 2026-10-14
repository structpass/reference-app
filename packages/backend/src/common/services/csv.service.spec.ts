import { CsvService } from './csv.service';

describe('CsvService', () => {
  let service: CsvService;

  beforeEach(() => {
    service = new CsvService();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('generate', () => {
    it('ヘッダーとデータ行からCSVバッファを生成すること', () => {
      const headers = ['名前', '年齢'];
      const rows = [
        ['太郎', '30'],
        ['花子', '25'],
      ];

      const buffer = service.generate(headers, rows);
      const csv = buffer.toString('utf-8');

      expect(csv).toContain('﻿');
      expect(csv).toContain('名前,年齢');
      expect(csv).toContain('太郎,30');
      expect(csv).toContain('花子,25');
    });

    it('空のデータでヘッダーのみのCSVを生成すること', () => {
      const buffer = service.generate(['A', 'B'], []);
      const csv = buffer.toString('utf-8');

      expect(csv).toContain('A,B');
      expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1);
    });

    it('カンマを含むフィールドをダブルクォートで囲むこと', () => {
      const buffer = service.generate(['名前'], [['田中,太郎']]);
      const csv = buffer.toString('utf-8');

      expect(csv).toContain('"田中,太郎"');
    });

    it('ダブルクォートを含むフィールドをエスケープすること', () => {
      const buffer = service.generate(['名前'], [['田中"太郎"']]);
      const csv = buffer.toString('utf-8');

      expect(csv).toContain('"田中""太郎"""');
    });

    it('改行を含むフィールドをダブルクォートで囲むこと', () => {
      const buffer = service.generate(['メモ'], [['行1\n行2']]);
      const csv = buffer.toString('utf-8');

      expect(csv).toContain('"行1\n行2"');
    });

    it('UTF-8 BOMで始まること', () => {
      const buffer = service.generate(['A'], [['B']]);
      const bytes = [...buffer.subarray(0, 3)];

      expect(bytes).toEqual([0xef, 0xbb, 0xbf]);
    });

    describe('formula injection 対策（SEC-H2）', () => {
      it.each(['=', '+', '-', '@'])(
        '先頭が %s のフィールドに単一引用符を前置して数式評価を防ぐこと',
        (trigger) => {
          const buffer = service.generate(['col'], [[`${trigger}HYPERLINK("x")`]]);
          const csv = buffer.toString('utf-8');
          expect(csv).toContain(`'${trigger}HYPERLINK`);
        },
      );

      it('先頭がタブ(0x09)のフィールドにも単一引用符を前置すること', () => {
        const buffer = service.generate(['col'], [['\t=cmd']]);
        expect(buffer.toString('utf-8')).toContain("'\t=cmd");
      });

      it('先頭が CR(0x0d) のフィールドは引用符前置の上でダブルクォート包囲されること', () => {
        const buffer = service.generate(['col'], [['\rdanger']]);
        const csv = buffer.toString('utf-8');
        expect(csv).toContain('"\'\rdanger"');
      });

      it('通常フィールドには単一引用符を付与しないこと', () => {
        const buffer = service.generate(['col'], [['安全な値']]);
        const csv = buffer.toString('utf-8');
        expect(csv).toContain('安全な値');
        expect(csv).not.toContain("'安全な値");
      });

      it('数式トリガを途中に含むだけのフィールドは無害化しないこと', () => {
        const buffer = service.generate(['col'], [['a=b']]);
        const csv = buffer.toString('utf-8');
        expect(csv).toContain('a=b');
        expect(csv).not.toContain("'a=b");
      });
    });
  });

  describe('parse', () => {
    it('単純なCSV文字列を二次元配列にパースすること', () => {
      const result = service.parse('a,b,c\n1,2,3');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.rows).toEqual([
          ['a', 'b', 'c'],
          ['1', '2', '3'],
        ]);
      }
    });

    it('CRLF 改行を処理すること', () => {
      const result = service.parse('a,b\r\n1,2\r\n3,4');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.rows).toEqual([
          ['a', 'b'],
          ['1', '2'],
          ['3', '4'],
        ]);
      }
    });

    it('先頭 BOM を除去すること', () => {
      const result = service.parse('﻿a,b\n1,2');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.rows[0]).toEqual(['a', 'b']);
      }
    });

    it('末尾の空行を無視すること', () => {
      const result = service.parse('a,b\n1,2\n\n');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.rows).toEqual([
          ['a', 'b'],
          ['1', '2'],
        ]);
      }
    });

    it('引用フィールドを処理すること', () => {
      const result = service.parse('name,note\n"田中, 太郎","ok"');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.rows[1]).toEqual(['田中, 太郎', 'ok']);
      }
    });

    it('引用フィールド内のエスケープされたダブルクォートを処理すること', () => {
      const result = service.parse('x\n"a ""b"" c"');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.rows[1]).toEqual(['a "b" c']);
      }
    });

    it('空フィールドを空文字として保持すること', () => {
      const result = service.parse('a,b,c\n1,,3');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.rows[1]).toEqual(['1', '', '3']);
      }
    });

    it('行ごとに列数が異なる場合もそのまま配列で返すこと（列数検証は呼び出し側）', () => {
      const result = service.parse('a,b,c\n1,2\n3,4,5,6');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.rows[1]).toEqual(['1', '2']);
        expect(result.rows[2]).toEqual(['3', '4', '5', '6']);
      }
    });

    it('引用符が閉じない不正CSVを失敗として返すこと', () => {
      const result = service.parse('a,b\n"unclosed,2');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeTruthy();
      }
    });

    it('空文字列を空の行配列として返すこと', () => {
      const result = service.parse('');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.rows).toEqual([]);
      }
    });

    it('例外を投げないこと（不正入力でも discriminated result を返す）', () => {
      expect(() => service.parse('"\n"\n"')).not.toThrow();
    });
  });
});
