# Mobile pipeline (Android)

## 1. Database (run once in Supabase SQL editor)

```sql
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS apk_url text,
  ADD COLUMN IF NOT EXISTS apk_version text,
  ADD COLUMN IF NOT EXISTS apk_updated_at timestamptz;
```

`get_tenant_by_slug` does not need changes — the dashboard reads these columns
directly with the tenant-scoped client.

## 2. Keystore (once, keep it forever)

```bash
keytool -genkey -v -keystore iftin.keystore -alias iftin \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 iftin.keystore > iftin.keystore.b64
```

Add these GitHub repository secrets:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | contents of `iftin.keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | store password |
| `ANDROID_KEY_ALIAS` | `iftin` |
| `ANDROID_KEY_PASSWORD` | key password |
| `SUPABASE_URL` | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (upload + update `tenants`) |

Create a **public** Supabase Storage bucket named `apks`.

Losing the keystore means Play Store updates can never be signed again — back it up.

## 3. Build an app for a reseller

GitHub → Actions → **Build tenant Android app** → Run workflow:

- `tenant_slug` — reseller code, e.g. `marwaan`
- `app_name` — name shown on the phone
- `logo_url` — public PNG (square, ≥1024px) → icons + splash
- `splash_color` — tenant primary color
- `version_name` / `version_code` — bump on every release

Output: signed APK + AAB as artifacts, APK uploaded to Storage, and
`tenants.apk_url` / `apk_version` updated. The reseller then sees the
**"App-kayga soo dejiso"** card on their dashboard.

## 4. How the app finds its tenant

Order of resolution inside the native shell:

1. `VITE_TENANT_SLUG` baked in at build time (per-tenant APK) — default path.
2. Slug stored on the device from a previous launch.
3. Deep link `iftin://t/<slug>`.
4. Otherwise: the reseller-code screen, validated against `get_tenant_by_slug`.

## 5. Local build

```bash
bun run build
npx cap sync android
npx cap open android
```

`capacitor.config.json` no longer contains `server.url`, so the APK ships the
real `dist/` bundle instead of loading the preview server.
