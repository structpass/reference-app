import { JstDateService, toJstIso } from './jst-date.service';

/**
 * v2-534: サーバー側で日付を作る時に、日本時間の暦日へ揃えるための検査。
 *
 * 実測（d627）: DB には UTC のタイムゾーンなしで保存され、アプリの時計も UTC。
 * `toISOString()` は UTC の暦日を返すため、日本時間の 0:00〜9:00 の記録が1日前になる。
 */
describe('JstDateService', () => {
  const service = new JstDateService();

  it('日本時間の 0:05 は同じ日の日付になる（UTC の前日にならない）', () => {
    // 2026-03-16 15:05Z = 2026-03-17 00:05 JST
    expect(service.toDateString(new Date('2026-03-16T15:05:00.000Z'))).toBe('2026-03-17');
    // 修正前の書き方（UTC の暦日）では 03-16 になっていた（1日ずれ）。
    expect(new Date('2026-03-16T15:05:00.000Z').toISOString().slice(0, 10)).toBe('2026-03-16');
  });

  it('日本時間の 23:55 は同じ日の日付になる', () => {
    expect(service.toDateString(new Date('2026-03-17T14:55:00.000Z'))).toBe('2026-03-17');
  });

  it('日時（分まで）も日本時間で返す', () => {
    expect(service.toDateTimeMinute(new Date('2026-03-16T15:05:30.000Z'))).toBe('2026-03-17 00:05');
  });

  it('文字列の日時を受け取っても同じ結果になる', () => {
    expect(service.toDateString('2026-03-16T15:05:00.000Z')).toBe('2026-03-17');
  });

  it('日本時間の日付だけの文字列（DB の date 型）は日付を変えない', () => {
    expect(service.toDateString('2026-03-17')).toBe('2026-03-17');
  });

  it('解釈できない値は空文字（例外にしない）', () => {
    expect(service.toDateString('not-a-date')).toBe('');
    expect(toJstIso('not-a-date')).toBeNull();
  });

  // d644: 日時を出す所が実行環境の時計に従わないこと。
  // 本番コンテナの時計は UTC・開発機は日本時間なので、実行環境で結果が変わると同じ記録が別の時刻で出る。
  describe('実行環境の時計に依存しないこと', () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it('実行環境が UTC でも日本時間でも、日時は日本時間の分までで同じになる', () => {
      const target = new Date('2026-03-16T15:05:30.000Z');
      const results: string[] = [];
      for (const tz of ['UTC', 'Asia/Tokyo']) {
        process.env.TZ = tz;
        results.push(service.toDateTimeMinute(target));
      }
      expect(results).toEqual(['2026-03-17 00:05', '2026-03-17 00:05']);
    });

    it('実行環境が UTC でも、日本時間の早朝の記録は前日の日付にならない', () => {
      process.env.TZ = 'UTC';
      expect(service.toDateString(new Date('2026-03-16T15:05:00.000Z'))).toBe('2026-03-17');
    });
  });

  // d1005: 日付だけの列（DB の date 型）は保存した暦日で出し、日時だけを日本時間にする。
  // 画面の日付（date 型）と同じ暦日で、時刻（9:00 など）を付けない。
  describe('書き出しの日付（date 型）', () => {
    it('date 型の値（UTC 0 時の Date）は +9 時間せず、保存した暦日を返す', () => {
      // Prisma は date 型を 2026-03-17T00:00:00.000Z として返す。
      expect(service.toExportDate(new Date('2026-03-17T00:00:00.000Z'))).toBe('2026/3/17');
      // 日時として出すと 09:00 になり、時刻の分からない日付に粗い値が出ていた。
      expect(service.toExportDateTime(new Date('2026-03-17T00:00:00.000Z'))).toBe('2026/3/17 9:00');
    });

    it('暦日の文字列（YYYY-MM-DD）はそのままの日を返す', () => {
      expect(service.toExportDate('2026-03-17')).toBe('2026/3/17');
    });

    it('実行環境の時計に依存しない', () => {
      const originalTz = process.env.TZ;
      const results: string[] = [];
      try {
        for (const tz of ['UTC', 'Asia/Tokyo']) {
          process.env.TZ = tz;
          results.push(service.toExportDate(new Date('2026-03-17T00:00:00.000Z')));
        }
      } finally {
        process.env.TZ = originalTz;
      }
      expect(results).toEqual(['2026/3/17', '2026/3/17']);
    });

    it('解釈できない値は空文字（例外にしない）', () => {
      expect(service.toExportDate('not-a-date')).toBe('');
      expect(service.toExportDate(null as unknown as Date)).toBe('');
    });
  });
});
