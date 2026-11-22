import { describe, expect, it } from "vitest";
import { evcPlusDialCode, evcPlusDialHref } from "../src/components/shop/evcPlusDial";

describe("tenant eCommerce EVC Plus dial", () => {
  it("formats configured Hormuud mobile numbers and includes the order total", () => {
    expect(evcPlusDialCode("EVC Plus", "619535029", 15)).toBe("*712*619535029*15.00#");
    expect(evcPlusDialCode("evcplus", "+252619535029", 0.5)).toBe("*712*619535029*0.50#");
    expect(evcPlusDialCode("Hormuud", "0779535029", 2.25)).toBe("*712*779535029*2.25#");
  });

  it("URL-encodes the terminating hash for the phone dialer", () => {
    expect(evcPlusDialHref("*712*619535029*15.00#")).toBe("tel:*712*619535029*15.00%23");
  });

  it("rejects unsupported providers, merchant shortcodes and unsafe totals", () => {
    expect(evcPlusDialCode("eDahab", "619535029", 15)).toBeNull();
    expect(evcPlusDialCode("EVC Plus", "123456", 15)).toBeNull();
    expect(evcPlusDialCode("EVC Plus", "629535029", 15)).toBeNull();
    expect(evcPlusDialCode("EVC Plus", "619535029", 0)).toBeNull();
    expect(evcPlusDialCode("EVC Plus", "619535029", 0.001)).toBeNull();
    expect(evcPlusDialCode("EVC Plus", "619535029", Number.NaN)).toBeNull();
  });
});
