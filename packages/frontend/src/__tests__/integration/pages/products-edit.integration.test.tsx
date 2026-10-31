import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { render, screen, waitFor } from '../_helpers/render-page';
import { apiPath } from '../_helpers/api-base';
import { server } from '../../mocks/server';
import { makeProduct } from '@/__tests__/factories';
import EditProductPage from '@/app/dashboard/products/[id]/page';
import NewProductPage from '@/app/dashboard/products/new/page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'prod-1' }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe('商品ページの仕入価格保存', () => {
  it.each([
    ['', null],
    ['0', 0],
    ['75000', 75000],
  ])('編集で仕入価格を %s にすると %s を送信し、再表示できる', async (input, expected) => {
    const user = userEvent.setup();
    let product = makeProduct({ id: 'prod-1', purchasePrice: 120000 });
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.get(apiPath('/products/:id'), () => HttpResponse.json({ data: product })),
      http.put(apiPath('/products/:id'), async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        if (body.purchasePrice !== undefined) {
          product = { ...product, purchasePrice: body.purchasePrice as number | null };
        }
        return HttpResponse.json({ data: product });
      }),
    );
    const view = render(<EditProductPage />);
    const price = await screen.findByLabelText('仕入価格');
    expect(price).toHaveValue(120000);
    await user.clear(price);
    if (input) await user.type(price, input);
    await user.click(screen.getByRole('button', { name: 'マスタ更新' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0].purchasePrice).toBe(expected);
    view.unmount();
    render(<EditProductPage />);
    expect(await screen.findByLabelText('仕入価格')).toHaveValue(expected);
  });

  it('新規登録の空欄は仕入価格を省略する', async () => {
    const user = userEvent.setup();
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post(apiPath('/products'), async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ data: makeProduct() });
      }),
    );
    render(<NewProductPage />);
    await user.type(await screen.findByLabelText(/商品コード/), 'NEW-724');
    await user.type(screen.getByLabelText(/商品名/), '空欄保存');
    await user.type(screen.getByLabelText(/^価格/), '100');
    await user.click(screen.getByRole('button', { name: '選択してください' }));
    await user.click(await screen.findByRole('option', { name: '電子部品' }));
    await user.click(screen.getByRole('button', { name: 'マスタ登録' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty('purchasePrice');
  });
});
