import {
  buildListWhere,
  resolveSortField,
  paginatedList,
  exportList,
  ListConfig,
} from './base-list.helper';

const config: ListConfig = {
  searchFields: ['name', 'code'],
  allowedSortFields: ['name', 'createdAt', 'updatedAt'],
  defaultSort: 'createdAt',
};

describe('base-list.helper', () => {
  describe('buildListWhere', () => {
    it('search なし / status なしは空 where を返すこと', () => {
      expect(buildListWhere({}, config)).toEqual({});
    });

    it('search を全 searchFields の OR(contains, insensitive) に展開すること', () => {
      expect(buildListWhere({ search: 'abc' }, config)).toEqual({
        OR: [
          { name: { contains: 'abc', mode: 'insensitive' } },
          { code: { contains: 'abc', mode: 'insensitive' } },
        ],
      });
    });

    it('status を where.status に載せること', () => {
      expect(buildListWhere({ status: 'ACTIVE' }, config)).toEqual({ status: 'ACTIVE' });
    });

    it('search と status を併用できること', () => {
      const where = buildListWhere({ search: 'x', status: 'INACTIVE' }, config);
      expect(where.status).toBe('INACTIVE');
      expect(where.OR).toHaveLength(2);
    });
  });

  describe('resolveSortField', () => {
    it('未指定なら config.defaultSort を返すこと', () => {
      expect(resolveSortField(undefined, config)).toBe('createdAt');
    });

    it('defaultSort 未設定かつ未指定なら createdAt にフォールバックすること', () => {
      expect(resolveSortField(undefined, { searchFields: [], allowedSortFields: [] })).toBe(
        'createdAt',
      );
    });

    it('allowedSortFields に含まれる値はそのまま使うこと', () => {
      expect(resolveSortField('name', config)).toBe('name');
    });

    it('許可されない値（SQLi 等のホワイトリスト外）は defaultSort に倒すこと', () => {
      expect(resolveSortField('name; DROP TABLE', config)).toBe('createdAt');
    });
  });

  describe('paginatedList', () => {
    const makeModel = (rows: unknown[], total: number) => ({
      findMany: jest.fn().mockResolvedValue(rows),
      count: jest.fn().mockResolvedValue(total),
    });

    it('skip/take/orderBy を組み立て PaginatedResponse 形で返すこと', async () => {
      const model = makeModel([{ id: 1 }, { id: 2 }], 2);

      const res = await paginatedList(
        model,
        { page: 2, limit: 10, sort: 'name', order: 'asc' },
        config,
      );

      expect(model.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 10,
        take: 10,
        orderBy: { name: 'asc' },
      });
      expect(res.success).toBe(true);
      expect(res.meta).toEqual({ total: 2, page: 2, limit: 10, totalPages: 1 });
    });

    it('mapper を渡すと各要素に適用すること', async () => {
      const model = makeModel([{ id: 1 }], 1);

      const res = await paginatedList(model, {}, config, (e: { id: number }) => ({
        wrapped: e.id,
      }));

      expect(res.data).toEqual([{ wrapped: 1 }]);
    });

    it('paginatedInclude を findMany に渡すこと', async () => {
      const model = makeModel([], 0);
      const withInclude: ListConfig = { ...config, paginatedInclude: { rel: true } };

      await paginatedList(model, { page: 1, limit: 20 }, withInclude);

      expect(model.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ include: { rel: true } }),
      );
    });
  });

  describe('exportList', () => {
    it('skip/take なしで全件取得し配列を返すこと', async () => {
      const model = {
        findMany: jest.fn().mockResolvedValue([{ id: 1 }]),
        count: jest.fn(),
      };

      const res = await exportList(model, { sort: 'name', order: 'asc' }, config);

      expect(model.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: 'asc' },
      });
      expect(res).toEqual([{ id: 1 }]);
      expect(model.count).not.toHaveBeenCalled();
    });
  });
});
