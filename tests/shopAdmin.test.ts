import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ShopAdmin from '../src/components/shop/ShopAdmin';
const mock = vi.hoisted(() => ({ enabled: true }));
vi.mock('@/lib/router-compat', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../src/components/shop/useShop', () => ({
  useShop: () => ({ tenant: { id: 'tenant-a' }, enabled: mock.enabled, loading: false }),
  shopDb: {}, money: (n: number) => `$${n.toFixed(2)}`,
  orderStatuses: { received: 'Waa la helay', preparing: 'Waa la diyaarinayaa', dispatched: 'Waa la soo diray', delivered: 'Waa la keenay', cancelled: 'Waa la joojiyay' },
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: {
    categories: [{ id: 'cat-a', name: 'Accessories', image_url: '', active: true }],
    products: [{ id: 'product-a', category_id: 'cat-a', name: 'Earbuds', image_url: '', description: '', stock: 3, price: 15, active: true }],
    orders: [{ id: 'order-a', customer_name: 'Customer A', phone: '0612345678', address: 'Hodan', total: 15, status: 'received', created_at: '2026-11-14T00:00:00Z', items: [{product_id:'product-a',name:'Earbuds',quantity:1}] }],
  }, isLoading: false }),
}));
// Render the actual admin views with a deterministic data boundary. No browser
// or live account is needed to verify disabled access and route-specific fields.
describe('tenant eCommerce admin pages', () => {
  beforeEach(() => { mock.enabled = true; (globalThis as any).React = React; });
  it.each(['categories','products','stock','orders'] as const)('hides %s even if cached shop data exists when disabled', section => {
    mock.enabled = false;
    const html = renderToStaticMarkup(React.createElement(ShopAdmin,{section}));
    expect(html).toContain('Super Admin'); expect(html).not.toContain('Earbuds'); expect(html).not.toContain('Customer A');
  });
  it('opens category management directly',()=>{
    const html = renderToStaticMarkup(React.createElement(ShopAdmin,{section:'categories'}));
    expect(html).toContain('Magaca qaybta');expect(html).toContain('Ku dar category');expect(html).toContain('Accessories');expect(html).not.toContain('Customer A');
  });
  it('provides product price and stock inputs',()=>{
    const html = renderToStaticMarkup(React.createElement(ShopAdmin,{section:'products'}));
    expect(html).toContain('Qiimaha ($)');expect(html).toContain('Stock');expect(html).toContain('Earbuds');expect(html).toContain('step="0.01"');
  });
  it('opens inventory with counts and stock editing',()=>{
    const html = renderToStaticMarkup(React.createElement(ShopAdmin,{section:'stock'}));
    expect(html).toContain('Tirada stock-ga');expect(html).toContain('Stock cusub');expect(html).toContain('Raadi stock');expect(html).not.toContain('Customer A');
  });
  it('opens order monitoring with statuses and customer details',()=>{
    const html = renderToStaticMarkup(React.createElement(ShopAdmin,{section:'orders'}));
    expect(html).toContain('Customer A');expect(html).toContain('Xaaladda dalabka');expect(html).toContain('Tallaabada xigta');expect(html).toContain('Jooji');
  });
});
