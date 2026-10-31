import { Prisma } from '@prisma/client';
import { DocumentNumberRepository } from './document-number.repository';

type Row = { max: number | null };

/**
 * DocumentNumberRepository の採番ロジックを、tx をモックして検証する。
 *
 * 見るのは「どのプレフィックスで・どの順に・何を問い合わせるか」と「桁・連番の算定」。
 * 並行時の重複防止（advisory lock の実効）と実 DB 上の一意性は、実 PostgreSQL を使う
 * 統合テスト（test/document-number-concurrency.int-spec.ts）の射程。
 */
describe('DocumentNumberRepository', () => {
  let repo: DocumentNumberRepository;

  beforeEach(() => {
    repo = new DocumentNumberRepository();
    // 採番の日付プレフィックスを固定する（ローカル時刻 2026-03-16）。
    jest.useFakeTimers().setSystemTime(new Date(2026, 2, 16, 9, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** 1回目=ロック、2回目=最大連番読み取り、として応答を返す tx を作る。 */
  const makeTx = (maxRows: Row[]) => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([]) // pg_advisory_xact_lock
      .mockResolvedValueOnce(maxRows); // 最大連番
    return { tx: { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient, queryRaw };
  };

  it('既存番号が無ければ 0001 から採番する（入荷）', async () => {
    const { tx } = makeTx([{ max: null }]);
    await expect(repo.generateReceivingNo(tx)).resolves.toBe('RCV-20260316-0001');
  });

  it('既存の最大連番の次の番号を返す（入荷・4桁0埋め）', async () => {
    const { tx } = makeTx([{ max: 41 }]);
    await expect(repo.generateReceivingNo(tx)).resolves.toBe('RCV-20260316-0042');
  });

  it('既存の最大連番の次の番号を返す（出荷・4桁0埋め）', async () => {
    const { tx } = makeTx([{ max: 7 }]);
    await expect(repo.generateShipmentNo(tx)).resolves.toBe('SHP-20260316-0008');
  });

  it('既存の最大連番の次の番号を返す（発注・3桁0埋め）', async () => {
    const { tx } = makeTx([{ max: 1 }]);
    await expect(repo.generateOrderNo(tx)).resolves.toBe('PO-20260316-002');
  });

  // ---- 受入条件3: 桁上がりでも数値として最大の連番 +1 を返す ----
  it('発注の連番が 999 の次は 1000 になる（文字列順の最大に依存しない）', async () => {
    const { tx } = makeTx([{ max: 999 }]);
    await expect(repo.generateOrderNo(tx)).resolves.toBe('PO-20260316-1000');
  });

  it('入荷の連番が 9999 の次は 10000 になる（桁数が増えても続く）', async () => {
    const { tx } = makeTx([{ max: 9999 }]);
    await expect(repo.generateReceivingNo(tx)).resolves.toBe('RCV-20260316-10000');
  });

  // ---- 受入条件6: 種別×日付プレフィックスで分離する ----
  it('種別×当日のプレフィックスでロックし、同じプレフィックスで最大連番を読む（入荷）', async () => {
    const { tx, queryRaw } = makeTx([{ max: null }]);

    await repo.generateReceivingNo(tx);

    expect(queryRaw).toHaveBeenCalledTimes(2);
    const lockCall = queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const maxCall = queryRaw.mock.calls[1] as [TemplateStringsArray, ...unknown[]];

    // 1回目は transaction advisory lock
    expect(lockCall[0].join('|')).toContain('pg_advisory_xact_lock');
    expect(lockCall.slice(1)).toContain('RCV-20260316-');
    // 2回目は同じプレフィックスで当日分の最大連番を読む
    expect(maxCall.slice(1)).toContain('RCV-20260316-');
  });

  it('種別ごとに異なるプレフィックスを使う（RCV/SHP/PO）', async () => {
    const rcv = makeTx([{ max: null }]);
    const shp = makeTx([{ max: null }]);
    const po = makeTx([{ max: null }]);

    await repo.generateReceivingNo(rcv.tx);
    await repo.generateShipmentNo(shp.tx);
    await repo.generateOrderNo(po.tx);

    expect((rcv.queryRaw.mock.calls[1] as unknown[]).slice(1)).toContain('RCV-20260316-');
    expect((shp.queryRaw.mock.calls[1] as unknown[]).slice(1)).toContain('SHP-20260316-');
    expect((po.queryRaw.mock.calls[1] as unknown[]).slice(1)).toContain('PO-20260316-');
  });

  // d644: 実行環境の時計（本番は UTC・開発機は日本時間）で伝票番号の日付が変わらないこと。
  // 2026-03-16 15:05Z = 2026-03-17 00:05 JST。UTC の暦日で組むと前日（20260316）になる。
  it('日本時間の 0:05 に採番しても、その日（日本時間）の日付を使う', async () => {
    jest.setSystemTime(new Date('2026-03-16T15:05:00.000Z'));
    const { tx } = makeTx([{ max: null }]);

    await expect(repo.generateReceivingNo(tx)).resolves.toBe('RCV-20260317-0001');
  });

  it('実行環境が UTC でも日本時間でも、同じ伝票番号になる', async () => {
    jest.setSystemTime(new Date('2026-03-16T15:05:00.000Z'));
    const originalTz = process.env.TZ;
    try {
      const numbers: string[] = [];
      for (const tz of ['UTC', 'Asia/Tokyo']) {
        process.env.TZ = tz;
        numbers.push(await repo.generateReceivingNo(makeTx([{ max: null }]).tx));
      }
      expect(numbers).toEqual(['RCV-20260317-0001', 'RCV-20260317-0001']);
    } finally {
      process.env.TZ = originalTz;
    }
  });
});
