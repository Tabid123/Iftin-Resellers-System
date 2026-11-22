import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const file = (name: string) => readFileSync(new URL("../" + name, import.meta.url), "utf8");

describe("tenant ecommerce storefront experience", () => {
  it("fills catalog card and detail gallery images while retaining original product art", () => {
    const page = file("src/components/shop/ShopPage.tsx");
    const gallery = file("src/components/shop/ShopImages.tsx");
    expect(page).toContain("object-cover object-center");
    expect(page).toContain("aspect-ratio: 1 / 1");
    expect(page).not.toContain("height: 112px; aspect-ratio: auto");
    expect(gallery).toContain("shop-gallery-primary aspect-square w-full");
    expect(gallery).toContain("object-cover object-center");
  });

  it("uses existing company logo files and supports tenant overrides", () => {
    const logo = file("src/components/shop/ShopPaymentLogo.tsx");
    const cart = file("src/components/shop/ShopCartView.tsx");
    for (const path of [
      "src/assets/payment-providers/evc-plus.png",
      "src/assets/payment-providers/edahab.jpg",
      "src/assets/payment-providers/jeeb.png",
    ]) expect(existsSync(new URL("../" + path, import.meta.url))).toBe(true);
    expect(logo).toContain("paymentLogoSrc");
    expect(cart).toContain('<ShopPaymentLogo provider={method.provider}');
    expect(cart).toContain("logoUrl={selected.logo_url}");
  });

  it("removes verbose payer text and receipt's redundant payment card", () => {
    const cart = file("src/components/shop/ShopCartView.tsx");
    expect(cart).not.toContain("Lambarkan wuxuu u adeegayaa xiriirka dalabka.");
    expect(cart).not.toContain("Lacagta waxaa loo dirayaa lambarka dukaanka.");
    expect(cart).not.toContain("<ShopPaymentInstructions");
    expect(cart).toContain("La xiriir lambarkan");
    expect(cart).toContain("https://wa.me/");
    expect(cart).toContain("supportPhoneE164");
  });

  it("reuses a tenant-scoped catalog and skeleton for first shop visits", () => {
    const page = file("src/components/shop/ShopPage.tsx");
    const shop = file("src/components/shop/useShop.ts");
    expect(page).toContain("localStorage.getItem(");
    expect(page).toContain(":catalog");
    expect(page).toContain("tenantId, savedAt: Date.now()");
    expect(page).toContain('refetchOnMount: "always"');
    expect(shop).toContain("shop:enabled:");
    expect(shop).toContain("refetchInterval: 15000");
    for (const path of ["src/routes/shop.tsx", "src/routes/t.$slug.shop.tsx"]) {
      const route = file(path);
      expect(route).toContain("<ShopSkeleton />");
      expect(route).not.toContain("Sug...");
    }
  });
});
