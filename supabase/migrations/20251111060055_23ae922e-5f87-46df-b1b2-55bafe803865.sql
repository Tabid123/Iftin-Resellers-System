-- Add iftin payment prefix setting
INSERT INTO app_settings (setting_key, text_value, description, setting_value)
VALUES (
  'iftin_payment_prefix',
  '*712*',
  'Prefix-ka USSD code-ka Iftin (tusaale: *712*)',
  NULL
)
ON CONFLICT (setting_key) DO NOTHING;