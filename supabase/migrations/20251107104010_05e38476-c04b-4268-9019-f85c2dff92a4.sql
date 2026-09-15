-- Allow videos in banners bucket
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg','image/jpg','image/png','image/webp',
  'video/mp4','video/webm','video/ogg','video/quicktime','video/x-msvideo'
]
WHERE id = 'banners';