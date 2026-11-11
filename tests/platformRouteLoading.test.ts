import { describe, expect, it, vi } from 'vitest';
import { createRootRoute, createRouter } from '@tanstack/react-router';

vi.mock('../src/lib/lazyPages', () => ({
  lazyPage: () => () => null,
  PageSuspense: () => null,
}));

const routes = [
  () => import('../src/routes/admin'),
  () => import('../src/routes/admin.index'),
  () => import('../src/routes/admin.resellers.index'),
  () => import('../src/routes/admin.resellers.$id'),
  () => import('../src/routes/admin.resellers.new'),
  () => import('../src/routes/admin.plans'),
  () => import('../src/routes/admin.apps'),
];

describe('platform route component loading', () => {
  it.each(routes.map((load, index) => ({ load, index })))('loads admin route $index without an extra component chunk', async ({ load }) => {
    const { Route } = await load();
    expect(Route.options.codeSplitGroupings).toEqual([]);
    expect(typeof Route.options.component).toBe('function');
    const router = createRouter({ routeTree: createRootRoute() });
    await expect(Promise.resolve(router.loadRouteChunk(Route))).resolves.toBeUndefined();
  });
});