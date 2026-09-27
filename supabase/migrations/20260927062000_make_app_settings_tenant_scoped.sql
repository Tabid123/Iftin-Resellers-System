-- Make app settings tenant-scoped.
-- The previous global unique constraint on setting_key prevented different
-- tenants from saving the same logical keys such as payment_number.

alter table public.app_settings
  drop constraint if exists app_settings_setting_key_key;

alter table public.app_settings
  drop constraint if exists app_settings_tenant_id_setting_key_key;

alter table public.app_settings
  add constraint app_settings_tenant_id_setting_key_key
  unique (tenant_id, setting_key);
