-- Fix existing SMS offline orders that were incorrectly marked as waafipay_api
-- This updates all orders that have matching payment_receipts to sms_offline
UPDATE orders o
SET payment_source = 'sms_offline'
FROM payment_receipts pr
WHERE pr.matched_order_id = o.id
  AND o.payment_source = 'waafipay_api';