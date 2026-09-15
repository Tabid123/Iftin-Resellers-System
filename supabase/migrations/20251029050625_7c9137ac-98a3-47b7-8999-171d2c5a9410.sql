-- Allow users to view their own orders by phone number
CREATE POLICY "Anyone can view their own orders by phone"
ON public.orders
FOR SELECT
USING (true);

-- Note: Since we don't have traditional auth, we'll filter by phone on the client side
-- The app will only query orders matching the verified phone number