# Tallaabo 3 — Keystore-ka Android + GitHub Secrets

## 1) Samee keystore (hal mar oo kaliya, kombiyuutarkaaga)

Waxaad u baahan tahay Java JDK (`keytool` way ku jirtaa).

```bash
keytool -genkeypair -v \
  -keystore iftin.keystore \
  -alias iftin \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass 'KU-BEDDEL-PASSWORD-ADAG' \
  -keypass  'KU-BEDDEL-PASSWORD-ADAG' \
  -dname "CN=Iftin Digital Solutions, OU=Mobile, O=Iftin, L=Mogadishu, S=Banadir, C=SO"
```

MUHIIM: `iftin.keystore` iyo password-ka si ammaan u kaydso (password manager).
Haddii ay lumaan, app-ka Play Store lagama cusboonaysiin karo weligiis.

## 2) U beddel base64

```bash
# macOS
base64 -i iftin.keystore | tr -d '\n' > keystore.base64.txt
# Linux
base64 -w 0 iftin.keystore > keystore.base64.txt
```

## 3) Ku dar GitHub Secrets

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Qiimaha |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | waxa ku jira `keystore.base64.txt` (hal saf, meel bannaan ma laha) |
| `ANDROID_KEYSTORE_PASSWORD` | password-kii `-storepass` |
| `ANDROID_KEY_ALIAS` | `iftin` (ama alias-kii aad isticmaashay) |
| `ANDROID_KEY_PASSWORD` | password-kii `-keypass` |
| `SUPABASE_URL` | `https://bpkddmxpyeyxvjyebull.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` key |

## 4) Hubi

Actions → **Build Tenant Android** → Run workflow → geli `tenant slug` + version →
APK-gu wuxuu galayaa bucket-ka `apks`, `tenants.apk_url` na waa la cusboonaysiiyaa,
dashboard-ka reseller-kana wuxuu tusayaa card-ka "App-kayga soo dejiso".

## Talooyin ammaan
- Keystore-ka HA gelin repo-ga (`.gitignore` ku dar `*.keystore`, `*.base64.txt`).
- `service_role` key-ga GitHub Secrets oo keliya ha ku jiro — meelna ha ku qorin code-ka.
