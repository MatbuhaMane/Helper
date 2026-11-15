// "יד ביד" (the hands economy, docs/vision/yad-beyad.md, later.md "כלכלה פנימית"): the pure rules. Tested by server/test-yad.mjs.
// Amounts are always whole TENTHS of a hand (an integer; one hand = 10 tenths), never a fraction: the ledger must be exact like money.

export const TENTHS = 10;
export const TITHE_PERCENT = 10;                       // a tenth of everything a person earns goes to the public fund

export type LevelId = 'light' | 'work' | 'long' | 'hour';
export interface Level { id: LevelId; name: string; hands: number }
/** the four levels of an hour; difficulty 0..2 + expertise 0..2 decide it (the owner's rule of the two questions) */
export const LEVELS: Level[] = [
  { id: 'light', name: 'שעה קלה', hands: 1 }, { id: 'work', name: 'שעת עבודה', hands: 2 },
  { id: 'long', name: 'שעה ארוכה', hands: 4 }, { id: 'hour', name: 'איש השעה', hands: 8 },
];
export const validScore = (n: unknown): n is 0 | 1 | 2 => n === 0 || n === 1 || n === 2;
export function levelOf(difficulty: 0 | 1 | 2, expertise: 0 | 1 | 2): Level {
  const sum = difficulty + expertise;
  return LEVELS[sum === 0 ? 0 : sum === 1 ? 1 : sum <= 3 ? 2 : 3];
}

/** the work time is counted in half hours (1..48): so an amount is always a whole number of tenths */
export const validHalfHours = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 48;
/** the gross price of half-hours at a level, in tenths: hands per hour x tenths x half the hours */
export const grossTenths = (handsPerHour: number, halfHours: number) => handsPerHour * halfHours * (TENTHS / 2);
/** the tithe of a gross amount, rounded DOWN (the one who earns is favoured; the fund never gets a fraction of a tenth) */
export const titheOf = (gross: number) => Math.floor((gross * TITHE_PERCENT) / 100);

/** a service between two members: the payer pays gross; the giver is paid gross - tithe; the fund gets the tithe */
export function splitService(gross: number) { const t = titheOf(gross); return { pay: gross, giver: gross - t, tithe: t }; }
/** a deed for the community: the fund pays first, new hands are created only for what the fund cannot cover (the owner's rule) */
export function splitDeed(gross: number, fundBalance: number) {
  const fromFund = Math.max(0, Math.min(gross, fundBalance));
  return { gross, fromFund, minted: gross - fromFund, tithe: titheOf(gross), person: gross - titheOf(gross) };
}

/** the tenths as the screen shows them: "2.5" or "3" (a tenth is 0.1 of a hand) */
export const showHands = (tenths: number) => (tenths % TENTHS === 0 ? String(tenths / TENTHS) : (tenths / TENTHS).toFixed(1));

/* ---- the gate (the owner's decision 2026-11-15: a feature that waits for approval is built, and locked behind its own switch) ---- */
/** open to everyone when the switch is on; when it is off, only the owner may try it */
export const yadOpen = (switchOn: boolean, email: string, ownerEmails: string) =>
  switchOn === true || ownerEmails.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean).includes(email.toLowerCase());

/* ---- distance as a range (the exact place is never shown): areas are a fixed table, the distance is between their centres ---- */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
/** the range label of a distance: "באותו אזור", "עד 5 ק"מ", "5 עד 15 ק"מ", "15 עד 50 ק"מ", "מעל 50 ק"מ" */
export function rangeOf(distance: number): { band: number; label: string } {
  if (distance < 1) return { band: 0, label: 'באותו אזור' };
  if (distance <= 5) return { band: 1, label: 'עד 5 ק"מ' };
  if (distance <= 15) return { band: 2, label: '5 עד 15 ק"מ' };
  if (distance <= 50) return { band: 3, label: '15 עד 50 ק"מ' };
  return { band: 4, label: 'מעל 50 ק"מ' };
}

/** the ways a need or a person may be reported, and the actions the owner takes (docs: ת4) */
export const REPORT_ACTIONS = ['dismiss', 'remove_need', 'remove_person'] as const;
