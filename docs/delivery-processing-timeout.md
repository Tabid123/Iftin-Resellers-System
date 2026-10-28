# Android delivery processing timeout

All tenant Android deliveries use a 90-second processing lease, beginning when
`claim_next_delivery` claims a pending item. Pending/scheduled queue age and
heartbeat/dispatch timestamps do not shorten or extend this lease.

`private.expire_delivery_processing` moves expired claims to
`verification_required`, releasing their SIM without requeueing them. This also
applies when the dispatch marker was never received: absence of that marker is
not proof that the carrier did not receive the recharge. Device identity and
dispatch evidence are retained for late-result verification.

A pg_cron watchdog runs every 10 seconds independently of the APK. Claims and
heartbeats also request maintenance. An idle/offline device's expired row is
normally cleared between 90 and 100 seconds after claim, subject to database
availability and concurrent transactions. Locked callback/admin rows are skipped
and checked again on the next pass. The server-side Somlink API queue is outside
this Android SIM lease.

Final Delivered/Cancelled orders close all outstanding queue items immediately.
The same reconciliation cleans up historical final orders during deployment.
Callbacks cannot reopen final orders. Completing one part of a linked/split order
leaves the order nonfinal until the remaining deliveries have resolved.

Late callbacks for verification holds require the original device and a matching
receiver in a successful carrier response or deduction SMS, within a 10-minute
correlation window. Otherwise the item remains for manual verification. No
watchdog timeout automatically resends a recharge.

Validation:

- `node --test tests/deliverySafety.node.mjs` (Node 24+): real Edge route with a
  synthetic database, late exact/generic success, wrong-device rejection, final
  order protection, correlation window, and linked-delivery aggregation.
- `psql "$TEST_DATABASE_URL" -f tests/delivery-processing-timeout.sql`: apply the
  migration inside a rollback transaction on its prior schema. Exercises two
  tenants, missing dispatch markers, fresh/old pending claims, immutable leases,
  SIM availability, late results, final order cleanup, and RPC permissions.
- Inspect `cron.job_run_details` for the `expire-delivery-processing-90s` job and
  verify that Android processing rows do not persist beyond the lease plus the
  watchdog interval.

Maintenance functions in `private` are inaccessible to public clients. The public
RPC wrapper is invoker-only and executable only by `service_role`. Existing
device routing priorities and explicit administrator resend workflows remain in
place. No APK update is required for the server-side timeout.
