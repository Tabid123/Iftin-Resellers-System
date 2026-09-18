# Workspace isolation audit (production readiness)

- [x] Architecture + ownership inventory for every workspace-owned resource.
- [x] Bug A (banner leak): evidence chain captured (server returns only own rows; client workspace hint was authoritative).
- [x] Bug B (company flash): workspace-scoped cache/offline/startup fix.
- [x] Canonical helpers: workspaceQueryKey / workspaceStorageKey / requireWorkspace / workspace-aware upload.
- [x] Database, RLS, RPC and privileged-path authorization audit.
- [x] Realtime, storage and preloader scoping audit (storage write policies tightened).
- [x] Automated regression tests (cross-read, cross-write, offline, late response, realtime, generic-key ban).
- [x] Two-workspace verification matrix + production verdict.
- [ ] BLOCKER: visitor/public access is authorized by a client-supplied workspace header (awaiting decision).
- [x] Multi-workspace accounts: membership-validated selection (0 = denied, 1 = auto, 2+ = explicit picker) in DB (authorized_tenant_id) and client (workspaceMembership.ts).
- [ ] BLOCKER: packaged APK offline isolation — manual run required (docs/offline-apk-isolation-test.md).
- [ ] Offline-mode A/B isolation not verifiable in dev (no service worker); retest on a packaged build.

# Current work

- [ ] Verify installed Delivery APK version with device-side evidence; blocked until a phone is connected, so add server-visible version telemetry.
- [ ] Diagnose and fix ONLINE dispatch using fresh production data and current code paths.
- [ ] Diagnose and fix SMS receive/logging, including runtime permission and device identity handling.
- [ ] Diagnose and fix tenant PIN propagation through every USSD flow.
- [ ] Add focused automated tests and produce evidence without claiming phone-level success prematurely.
- [ ] Fix tenant Android/PWA bottom movement, covered phone/code fields, and the white bottom banner.
- [ ] Play the supplied full voice prompt whenever the login phone-number field is tapped.
