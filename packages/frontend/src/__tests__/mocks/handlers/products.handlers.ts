import { http, HttpResponse } from 'msw';
import { apiPath } from '../../integration/_helpers/api-base';

interface ProductFixture {
  id: string;
  code: string;
  name: string;
  categoryId: number | null;
  category?: { id: number; name: string };
  price: number;
  stockQuantity: number;
  status: 'ACTIVE' | 'INACTIVE';
  unit?: string | null;
}

interface CategoryFixture {
  id: number;
  code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

const defaultProducts: ProductFixture[] = [
  {
    id: 'prod-1',
    code: 'P-001',
    name: 'コンデンサ A',
    categoryId: 1,
    category: { id: 1, name: '電子部品' },
    price: 1000,
    stockQuantity: 100,
    status: 'ACTIVE',
    unit: 'pcs',
  },
  {
    id: 'prod-2',
    code: 'P-002',
    name: '抵抗 B',
    categoryId: 1,
    category: { id: 1, name: '電子部品' },
    price: 500,
    stockQuantity: 200,
    status: 'ACTIVE',
    unit: 'pcs',
  },
];

const defaultCategories: CategoryFixture[] = [
  { id: 1, code: 'CAT-001', name: '電子部品', status: 'ACTIVE' },
  { id: 2, code: 'CAT-002', name: '機械部品', status: 'ACTIVE' },
];

export const productsListHandler = (products: ProductFixture[] = defaultProducts) =>
  http.get(apiPath('/products'), () =>
    HttpResponse.json({
      data: products,
      meta: { total: products.length, page: 1, limit: 10, totalPages: 1 },
    }),
  );

export const productsDeleteHandler = http.delete(apiPath('/products/:id'), () =>
  HttpResponse.json({ data: { success: true } }),
);

export const categoriesListHandler = (categories: CategoryFixture[] = defaultCategories) =>
  http.get(apiPath('/categories'), () =>
    HttpResponse.json({
      data: categories,
      meta: { total: categories.length, page: 1, limit: 100, totalPages: 1 },
    }),
  );

export const categoriesDeleteHandler = http.delete(apiPath('/categories/:id'), () =>
  HttpResponse.json({ data: { success: true } }),
);
