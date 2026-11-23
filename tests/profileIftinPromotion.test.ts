import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

const profile = read("src/components/pages/Profile.tsx");

describe("tenant Profile footer without promotional card", () => {
  it("removes the Iftin promotion card, CTA, and standalone logo from every tenant Profile", () => {
    expect(profile).not.toContain('aria-label="Iftin Digital Solutions"');
    expect(profile).not.toContain("Adigana hel App kuu gaar ah!");
    expect(profile).not.toContain("Wax badan ka ogow");
    expect(profile).not.toContain("iftin-digital-company-mark.png");
    expect(profile).not.toContain("<Code2");
  });

  it("keeps the small Powered by Iftin attribution under profile actions", () => {
    const logout = profile.indexOf("{/* Logout */}");
    const footer = profile.indexOf("<PoweredByIftin");
    expect(logout).toBeGreaterThanOrEqual(0);
    expect(footer).toBeGreaterThan(logout);
    expect(read("src/components/PoweredByIftin.tsx")).toContain("https://iftindigital.com/");
  });
});
