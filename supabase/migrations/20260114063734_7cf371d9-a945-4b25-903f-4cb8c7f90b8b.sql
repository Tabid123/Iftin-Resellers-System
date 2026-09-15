-- Update the new auto-registered device to be A30 with correct providers
UPDATE android_devices 
SET 
  device_name = 'A30',
  sim1_provider = 'Somtel',
  sim2_provider = 'Amtel',
  provider_name = 'Somtel'
WHERE id = '9ef7ba42-876d-44f3-ad0f-78b94bb3ffc7';

-- Deactivate old duplicate/archived devices
UPDATE android_devices 
SET is_active = false
WHERE id IN (
  'f1890cb2-d41f-44c7-a503-9aaacd185e68', 
  'da83753f-7a6f-478a-a916-65f5e0a77532', 
  '59fac667-9c61-4225-a76a-8ce67319b98d'
);