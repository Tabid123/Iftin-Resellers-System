-- Fix the function overloading issue by dropping the old function
-- and keeping only the one that accepts optional provider_uuid parameter

-- Drop the function that takes no parameters (causing the conflict)
DROP FUNCTION IF EXISTS public.get_active_categories();

-- The function with provider_uuid parameter already exists and will work correctly
-- It's defined as: get_active_categories(provider_uuid uuid DEFAULT NULL)
-- This allows it to be called with or without a provider_uuid parameter