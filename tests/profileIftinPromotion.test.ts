import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

const profile = read("src/components/pages/Profile.tsx");
const branding = read("src/components/PoweredByIftin.tsx");

describe("tenant Profile footer with official Iftin company logo", () => {
  it("does not restore the old promotional card", () => {
    expect(profile).not.toContain('aria-label="Iftin Digital Solutions"');
    expect(profile).not.toContain("Adigana hel App kuu gaar ah!");
    expect(profile).not.toContain("Wax badan ka ogow");
    expect(profile).not.toContain("iftin-digital-company-mark.png");
    expect(profile).not.toContain("<Code2");
  });

  it("renders the official PDF-sourced logo, centered below Profile actions", () => {
    const logout = profile.indexOf("{/* Logout */}");
    const footer = profile.indexOf('<PoweredByIftin variant="logo"');
    expect(logout).toBeGreaterThanOrEqual(0);
    expect(footer).toBeGreaterThan(logout);
    expect(profile).toContain('className="flex justify-center pt-4"');
    expect(profile).not.toContain('<PoweredByIftin className="text-xs"');
    expect(branding).toContain('variant === "logo"');
    expect(branding).toContain('src={IFTIN_DIGITAL_SOLUTIONS_LOGO}');
    expect(existsSync(new URL("../public/iftin-digital-solutions-logo.png", import.meta.url))).toBe(true);
  });

  it("keeps the official company website link and preserves login text branding", () => {
    expect(branding).toContain('https://iftindigital.com/');
    expect(branding).toContain("window.location.assign(IFTIN_DIGITAL_SOLUTIONS_URL)");
    expect(branding).toContain("Powered by Iftin Digital Solutions");
    expect(read("src/components/Footer.tsx")).toContain("<PoweredByIftin");
  });
});
