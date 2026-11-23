import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const profile = readFileSync(
  new URL("../src/components/pages/Profile.tsx", import.meta.url),
  "utf8",
);
const brand = readFileSync(
  new URL("../src/components/PoweredByIftin.tsx", import.meta.url),
  "utf8",
);

describe("shared Iftin promotion across tenant Profiles", () => {
  it("shows one static promotion after Share and before Logout on the shared Profile page", () => {
    const shareEnd = profile.indexOf("{profileOptions.map");
    const promo = profile.indexOf('aria-label="Iftin Digital Solutions"');
    const logout = profile.indexOf("{/* Logout */}");
    expect(shareEnd).toBeGreaterThanOrEqual(0);
    expect(promo).toBeGreaterThan(shareEnd);
    expect(logout).toBeGreaterThan(promo);
    expect(profile).toContain("Adigana hel App kuu gaar ah!");
    expect(profile).toContain("Wax badan ka ogow");
    expect(profile).toContain("<PoweredByIftin");
  });

  it("always renders, without any tenant ON/OFF settings", () => {
    const promo = profile.slice(
      profile.indexOf("{/* Shared Iftin Digital Solutions promotion"),
      profile.indexOf("{/* Logout */}"),
    );
    expect(promo).toContain('href={IFTIN_DIGITAL_SOLUTIONS_URL}');
    expect(promo).toContain("Capacitor.isNativePlatform()");
    expect(promo).not.toContain("tenant?.");
    expect(promo).not.toContain("promoEnabled");
    expect(promo).not.toContain("isPromotionEnabled");
    expect(brand).toContain('https://iftindigital.com/');
  });
});
