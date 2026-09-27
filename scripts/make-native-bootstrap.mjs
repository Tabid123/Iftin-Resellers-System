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

const packagedHtml = fs.readFileSync(indexPath, "utf8");
fs.writeFileSync(packagedPath, packagedHtml);

const js = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const liveUrl = `https://iftinagents.com/t/${encodeURIComponent(slug)}`;

const bootstrap = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="iftin-native-bootstrap" content="v1">
  <title>${appName.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</title>
  <style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${splashColor};}
    body{display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
    .s{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2rem;width:100%;height:100%;background:${splashColor};}
    .logo{width:9rem;height:9rem;border-radius:1rem;object-fit:cover;box-shadow:0 10px 24px rgba(0,0,0,.18);}
    .spin{width:2.25rem;height:2.25rem;border-radius:9999px;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;animation:r .8s linear infinite;}
    @keyframes r{to{transform:rotate(360deg)}}
  </style>
  <script>
    (function(){
      var live=${js(liveUrl)};
      var done=false;
      function local(){
        if(done)return;done=true;
        fetch("/packaged-app.html",{cache:"no-store"})
          .then(function(r){if(!r.ok)throw new Error("packaged app missing");return r.text();})
          .then(function(html){document.open();document.write(html);document.close();})
          .catch(function(){location.replace("/packaged-app.html");});
      }
      if(navigator.onLine===false){local();return;}
      var controller=typeof AbortController!=="undefined"?new AbortController():null;
      var timer=setTimeout(function(){try{controller&&controller.abort();}catch(e){} local();},6000);
      fetch(live,{method:"GET",mode:"no-cors",cache:"no-store",signal:controller?controller.signal:undefined})
        .then(function(){
          if(done)return;done=true;clearTimeout(timer);location.replace(live);
        })
        .catch(function(){clearTimeout(timer);local();});
    })();
  </script>
</head>
<body>
  <div class="s" aria-label=${js(appName)}>
    ${logoUrl ? `<img class="logo" src="${logoUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}" alt="">` : ""}
    <div class="spin" aria-hidden="true"></div>
  </div>
</body>
</html>`;

fs.writeFileSync(indexPath, bootstrap);
console.log(`Native bootstrap created for ${slug}; original packaged app saved as packaged-app.html`);
