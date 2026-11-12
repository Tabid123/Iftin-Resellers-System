# Sharfaan Data: update the existing Google Play app

Goal: replace the existing **Sharfan data** Play Store app with the `sharfaan` tenant from Iftin Resellers System **as an update**, not a new listing.

## Confirm the existing Play app

The earlier Play Console screenshot showed **Sharfan data** with package name `com.sharfandata.app`. Confirm this in Play Console before building: **Test and release → Latest releases and bundles → All app bundles**. Write down the **highest ever uploaded version code**; do not assume Faanoole's version code 21 or 22 applies.

## If you do not have the old Sharfaan upload keystore

Create a **new Sharfaan-only** PKCS12 upload keystore on your Windows computer in a separate directory:

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\SharfaanKeys"
Set-Location "$HOME\SharfaanKeys"
keytool -genkeypair -v -keystore sharfaan-upload.jks -storetype PKCS12 -alias sharfaan-upload -keyalg RSA -keysize 3072 -validity 10000
keytool -exportcert -rfc -keystore sharfaan-upload.jks -alias sharfaan-upload -file upload_certificate.pem
```

Store `sharfaan-upload.jks` and the password securely offline. **Do not reuse Faanoole's upload key or password**. Never commit the keystore, a Base64 copy, or passwords to the repository.

In the **existing Sharfaan Play Console app**, visit **App signing → Upload key → Request reset**. Select the truthful reason (lost upload key if applicable) and upload the Sharfaan `upload_certificate.pem`. Do NOT click **Upgrade key** under App signing key. Wait for the new upload certificate to become valid, and verify the SHA-256 fingerprints.

## GitHub Actions secrets (dedicated to Sharfaan)

Create these secrets on **Settings → Secrets and variables → Actions**:

| Name | Value |
| --- | --- |
| `SHARFAAN_PLAY_KEYSTORE_BASE64` | Base64 encoding of the new `sharfaan-upload.jks` file |
| `SHARFAAN_PLAY_KEYSTORE_PASSWORD` | The new keystore password |
| `SHARFAAN_PLAY_KEY_ALIAS` | `sharfaan-upload` |

PowerShell to copy Base64 privately:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\SharfaanKeys\sharfaan-upload.jks")) | Set-Clipboard
```

The PKCS12 key generated above uses the same key password as the store password. There is no separate Sharfaan key-password secret required. Do not overwrite any existing Faanoole or generic Android secrets.

## Build after changes are merged

Open GitHub → Actions → **Build tenant Android app** → **Run workflow** on `main`:

| Input | Value |
| --- | --- |
| `tenant_slug` | `sharfaan` |
| `app_name` | `Sharfaan Data` |
| `app_id` | `com.sharfandata.app` (verify from existing app) |
| `logo_url` | Leave blank — verified Sharfaan tenant PNG is loaded automatically |
| `splash_color` | `#4f026c` |
| `version_code` | Set to **higher than the maximum version code** displayed in Sharfaan Play Console |
| `version_name` | Select a new version name to match the release (e.g. `1.0.16` only if appropriate) |
| `signing_profile` | `sharfaan_play` |
| `publish_apk_to_supabase` | `false` |

The workflow must reject mismatching tenant/package and missing Sharfaan signing credentials. It does not automatically publish the Play-signed APK to tenant downloads, even if the checkbox is checked.

Retrieve the signed **`.aab`** from the `sharfaan-android` GitHub Actions artifact. Verify package, version code, certificate, Faanoole/other-tenant isolation, Sharfaan branding, ordering, payments, notifications and offline mode before submitting to the **existing** Sharfaan Production release. Only upload after Google has activated the Sharfaan-specific upload key if a reset was required.

This change does not submit an app to Google Play, reset a signing key, or modify the Supabase database.
