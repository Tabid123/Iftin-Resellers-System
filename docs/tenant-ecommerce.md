# Tenant eCommerce

Opt-in shop module controlled only by platform super admins. A missing feature
row means OFF. No tenant is enabled or seeded with sample products by this change.

## Controls and routes

- Platform: open a reseller detail and use **eCommerce — Dukaanka** ON/OFF.
- Tenant owner: `/dashboard/shop` manages categories, HTTPS product images,
  product descriptions/prices/stock, visibility and the latest 100 orders.
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

1. Review and apply `supabase/migrations/20261114155445_tenant_ecommerce.sql`
   to the repository's configured project (`bpkddmxpyeyxvjyebull`). It is additive.
2. Deploy the matching web source. Leave all tenants OFF initially.
3. Enable one test tenant in the platform detail page, add real categories/products
   as its owner, and exercise the manual checks below before enabling customers.

This work session's hosted migration attempt was blocked by automatic approval
review. No production database migration or tenant activation was performed.

## Verification

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
