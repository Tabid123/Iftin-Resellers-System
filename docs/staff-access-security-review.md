# Staff access security – Cawaale Data ticket IFT-20261108-D65082B0

This change is **staged**. The GitHub PR is a draft and has not been merged or published.
Manual Transactions diagnostics and modifications are explicitly out of scope.

## Applied database migrations (Iftin Tech, project bpkddmxpyeyxvjyebull)

The following migrations were applied with the connected Supabase migration action on 2026-11-09:

- `20261109132933` – `ids_staff_owner_only_permission_policies_20261109`
  Owner-only writes to `admin_permissions`, staff self-read of grants, safe staff-member removal,
  and revoke client TRUNCATE privileges.
- `20261109140117` – `ids_staff_marked_financial_access_guard_20261109`
  Adds restrictive RLS for seven sensitive tables, requiring grants for users with the
  `restricted_access` marker. **Unmarked legacy users retain previous access intentionally**
  until the new client and role controls have been deployed and validated.
- `20261109140403` – `ids_staff_safe_order_list_rpc_20261109`
  Adds authenticated `public.get_staff_orders`, implemented by a checked non-exposed
  `ids_security.list_staff_orders` routine. Returns explicitly selected order fields,
  with `selling_price` and `cost_price` redacted independently according to grants.

These are already present in Supabase's migration history. Do not reapply them by hand.

## SQL safety verification performed

All SQL role simulations used `BEGIN`/`ROLLBACK`; no test permission markers were kept.

- Restricted staff with no relevant grants: raw orders query returned **0**.
- Restricted staff granted only `manage_orders`: raw orders query returned **0**;
  checked RPC returned **10 paginated rows** from **274** matching rows, with
  both selling and cost amounts redacted.
- Restricted staff granted only `view_sales`: raw orders query returned **0**;
  checked RPC exposed selling price but redacted cost price.
- Staff with no sales/order/profit grants: checked RPC rejected unauthorized access.

## Limitations and deployment blockers

1. No persistent `restricted_access` markers were added to existing accounts. The
   database guard is activated only for appropriately marked accounts. Introduce the
   marker for existing restricted staff **only after** the UI/edge deployment is ready.
2. Owner/legacy order reads still use their existing code paths. The limited staff
   order pages in this PR use `get_staff_orders`. Limited-staff order mutations are
   intentionally hidden until write RPCs are reviewed.
3. Dashboard financial RPCs currently use invoker rights; restricted staff may see zero
   totals. A dedicated restricted-staff summary is needed before full rollout. Existing
   owners should remain unaffected.
4. Review all other financial data paths (bank transactions, receipts, wallet, exported
   reports, price configuration, additional Edge functions). SQL RLS on orders does not
   automatically protect every view or function.
5. Separate staff-only roles are not yet validated end-to-end in the deployed app.
6. Existing unrelated `Verify tenant secret prices feature` workflow fails on an
   absent source anchor; it fails during its patch step, before building, and is not
   evidence that staff access tests fail.
7. **Never merge or publish this draft** without explicit permission and an end-to-end
   staging review. Production publishing is a separate approval.

## Reviewer quick checks

- Run the PR web-build workflow (includes `tests/staffAccessRules.test.ts`).
- Compare read-only queries against the Supabase policies and actual migration records.
- Verify tenant membership and owner privileges for each staff role.
- Check zero-grant, Sales-only, Profit-only, Orders-only, and cross-tenant access.
- Verify direct REST/RPC access cannot return unapproved financial columns.
- Preserve and recheck existing order delivery paths without changing Manual Transactions.
