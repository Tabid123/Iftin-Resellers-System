import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("Iftin Digital Solutions login attribution", () => {
  it("links every customer login footer to the official company site", () => {
    const attribution = read("src/components/PoweredByIftin.tsx");
    expect(attribution).toContain("Powered by Iftin Digital Solutions");
    expect(attribution).toContain("https://iftindigital.com/");
    expect(attribution).toContain("window.location.assign(IFTIN_DIGITAL_SOLUTIONS_URL)");
    expect(attribution).toContain("rel=\"noopener noreferrer\"");
  });

  it("separates attribution and privacy policy into two explicit footer rows", () => {
    const footer = read("src/components/Footer.tsx");
    expect(footer).toContain('display: "grid"');
    expect(footer).toContain('gridTemplateRows: "auto auto"');
    expect(footer).toContain('gridRow: "1"');
    expect(footer).toContain('gridRow: "2"');
    expect(footer).toContain("<PoweredByIftin");
    expect(footer).toContain("Secure privacy policy");
  });

  it("replaces the old text on the login page and phone-verification dialogs", () => {
    for (const path of [
      "src/components/Footer.tsx",
      "src/components/PhoneVerification.tsx",
    ]) {
      const content = read(path);
      expect(content).toContain("<PoweredByIftin");
      expect(content).not.toContain("Developed by Saabir");
    }
  });
});
