-- Tirtir policy-ga hore ee aan shaqaynayn
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;

-- Abuur policy cusub oo PERMISSIVE ah (default-ka)
CREATE POLICY "Anyone can create orders" 
ON public.orders 
FOR INSERT 
WITH CHECK (true);