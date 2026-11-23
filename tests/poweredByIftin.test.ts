import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

describe("Iftin Digital Solutions login attribution", () => {
  it("links every customer login footer to the official company site", () => {
    const attribution = read("src/components/PoweredByIftin.tsx");
    expect(attribution).toContain("Powered by Iftin Digital Solutions");
    expect(attribution).toContain("https://iftindigitalsolutions.com/");
    expect(attribution).toContain("window.location.assign(IFTIN_DIGITAL_SOLUTIONS_URL)");
    expect(attribution).toContain("rel=\"noopener noreferrer\"");
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
