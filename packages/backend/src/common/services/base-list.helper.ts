/**
 * CRUD モジュール共通のリスト取得ヘルパー。
 * 各モジュールの findAll / findAllForExport で重複していた
 * where 構築・ソート解決・ページネーション処理を集約する。
 */
import { PaginatedResponse, okPaginated, buildPaginatedMeta } from '../dto/response.dto';

export interface ListQueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  status?: string;
}

export interface ListConfig {
  searchFields: string[];
  allowedSortFields: string[];
  defaultSort?: string;
  /** paginatedList の findMany にだけ渡す include 句（exportList は出力側で扱うため無視） */
  paginatedInclude?: Record<string, unknown>;
}

interface PrismaListDelegate<T> {
  findMany(args: unknown): Promise<T[]>;
  count(args: unknown): Promise<number>;
}

export function buildListWhere(
  query: ListQueryParams,
  config: ListConfig,
): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (query.search) {
    where.OR = config.searchFields.map((field) => ({
      [field]: { contains: query.search, mode: 'insensitive' },
    }));
  }

  if (query.status) {
    where.status = query.status;
  }

  return where;
}

export function resolveSortField(sort: string | undefined, config: ListConfig): string {
  const defaultSort = config.defaultSort ?? 'createdAt';
  if (!sort) return defaultSort;
  return config.allowedSortFields.includes(sort) ? sort : defaultSort;
}

export async function paginatedList<T, U = T>(
  model: PrismaListDelegate<T>,
  query: ListQueryParams,
  config: ListConfig,
  mapper?: (entity: T) => U,
): Promise<PaginatedResponse<U>> {
  const { page = 1, limit = 20, order = 'desc' } = query;
  const where = buildListWhere(query, config);
  const sortField = resolveSortField(query.sort, config);

  const findManyArgs: Record<string, unknown> = {
    where,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { [sortField]: order },
  };
  if (config.paginatedInclude) {
    findManyArgs.include = config.paginatedInclude;
  }

  const [data, total] = await Promise.all([model.findMany(findManyArgs), model.count({ where })]);

  const mapped = mapper ? data.map(mapper) : (data as unknown as U[]);
  return okPaginated(mapped, buildPaginatedMeta(total, page, limit));
}

export async function exportList<T, U = T>(
  model: PrismaListDelegate<T>,
  query: ListQueryParams,
  config: ListConfig,
  mapper?: (entity: T) => U,
): Promise<U[]> {
  const { order = 'desc' } = query;
  const where = buildListWhere(query, config);
  const sortField = resolveSortField(query.sort, config);

  const data = await model.findMany({
    where,
    orderBy: { [sortField]: order },
  });

  return mapper ? data.map(mapper) : (data as unknown as U[]);
}
