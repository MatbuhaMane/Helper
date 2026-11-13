// The rules of the app lock and the tree lock (the owner's design, docs/decisions.md "Locks and privacy").
// Pure functions, tested in test-lock.mjs. The handlers are in lock.ts.

export type Mode = 'off' | 'pin' | 'bio';
export const MODES: Mode[] = ['off', 'pin', 'bio'];
export const AUTOLOCK_MIN = [1, 5, 15, 60];
export const DEFAULT_AUTOLOCK = 5;
/** a code, a passkey or a Google sign-in from this long ago proves it is the person (to change the code or turn a lock off) */
export const PROOF_MS = 5 * 60e3;
/** an opened tree stays open this long from its last use */
export const TREE_IDLE_MS = 15 * 60e3;
/** wrong codes: every 5 a pause, at 10 the code is closed until a new Google sign-in */
export const PAUSE_EVERY = 5, PAUSE_MS = 15 * 60e3, CLOSE_AT = 10;

export const validPin = (pin: unknown): pin is string => typeof pin === 'string' && /^\d{4}$/.test(pin);
export const validMode = (m: unknown): m is Mode => typeof m === 'string' && (MODES as string[]).includes(m);
export const validAutolock = (n: unknown) => typeof n === 'number' && AUTOLOCK_MIN.includes(n);

/** is the app locked for this session? (a lock is on, and it was locked by hand or left alone too long) */
export function appLocked(o: { mode: string | null; locked: number | null; lastActive: number | null; autolockMin: number | null; now: number }): boolean {
  if (!o.mode || o.mode === 'off') return false;
  if (o.locked) return true;
  const idle = (o.autolockMin || DEFAULT_AUTOLOCK) * 60e3;
  return !!o.lastActive && o.now - o.lastActive > idle;
}

/** what a locked session may still reach: the lock itself, who am I, and signing in or out */
export const allowedWhenLocked = (path: string) => /^\/api\/(lock(\/.*)?|me|logout|auth\/.*)$/.test(path);

/** is the tree open for this session? (no tree lock, or opened in the last 15 minutes) */
export const treeOpen = (o: { mode: string | null; openUntil: number | null; now: number }) => !o.mode || o.mode === 'off' || (!!o.openUntil && o.openUntil > o.now);

/** after a wrong code: the new count, a pause until when, and whether the code is now closed */
export function afterFail(fails: number, now: number): { fails: number; pauseUntil: number; closed: boolean } {
  const n = fails + 1;
  return { fails: n, pauseUntil: n % PAUSE_EVERY === 0 ? now + PAUSE_MS : 0, closed: n >= CLOSE_AT };
}

export const hasProof = (proofAt: number | null | undefined, now: number) => !!proofAt && now - proofAt <= PROOF_MS;

/**
 * May this change of locks go through? Turning a lock on needs its means (a code set, or a passkey), and making the
 * protection weaker (off, or another mode) needs a proof from the last 5 minutes.
 */
export function mayChange(o: { from: Mode; to: Mode; hasPin: boolean; hasPasskey: boolean; proof: boolean }): { ok: boolean; why?: 'no_pin' | 'no_passkey' | 'proof_needed' } {
  if (o.to === 'pin' && !o.hasPin) return { ok: false, why: 'no_pin' };
  if (o.to === 'bio' && !o.hasPasskey) return { ok: false, why: 'no_passkey' };
  if (o.from !== 'off' && o.from !== o.to && !o.proof) return { ok: false, why: 'proof_needed' };
  return { ok: true };
}
