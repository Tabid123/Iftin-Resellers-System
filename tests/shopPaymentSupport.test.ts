import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { supportPhoneE164 } from "../src/components/shop/ShopSupportFab";

const file = (p: string) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

describe("eCommerce payment and support", () => {
  it("normalizes Somali local and international support numbers", () => {
    expect(supportPhoneE164("619535029")).toBe("+252619535029");
    expect(supportPhoneE164("+252619535029")).toBe("+252619535029");
    expect(supportPhoneE164("0619535029")).toBe("+252619535029");
    expect(supportPhoneE164("")).toBe("");
  });

  it("provides Payment & Support route only to enabled tenant managers", () => {
    expect(file("src/components/admin/SimpleAdminSidebar.tsx")).toContain("/dashboard/ecommerce-settings");
    expect(file("src/hooks/useTenantCapabilities.ts")).toContain("'ecommerce-settings'");
    expect(file("src/components/pages/SimpleAdminDetail.tsx")).toContain('section="settings"');
    expect(file("src/components/shop/ShopAdmin.tsx")).toContain("<ShopCheckoutSettings />");
  });

  it("presents payment number and support controls to customers", () => {
    const page = file("src/components/shop/ShopPage.tsx");
    expect(page).toContain('from("shop_checkout_settings")');
    expect(page).toContain("<ShopPaymentInstructions");
    expect(page).toContain("<ShopSupportFab");
    expect(page).toContain("checkoutSettings.isError");
    expect(file("src/components/shop/ShopSupportFab.tsx")).toContain("https://wa.me/");
    expect(file("src/components/shop/ShopSupportFab.tsx")).toContain('href={"tel:" + tel}');
  });

  it("snapshots manual transfer payment per order with scoped RLS", () => {
    const sql = file("supabase/migrations/20261115102908_shop_checkout_payment_support.sql");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("private.shop_owner(tenant_id)");
    expect(sql).toContain("shop_order_payment_snapshot");
    expect(sql).toContain("'manual_transfer'");
    expect(sql).toContain("payment_number, payment_provider");
  });
});
