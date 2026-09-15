-- Rename iftin_payment_number to payment_number
UPDATE app_settings SET setting_key = 'payment_number' WHERE setting_key = 'iftin_payment_number';

-- Rename iftin_payment_prefix to payment_prefix  
UPDATE app_settings SET setting_key = 'payment_prefix' WHERE setting_key = 'iftin_payment_prefix';