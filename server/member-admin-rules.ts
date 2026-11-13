// Editing the family's members from the owner's room (the חברים section, public/admin/admin.js): the pure rules, with no
// database, so they can be tested alone (server/test-member-admin.mjs). The handlers are in server/member-admin.ts.
//
// Three roles show in the room, and they are not the same kind of thing:
//   * מנהל (members.role = 'owner') is the app's owner, and it is global: it heads every household, names the tribe head,
//     takes the vault's Drive backups, makes the design images. So only an address in OWNER_EMAIL may hold it, and that
//     address always keeps it (nobody can demote or move the last manager).
//   * ראש בית (a 'head' row in family_roles, for the member's own household) heads that household's tree only.
//   * חבר: everyone else.
// The email is not editable: it is the member's Google identity and the key of everything they keep (sessions, prefs,
// vault items, cards, allowance). A new address is a new member; the old one is removed.

export type Role = 'member' | 'head' | 'owner';
export const ROLES: Role[] = ['member', 'head', 'owner'];

export interface Target { email: string; household: string; role: Role }
export interface Want { name?: unknown; he_name?: unknown; household?: unknown; newHousehold?: unknown; role?: unknown; email?: unknown; confirm?: unknown }
export interface Change { name?: string | null; he_name?: string | null; household?: string; newTitle?: string; role?: Role }

export class RuleError extends Error { constructor(public code: string) { super(code); } }

/** the role the room shows: the app's owner, else a head of their own household, else a member */
export function roleOf(memberRole: string, headOf: string[], household: string): Role {
  if (memberRole === 'owner') return 'owner';
  return headOf.includes(household) ? 'head' : 'member';
}

/** the Hebrew name the helper calls someone by (as the members route checks it) */
export function heName(v: unknown): string | null {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (s && !/^[֐-׿'"׳״\- ]+$/.test(s)) throw new RuleError('he_name_hebrew');
  return s || null;
}
export function plainName(v: unknown): string | null {
  const s = String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return s || null;
}
/** a household's name ("משפחת כהן") for a new household */
export function title(v: unknown): string {
  const s = String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!s) throw new RuleError('title_required');
  return s;
}

/**
 * What an edit may change. `owners`: the OWNER_EMAIL addresses; `ownerCount`: how many members hold role owner now;
 * `households`: the ids that exist. Throws RuleError with a code the page turns into words.
 */
export function checkEdit(t: Target, w: Want, owners: Set<string>, ownerCount: number, households: Set<string>): Change {
  const c: Change = {};
  if (w.email !== undefined && String(w.email).trim().toLowerCase() !== t.email) throw new RuleError('email_fixed');
  if (w.name !== undefined) c.name = plainName(w.name);
  if (w.he_name !== undefined) c.he_name = heName(w.he_name);

  const fromConfig = owners.has(t.email);
  let role: Role | undefined;
  if (w.role !== undefined) {
    if (!ROLES.includes(w.role as Role)) throw new RuleError('bad_role');
    role = w.role as Role;
    if (role !== t.role) {
      if (role === 'owner' && !fromConfig) throw new RuleError('owner_only_from_config');
      if (t.role === 'owner' && fromConfig) throw new RuleError('owner_stays');
      if (t.role === 'owner' && ownerCount <= 1) throw new RuleError('last_owner');
      c.role = role;
    }
  }

  let household: string | undefined;
  if (w.newHousehold !== undefined && w.newHousehold !== null && w.newHousehold !== '') {
    c.newTitle = title(w.newHousehold);
    household = '';                                    // a new id, made by the handler
  } else if (w.household !== undefined) {
    household = String(w.household).trim();
    if (!households.has(household)) throw new RuleError('no_household');
  }
  if (household !== undefined && household !== t.household) {
    if ((role ?? t.role) === 'owner') throw new RuleError('owner_home_fixed');   // the manager's household is the family's
    c.household = household;
  }
  // a new household starts empty, with the member who opens it as its head (the CEO, 2026-11-13)
  if (c.newTitle !== undefined && c.household !== undefined) {
    if (role !== undefined && role !== 'head') throw new RuleError('new_household_head');
    if (t.role !== 'head') c.role = 'head';
  }

  if ((c.role !== undefined || c.household !== undefined) && w.confirm !== true) throw new RuleError('confirm_needed');
  return c;
}

/** may this member be removed? never the last manager, nor an address in OWNER_EMAIL, nor yourself */
export function mayRemove(email: string, me: string, owners: Set<string>, ownerCount: number, isOwner: boolean): string | null {
  if (email === me) return 'self';
  if (owners.has(email)) return 'owner_stays';
  if (isOwner && ownerCount <= 1) return 'last_owner';
  return null;
}

/** a search over the members: the words to look for, at least two letters; LIKE's own signs are escaped */
export function likeOf(q: unknown): string | null {
  const s = String(q ?? '').trim().toLowerCase().slice(0, 60);
  if (s.length < 2) return null;
  return '%' + s.replace(/[\\%_]/g, (x) => '\\' + x) + '%';
}

/** one line for the audit log */
export function describe(email: string, c: Change, t: Target): string {
  const parts: string[] = [];
  if (c.name !== undefined) parts.push('name');
  if (c.he_name !== undefined) parts.push('he_name');
  if (c.role !== undefined) parts.push(`role ${t.role}→${c.role}`);
  if (c.household !== undefined) parts.push(`household ${t.household}→${c.household || 'new:' + c.newTitle}`);
  return `${email}: ${parts.join(', ') || 'nothing'}`;
}
