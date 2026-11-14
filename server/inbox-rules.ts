// The inbox's "מהאוהל" tab (the owner, 2026-11-14), the pure rules: who sees which of האוהל's own messages. Tested by
// server/test-inbox.mjs. A member sees:
//   - a message to them alone (to_email = them): the room's own notes ('system') and the owner's message to one member;
//   - a message to everyone (to_email empty) only when the owner marked it to keep in the inbox (keep = 1), and never a
//     'system' row without an address (those are the room's notes to the owner, server/admin.ts).
// Read only: there is no reply. "האוהל התעדכן" notices come from /whats-new.json and are read as 'wn:<v>'.

export type Row = { id: string; to_email: string | null; by_email: string; keep: number | null };

export function sees(r: Row, email: string): boolean {
  const me = email.toLowerCase();
  if (r.to_email) return r.to_email.toLowerCase() === me;
  return r.keep === 1 && r.by_email !== 'system';
}

/** the ids a member may mark read from the tab: their own messages' ids, and "האוהל התעדכן" versions as 'wn:<v>' */
export function readIds(ids: unknown, mine: Set<string>): string[] {
  if (!Array.isArray(ids)) return [];
  const out = new Set<string>();
  for (const x of ids.slice(0, 200)) {
    if (typeof x !== 'string') continue;
    if (mine.has(x) || /^wn:[^\s]{1,100}$/.test(x)) out.add(x);
  }
  return [...out];
}
