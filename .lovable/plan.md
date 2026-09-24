# Qorshaha hagaajinta APK-ga Android

## 0. Badhan tijaabo ah (kan ugu horreeya)

Bogga providers-ka waxaa lagu darayaa badhan yar oo "Tijaabo v2" ah (hoos, liiska shirkadaha kadib). Marka la taabto wuxuu tusayaa fariin gaaban oo leh waqtiga daabacaadda. Haddii APK-gu uu badhankan tuso, waxay caddaynaysaa in isbeddellada web-ka ay APK-ga gaaraan; haddii kale, APK-ga waa in dib loo dhisaa. Badhanka waa la saari doonaa marka tijaabadu dhammaato.

Afar dhibaato ayaad soo sheegtay: codka oo aan APK-ga ka dhicin, lacag-bixinta oo daahda (ilaa 5 furitaan kadib), splash-ka oo 10-20 ilbiriqsi qaata, iyo app-ka oo guud ahaan culus.

## 1. Codka oo APK-ga ka dhaca

Hadda codadku waxay ka soo degayaan internetka (iftinagents.com) mar kasta oo la taabto. WebView-ga APK-ga taasi ma shaqeyso si joogto ah: haddii shabakaddu gaabis tahay ama codku weli soo dhammaan uusan ku bilaaban gestures-ka, waxba lama maqlayo.

Xalka: saddexda cod (lambarka, OTP, offline) waa la soo dejinayaa waqtiga app-ka la dhisayo oo waa lagu duubayaa APK-ga gudihiisa. Markaas:
- codku wuxuu ka dhacaa gudaha telefoonka, internet la'aanna wuu shaqeeyaa;
- taabashada koowaad codku isla markiiba wuu bilaabmayaa (hore uma sugayo soo dejin);
- haddii file-ka gudaha maqan yahay, waxaa lagu soo noqonayaa internetka sidii hore.

Waxaa sidoo kale lagu darayaa furitaan mid ah taabashada koowaad ee shaashadda si WebView-gu u ogolaado codka inta kale ee wakhtiga.

## 2. Lacag-bixinta oo daahda ilaa 5 furitaan

Hadda xaaladda lacagta waxaa la hubiyaa 5 ilbiriqsi kasta oo keliya inta bogga furan yahay. Marka app-ka la xiro ama background loo diro, Android-ku wuu hakiyaa jadwalkaas — sidaa darteed natiijadu soo muuqataa marka aad dib u furto oo bogga ku soo noqoto.

Xalka:
- dalab kasta oo la sugayo waxaa lagu kaydinayaa telefoonka (order id + xaaladdiisa);
- mar kasta oo app-ka dib loo furo ama dib loogu soo noqdo (app resume), waxaa si toos ah loo hubinayaa dalabyada sugaya, natiijadana la tusayaa isla markiiba — bogga lacag-bixinta ha furan yahay ha furnaanine;
- ogeysiis/status-ka dalabka wuxuu ka muuqan doonaa taariikhda dalabyada xitaa haddii user-ku baxay inta lagu jiro.

## 3. Splash 10-20 ilbiriqsi

Splash-ka waxaa lagu qoray "launchAutoHide: false" — taas macnaheedu waa in codeka web-ku uu naftiisa u qariyo. Hadda qarintaasi waxay sugaysaa in bogga hore uu si buuxda u soo baxo (tenant lookup + chunk-yada JS), taasoo internet gaabis ah ku qaadan karta 10-20 ilbiriqsi.

Xalka:
- splash-ka waxaa la qarinayaa isla marka shell-ka app-ka uu sawiro, ma aha marka xogta tenant-ka la helo;
- waxaa lagu darayaa waqti ugu badan oo adag (ugu badnaan ~3 ilbiriqsi) oo si toos ah u qarinaya splash-ka xitaa haddii wax kasta gaabsadaan;
- bogga hore wuxuu ka bilaabmayaa xogta gudaha APK-ga lagu duubay (packaged snapshot), kadibna internetka ayuu ka cusboonaysiiyaa background-ka.

## 4. Adkaanta/gaabiska isticmaalka

Marka splash-ka la saxo, waxaa hadhaya culayska koowaad ee bogga. Waxaan sameynayaa:
- cabbir (measurement) cold start ah oo lagu ogaanayo meelaha ugu waaweyn ee wakhtiga cunaya;
- xogta bogagga (providers, categories, packages) in marka hore laga soo bandhigo kaydka gudaha, network-na uusan waxba xannibin;
- yaraynta codsiyada isku mid ah ee cold start-ka (hal bootstrap oo keliya), iyo hordhac (prefetch) bogagga ugu badan ee la isticmaalo.

## Faahfaahin farsamo

- `scripts/build.mjs` (marka `CAPACITOR_BUILD=true`) + tallaabo CI ah oo ku jirta `.github/workflows/build-tenant-android.yml`: soo deji saddexda WAV ee `src/assets/*.asset.json` ku xusan oo geli `public/audio/{phone,otp,offline}.wav`; dhismaha web-ka ayaa u gudbinaya `dist/` → `cap sync android`.
- `src/lib/audioPrompts.ts`: `primarySource()` waxay native-ka ku bilaabmaysaa `/audio/<kind>.wav`, kadib `PRODUCTION_AUDIO_ORIGIN` fallback ah marka `error` dhaco; waxaa lagu darayaa hal-mar unlock (muted play) oo ku xiran taabashada koowaad ee dukumeentiga.
- Lacagta: kayd `pending_payments` ah oo `workspaceStorage` ku jira; `@capacitor/app` `appStateChange` + `visibilitychange` → reconcile query ee `orders` (status/delivery_status) → invalidate `orders`/`history` queries + toast. `setInterval(tick, 5000)` ee `PaymentProviders.tsx:714` wuxuu noqonayaa mid la joojiyo marka bogga la hakiyo.
- Splash: `capacitor.config.json` `launchShowDuration` 2000 → 1200; `src/lib/nativeSplash.ts` `NATIVE_SPLASH_MS` yaree oo `scheduleNativeSplashFallback` laga wac `__root.tsx` boot-ka (hadda kaliya `Index` route-ka ayaa `hideNativeSplash()` wacaya, sidaas darteed route kasta oo kale/gaabis kasta wuu daahayaa).
- Waxaan APK dhisi karaa oo tijaabin karaa `bun run build` + `cap sync`, laakiin qiimeynta dhabta ah ee codka, splash-ka iyo lacagta waxay u baahan tahay taleefan dhab ah — waxaan ku siinayaa liis tijaabo gaaban.

## Tartiibka shaqada

1. Codka (gudaha APK-ga lagu duubo + unlock).
2. Splash-ka (qarinta hore + waqti xaddidan).
3. Reconcile-ka lacagta marka app-ka dib loo furo.
4. Xawaaraha cold start-ka.
