// An order may contain several scheduled/linked deliveries. Finishing one part
// must not close the remaining parts when terminal-order cleanup runs.
export function deliveryOutcome(statuses: string[]): string {
  if (statuses.some(s => s === 'verification_required' || s === 'awaiting_sms')) return 'verification_required';
  if (statuses.includes('processing')) return 'processing';
  if (statuses.some(s => s === 'pending' || s === 'scheduled')) return 'queued';
  if (statuses.some(s => s === 'failed' || s === 'timeout')) return 'failed';
  return 'delivered';
}

export function needsLateEvidence(queueStatus: string): boolean {
  return queueStatus === 'verification_required' || queueStatus === 'awaiting_sms';
}

export function isFinalOrder(order: { status?: string; delivery_status?: string } | null): boolean {
  return !!order && (order.status === 'cancelled' || order.delivery_status === 'delivered' || order.delivery_status === 'cancelled');
}
