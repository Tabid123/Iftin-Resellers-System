-- Ku dar setting-ka lambarka lacagta Iftin
INSERT INTO app_settings (setting_key, text_value, description, setting_value)
VALUES (
  'iftin_payment_number',
  '617195659',
  'Lambarka lacagta ee shirkada Iftin (USSD code-ka lagu isticmaalo)',
  NULL
)
ON CONFLICT (setting_key) DO NOTHING;