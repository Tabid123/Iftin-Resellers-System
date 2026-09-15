-- Mark bd692802 as matched (manually delivered by admin)
UPDATE payment_receipts SET status = 'matched', admin_notes = 'Manually matched - package delivered by hand', processed_at = now() WHERE id = 'bd692802-1122-40d2-adef-cf8be4c3451e';

-- Mark all test receipts (619535029) as ignored  
UPDATE payment_receipts SET status = 'ignored', admin_notes = 'Test receipt - ignored' WHERE status = 'pending' AND sender_phone = '619535029';