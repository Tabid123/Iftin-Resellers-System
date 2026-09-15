
-- Delete all delivery queue entries
DELETE FROM public.delivery_queue;

-- Delete all delivery instructions
DELETE FROM public.delivery_instructions;

-- Delete all payment receipts
DELETE FROM public.payment_receipts;

-- Delete all pending online payments
DELETE FROM public.pending_online_payments;

-- Delete all fraud alerts
DELETE FROM public.fraud_alerts;

-- Delete all orders
DELETE FROM public.orders;

-- Delete all audit logs
DELETE FROM public.audit_logs;
