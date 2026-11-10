# Faanoole: update the existing Google Play listing

This guide updates the existing **Faanoole** listing, rather than creating a new Play app. Current Play screenshots show package `com.faanoole.app`, release version code `21` and version name `1.0.15`. Confirm the Play Console details before releasing if a newer build appears.

## 1. Create a private Faanoole upload key on your computer

Generate a **new upload key**, not an app signing key:

```sh
keytool -genkeypair -v -keystore faanoole-upload.jks -storetype PKCS12 -alias faanoole-upload -keyalg RSA -keysize 3072 -validity 10000
keytool -exportcert -rfc -keystore faanoole-upload.jks -alias faanoole-upload -file upload_certificate.pem
```

Keep `faanoole-upload.jks` and its passwords offline in two secure locations. Never commit them to GitHub, share in chat or include passwords in command history.

## 2. Reset the upload key in the existing Play app

Open Faanoole in Play Console → Protected with Play → Play Store protection → Manage Play app signing → **Upload key → Request reset**. Upload **`upload_certificate.pem`** and state that the former upload key was lost. Do **not** select **Upgrade key** under *App signing key*.

Wait until Google confirms the upload-key reset. Verify the new upload certificate SHA-256 fingerprint against the certificate shown in the Play Console. Google Play will continue signing delivered installs using the existing app signing key.

## 3. Configure dedicated GitHub Actions secrets

On **Settings → Secrets and variables → Actions**, create these repository secrets:

| Secret | Value |
| --- | --- |
| `FAANOOLE_PLAY_KEYSTORE_BASE64` | Base64 encoding of the **new** `.jks` file |
| `FAANOOLE_PLAY_KEYSTORE_PASSWORD` | The new keystore password |
| `FAANOOLE_PLAY_KEY_ALIAS` | `faanoole-upload` |
| `FAANOOLE_PLAY_KEY_PASSWORD` | The new key password |

On Windows PowerShell, use this to copy the Base64 data for the first secret, using your actual keystore path:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\faanoole-upload.jks")) | Set-Clipboard
```

Avoid screenshots or sharing the private key and passwords. Existing general Android signing secrets remain untouched.

## 4. Build the **Faanoole** release AAB

After this workflow change is merged to `main`, open GitHub → Actions → **Build tenant Android app** → **Run workflow** with:

| Input | Value |
| --- | --- |
| `tenant_slug` | `faanoole` (confirm it exists in the tenants database) |
| `app_name` | `Faanoole` |
| `app_id` | `com.faanoole.app` |
| `version_code` | `22` (or higher than *all* version codes in Play Console) |
| `version_name` | `1.0.16` |
| `signing_profile` | `faanoole_play` |
| `publish_apk_to_supabase` | `false` |
| `logo_url` | Public square Faanoole app icon URL; verify artwork before release |
| `splash_color` | Faanoole brand color, such as `#0F4C81` only if appropriate |

The workflow builds both signed APK and AAB. **Only upload the signed AAB** from the `faanoole-android` Actions artifact to the existing Play Console listing. It intentionally does not publish the APK to the tenant's Supabase downloads when using `faanoole_play` signing, to avoid breaking sideloaded update paths.

Before promotion, verify `com.faanoole.app`, the actual maximum version code, Faanoole branding, offline startup, tenant isolation, push notifications, payments and core ordering in an internal-test release. Verify all required store declarations and policy compliance for the rewritten app. Production release must be an explicit separate action.

## Safety notes

- The repository default app id `com.iftin.agents` is **not** the Faanoole Play Store package. Always supply the Faanoole app id in the workflow.
- The old shared `ANDROID_KEYSTORE_*` secrets are for other builds; **do not replace them** with the Faanoole upload key.
- A Google Play **upload-key reset** is not an **app-signing-key upgrade**. Updating the upload key alone does not change the on-device app signature.
- A build will fail if the Faanoole-specific secrets are missing, if the app ID is wrong, or if the version code is `21` or lower.
