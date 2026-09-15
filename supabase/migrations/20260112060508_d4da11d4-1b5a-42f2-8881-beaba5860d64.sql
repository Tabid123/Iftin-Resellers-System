
-- Step 1: Create new categories for all 4 providers
INSERT INTO package_categories (category_name, provider_id, display_order, is_active) VALUES
-- Hormuud
('Maalinle', 'd4829a4e-514a-4329-a44f-84e1e028d97a', 1, true),
('Isbuucle', 'd4829a4e-514a-4329-a44f-84e1e028d97a', 2, true),
('Bille', 'd4829a4e-514a-4329-a44f-84e1e028d97a', 3, true),
('No Expire', 'd4829a4e-514a-4329-a44f-84e1e028d97a', 4, true),
-- Somnet
('Maalinle', '85512d5e-a1f7-4c8d-b5e6-cd868361ecb2', 1, true),
('Isbuucle', '85512d5e-a1f7-4c8d-b5e6-cd868361ecb2', 2, true),
('Bille', '85512d5e-a1f7-4c8d-b5e6-cd868361ecb2', 3, true),
('No Expire', '85512d5e-a1f7-4c8d-b5e6-cd868361ecb2', 4, true),
-- Somtel
('Maalinle', '4bfadba1-a743-47b6-a497-5a9f7e86ded1', 1, true),
('Isbuucle', '4bfadba1-a743-47b6-a497-5a9f7e86ded1', 2, true),
('Bille', '4bfadba1-a743-47b6-a497-5a9f7e86ded1', 3, true),
('No Expire', '4bfadba1-a743-47b6-a497-5a9f7e86ded1', 4, true),
-- Amtel
('Maalinle', 'a5a801ce-dd1b-4d46-af24-ab46a1d0bba2', 1, true),
('Isbuucle', 'a5a801ce-dd1b-4d46-af24-ab46a1d0bba2', 2, true),
('Bille', 'a5a801ce-dd1b-4d46-af24-ab46a1d0bba2', 3, true),
('No Expire', 'a5a801ce-dd1b-4d46-af24-ab46a1d0bba2', 4, true);

-- Step 2: Update display_order for categories we're keeping (Hormuud: 5G Plus, ADSL Arday, ADSL Plus)
UPDATE package_categories SET display_order = 5 WHERE id = 'ec2fb69f-a837-4029-bc8b-78fc658cc5e4'; -- 5G Plus
UPDATE package_categories SET display_order = 6 WHERE id = 'ef80e2de-9b42-4c7e-9a0e-214736f9a176'; -- ADSL Arday
UPDATE package_categories SET display_order = 7 WHERE id = '8d3f5a06-2385-4d21-8b15-cd487da12d16'; -- ADSL Plus

-- Step 3: Update display_order for categories we're keeping (Somnet: Mifi Internet (GB), 5G)
UPDATE package_categories SET display_order = 5 WHERE id = '97e27efb-fe96-4358-89b3-9c6057644ab4'; -- Mifi Internet (GB)
UPDATE package_categories SET display_order = 6 WHERE id = '4f0f47a5-8c70-4a45-8090-53126f99e618'; -- 5G

-- Step 4: Disable old categories for Hormuud (Anfac, Anfac Plus, Unlimited Data, Unlimited Calls, Kaar Kuhadal)
UPDATE package_categories SET is_active = false WHERE id IN (
  'f55ed7bf-16e0-4d58-a72b-7b28ba5be799', -- Anfac
  '262b3fe2-ea40-49dc-9199-a10efacd56bd', -- Anfac Plus
  '338a4cb1-a4cc-4bc5-95ac-173849813dea', -- Unlimited Data
  '6020020f-5564-4c6f-a4ed-b8a320eff91b', -- Unlimited Calls
  'ec5d4374-2389-4f1c-b329-24c5c201517f'  -- Kaar Kuhadal
);

-- Step 5: Disable old categories for Somnet (Qanciye Plus, Unlimited Data, Kaafi Unlimited, Unlimited Voice)
UPDATE package_categories SET is_active = false WHERE id IN (
  'f28462ea-0e29-4091-b57a-1a835f121c31', -- Qanciye Plus
  'b8378aee-4bb3-49c0-8384-db12b74382c1', -- Unlimited Data
  'c57fb112-c95e-42dc-9715-96ee65472819', -- Kaafi Unlimited
  '7560dc4d-6104-4f98-a483-7ae0b784c7ef'  -- Unlimited Voice
);

-- Step 6: Disable old categories for Somtel (Unlimited Data, No Expire, Unlimited Calls, Kaar Kuhadal)
UPDATE package_categories SET is_active = false WHERE id IN (
  'ba0b3bd6-3cc7-4ca8-9457-5be65d46e773', -- Unlimited Data
  'b928b548-8177-4399-b97f-3ca7f41f4342', -- No Expire
  'fd560173-50d4-4936-bf4c-b91fdbe68178', -- Unlimited Calls
  '29f018d3-b85b-4f9f-a010-459f894ec022'  -- Kaar Kuhadal
);

-- Step 7: Disable old categories for Amtel (Unlimited Data, Tanaad (GB))
UPDATE package_categories SET is_active = false WHERE id IN (
  'f3be09ab-fe0b-4bb4-9c30-fddbfe859fd4', -- Unlimited Data
  '5949a80d-b943-4e79-84cc-aa44e00cbda4'  -- Tanaad (GB)
);
