-- Allow public users to UPDATE pending_online_payments (needed for dedup and status changes)
CREATE POLICY "Anyone can update pending payments"
ON public.pending_online_payments
FOR UPDATE
USING (true)
WITH CHECK (true);