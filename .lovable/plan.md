# Hagaajinta Supabase (database-ka oo gaabis/xiran)

## Waxa la helay (xogta tooska ah, 6 saac ee u dambeeyay)
- Codsiyo badan oo database-ka ah waxay soo celinayaan **522 (timeout)**: `get_tenant_by_slug`, `get_active_providers`, `get_active_categories`, `get_tenant_app_settings`, `get_tenant_delivery_instructions`, `tenant_shop_features` — markaa app-ku ma soo dejin karo xogta tenant-ka (shaashad madhan / splash).
- `android_devices` ayaa la weydiinayaa **ilbiriqsiyo kasta** (polling aad u badan) — kaligiis ayuu inta badan 522-yada sameeyay.
- Xiriirro database ah oo ku xayiran **"idle in transaction" ~1 daqiiqo** — xiriirradu way dhammaanayaan.
- Shaqo joogto ah `reconcile_iftin_somtel_sms(45 min, 1000)` oo 1 daqiiqo+ socota.
- Edge functions: `process-payment-receipt` iyo `activate-package/pending` → 546 (xusuus/waqti dhaafay), `update-sim-balance` iyo `activate-package/log-sms` → 500.
- App: khalad hydration ah oo ka yimaada `TenantSplash` (server iyo browser way kala duwan yihiin).

## Qorshaha
1. **Yaree polling-ka `android_devices`**: hal query la wadaago, interval 30–60s, jooji marka tab-ku qarsoon yahay; realtime halkii polling.
2. **Dib u qor `reconcile_iftin_somtel_sms`**: batch yar (tusaale 200), indexes ku dar tiirarka la raadiyo, `statement_timeout` u gaar ah, ha ku dhex jirin isku transaction dheer.
3. **Ilaalinta xiriirrada**: `idle_in_transaction_session_timeout` (tusaale 15s) iyo `statement_timeout` doorarka `authenticator/anon/authenticated`.
4. **Edge functions 546/500**: log-yada akhri, yaree xogta xusuusta lagu shubo (pagination), khaladaadka si cad u soo celi.
5. **Hubi RPC-yada tenant-ka** (`get_tenant_by_slug` iwm.) `EXPLAIN` + index haddii loo baahdo.
6. **Hydration**: `TenantSplash` ha ku tiirsanaan xaalad browser-ka keliya ah inta lagu jiro SSR.
7. **Xaqiijin**: dib u eeg edge logs — 522 waa inay eber ku dhowaadaan; bogga tenant-ka fur.

Haddii kuwan kadib weli culays jiro, waxaa loo baahan karaa in cabbirka instance-ka Cloud la kordhiyo (Settings → Cloud → Advanced).
