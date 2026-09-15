-- Create offline_registrations table
CREATE TABLE IF NOT EXISTS offline_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_phone TEXT NOT NULL,
  receiver_phone TEXT NOT NULL,
  provider_id UUID REFERENCES providers_config(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(sender_phone, is_active)
);

-- Index for fast sender lookup
CREATE INDEX idx_offline_registrations_sender 
  ON offline_registrations(sender_phone) 
  WHERE is_active = true;

-- RLS Policies
ALTER TABLE offline_registrations ENABLE ROW LEVEL SECURITY;

-- Anyone can register (insert)
CREATE POLICY "Anyone can insert registrations"
  ON offline_registrations FOR INSERT
  WITH CHECK (true);

-- Anyone can view their own registration
CREATE POLICY "Anyone can view registrations"
  ON offline_registrations FOR SELECT
  USING (true);

-- Only admins can manage all registrations
CREATE POLICY "Only admins can manage registrations"
  ON offline_registrations FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger to update updated_at
CREATE TRIGGER update_offline_registrations_updated_at
  BEFORE UPDATE ON offline_registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();