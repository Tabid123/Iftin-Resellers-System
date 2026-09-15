-- Update provider logos to local paths
UPDATE providers_config SET provider_logo = '/storage/logos/hormuud.jpg' WHERE provider_name = 'Hormuud';
UPDATE providers_config SET provider_logo = '/storage/logos/somlink.jpg' WHERE provider_name = 'Somlink';
UPDATE providers_config SET provider_logo = '/storage/logos/amtel.png' WHERE provider_name = 'Amtel';
UPDATE providers_config SET provider_logo = '/storage/logos/somnet.jpg' WHERE provider_name = 'Somnet';
UPDATE providers_config SET provider_logo = '/storage/logos/somtel.png' WHERE provider_name = 'Somtel';

-- Update payment provider logos
UPDATE payment_providers_config SET provider_logo = '/storage/payment-logos/evc.png' WHERE provider_name = 'Evc';
UPDATE payment_providers_config SET provider_logo = '/storage/payment-logos/jeeb.jpg' WHERE provider_name = 'Jeeb';

-- Update banner images
UPDATE banners_config SET banner_image = '/storage/banners/banner1.jpeg' WHERE banner_image LIKE '%zxwboi2mtt%';
UPDATE banners_config SET banner_image = '/storage/banners/banner2.jpeg' WHERE banner_image LIKE '%372gmb2s1ts%';
UPDATE banners_config SET banner_image = '/storage/banners/banner3.png' WHERE banner_image LIKE '%xfsrabilgr9%';
UPDATE banners_config SET banner_image = '/storage/banners/banner4.jpeg' WHERE banner_image LIKE '%mdjes37je88%';

-- Update category images
UPDATE package_categories SET category_image = '/storage/categories/5g-plus.png' WHERE category_image LIKE '%uqy55ekrhe%';
UPDATE package_categories SET category_image = '/storage/categories/adsl-arday.png' WHERE category_image LIKE '%855cntv4cjn%';
UPDATE package_categories SET category_image = '/storage/categories/adsl-plus.png' WHERE category_image LIKE '%bffbc3c1w4e%';
UPDATE package_categories SET category_image = '/storage/categories/mifi-internet.png' WHERE category_image LIKE '%z5rj3lrkpgf%';
UPDATE package_categories SET category_image = '/storage/categories/5g.png' WHERE category_image LIKE '%co4dxyq07mj%';
UPDATE package_categories SET category_image = '/storage/categories/unlimited-calls-hormuud.png' WHERE category_image LIKE '%xle6k10lmeg%';
UPDATE package_categories SET category_image = '/storage/categories/kaar-kuhadal.jpg' WHERE category_image LIKE '%nb32o1khl0p%';
UPDATE package_categories SET category_image = '/storage/categories/unlimited-data-voice-hormuud.png' WHERE category_image LIKE '%io2m1xfc65%';
UPDATE package_categories SET category_image = '/storage/categories/qanciye-plus.png' WHERE category_image LIKE '%6kqyehqugjq%';
UPDATE package_categories SET category_image = '/storage/categories/anfac.png' WHERE category_image LIKE '%o2x7uko4ko8%';
UPDATE package_categories SET category_image = '/storage/categories/anfac-plus.png' WHERE category_image LIKE '%uk3xnbxbqh%';
UPDATE package_categories SET category_image = '/storage/categories/unlimited-data-hormuud.png' WHERE category_image LIKE '%1d6iye84hol%';
UPDATE package_categories SET category_image = '/storage/categories/unlimited-data-voice-somlink.png' WHERE category_image LIKE '%upeab6tcdnf%';
UPDATE package_categories SET category_image = '/storage/categories/unlimited-voice.png' WHERE category_image LIKE '%nnz9h32f23s%';
UPDATE package_categories SET category_image = '/storage/categories/unlimited-data-voice-somtel.png' WHERE category_image LIKE '%y84gp1u30s%';
UPDATE package_categories SET category_image = '/storage/categories/no-expire-somtel.png' WHERE category_image LIKE '%6xsjkmxfjf2%';
UPDATE package_categories SET category_image = '/storage/categories/unlimited-calls-somtel.png' WHERE category_image LIKE '%fkwpmq4qemd%';
UPDATE package_categories SET category_image = '/storage/categories/voice-somtel.png' WHERE category_image LIKE '%6hipmq83yg%';
UPDATE package_categories SET category_image = '/storage/categories/no-expire-somlink.png' WHERE category_image LIKE '%uuee74oubrn%';
UPDATE package_categories SET category_image = '/storage/categories/unlimited-data-voice-somlink2.png' WHERE category_image LIKE '%gz7fbsh78y4%';