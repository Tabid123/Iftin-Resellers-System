# Web2App Builder — Platform link → APK + AAB

Mashruuc **cusub oo gooni ah** (website + database u gaar ah) oo qofku galiyo link-ga web app-kiisa, kadibna helo APK iyo AAB saxiixan, oo **offline-first** ah sida APK-ga tenant-ka Iftin.

## 1. Waxa uu user-ku sameeyo (A–Z)

1. **Is-diiwaangeli** (email + password).
2. **Abuur App cusub** — buuxi:
   - Link-ga website-ka (`https://...`)
   - Magaca app-ka, Package ID (tusaale `com.magaca.app`)
   - Logo (PNG ≥1024px square), midabka splash/status bar
   - Version name + version code
   - Doorasho: offline-first (soo dejin bogga) ama online kaliya
3. **Soo rar keystore-kaaga** — `.keystore`/`.jks` + store password, key alias, key password. (Haddii uusan haysan: tilmaamo `keytool` amar ah oo la koobiyeeyo; badbaadinta furaha waa mas'uuliyaddiisa.)
4. **Riix "Dhis App-ka"** — status-ka live ah: `queued → crawling → building → signing → ready/failed`.
5. **Soo deji** APK (tijaabo telefoonka) iyo AAB (Play Store), iyo QR code fudud.
6. **Build cusub** — isbeddel kasta (logo, magac, version) wuxuu abuurayaa build cusub; taariikh buuxda ayaa la kaydiyaa.

## 2. Sida platform-ku u shaqeeyo (gudaha)

```text
User form ──> builds row (queued)
                  │
                  ▼
          GitHub Actions (workflow_dispatch)
            1. crawl/download web app  (offline snapshot)
            2. Capacitor shell: appId, name, icons, splash
            3. build web bundle -> npx cap sync android
            4. gradlew assembleRelease bundleRelease
            5. sign with user keystore (decoded from secret store)
            6. upload APK + AAB -> Storage
            7. callback -> builds row = ready + URLs
                  │
                  ▼
        User dashboard: Download APK / AAB
```

### Qeybaha

- **Web app (frontend + server functions)** — diiwaangelin, foomka app-ka, liiska builds-ka, download links, live status (realtime).
- **Database (Supabase)** — `profiles`, `apps`, `app_builds`, `build_logs`, `keystores` (metadata kaliya).
- **Storage buckets** — `assets` (logos, private), `artifacts` (APK/AAB, private + signed URLs), `keystores` (private, encrypted).
- **Build runner** — GitHub Actions repo gooni ah oo leh template Capacitor ah; server function ayaa `workflow_dispatch` ku dirta parameters + build token.
- **Callback endpoint** — `/api/public/build-callback` oo HMAC signature ku xaqiijiya, kadibna cusbooneysiiya safka build-ka (status, artifact paths, logs).

## 3. Offline-first: sida bogga loo duubo APK-ga

1. Runner-ku wuxuu `wget`/crawler (mirror mode) ku soo dejiyaa bogga: HTML, CSS, JS, sawirro, fonts — depth xaddidan + same-origin kaliya.
2. Link-yada gudaha waa la rewrite gareeyaa si ay relative u noqdaan; `base href` waa la saaraa.
3. Snapshot-ka wuxuu galaa `dist/`, kadibna `npx cap sync android` — app-ku wuxuu ka bilaabmaa assets-ka gudaha, ma sugayo internet.
4. **Online refresh** — markuu internet jiro, app-ku wuxuu isku dayaa inuu URL-ka dhabta ah soo shubo (WebView remote), haddii fashilmo wuxuu ku noqdaa snapshot-ka gudaha. Offline banner Soomaali ah ayaa la muujinayaa.
5. Service worker/cache lama daro shell-ka gudaha si aan stale-cache dhibaato u dhalin.

## 4. Keystore user-ka — badbaadada

- Faylka waa la encrypt gareeyaa (AES-GCM, fure platform ah oo secret ku jira) ka hor intaan Storage la gelin; passwords-ka isla si ayaa loogu kaydiyaa (column encrypted, RLS: owner kaliya).
- Server function kaliya ayaa decrypt kara, kadibna base64 ahaan u gudbiya workflow-ga `secrets`-ka runtime ah (mask ku sameeya log-yada).
- Runner-ku wuxuu keystore-ka ku qoraa `$RUNNER_TEMP`, kadibna build-ka ka dib wuu tirtiraa; log-yada lama muujiyo.
- User-ka waxaa loo sheegayaa: "Furahaaga ha lumin — haddii uu lumo update Play Store lama saxiixi karo."
- Fingerprint (SHA-256) ayaa la tusayaa si uu u hubiyo in furaha saxda ah la isticmaalay.

## 5. Database schema (qoraal kooban)

| Table | Columns muhiim ah |
| --- | --- |
| `profiles` | id (auth user), email, created_at |
| `apps` | id, owner_id, name, website_url, package_id (unique), logo_path, splash_color, offline_mode bool, created_at |
| `app_builds` | id, app_id, version_name, version_code, status, apk_path, aab_path, error_message, gh_run_id, started_at, finished_at |
| `build_logs` | id, build_id, ts, level, message |
| `keystores` | id, owner_id, app_id, file_path, alias, enc_store_pass, enc_key_pass, sha256_fingerprint |

RLS: owner kaliya (`auth.uid() = owner_id`), builds/logs waxaa la eegaa `app_id → apps.owner_id`. GRANTs authenticated + service_role.

## 6. Farsamada (technical)

- **Stack**: TanStack Start + Supabase (auth, DB, storage), Tailwind. Server functions: `createServerFn` (create app, upload keystore, trigger build, signed download URLs). Server route: `/api/public/build-callback` (HMAC verified).
- **CI repo**: `web2app-builder-ci` — hal workflow `build-app.yml` oo qaata inputs: `build_id`, `app_url`, `app_name`, `app_id`, `logo_url`, `splash_color`, `version_name`, `version_code`, `offline_mode`, `callback_url`, `callback_token`; secrets: `KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` (runtime ahaan la gudbiyo), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Steps-ka workflow-ga**: setup-bun, setup-java 21 (temurin), Android SDK (cmdline-tools + `platforms;android-36`, `build-tools;36.0.0`), crawl site, patch `capacitor.config.json` (appId/appName/colors), `@capacitor/assets generate --android` icons+splash, `cap sync android`, `./gradlew assembleRelease bundleRelease`, upload artifacts → Storage, callback.
- **Secrets**: GitHub PAT (dispatch), `BUILD_CALLBACK_SECRET`, `KEYSTORE_ENC_KEY` — dhammaan `add_secret`.
- **Limits qeybta 1-aad**: 5 build/maalin/user (aan lacag lahayn), timeout 30 daqiiqo.

## 7. Dokumentiyada la qorayo (repo docs/)

- `README.md` — dulmar + quick start
- `docs/user-guide.md` — Soomaali: sida app loo sameeyo, keystore loo sameeyo, Play Store loogu diro
- `docs/architecture.md` — diagram + qulqulka build-ka
- `docs/ci-workflow.md` — inputs, secrets, troubleshooting (build failed, icon fail, crawl fail)
- `docs/security.md` — keystore encryption, RLS, signed URLs

## 8. Qaabka la dhisayo (phases)

1. **P1** — Auth + dashboard + `apps`/`app_builds` schema + foomka app-ka.
2. **P2** — CI repo + workflow + dispatch server function + callback + status live.
3. **P3** — Keystore upload + encryption + signing.
4. **P4** — Offline crawler + fallback-ka online, QR download, build history.
5. **P5** — Docs A–Z + tijaabo dhab ah oo telefoon ah.

## Qodobo la hubinayo hadhow

- Repo-ga CI cusub (magac + PAT) waa in la abuuro — waan ku hagayaa.
- iOS lama daraayo qeybtan (Mac runner ayaa loo baahan yahay).
