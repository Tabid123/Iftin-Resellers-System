-- Add provider columns for each SIM slot
ALTER TABLE public.android_devices 
ADD COLUMN sim1_provider text,
ADD COLUMN sim2_provider text;

-- Update existing device with current configuration (M31: Hormuud + Somnet)
UPDATE public.android_devices 
SET sim1_provider = 'hormuud', 
    sim2_provider = 'somnet'
WHERE device_name = 'M31';