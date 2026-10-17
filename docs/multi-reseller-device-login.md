# Multi-reseller device login — implementation safety plan

## Confirmed current behavior

- Android `LoginActivity` supplies `Settings.Secure.ANDROID_ID` to `AuthRepository.login`.
- `AuthRepository.login` calls `register-device` with credentials and fails on HTTP 409.
- `register-device` finds `android_devices` by globally unique `device_id` and rejects a different `tenant_id`.
- Production has two `forbid_tenant_id_change` triggers and a unique index on `android_devices.device_id`.
- `delivery_queue.android_device_id`, `sms_logs.device_id`, `sim_balances.device_id` and other tables refer to devices. Changing a device's tenant in place can reassign or leak historical and pending work.

## Required behavior

1. Authenticate the account and resolve its authorized tenant before any device mutation.
2. Permit sequential use of one physical handset by multiple tenants, **never concurrent cross-tenant polling or SMS delivery**.
3. Preserve immutable tenant ownership of historical orders, SMS logs, balances and pending delivery queue rows.
4. Device registration and heartbeat must not allow a previously logged-out tenant to reclaim the active device session.
5. Before switching, stop/reject pending delivery and SMS operations belonging to the old tenant; do not silently move queued work to the new tenant.
6. All device-facing polling, callbacks, balance updates and SMS ingestion must validate the current tenant and authenticated session, not merely `ANDROID_ID`.
7. Keep the existing APK API contract if possible; if its polling endpoints do not carry a trustworthy tenant/session, a server-only fix is **not safe** and requires an APK update.

## Do not ship this shortcut

Do not simply remove the 409 branch, disable tenant immutability triggers or overwrite `android_devices.tenant_id`. Doing so may allow old-tenant orders/SMS to be processed by the new tenant.

## Acceptance tests

- A logs in on phone P, logs out; B logs in on P; B only sees/executes B's work.
- A's historical SMS, balances and orders remain visible to A and invisible to B.
- A's pending delivery cannot be executed or acknowledged by B after switch.
- An old A token or heartbeat cannot reactivate A's session while B is active.
- Wrong password or account with no tenant cannot bind any device.
- Rapid A→B→A switches and offline reconnect do not leak cross-tenant work.
- Existing single-tenant devices continue to work without a forced reinstall.

## Implementation gate

Audit every device poll, heartbeat, SMS and delivery endpoint and the APK payloads before changing production. Test with two dedicated tenant accounts and a non-production phone. No production migration until the isolation tests pass.
