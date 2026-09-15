-- Allow public delete on payment_receipts (admin UI uses anon role)
CREATE POLICY "Anyone can delete payment receipts"
ON public.payment_receipts
FOR DELETE
USING (true);

-- Allow public delete on sms_logs (admin UI uses anon role)
CREATE POLICY "Anyone can delete sms logs"
ON public.sms_logs
FOR DELETE
USING (true);