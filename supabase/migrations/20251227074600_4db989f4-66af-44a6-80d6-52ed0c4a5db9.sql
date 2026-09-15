-- Add WhatsApp notification settings for device offline alerts
INSERT INTO app_settings (setting_key, text_value, description, setting_value)
VALUES 
  ('device_alert_whatsapp_number', '', 'Lambarka WhatsApp ee uu notification-ku tago marka device offline noqdo', null),
  ('device_alert_whatsapp_enabled', null, 'Awood/jooji WhatsApp notifications marka device offline noqdo', true)
ON CONFLICT (setting_key) DO NOTHING;