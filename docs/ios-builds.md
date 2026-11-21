# Tenant iOS builds

Open GitHub Actions and select **Build tenant iOS app**. Enter a tenant slug, an
optional app name and bundle identifier, a version, and a build number. The
default tenant is `marwaan`, with bundle identifier `com.iftin.marwaan`.
The bundle identifier must match the app registered in Apple Developer and App
Store Connect before a signed upload.

## Simulator test

Choose `simulator`. The workflow uses macOS and Xcode 26 or later, packages the
tenant's public storefront and images, generates a Capacitor iOS project, and
builds and launches it on an iPhone simulator. Download the simulator app,
startup screenshot, and build log from the workflow artifacts. A simulator app
runs in the iOS Simulator on a Mac.

Changes pushed to `codex/marwaan-ios` run this Marwaan simulator test. Other
tenants can be built using the workflow form after it is on the default branch.

## Signed App Store IPA

Create a GitHub environment named `ios-<tenant_slug>`, such as `ios-marwaan`.
Set these secrets in that environment to keep each tenant's Apple credentials
scoped to its builds.

| Secret | Value |
| --- | --- |
| `IOS_DISTRIBUTION_P12_BASE64` | Base64-encoded Apple Distribution certificate including its private key |
| `IOS_P12_PASSWORD` | Password protecting that P12 file |
| `IOS_PROVISIONING_PROFILE_BASE64` | Base64-encoded App Store provisioning profile for the exact bundle identifier |

Select `app-store` to archive and export a signed IPA. Increase the build number
for each upload of a version. A temporary keychain holds the certificate during
the job. The workflow checks the profile's bundle identifier, expiry, and
distribution type before archiving.

To select **Upload the signed package to App Store Connect**, also configure:

| Secret | Value |
| --- | --- |
| `APP_STORE_CONNECT_KEY_ID` | App Store Connect API key ID |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID |
| `APP_STORE_CONNECT_PRIVATE_KEY` | Full contents of the API key's `.p8` file |

Create the app record in App Store Connect before uploading. Apple must process
the build before it is available for TestFlight. Distribution and App Review
still require the app's metadata, screenshots, privacy information, and testing.

## Current test scope

The workflow generates `ios/` from the pinned Capacitor version. Tenant branding
and version settings are applied during the build. The web and Android source
configuration remains the input to those platforms' existing build workflows.

The test packages offline browsing and checks native compilation and startup.
The current `tel:` checkout uses USSD codes containing `*` and `#`, which need a
separate iOS-compatible payment flow. Native iOS push is disabled in this first
build until the tenant's APNs and signing capabilities are configured. Payment
completion, push delivery, and account deletion require end-to-end validation
before App Store submission. The current storefront account deletion handler
clears local state and must be connected to backend deletion when accounts are
created on the server.

References

- https://capacitorjs.com/docs/ios
- https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications
- https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds
- https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/PhoneLinks/PhoneLinks.html
