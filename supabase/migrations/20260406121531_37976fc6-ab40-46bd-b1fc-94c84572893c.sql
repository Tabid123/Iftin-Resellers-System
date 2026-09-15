CREATE POLICY "Anyone can update verified phones"
  ON public.verified_phones
  FOR UPDATE
  USING (true)
  WITH CHECK (true);