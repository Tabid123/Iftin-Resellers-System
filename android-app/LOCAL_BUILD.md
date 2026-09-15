# Build APK locally (no CI credits)

This guide builds the Android APK on your own machine. Use this when GitHub Actions credits are limited.

## Prerequisites
- JDK 17 installed
- Android SDK Command-line Tools installed
- Android Platform 34 and Build-tools 34.0.0
- ADB (optional, for installing the APK)

Tip: Android Studio includes all of the above if you install it and add the SDK components.

## 1) Set environment variables
- ANDROID_SDK_ROOT should point to your Android SDK directory
- Ensure `java -version` shows Java 17

Examples:
- Windows (PowerShell):
  ```powershell
  $env:ANDROID_SDK_ROOT = "C:\\Android\\Sdk"
  $env:JAVA_HOME = "C:\\Program Files\\Java\\jdk-17"
  $env:Path = "$env:JAVA_HOME\\bin;$env:Path"
  ```
- macOS/Linux (bash/zsh):
  ```bash
  export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"  # macOS
  # or export ANDROID_SDK_ROOT="$HOME/Android/Sdk"     # Linux
  export JAVA_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null || echo "$JAVA_HOME")
  export PATH="$JAVA_HOME/bin:$PATH"
  ```

## 2) Install required SDK packages (once)
```bash
"$ANDROID_SDK_ROOT"/cmdline-tools/latest/bin/sdkmanager --sdk_root="$ANDROID_SDK_ROOT" --licenses
"$ANDROID_SDK_ROOT"/cmdline-tools/latest/bin/sdkmanager --sdk_root="$ANDROID_SDK_ROOT" "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

## 3) Build using provided scripts
- Windows:
  ```cmd
  scripts\build-android.bat
  ```
- macOS/Linux:
  ```bash
  chmod +x scripts/build-android.sh
  ./scripts/build-android.sh
  ```

The script will:
- Create `android-app/local.properties` pointing to your SDK
- Run Gradle to assemble the debug APK
- Copy the APK to `apk-output/iftin-delivery.apk`

## 4) Install the APK (optional)
```bash
adb install -r apk-output/iftin-delivery.apk
```

## Troubleshooting
- If Gradle fails, open `gradle-build.log` generated at the repo root
- Ensure ANDROID_SDK_ROOT and JDK 17 are correctly configured
- If build-tools 34.0.0 are missing, re-run the sdkmanager commands above

## Post-build checklist
- Install APK on target device
- Grant required permissions (Phone, SMS, Background activity as needed)
- Test USSD dialing
- Send/receive SMS and verify in-app parsing
- Use `adb logcat` to view logs