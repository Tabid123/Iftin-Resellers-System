import { describe, expect, it } from "vitest";
import { shopPaymentOptions, normalizedPayerPhone, validPayerPhone, shopMethodDialHref } from "../src/components/shop/shopPaymentOptions";

describe("shop tenant payment methods", () => {
  it("lists merchant-configured options without inventing defaults", () => {
    expect(shopPaymentOptions(null)).toEqual([]);
    expect(shopPaymentOptions({ payment_provider: "EVC Plus", payment_number: "619535029" }))
      .toEqual([{ id: "legacy", provider: "EVC Plus", number: "619535029" }]);
    expect(shopPaymentOptions({
      payment_provider: "EVC Plus", payment_number: "619535029",
      payment_methods: [
        { id: "evc", provider: "EVC Plus", number: "619535029" },
        { id: "dahab", provider: "eDahab", number: "629535029" },
      ],
    })).toHaveLength(2);
  });

  it("validates payer phone according to the chosen network", () => {
    expect(normalizedPayerPhone("+252 61 9535029")).toBe("619535029");
    expect(validPayerPhone("EVC Plus", "0619535029")).toBe(true);
    expect(validPayerPhone("EVC Plus", "629535029")).toBe(false);
    expect(validPayerPhone("eDahab", "629535029")).toBe(true);
    expect(validPayerPhone("eDahab", "619535029")).toBe(false);
    expect(validPayerPhone("EVC Plus", "12")).toBe(false);
  });

  it("uses verified dial formats and never invents a bank payment shortcode", () => {
    expect(shopMethodDialHref("EVC Plus", "619535029", 7.56))
      .toBe("tel:*712*619535029*7.56%23");
    expect(shopMethodDialHref("eDahab", "629535029", 7.56)).toBe("tel:*101%23");
    expect(shopMethodDialHref("Premier Wallet", "619535029", 7.56)).toBeNull();
  });
});
