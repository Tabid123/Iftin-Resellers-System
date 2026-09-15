-- First unschedule the existing job
SELECT cron.unschedule('check-offline-devices-job');

-- Create new job that runs every minute for real-time offline detection
SELECT cron.schedule(
  'check-offline-devices-job',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tsjqvhddjfuecwxpcuil.supabase.co/functions/v1/check-offline-devices',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzanF2aGRkamZ1ZWN3eHBjdWlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1MTQ3NzMsImV4cCI6MjA3NDA5MDc3M30.VPcKtHoqx8zsKnzXEg9sqLDnu5FcJlwmRrUZ6MpwzLI", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);