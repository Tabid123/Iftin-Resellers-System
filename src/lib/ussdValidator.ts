// Validates a USSD template string used for auto top-up / package delivery.
// Catches malformed brackets like `(receiver_phone}` that would otherwise
// be sent literally to the carrier.

const ALLOWED_PLACEHOLDERS = ['receiver_phone', 'cost_price', 'sim_password', 'package_code'];

export interface UssdValidationResult {
  valid: boolean;
  error?: string;
}

export function validateUssdTemplate(input: string): UssdValidationResult {
  const ussd = (input || '').trim();
  if (!ussd) return { valid: true }; // empty is allowed (will be stored as null)

  // No parentheses allowed — only curly braces for placeholders
  if (ussd.includes('(') || ussd.includes(')')) {
    return { valid: false, error: 'USSD waa inuu isticmaalo { } oo keliya, ( ) ma ogola. Tusaale: {receiver_phone}' };
  }

  // Balanced braces
  const opens = (ussd.match(/\{/g) || []).length;
  const closes = (ussd.match(/\}/g) || []).length;
  if (opens !== closes) {
    return { valid: false, error: 'Calaamadaha { } isma dhicaan (balanced).' };
  }

  // Each placeholder must be a known token
  const placeholders = ussd.match(/\{([^{}]*)\}/g) || [];
  for (const p of placeholders) {
    const name = p.slice(1, -1).trim();
    if (!ALLOWED_PLACEHOLDERS.includes(name)) {
      return {
        valid: false,
        error: `Placeholder aan la aqoon "${p}". Kaliya isticmaal: ${ALLOWED_PLACEHOLDERS.map(x => `{${x}}`).join(', ')}`,
      };
    }
  }

  // No leftover stray { or } outside placeholders
  const stripped = ussd.replace(/\{[^{}]*\}/g, '');
  if (stripped.includes('{') || stripped.includes('}')) {
    return { valid: false, error: 'Calaamado { ama } oo aan dhammaystirneyn ayaa ku jira.' };
  }

  // Should look like a USSD code
  if (!ussd.startsWith('*')) {
    return { valid: false, error: 'USSD waa inuu ku bilowdo *' };
  }
  if (!ussd.endsWith('#')) {
    return { valid: false, error: 'USSD waa inuu ku dhammaado #' };
  }

  return { valid: true };
}
