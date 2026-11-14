// Run: npm install --no-save --package-lock=false @electric-sql/pglite@0.5.16
// Then: node tests/shop-database.mjs
// Isolated Postgres engine; never connects to production.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002";
const owner = "20000000-0000-4000-8000-000000000001",
  other = "20000000-0000-4000-8000-000000000002";
const cat = "30000000-0000-4000-8000-000000000001",
  product = "40000000-0000-4000-8000-000000000001",
  token = "50000000-0000-4000-8000-000000000001";
await db.exec(`create role anon; create role authenticated; create role service_role;
alter default privileges in schema public grant all on tables to anon, authenticated;
create schema auth; create schema private; grant usage on schema auth to anon, authenticated;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function public.current_request_tenant_id() returns uuid language sql stable as $$select nullif(current_setting('test.tenant',true),'')::uuid$$;
create function public.is_super_admin() returns boolean language sql stable as $$select coalesce(current_setting('test.super',true),'false')='true'$$;
create table public.tenants(id uuid primary key,status text,current_period_end timestamptz,trial_ends_at timestamptz);
create table public.tenant_members(tenant_id uuid,user_id uuid,role text);
insert into tenants values ('${a}','active',null,null),('${b}','active',null,null);
insert into tenant_members values ('${a}','${owner}','owner'),('${b}','${other}','owner');`);
await db.exec(
  readFileSync(
    new URL("../supabase/migrations/20261114155445_tenant_ecommerce.sql", import.meta.url),
    "utf8",
  ),
);
async function actor(role, tenant, uid = "", superAdmin = false) {
  await db.exec(
    `reset role;set test.tenant='${tenant}';set test.uid='${uid}';set test.super='${superAdmin}';set role ${role}`,
  );
}
async function denied(sql) {
  await assert.rejects(() => db.exec(sql));
}
await actor("anon", a);
assert.equal((await db.query("select shop_is_enabled() as enabled")).rows[0].enabled, false);
await actor("authenticated", a, owner);
await denied(`insert into tenant_shop_features values ('${a}',true)`);
await actor("authenticated", a, owner, true);
await db.exec(`insert into tenant_shop_features values ('${a}',true),('${b}',false)`);
await actor("authenticated", a, owner);
await db.exec(
  `insert into shop_categories(id,tenant_id,name) values('${cat}','${a}','Accessories');insert into shop_products(id,tenant_id,category_id,name,price,stock) values('${product}','${a}','${cat}','Earbuds',15,3)`,
);
await denied(
  `insert into shop_products(tenant_id,category_id,name,price,stock) values('${b}','${cat}','Intrusion',1,1)`,
);
await actor("authenticated", a, other);
assert.equal((await db.query("select * from shop_orders")).rows.length, 0);
await denied(`insert into shop_categories(tenant_id,name) values('${a}','Wrong owner')`);
await actor("anon", b);
assert.equal((await db.query("select * from shop_products")).rows.length, 0);
await actor("anon", a);
assert.equal((await db.query("select * from shop_products")).rows.length, 1);
const place = (tok = token, quantity = 2, total = 30) =>
  `select shop_place_order('${tok}','Customer','0612345678','Hodan, Muqdisho','[{"product_id":"${product}","quantity":${quantity}}]',${total})`;
await denied(place(token, 2, 1)); // manipulated or stale prices roll back reservations
assert.equal((await db.query("select stock from shop_products")).rows[0].stock, 3);
await db.exec(place());
await db.exec(place()); // retries reserve stock only once
assert.equal((await db.query("select stock from shop_products")).rows[0].stock, 1);
await denied(place("50000000-0000-4000-8000-000000000002", 2, 30));
await denied("select * from shop_orders");
assert.equal(
  (await db.query(`select shop_order_history(array['${token}']::uuid[]) as orders`)).rows[0].orders
    .length,
  1,
);
await actor("anon", b);
assert.equal(
  (await db.query(`select shop_order_history(array['${token}']::uuid[]) as orders`)).rows[0].orders
    .length,
  0,
);
await denied(place());
await actor("authenticated", a, owner);
await denied(`update shop_orders set total=0`);
await denied(`update shop_orders set status='delivered'`);
await db.exec(
  `update shop_orders set status='cancelled';update shop_orders set status='cancelled'`,
);
assert.equal((await db.query("select stock from shop_products")).rows[0].stock, 3);
await denied(`update shop_orders set status='received'`);
await actor("authenticated", a, owner, true);
await db.exec(`update tenant_shop_features set enabled=false where tenant_id='${a}'`);
await actor("anon", a);
assert.equal((await db.query("select * from shop_products")).rows.length, 0);
await denied(place("50000000-0000-4000-8000-000000000003", 1, 15));
await actor("authenticated", a, owner);
await denied(`insert into shop_categories(tenant_id,name) values('${a}','Disabled')`);
await actor("authenticated", a, owner, true);
await db.exec(`update tenant_shop_features set enabled=true where tenant_id='${a}'`);
await actor("authenticated", a, owner);
assert.equal((await db.query("select * from shop_orders")).rows.length, 1);
console.log(
  "PASS: default-off, super-admin-only toggle, tenant isolation, owner permissions, private receipts, server pricing, stock, idempotency, cancellation and disabled access.",
);
await db.close();
