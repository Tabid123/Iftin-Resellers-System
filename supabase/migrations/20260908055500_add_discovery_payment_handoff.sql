-- Carry the selected *212* discovery row across the payment/receipt boundary.
ALTER TABLE public.pending_online_payments
  ADD COLUMN IF NOT EXISTS discovery_id uuid REFERENCES public.ussd_package_discoveries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discovery_label text;

CREATE INDEX IF NOT EXISTS pending_online_payments_discovery_idx
  ON public.pending_online_payments (tenant_id, discovery_id)
  WHERE discovery_id IS NOT NULL;
