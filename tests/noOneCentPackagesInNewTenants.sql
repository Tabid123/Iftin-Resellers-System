-- Regression checks for tenant provisioning.
-- The two tenant-seeding RPCs must retain the one-cent package exclusion.
-- USSD discovery roots are exempt, and existing historical rows are unchanged.
SELECT
  (SELECT count(*) FROM private.master_template_packages
   WHERE selling_price = 0.01 AND is_discovery_root IS NOT TRUE) AS bad_master_template_packages,
  (SELECT count(*) FROM pg_constraint
   WHERE conrelid = 'private.master_template_packages'::regclass
     AND conname = 'master_template_packages_no_bad_cent_price') AS installed_master_guard,
  (SELECT position('AND NOT (selling_price = 0.01 AND is_discovery_root IS NOT TRUE)'
      IN pg_get_functiondef('public.seed_tenant_from_template(uuid,uuid)'::regprocedure)) > 0) AS tenant_clone_guard,
  (SELECT position('AND NOT (selling_price = 0.01 AND is_discovery_root IS NOT TRUE)'
      IN pg_get_functiondef('public.apply_master_template_to_tenant(uuid,text)'::regprocedure)) > 0) AS master_clone_guard,
  (SELECT count(*) FROM public.data_packages_config
   WHERE selling_price = 0.01 AND is_discovery_root IS NOT TRUE AND is_active) AS bad_active_packages;
