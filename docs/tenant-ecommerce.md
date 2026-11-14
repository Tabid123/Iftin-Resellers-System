# Tenant eCommerce

Opt-in shop module controlled only by platform super admins. A missing feature
row means OFF. No tenant is enabled or seeded with sample products by this change.

## Controls and routes

- Platform: open a reseller detail and use **eCommerce — Dukaanka** ON/OFF.
- Tenant owner: the **eCommerce** sidebar group contains **Categories**
  (`/dashboard/ecommerce-categories`), **Packages / Alaabta**
  (`/dashboard/ecommerce-packages`), **Stock** (`/dashboard/ecommerce-stock`)
  and **Dalabyada** (`/dashboard/ecommerce-orders`). `/dashboard/shop` remains
  a compatible entry to products. Owners can add/edit categories and products,
  HTTPS images, descriptions, prices, availability, stock and order status.
- Stock edits use the original stock count as an optimistic concurrency check;
  intervening customer purchases cannot be silently overwritten. Stock summary,
  inventory search, and order status filters are included.
- Customer: `/shop`, also `/t/<slug>/shop`, has its own bottom navigation:
  Dukaan, Raadi, Dambiil, Dalabyadayda. Checkout hides this navigation.
- Enabled tenants show a shop banner between provider tiles and popular bundles.
- Disabled tenants lose the banner and shop screen. The server rejects new
  orders and catalog/admin writes. Existing records remain available on re-enable.
  The feature flag refreshes on focus and every 15 seconds; server checks apply
  immediately to every catalog/order request.

## Initial checkout scope

Cash on delivery only. Delivery charges are agreed with the merchant, not silently
added. No online payment, payment confirmation, provider credentials, or USSD
bundle fulfillment is reused. Confirmation explicitly says payment is outstanding.
Images are entered as HTTPS URLs; no new storage bucket is needed.

The existing storefront uses a locally stored phone, not an authenticated buyer
identity. Therefore order history uses random private receipt UUIDs, scoped to the
tenant and saved on the device. A phone number alone cannot retrieve an order.
Receipts do not sync between devices; clearing browser data removes access.
Merchant order records remain intact. Public shop activation should include a
merchant review of the guest COD ordering policy and abuse controls.

Server-side transactions calculate prices, compare the displayed total, lock stock,
and reject unavailable/cross-tenant items. A stable receipt token makes network
retries idempotent. Status transitions are sequential, terminal states cannot be
reopened, and cancellation restores stock exactly once. Only status is updateable
on order records, including on projects with broad default table grants.

## Deployment

1. Review and apply `supabase/migrations/20261114161416_tenant_ecommerce.sql`
   to the repository's configured project (`bpkddmxpyeyxvjyebull`). It is additive.
2. Deploy the matching web source. Leave all tenants OFF initially.
3. Enable one test tenant in the platform detail page, add real categories/products
   as its owner, and exercise the manual checks below before enabling customers.

The user explicitly approved the hosted migration after the initial approval
review rejection. Migration `20261114161416_tenant_ecommerce` was applied to
production successfully. Live verification confirmed zero enabled tenants and
no catalog/order records; authenticated clients can update order status but
cannot change order totals, and anonymous clients cannot directly insert orders.
No tenant has been activated.

Security advisors flag the two intentionally guest-callable `SECURITY DEFINER`
RPCs (`shop_place_order` and `shop_order_history`). They enforce tenant selection,
server-owned pricing/stock, or private receipt tokens internally and expose no
unrestricted order-table access. See the [Supabase linter guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
Table RLS and privilege checks were verified separately.

## Verification

- `npx vitest run tests/shopAdmin.test.ts`: eight admin render/access tests pass.
- `npx tsc --noEmit`
- `npm run build`
- Isolated Postgres policy/business-rule test (does not connect to production):
  `npm install --no-save --package-lock=false @electric-sql/pglite@0.5.16`
  then `node tests/shop-database.mjs`.
- `npm test`: 66 passed, 3 failed on both the unchanged base and this branch.
  Existing failures: two in `deviceHeartbeat.test.ts`, one in
  `workspaceIsolation.test.ts`. These files and their implementation were not changed.
- Browser smoke testing was attempted but Chromium could not start in this
  executor (`socket() failed: Operation not permitted`). No visual/end-to-end
  browser pass is claimed.

Manual acceptance: enable tenant A and leave B disabled; verify A's banner and
shop navigation; order one product; verify only A's owner sees the order; change
its status; check buyer history; cancel a separate order and check restored stock;
disable A and try its direct shop URL and ordering API; re-enable A and verify
its existing products/orders are preserved. Also test mobile widths and back navigation.
