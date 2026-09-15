# Packaged APK — offline workspace isolation test (manual, required before release)

Status: **NOT YET VERIFIED ON PACKAGED APK**. This environment cannot compile or
run the Android build, so this procedure must be executed on a real device with
the signed/packaged build before the release is approved.

## What is being proven

A device that has previously used workspace A must never display, cache, or fall
back to workspace A data while workspace B is active — including cold start,
airplane mode, and an interrupted first sync.

## Prerequisites

- Two packaged builds (or one build + two authoritative slugs/domains): A and B.
- Two staff accounts, one per workspace.
- `adb` connected: `adb logcat -c` before each phase, `adb logcat > phaseN.txt` during.

## Phase 1 — A baseline

1. Fresh install build A (or `adb shell pm clear <package>`).
2. Log in as workspace A staff.
3. Open every offline-capable page (Providers, Categories, Packages, Payment
   methods, Popular/Featured, Banners, Offline mode, History, Dashboard).
4. Confirm A data is present and cached: `adb shell run-as <package> ls -R /data/data/<package>/app_webview/Local\ Storage`.
5. Screenshot each page. Log out.

## Phase 2 — B on the same device

6. Launch workspace B (B slug/domain/build).
7. Log in as workspace B staff, let the sync finish.
8. Enable airplane mode. Force-stop the app. Cold start.
9. Visit every page from step 3.

**Expected:** zero A branding, zero A banners, zero A providers/categories/
packages/payment methods, zero A popular/featured items, zero A orders.
Empty or "no data" states are acceptable; A data is a FAIL.

10. Record the active workspace id shown in local storage keys — every `ws:` key
    must carry B's id only.

## Phase 3 — reverse

11. Repeat Phase 1/2 with the roles swapped (B first, then A).

## Phase 4 — interrupted sync (fail-safe)

12. Log in as A, sync, log out.
13. Log in as B, and disconnect the network **before** B's sync completes.
14. Cold start offline and inspect every page.

**Expected:** neutral/empty state or an explicit "no data yet" message.
Falling back to A's cache is a FAIL.

## Evidence to attach

- Screenshots per page and phase.
- `adb logcat` files per phase.
- Local storage key dump per phase (must contain only the active workspace id).
- Explicit PASS/FAIL per phase.
