
CREATE TABLE public.sms_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL,
  sim_slot INTEGER NOT NULL DEFAULT 1,
  sim_number TEXT,
  sms_type TEXT NOT NULL DEFAULT 'incoming',
  sms_sender TEXT,
  sms_body TEXT NOT NULL,
  amount NUMERIC,
  tx_type TEXT,
  tx_id TEXT,
  counterpart_phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert sms logs" ON public.sms_logs FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can read sms logs" ON public.sms_logs FOR SELECT TO public USING (true);

CREATE INDEX idx_sms_logs_device_sim ON public.sms_logs (device_id, sim_slot);
CREATE INDEX idx_sms_logs_tx_type ON public.sms_logs (tx_type);
CREATE INDEX idx_sms_logs_created_at ON public.sms_logs (created_at DESC);
