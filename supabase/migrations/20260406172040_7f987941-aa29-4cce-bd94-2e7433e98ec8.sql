ALTER TABLE public.android_devices 
ADD COLUMN IF NOT EXISTS battery_level integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_charging boolean DEFAULT false;