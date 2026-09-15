-- Add support for video banners with audio
-- Add media_type column to distinguish between images and videos
ALTER TABLE banners_config 
ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'image' CHECK (media_type IN ('image', 'video'));

-- Add video_duration column to track video length (in seconds, max 300 for 5 minutes)
ALTER TABLE banners_config 
ADD COLUMN IF NOT EXISTS video_duration INTEGER CHECK (video_duration IS NULL OR (video_duration > 0 AND video_duration <= 300));

-- Update comments
COMMENT ON COLUMN banners_config.media_type IS 'Type of media: image or video';
COMMENT ON COLUMN banners_config.video_duration IS 'Duration of video in seconds (max 300 seconds = 5 minutes)';
COMMENT ON COLUMN banners_config.banner_image IS 'URL to banner media file (image or video)';