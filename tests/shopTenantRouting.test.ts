import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { withTenantPrefix } from "../src/lib/tenant-basepath";

describe("tenant eCommerce routing", () => {
  it("keeps banner and shop navigation inside the selected tenant", () => {
    expect(withTenantPrefix("/shop", "/t/demo/providers")).toBe("/t/demo/shop");
    expect(withTenantPrefix("/shop", "/t/tenant-a/shop")).toBe("/t/tenant-a/shop");
    expect(withTenantPrefix("/providers", "/t/demo/shop")).toBe("/t/demo/providers");
  });

  it("registers the tenant-specific shop route in source files", () => {
    const source = readFileSync(
      new URL("../src/routes/t.$slug.shop.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('createFileRoute("/t/$slug/shop")');
    expect(source).toContain("ShopPage");
    expect(source).toContain("validateSearch");
  });
});
