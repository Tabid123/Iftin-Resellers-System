-- Add low balance alert settings
INSERT INTO app_settings (setting_key, description, text_value, setting_value) 
VALUES 
  ('low_balance_threshold', 'E-Voucher balance minimum ($) - alerts when below this amount', '5', true),
  ('low_balance_alert_enabled', 'Enable low balance SMS alerts for E-Voucher', NULL, true)
ON CONFLICT (setting_key) DO NOTHING;