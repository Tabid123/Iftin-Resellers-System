// Prefix-yada telefoonka ee shirkad kasta (network) iyo habka lacag bixinta.
// Waa isticmaalka keliya ee validation-ka lambarada — mid walba prefix-yadiisa.

const NETWORK_PREFIXES: Array<{ match: string[]; prefixes: string[] }> = [
  { match: ['hormuud', 'evc', 'evcplus', 'evc plus'], prefixes: ['61', '77'] },
  { match: ['somtel', 'edahab', 'e-dahab', 'e dahab'], prefixes: ['62'] },
  { match: ['somnet', 'jeeb'], prefixes: ['68'] },
  { match: ['somlink'], prefixes: ['63', '65'] },
  { match: ['amtel'], prefixes: ['71'] },
  { match: ['telesom', 'zaad'], prefixes: ['63'] },
  { match: ['golis', 'sahal'], prefixes: ['90', '85'] },
  { match: ['nationlink', 'nation link'], prefixes: ['67', '69'] },
];

/** Prefix-yada la aqbalayo ee magaca la bixiyay. Madhan = lama garanayo. */
export function getAllowedPrefixes(name?: string | null, dbPrefix?: string | null): string[] {
  // 1) Prefix-ka admin-ka dejiyay (waxa laga yaabaa inuu badan yahay: "61,77")
  const fromDb = String(dbPrefix ?? '')
    .split(/[^0-9]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  if (fromDb.length) return Array.from(new Set(fromDb));

  const lower = String(name ?? '').toLowerCase().trim();
  if (!lower) return [];
  for (const entry of NETWORK_PREFIXES) {
    if (entry.match.some((m) => lower.includes(m))) return entry.prefixes;
  }
  return [];
}

/** Ma bilaabmaa lambarku mid ka mid ah prefix-yada la aqbalayo? */
export function matchesAllowedPrefix(value: string, allowed: string[]): boolean {
  if (!allowed.length) return true; // lama garanayo → ha joojin
  return allowed.some((p) => value.startsWith(p));
}

/** Qoraalka la tusayo isticmaalaha: "61 ama 77" */
export function formatPrefixes(allowed: string[]): string {
  return allowed.join(' ama ');
}
