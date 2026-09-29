import fs from "node:fs";
import path from "node:path";

const dist = path.resolve("dist");
const indexPath = path.join(dist, "index.html");
const packagedPath = path.join(dist, "packaged-app.html");

if (!fs.existsSync(indexPath)) {
  throw new Error("dist/index.html not found");
}

const slug = String(process.env.TENANT_SLUG || "").trim().toLowerCase();
const appName = String(process.env.APP_NAME || slug || "App").trim();
const logoUrl = String(process.env.LOGO_URL || "").trim();
const splashColor = String(process.env.SPLASH_COLOR || "#0F4C81").trim();

if (!slug) throw new Error("TENANT_SLUG is required");

let splashLogoUrl = logoUrl;
try {
  const snapshotPath = path.join("public", "tenant-bootstrap.json");
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  if (snapshot?.tenant?.logo_url) splashLogoUrl = String(snapshot.tenant.logo_url);
} catch {
  // Build-time logo URL remains a fallback when the snapshot is absent.
}

let appHtml = fs.readFileSync(indexPath, "utf8");

const escHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

// Stay in one WebView document. The old index.html -> packaged-app.html
// navigation caused a visible white paint between native and web splash.
// Rewrite browser history only; React then boots from the packaged bundle.
const nativeRouteScript = `<script>(function(){try{
  var p=location.pathname;
  if(p!=="/"&&p!=="/index.html"&&p!=="/packaged-app.html")return;
  history.replaceState(null,"","/t/${encodeURIComponent(slug)}/"+(location.search||"")+(location.hash||""));
}catch(e){}})();<\/script>`;

const startupCss = `<style id="iftin-native-prehydrate-style">
  html,body{margin:0;min-height:100%;background:${escHtml(splashColor)};}
  #iftin-native-prehydrate-splash{position:fixed;inset:0;z-index:2147483646;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2rem;background:${escHtml(splashColor)};}
  #iftin-native-prehydrate-splash img{width:9rem;height:9rem;border-radius:1rem;object-fit:cover;box-shadow:0 10px 24px rgba(0,0,0,.18);}
  #iftin-native-prehydrate-splash .spin{width:2.25rem;height:2.25rem;border-radius:9999px;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;animation:iftin-prehydrate-spin .8s linear infinite;}
  @keyframes iftin-prehydrate-spin{to{transform:rotate(360deg)}}
</style>`;

const startupOverlay = `<div id="iftin-native-prehydrate-splash" role="status" aria-label="${escHtml(appName)}">
  ${splashLogoUrl ? `<img src="${escHtml(splashLogoUrl)}" alt="">` : ""}
  <div class="spin" aria-hidden="true"></div>
</div>`;

appHtml = appHtml.replace(
  "<head>",
  `<head><meta name="iftin-native-bootstrap" content="v2">${startupCss}${nativeRouteScript}`,
);
appHtml = appHtml.replace(/<body([^>]*)>/i, (match, attrs) => `<body${attrs}>${startupOverlay}`);

// Both files are the same single-document app. packaged-app.html remains only
// for backwards compatibility; new APK launches never navigate to it.
fs.writeFileSync(indexPath, appHtml);
fs.writeFileSync(packagedPath, appHtml);

console.log(`Native single-document startup prepared for ${slug}; no document handoff required`);
