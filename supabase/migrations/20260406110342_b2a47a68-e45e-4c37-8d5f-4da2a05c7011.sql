
-- Add missing columns to delivery_instructions table
ALTER TABLE public.delivery_instructions 
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.providers_config(id),
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.package_categories(id),
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.data_packages_config(id),
  ADD COLUMN IF NOT EXISTS code_template text,
  ADD COLUMN IF NOT EXISTS sim_password text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS instruction_template text DEFAULT '';

-- Allow admins to insert, update, delete delivery_instructions
CREATE POLICY "Admins can manage delivery instructions"
  ON public.delivery_instructions
  FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()));

-- Allow anyone to insert delivery instructions (for edge functions)
CREATE POLICY "Anyone can insert delivery instructions"
  ON public.delivery_instructions
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Allow anyone to update delivery instructions
CREATE POLICY "Anyone can update delivery instructions"
  ON public.delivery_instructions
  FOR UPDATE
  TO public
  USING (true);

-- Allow anyone to delete delivery instructions  
CREATE POLICY "Anyone can delete delivery instructions"
  ON public.delivery_instructions
  FOR DELETE
  TO public
  USING (true);
