REVOKE ALL ON FUNCTION public.set_sim_pin(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delivery_instructions_fill_sim_pin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_sim_pin(text, text) TO authenticated;