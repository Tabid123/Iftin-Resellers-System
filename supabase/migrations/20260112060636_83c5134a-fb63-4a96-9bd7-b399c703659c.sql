
-- HORMUUD - Assign packages to new categories
-- Maalinle (validity: saac, 1-3 maalin) - excluding 5G Plus, ADSL Arday, ADSL Plus packages
UPDATE data_packages_config 
SET category_id = '183677c3-e8e4-4d66-b1bd-ec08af3ead25'
WHERE provider_id = 'd4829a4e-514a-4329-a44f-84e1e028d97a'
AND LOWER(validity_days) SIMILAR TO '%(saac|1 maalin|2 maalin|3 maalin)%'
AND category_id NOT IN ('ec2fb69f-a837-4029-bc8b-78fc658cc5e4', 'ef80e2de-9b42-4c7e-9a0e-214736f9a176', '8d3f5a06-2385-4d21-8b15-cd487da12d16');

-- Isbuucle (validity: 7-14 maalin)
UPDATE data_packages_config 
SET category_id = 'ba089766-7e52-4533-a41d-a1ca1fb7909e'
WHERE provider_id = 'd4829a4e-514a-4329-a44f-84e1e028d97a'
AND LOWER(validity_days) SIMILAR TO '%(7 maalin|14 maalin)%'
AND category_id NOT IN ('ec2fb69f-a837-4029-bc8b-78fc658cc5e4', 'ef80e2de-9b42-4c7e-9a0e-214736f9a176', '8d3f5a06-2385-4d21-8b15-cd487da12d16');

-- Bille (validity: 30+ maalin or bil)
UPDATE data_packages_config 
SET category_id = 'fe9ee227-e1db-4b73-a12f-51ae0111b2e6'
WHERE provider_id = 'd4829a4e-514a-4329-a44f-84e1e028d97a'
AND LOWER(validity_days) SIMILAR TO '%(30 maalin|45 maalin|60 maalin|90 maalin|bil)%'
AND category_id NOT IN ('ec2fb69f-a837-4029-bc8b-78fc658cc5e4', 'ef80e2de-9b42-4c7e-9a0e-214736f9a176', '8d3f5a06-2385-4d21-8b15-cd487da12d16');

-- No Expire
UPDATE data_packages_config 
SET category_id = '01c24c15-6dd8-4e96-8ea4-8f1f01ae6716'
WHERE provider_id = 'd4829a4e-514a-4329-a44f-84e1e028d97a'
AND LOWER(validity_days) = 'no expire'
AND category_id NOT IN ('ec2fb69f-a837-4029-bc8b-78fc658cc5e4', 'ef80e2de-9b42-4c7e-9a0e-214736f9a176', '8d3f5a06-2385-4d21-8b15-cd487da12d16');

-- SOMNET - Assign packages to new categories (excluding 5G and Mifi categories)
-- Maalinle
UPDATE data_packages_config 
SET category_id = '82f1a007-f0fd-448c-a4c7-4df8ad184787'
WHERE provider_id = '85512d5e-a1f7-4c8d-b5e6-cd868361ecb2'
AND LOWER(validity_days) SIMILAR TO '%(saac|1 maalin|2 maalin|3 maalin)%'
AND category_id NOT IN ('4f0f47a5-8c70-4a45-8090-53126f99e618', '97e27efb-fe96-4358-89b3-9c6057644ab4');

-- Isbuucle
UPDATE data_packages_config 
SET category_id = '6c90df70-82d6-49ba-9185-98005a2943fa'
WHERE provider_id = '85512d5e-a1f7-4c8d-b5e6-cd868361ecb2'
AND LOWER(validity_days) SIMILAR TO '%(7 maalin|14 maalin)%'
AND category_id NOT IN ('4f0f47a5-8c70-4a45-8090-53126f99e618', '97e27efb-fe96-4358-89b3-9c6057644ab4');

-- Bille
UPDATE data_packages_config 
SET category_id = 'c85f8aab-e39a-43f7-bf3c-ff2f02428ab9'
WHERE provider_id = '85512d5e-a1f7-4c8d-b5e6-cd868361ecb2'
AND LOWER(validity_days) SIMILAR TO '%(30 maalin|45 maalin|60 maalin|90 maalin|bil)%'
AND category_id NOT IN ('4f0f47a5-8c70-4a45-8090-53126f99e618', '97e27efb-fe96-4358-89b3-9c6057644ab4');

-- No Expire
UPDATE data_packages_config 
SET category_id = '97b11e1d-129c-48cc-a166-e31b551af9bd'
WHERE provider_id = '85512d5e-a1f7-4c8d-b5e6-cd868361ecb2'
AND LOWER(validity_days) = 'no expire'
AND category_id NOT IN ('4f0f47a5-8c70-4a45-8090-53126f99e618', '97e27efb-fe96-4358-89b3-9c6057644ab4');

-- SOMTEL - Assign ALL packages to new categories
-- Maalinle
UPDATE data_packages_config 
SET category_id = '1050c553-63eb-4e36-9159-16ddcc39d743'
WHERE provider_id = '4bfadba1-a743-47b6-a497-5a9f7e86ded1'
AND LOWER(validity_days) SIMILAR TO '%(saac|1 maalin|2 maalin|3 maalin)%';

-- Isbuucle
UPDATE data_packages_config 
SET category_id = '7eb250e2-3bcb-4ada-bbf7-418618888436'
WHERE provider_id = '4bfadba1-a743-47b6-a497-5a9f7e86ded1'
AND LOWER(validity_days) SIMILAR TO '%(7 maalin|14 maalin)%';

-- Bille
UPDATE data_packages_config 
SET category_id = '4a2957ba-204e-4e55-adc3-85645d79676c'
WHERE provider_id = '4bfadba1-a743-47b6-a497-5a9f7e86ded1'
AND LOWER(validity_days) SIMILAR TO '%(30 maalin|45 maalin|60 maalin|90 maalin|bil)%';

-- No Expire
UPDATE data_packages_config 
SET category_id = '9a4c5844-aa80-489f-96ed-9210db4dc971'
WHERE provider_id = '4bfadba1-a743-47b6-a497-5a9f7e86ded1'
AND LOWER(validity_days) = 'no expire';

-- AMTEL - Assign ALL packages to new categories
-- Maalinle
UPDATE data_packages_config 
SET category_id = 'f469d9eb-00d9-45d9-8549-d4f60c6922b5'
WHERE provider_id = 'a5a801ce-dd1b-4d46-af24-ab46a1d0bba2'
AND LOWER(validity_days) SIMILAR TO '%(saac|1 maalin|2 maalin|3 maalin)%';

-- Isbuucle
UPDATE data_packages_config 
SET category_id = '4fe7ac1e-cec9-4da8-9500-f2ffed33d0e8'
WHERE provider_id = 'a5a801ce-dd1b-4d46-af24-ab46a1d0bba2'
AND LOWER(validity_days) SIMILAR TO '%(7 maalin|14 maalin)%';

-- Bille
UPDATE data_packages_config 
SET category_id = '8f6c67f6-3940-4ec4-9309-2acda0100bcf'
WHERE provider_id = 'a5a801ce-dd1b-4d46-af24-ab46a1d0bba2'
AND LOWER(validity_days) SIMILAR TO '%(30 maalin|45 maalin|60 maalin|90 maalin|bil)%';

-- No Expire
UPDATE data_packages_config 
SET category_id = 'acd66d12-8fec-4639-b0dc-c6110122f608'
WHERE provider_id = 'a5a801ce-dd1b-4d46-af24-ab46a1d0bba2'
AND LOWER(validity_days) = 'no expire';
