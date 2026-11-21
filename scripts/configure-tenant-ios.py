"""Configure the generated Capacitor iOS project for one tenant."""

import json
import os
import plistlib
import re
import shutil
import sys
from pathlib import Path


root = Path.cwd()
snapshot = json.loads((root / "public/tenant-bootstrap.json").read_text())
tenant = snapshot["tenant"]
slug = os.environ["TENANT_SLUG"].strip().lower()
if tenant["slug"] != slug or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
    raise ValueError("The packaged tenant must match TENANT_SLUG")

app_name = os.environ.get("APP_NAME", "").strip() or tenant["name"]
app_id = os.environ.get("APP_ID", "").strip() or "com.iftin." + slug.replace("-", "")
color = os.environ.get("SPLASH_COLOR", "").strip() or tenant.get("primary_color") or "#0F4C81"
version = os.environ.get("APP_VERSION_NAME", "1.0.0").strip()
build_number = os.environ.get("APP_VERSION_CODE", "1").strip()
if not re.fullmatch(r"[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z][A-Za-z0-9-]*)+", app_id):
    raise ValueError("APP_ID must be a valid explicit Apple bundle identifier")
if not re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
    raise ValueError("SPLASH_COLOR must contain a six-digit hex colour")
if not re.fullmatch(r"\d+\.\d+(?:\.\d+)?", version):
    raise ValueError("APP_VERSION_NAME must look like 1.0.0")
if not build_number.isdigit() or int(build_number) < 1:
    raise ValueError("APP_VERSION_CODE must be a positive integer")

if "--native" not in sys.argv:
    config_path = root / "capacitor.config.json"
    config = json.loads(config_path.read_text())
    config.update(appId=app_id, appName=app_name, backgroundColor=color)
    config["ios"] = {
        "scheme": "App", "contentInset": "automatic", "backgroundColor": color,
        "includePlugins": [
            "@capacitor/app", "@capacitor/device", "@capacitor/filesystem",
            "@capacitor/keyboard", "@capacitor/splash-screen", "@capacitor/status-bar",
        ],
    }
    config.setdefault("server", {}).pop("url", None)
    config["plugins"]["SplashScreen"]["backgroundColor"] = color
    config_path.write_text(json.dumps(config, indent=2) + "\n")

    # Reuse the locally packaged logo, including logos stored as data URLs.
    logo = root / "public" / str(tenant.get("logo_url", "")).lstrip("/")
    assets = root / "assets"
    assets.mkdir(exist_ok=True)
    if not logo.is_file():
        raise ValueError("The tenant logo must be bundled locally before generating iOS assets")
    shutil.copyfile(logo, assets / "icon-only.png")
    shutil.copyfile(logo, assets / "splash.png")

    env = {
        "APP_NAME": app_name,
        "APP_ID": app_id,
        "SPLASH_COLOR": color,
        "VITE_TENANT_SLUG": slug,
        "VITE_TENANT_NAME": app_name,
        "VITE_TENANT_LOGO_URL": tenant["logo_url"],
        "VITE_SPLASH_COLOR": color,
    }
    if any("\n" in value or "\r" in value for value in env.values()):
        raise ValueError("Tenant build values must not contain newlines")
    if os.environ.get("GITHUB_ENV"):
        with open(os.environ["GITHUB_ENV"], "a") as target:
            for key, value in env.items():
                target.write(f"{key}={value}\n")
    (root / "public/apk-build.json").write_text(json.dumps({
        "commit": os.environ.get("GITHUB_SHA", "local"),
        "tenant": slug,
        "platform": "ios",
        "offlineBootstrap": "packaged-v1",
    }) + "\n")
    print(f"Configured {app_name}, bundle {app_id}, version {version} ({build_number})")
    sys.exit(0)

app = root / "ios/App/App"
library = root / "build/ios-dependencies/IONFilesystemLib"
if library.is_dir():
    # Use the verified official framework fetched through the GitHub asset API.
    spec = {
        "name": "IONFilesystemLib", "version": "1.1.4",
        "summary": "Native iOS filesystem library",
        "homepage": "https://github.com/ionic-team/ion-ios-filesystem",
        "license": {"type": "MIT"}, "authors": "OutSystems Mobile Ecosystem",
        "source": {"http": "https://github.com/ionic-team/ion-ios-filesystem/releases/download/1.1.4/IONFilesystemLib.zip"},
        "vendored_frameworks": "IONFilesystemLib.xcframework",
        "platforms": {"ios": "14.0"}, "swift_versions": ["5.9"],
    }
    (library / "IONFilesystemLib.podspec.json").write_text(json.dumps(spec))
    podfile_path = root / "ios/App/Podfile"
    podfile = podfile_path.read_text()
    if "pod 'IONFilesystemLib', :path" not in podfile:
        marker = "  capacitor_pods\n"
        if podfile.count(marker) != 1:
            raise ValueError("Unexpected Capacitor Podfile layout")
        podfile = podfile.replace(marker, marker + "  pod 'IONFilesystemLib', :path => '../../build/ios-dependencies/IONFilesystemLib'\n")
        podfile_path.write_text(podfile)

info_path = app / "Info.plist"
info = plistlib.loads(info_path.read_bytes())
info.update({
    "CFBundleDisplayName": app_name,
    "CFBundleShortVersionString": version,
    "CFBundleVersion": build_number,
    "CFBundleURLTypes": [{"CFBundleURLSchemes": ["iftin"], "CFBundleURLName": app_id}],
    "NSCameraUsageDescription": f"Add a photo to your {app_name} profile or support request.",
    "NSPhotoLibraryUsageDescription": f"Choose a photo for your {app_name} profile or support request.",
})
info_path.write_bytes(plistlib.dumps(info, sort_keys=False))

privacy_path = app / "PrivacyInfo.xcprivacy"
privacy_path.write_bytes(plistlib.dumps({
    "NSPrivacyAccessedAPITypes": [
        {"NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp",
         "NSPrivacyAccessedAPITypeReasons": ["C617.1"]},
        {"NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryDiskSpace",
         "NSPrivacyAccessedAPITypeReasons": ["E174.1"]},
        {"NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
         "NSPrivacyAccessedAPITypeReasons": ["CA92.1"]},
    ],
}, sort_keys=False))

project_path = root / "ios/App/App.xcodeproj/project.pbxproj"
project = project_path.read_text()
for key, value in {
    "PRODUCT_BUNDLE_IDENTIFIER": app_id,
    "MARKETING_VERSION": version,
    "CURRENT_PROJECT_VERSION": build_number,
}.items():
    project, count = re.subn(rf"({key} = )[^;]+;", rf"\g<1>{value};", project)
    if count != 2:
        raise ValueError(f"Expected two {key} settings in the Capacitor iOS template, found {count}")

# Register the privacy manifest in the app's resources as well as its file group.
if "PrivacyInfo.xcprivacy in Resources" not in project:
    build_ref = "A10000000000000000000001"
    file_ref = "A10000000000000000000002"
    additions = {
        "/* Begin PBXBuildFile section */":
            f"\n\t\t{build_ref} /* PrivacyInfo.xcprivacy in Resources */ = {{isa = PBXBuildFile; fileRef = {file_ref}; }};",
        "/* Begin PBXFileReference section */":
            f'\n\t\t{file_ref} /* PrivacyInfo.xcprivacy */ = {{isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; }};',
        "\t\t\t\t504EC3131FED79650016851F /* Info.plist */,":
            f"\n\t\t\t\t{file_ref} /* PrivacyInfo.xcprivacy */,",
        "\t\t\t\t504EC3121FED79650016851F /* LaunchScreen.storyboard in Resources */,":
            f"\n\t\t\t\t{build_ref} /* PrivacyInfo.xcprivacy in Resources */,",
    }
    for marker, addition in additions.items():
        if project.count(marker) != 1:
            raise ValueError("Unexpected Capacitor iOS project resource layout")
        project = project.replace(marker, marker + addition)
project_path.write_text(project)
print(f"Prepared iOS native branding and privacy resources for {slug}")
