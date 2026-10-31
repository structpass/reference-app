import { describe, it, expect } from 'vitest';
import { buildProductExportParams } from '@/app/dashboard/products/export-params';

describe('buildProductExportParams', () => {
  const sort = { sort: 'createdAt', order: 'desc' } as const;

  it('画面で絞り込んだ条件と並び順をそのまま渡す', () => {
    const params = buildProductExportParams({ recordScope: 'unused', search: 'PRD' }, sort);

    expect(params).toEqual({
      sort: 'createdAt',
      order: 'desc',
      recordScope: 'unused',
      search: 'PRD',
    });
  });

  it('空の条件は渡さない（未指定の絞り込みで 0 件にしない）', () => {
    const params = buildProductExportParams({ recordScope: '', categoryId: undefined }, sort);

    expect(params).toEqual({ sort: 'createdAt', order: 'desc' });
    expect(params).not.toHaveProperty('recordScope');
    expect(params).not.toHaveProperty('categoryId');
  });
});
