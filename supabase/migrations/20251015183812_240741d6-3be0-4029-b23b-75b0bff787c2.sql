-- Update delivery instruction templates to use {cost_price} instead of {data_amount}
-- This allows each package to use its actual cost_price from data_packages_config

-- Update Anfac category template
UPDATE delivery_instructions 
SET code_template = '*737*{receiver_phone}*{cost_price}*{sim_password}#'
WHERE category_id = 'f55ed7bf-16e0-4d58-a72b-7b28ba5be799';

-- Update Unlimited Data & Voice category template
UPDATE delivery_instructions 
SET code_template = '*729*{receiver_phone}*{cost_price}*{sim_password}#'
WHERE category_id = '338a4cb1-a4cc-4bc5-95ac-173849813dea';