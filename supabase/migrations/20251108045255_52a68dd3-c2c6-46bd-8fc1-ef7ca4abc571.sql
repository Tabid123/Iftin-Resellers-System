-- Add rotation_interval column to banners_config table
ALTER TABLE banners_config 
ADD COLUMN IF NOT EXISTS rotation_interval integer;

COMMENT ON COLUMN banners_config.rotation_interval IS 'Duration in seconds before auto-rotating to next banner (overrides video_duration if set)';