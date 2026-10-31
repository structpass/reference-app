import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { StocksRepository, forecastKey } from './stocks.repository';
import { PrismaService } from '../../../database/prisma.service';

/** Prisma.sql の断片の SQL 文字列を、空白を詰めて 1 行にする（パラメータは ? のまま残る）。 */
function flattenSql(fragment: { sql: string }): string {
  return fragment.sql.replace(/\s+/g, ' ');
}

/** 内側の問いを読み取るため、flat にした SQL の括弧内の空白を詰める。 */
function tightenParens(sql: string): string {
  return sql.replace(/\( /g, '(').replace(/ \)/g, ')');
}

// PrismaService 本体（非 tx 経路）は本 spec では使用しない。lockStockForUpdate は
// すべて tx 経由で呼ばれるため、空の mock で provider を満たすだけで十分。
// 予測集計（findManyForForecast / aggregatePendingReceiving|ShipmentByKey）も
// 引数の形で検証するため、該当モデルに jest.fn() を足す（ref-0064）。
const mockPrisma = {
  stock: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  receivingLine: {
    findMany: jest.fn(),
  },
  shipmentLine: {
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

describe('StocksRepository', () => {
  let repo: StocksRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StocksRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<StocksRepository>(StocksRepository);
    jest.clearAllMocks();
  });

  describe('lockStockForUpdate (CODE-H3)', () => {
    // FOR UPDATE は存在しない行をロックできない。初回入荷など stock 行が未作成の
    // (warehouse, product) でも確実にロック対象を得るため、INSERT ... ON CONFLICT
    // DO UPDATE で空行を冪等に確保してから FOR UPDATE する。この「ensure-row →
    // FOR UPDATE」の順序が崩れると H3 が再発するため、呼び出し順序を構造的に検証する。
    it('FOR UPDATE の前に ensure-row(INSERT ON CONFLICT) を実行すること（呼び出し順序）', async () => {
      const callOrder: string[] = [];

      const mockTx = {
        $executeRaw: jest.fn().mockImplementation(async () => {
          callOrder.push('ensureRow');
          return 1;
        }),
        $queryRaw: jest.fn().mockImplementation(async () => {
          callOrder.push('forUpdate');
          return [{ quantity: 0 }];
        }),
      };

      await repo.lockStockForUpdate(mockTx as never, 1, 'prod-1');

      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(['ensureRow', 'forUpdate']);
    });

    it('ensure-row は tagged template（パラメータ化）で実行すること（injection セーフ）', async () => {
      const mockTx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockResolvedValue([{ quantity: 0 }]),
      };

      await repo.lockStockForUpdate(mockTx as never, 1, 'prod-1');

      // tagged template literal は第1引数に TemplateStringsArray、以降に補間値が渡る。
      // 文字列結合（$executeRawUnsafe 相当）に退行していないことを構造的に保証する。
      const firstArg = mockTx.$executeRaw.mock.calls[0][0];
      expect(Array.isArray(firstArg)).toBe(true);
      expect((firstArg as { raw?: unknown }).raw).toBeDefined();
      const interpolated = mockTx.$executeRaw.mock.calls[0].slice(1);
      expect(interpolated).toEqual([1, 'prod-1']);
    });

    it('ロック取得後の quantity を返すこと', async () => {
      const mockTx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockResolvedValue([{ quantity: 42 }]),
      };

      const result = await repo.lockStockForUpdate(mockTx as never, 1, 'prod-1');

      expect(result).toEqual([{ quantity: 42 }]);
    });

    it('行が無い結果でも例外を投げずそのまま返すこと（service 側で 0 フォールバック）', async () => {
      const mockTx = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockResolvedValue([]),
      };

      const result = await repo.lockStockForUpdate(mockTx as never, 1, 'prod-1');

      expect(result).toEqual([]);
    });
  });

  describe('findManyForForecast (CODE-M2 予測一覧)', () => {
    it('warehouseId・search の条件はページの問いと件数の問いの両方に掛かること', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await repo.findManyForForecast({ warehouseId: 3, search: 'ネジ' });

      const [pageSql, countSql] = mockPrisma.$queryRaw.mock.calls.map((c) => c[0]);
      const page = tightenParens(flattenSql(pageSql));
      expect(page).toMatch(
        /WHERE s\.warehouse_id = \? AND s\.product_id IN \(SELECT id FROM products/,
      );
      expect(page).toMatch(/lower\(name\) LIKE lower\(\?\) OR lower\(code\) LIKE lower\(\?\)/);
      // 深いページの飛ばし読みはしない（前ページの最後の id から続きを取る）。d811
      expect(pageSql.values).toEqual([3, '%ネジ%', '%ネジ%', 20]);
      expect(page).toMatch(/ORDER BY s\.id ASC LIMIT \?$/);

      const count = tightenParens(flattenSql(countSql));
      expect(count).toMatch(
        /FROM stocks WHERE warehouse_id = \? AND product_id IN \(SELECT id FROM products/,
      );
      expect(countSql.values).toEqual([3, '%ネジ%', '%ネジ%']);
      expect(count).not.toMatch(/ORDER BY/);
    });

    it('条件が無い時は絞り込みの条項を出さず・既定ページングで渡すこと', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await repo.findManyForForecast({ page: 2, limit: 10 });

      expect(result).toEqual({ stocks: [], total: 0, page: 2, limit: 10 });
      const [pageSql, countSql] = mockPrisma.$queryRaw.mock.calls.map((c) => c[0]);
      const page = flattenSql(pageSql);
      // 絞り込みの条項は出さない（続きを取る位置だけが載る）。d811
      expect(page).not.toMatch(/WHERE s\.warehouse_id|WHERE s\.product_id/);
      expect(page).toMatch(/ORDER BY s\.id ASC/);
      expect(pageSql.values).toEqual([9, 10]);
      expect(flattenSql(countSql)).not.toMatch(/WHERE/);
      // Prisma の findMany+include は使わない（品目名の条件が索引で効かず残高全件を読むため）。
      expect(mockPrisma.stock.findMany).not.toHaveBeenCalled();
    });

    it('品目・倉庫・分類を 1:1 で結合して行を画面の形へ組み立てること', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          {
            id: 42,
            warehouse_id: 3,
            product_id: 'prod-1',
            quantity: 7,
            updated_at: new Date('2026-10-20T00:00:00Z'),
            w_id: 3,
            w_name: '本倉庫',
            w_code: 'WH-03',
            p_name: '六角ボルト',
            p_code: 'P-1',
            p_unit: '個',
            c_id: 5,
            c_name: '金物',
          },
        ])
        .mockResolvedValueOnce([{ total: 41 }]);

      const result = await repo.findManyForForecast({ page: 2, limit: 20 });

      expect(result.total).toBe(41);
      expect(result.stocks[0]).toEqual({
        id: 42,
        warehouseId: 3,
        productId: 'prod-1',
        quantity: 7,
        updatedAt: new Date('2026-10-20T00:00:00Z'),
        warehouse: { id: 3, name: '本倉庫', code: 'WH-03' },
        product: {
          id: 'prod-1',
          name: '六角ボルト',
          code: 'P-1',
          unit: '個',
          category: { id: 5, name: '金物' },
        },
      });
      // ページ 2 は 21 行目から（並びは stock の id 昇順のまま）。
      // 21 行目より前の id を求める問いが内側に入る（飛ばす行を読むのは 20 行目の 1 件だけ）。d811
      expect(mockPrisma.$queryRaw.mock.calls[0][0].values).toEqual([19, 20]);
      const pageSql = tightenParens(flattenSql(mockPrisma.$queryRaw.mock.calls[0][0]));
      expect(pageSql).toMatch(
        /WHERE s\.id > \(SELECT a\.id FROM stocks a ORDER BY a\.id ASC LIMIT 1 OFFSET \?\)/,
      );
    });

    it('検索語は大文字小文字を無視した一部一致で、記号の扱いもこれまでと同じにすること', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await repo.findManyForForecast({ search: 'NeJi 50%' });

      const values = mockPrisma.$queryRaw.mock.calls[0][0].values;
      // これまで（Prisma の contains）と同じく、検索語はそのまま渡す（% と _ はワイルドカード）。
      // 大小は DB 側の lower() で揃える（アプリ側では小文字化しない）。
      expect(values.slice(0, 2)).toEqual(['%NeJi 50%%', '%NeJi 50%%']);
    });
  });

  describe('品目の検索の絞り込み（d806: 画面ごとに条件の中身がずれないこと）', () => {
    const SEARCH = 'NeJi 50%';
    const LIKE_PATTERN = '%NeJi 50%%';

    /**
     * 通常の在庫一覧・エクスポートの経路（DTO の search → buildWhere → findMany の where）を走らせ、
     * エクスポートの呼び出しから Prisma に渡った where を読む。
     */
    async function normalListWhere(search: string): Promise<Prisma.ProductWhereInput | undefined> {
      mockPrisma.stock.findMany.mockResolvedValue([]);
      mockPrisma.stock.count.mockResolvedValue(0);
      await repo.findManyPaginated({ search });
      await repo.findManyForExport({ search });
      const pageWhere = mockPrisma.stock.findMany.mock.calls[0][0].where as Prisma.StockWhereInput;
      const exportWhere = mockPrisma.stock.findMany.mock.calls[1][0]
        .where as Prisma.StockWhereInput;
      // 一覧・件数・エクスポートは同じ条件で引く。
      expect(mockPrisma.stock.count.mock.calls[0][0].where).toEqual(pageWhere);
      expect(exportWhere).toEqual(pageWhere);
      return pageWhere.product as Prisma.ProductWhereInput;
    }

    /**
     * 予測在庫の経路（DTO の search → buildForecastWhere → buildForecastSql）を走らせ、
     * ページの問い・件数の問いに載った SQL の断片を読む。
     */
    async function forecastSql(search: string): Promise<{ page: string; count: string }> {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      await repo.findManyForForecast({ search });
      const [pageSql, countSql] = mockPrisma.$queryRaw.mock.calls.map((c) => c[0]);
      // ページの問いと件数の問いは同じ絞り込みを使う（問いの骨と相関名 s だけが違う）。
      // 絞り込みの条項（最初の WHERE 以降）を両方から取り出し、同一であることを先に縛る。
      const filterOf = (fragment: { sql: string }) => {
        const flat = tightenParens(flattenSql(fragment));
        const from = flat.indexOf('WHERE');
        if (from < 0) return '';
        return flat
          .slice(from)
          .replace(/ AND s\.id > \(SELECT a\.id FROM stocks a .* LIMIT 1 OFFSET \?\)/, '')
          .replace(/ ORDER BY s\.id ASC LIMIT \?/, '')
          .replace(/(^| )s\./g, '$1');
      };
      expect(filterOf(pageSql)).toBe(filterOf(countSql));
      return {
        page: tightenParens(flattenSql(pageSql)),
        count: tightenParens(flattenSql(countSql)),
      };
    }

    it('同じ検索語で、一覧・エクスポートと予測在庫のページ・件数の絞り込みが同じ中身になること', async () => {
      const productWhere = await normalListWhere(SEARCH);
      const { page } = await forecastSql(SEARCH);

      // 通常の一覧・エクスポートは品目名・品目コードの両方を大文字小文字無視の一部一致で見る。
      expect(productWhere).toEqual({
        OR: [
          { name: { contains: SEARCH, mode: 'insensitive' } },
          { code: { contains: SEARCH, mode: 'insensitive' } },
        ],
      });
      // 予測在庫の SQL も同じ 2 列を同じ検索語で見る。
      expect(page).toMatch(
        /WHERE s\.product_id IN \(SELECT id FROM products WHERE lower\(name\) LIKE lower\(\?\) OR lower\(code\) LIKE lower\(\?\)\)/,
      );
      expect(mockPrisma.$queryRaw.mock.calls[0][0].values).toEqual([
        LIKE_PATTERN,
        LIKE_PATTERN,
        20,
      ]);
      expect(mockPrisma.$queryRaw.mock.calls[1][0].values).toEqual([LIKE_PATTERN, LIKE_PATTERN]);
    });

    it('検索語が無い時は、どちらの画面も品目の条件を付けないこと', async () => {
      expect(await normalListWhere('')).toBeUndefined();
      const { page, count } = await forecastSql('');
      expect(page).not.toMatch(/product_id IN/);
      expect(count).not.toMatch(/product_id IN/);
    });

    it('倉庫と検索語が重なっても、一覧・エクスポートと予測在庫が同じ 2 条件で引くこと', async () => {
      mockPrisma.stock.findMany.mockResolvedValue([]);
      mockPrisma.stock.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await repo.findManyPaginated({ search: SEARCH, warehouseId: 3 });
      await repo.findManyForExport({ search: SEARCH, warehouseId: 3 });
      await repo.findManyForForecast({ search: SEARCH, warehouseId: 3 });

      const listWhere = mockPrisma.stock.findMany.mock.calls[0][0].where as Prisma.StockWhereInput;
      const exportWhere = mockPrisma.stock.findMany.mock.calls[1][0]
        .where as Prisma.StockWhereInput;
      expect(exportWhere).toEqual(listWhere);

      // 予測在庫のページの問いと件数の問いには、倉庫と品目の 2 条件だけが倉庫→品目の順で載る
      // （外側に余計な条件が足されたら落ちる）。
      const [pageSql, countSql] = mockPrisma.$queryRaw.mock.calls.map((c) => c[0]);
      const conditionsOf = (fragment: { sql: string }) => {
        const flat = tightenParens(flattenSql(fragment));
        const filter = flat
          .slice(flat.indexOf('WHERE') + 'WHERE '.length, flat.indexOf('ORDER BY s.id ASC'))
          .trim();
        // 括弧の内側（品目の副問い）の AND では切らず、外側の条件だけで切る。
        const out: string[] = [];
        let depth = 0;
        let rest = filter;
        while (rest.length > 0) {
          let index = -1;
          for (let i = 0; i < rest.length; i++) {
            if (rest[i] === '(') depth++;
            else if (rest[i] === ')') depth--;
            else if (depth === 0 && rest.startsWith(' AND ', i)) {
              index = i;
              break;
            }
          }
          if (index < 0) {
            out.push(rest);
            break;
          }
          out.push(rest.slice(0, index));
          rest = rest.slice(index + ' AND '.length);
        }
        return out.map((c) => c.replace(/(^| )s\./g, '$1'));
      };
      for (const conditions of [conditionsOf(pageSql), conditionsOf(countSql)]) {
        expect(conditions).toHaveLength(2);
        expect(conditions[0]).toBe('warehouse_id = ?');
        expect(conditions[1]).toMatch(/^product_id IN \(SELECT id FROM products WHERE /);
      }
      expect(listWhere).toEqual({
        warehouseId: 3,
        product: {
          OR: [
            { name: { contains: SEARCH, mode: 'insensitive' } },
            { code: { contains: SEARCH, mode: 'insensitive' } },
          ],
        },
      });
    });
  });

  describe('飛ばし読みをしないページ送りと書き出し（d811）', () => {
    it('ページ 1 は OFFSET を出さず、先頭から limit 件だけ取ること', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await repo.findManyForForecast({ page: 1, limit: 20 });

      const [pageSql] = mockPrisma.$queryRaw.mock.calls.map((c) => c[0]);
      expect(flattenSql(pageSql)).not.toMatch(/OFFSET/);
      expect(pageSql.values).toEqual([20]);
    });

    it('2 ページ目以降は、前ページまでの最後の id を求めて続きだけを読むこと', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await repo.findManyForForecast({ page: 3, limit: 20 });

      const [pageSql] = mockPrisma.$queryRaw.mock.calls.map((c) => c[0]);
      const flat = flattenSql(pageSql);
      // 外側は OFFSET を持たない（飛ばす行を並べて読まない）。
      expect(flat.match(/OFFSET/g)).toHaveLength(1);
      expect(tightenParens(flattenSql(pageSql))).toMatch(
        /WHERE s\.id > \(SELECT a\.id FROM stocks a ORDER BY a\.id ASC LIMIT 1 OFFSET \?\)/,
      );
      // 40 行目の id を求める（3 ページ目は 41 行目から）。
      expect(pageSql.values).toEqual([39, 20]);
    });

    it('書き出しは 1 回の上限だけで読み、品目の条件を結合の前段に置くこと', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await repo.findManyForForecastExport({ search: 'ネジ' }, 10000);

      // 件数を数える問いは流さない。
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      const [sql] = mockPrisma.$queryRaw.mock.calls.map((c) => c[0]);
      const flat = tightenParens(flattenSql(sql));
      expect(flat).toMatch(
        /JOIN products p ON p\.id = s\.product_id AND s\.product_id IN \(SELECT id FROM products/,
      );
      expect(flat).toMatch(/ORDER BY s\.id ASC LIMIT \?$/);
      expect(sql.values).toEqual(['%ネジ%', '%ネジ%', 10000]);
      // 品目の条件は結合の位置だけに載り、絞り込みの側では重ねない。
      expect(flat.replace(/JOIN products p ON [^)]*\)/, '')).not.toMatch(/product_id IN/);
    });

    // 書き出しは品目の条件だけを結合の位置へ移す。倉庫の条件を巻き込むと、
    // `FROM stocks s s.warehouse_id = ?` のような SQL になり、書き出しが開けなくなる。
    it.each([
      { name: '倉庫のみ', query: { warehouseId: 3 }, where: /WHERE s\.warehouse_id = \?/ },
      {
        name: '倉庫と検索',
        query: { warehouseId: 3, search: 'ネジ' },
        where: /WHERE s\.warehouse_id = \? ORDER BY/,
      },
    ])(
      '書き出しで$nameの絞り込みを付けても、倉庫の条件は絞り込みの側に残ること',
      async ({ query, where }) => {
        mockPrisma.$queryRaw.mockResolvedValue([]);

        await repo.findManyForForecastExport(query, 10000);

        const [sql] = mockPrisma.$queryRaw.mock.calls.map((c) => c[0]);
        const flat = tightenParens(flattenSql(sql));
        // 品目の結合は常に 1 つあり、結合の位置に絞り込みの条件が流れ込まない。
        expect(flat).toMatch(/FROM stocks s JOIN products p ON p\.id = s\.product_id/);
        expect(flat).not.toMatch(/FROM stocks s s\./);
        expect(flat).toMatch(where);
      },
    );
  });

  describe('aggregatePendingReceivingByKey (入荷見込み集計)', () => {
    it('空入力は early return しクエリを発行しないこと', async () => {
      const result = await repo.aggregatePendingReceivingByKey([]);

      expect(result).toEqual(new Map());
      expect(mockPrisma.receivingLine.findMany).not.toHaveBeenCalled();
    });

    it('下書きステータスのみ・削除済み除外で line を引くこと', async () => {
      mockPrisma.receivingLine.findMany.mockResolvedValue([]);

      await repo.aggregatePendingReceivingByKey(['prod-1', 'prod-2']);

      expect(mockPrisma.receivingLine.findMany).toHaveBeenCalledWith({
        where: {
          productId: { in: ['prod-1', 'prod-2'] },
          receiving: {
            status: 'DRAFT',
            deletedAt: null,
          },
        },
        select: {
          productId: true,
          plannedQty: true,
          receiving: { select: { warehouseId: true } },
        },
      });
    });

    it('(productId, warehouseId) キーで plannedQty を合算して返すこと', async () => {
      mockPrisma.receivingLine.findMany.mockResolvedValue([
        { productId: 'prod-1', plannedQty: 10, receiving: { warehouseId: 1 } },
        { productId: 'prod-1', plannedQty: 5, receiving: { warehouseId: 1 } },
        { productId: 'prod-1', plannedQty: 7, receiving: { warehouseId: 2 } },
        { productId: 'prod-2', plannedQty: 3, receiving: { warehouseId: 1 } },
      ]);

      const result = await repo.aggregatePendingReceivingByKey(['prod-1', 'prod-2']);

      expect(result.get('prod-1::1')).toBe(15);
      expect(result.get('prod-1::2')).toBe(7);
      expect(result.get('prod-2::1')).toBe(3);
    });
  });

  describe('aggregatePendingShipmentByKey (出荷見込み集計)', () => {
    it('空入力は early return しクエリを発行しないこと', async () => {
      const result = await repo.aggregatePendingShipmentByKey([]);

      expect(result).toEqual(new Map());
      expect(mockPrisma.shipmentLine.findMany).not.toHaveBeenCalled();
    });

    it('下書きステータスのみ・削除済み除外で line を引くこと', async () => {
      mockPrisma.shipmentLine.findMany.mockResolvedValue([]);

      await repo.aggregatePendingShipmentByKey(['prod-1']);

      expect(mockPrisma.shipmentLine.findMany).toHaveBeenCalledWith({
        where: {
          productId: { in: ['prod-1'] },
          shipment: {
            status: 'DRAFT',
            deletedAt: null,
          },
        },
        select: {
          productId: true,
          plannedQty: true,
          shipment: { select: { warehouseId: true } },
        },
      });
    });

    it('(productId, warehouseId) キーで plannedQty を合算して返すこと', async () => {
      mockPrisma.shipmentLine.findMany.mockResolvedValue([
        { productId: 'prod-1', plannedQty: 4, receiving: undefined, shipment: { warehouseId: 2 } },
        { productId: 'prod-1', plannedQty: 6, receiving: undefined, shipment: { warehouseId: 2 } },
      ]);

      const result = await repo.aggregatePendingShipmentByKey(['prod-1']);

      expect(result.get('prod-1::2')).toBe(10);
    });
  });

  describe('forecastKey', () => {
    it('productId と warehouseId を :: で合成したキーを返すこと', () => {
      expect(forecastKey('prod-1', 3)).toBe('prod-1::3');
    });
  });
});
