// Shared research (the research assistant, step 3 – docs/vision/research.md): who may do what, who may join, and when an
// edit is kept in the history. The logic only, no database.   Tests: node server/test-research-share.mjs
//   owner        everything: invite and remove, roles, delete, settings
//   editor       notes, questions, sources and drafts – anyone's; invites readers
//   contributor  adds (notes, questions, sources, drafts) and comments; edits only what they wrote themselves
//   reader       sees and comments
// The family's rules (decisions.md): someone outside the family joins only with their approval; a child under 12 works
// only with the family. "The family" here is the same household; the age comes from the members once it is kept there.

export const ROLES = ['owner', 'editor', 'contributor', 'reader'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_NAME: Record<Role, string> = { owner: 'בעלים', editor: 'עורך', contributor: 'תורם', reader: 'קורא' };
const rank = (r: Role) => ROLES.length - ROLES.indexOf(r);   // owner 4 … reader 1

export type Action = 'view' | 'comment' | 'add' | 'editOwn' | 'editAny' | 'restore' | 'invite' | 'manage' | 'delete' | 'settings';
/** may this role do this; `invite` also needs the role to be given (an editor invites readers only) */
export function can(role: Role | null, action: Action, opts: { mine?: boolean; inviteAs?: Role } = {}): boolean {
  if (!role) return false;
  const r = rank(role);
  switch (action) {
    case 'view': case 'comment': return true;
    case 'add': return r >= rank('contributor');
    case 'editOwn': return opts.mine ? r >= rank('contributor') : r >= rank('editor');
    case 'editAny': case 'restore': return r >= rank('editor');
    case 'invite': return role === 'owner' ? opts.inviteAs !== 'owner' : role === 'editor' ? opts.inviteAs === 'reader' : false;
    case 'manage': case 'delete': case 'settings': return role === 'owner';
  }
}
/** may someone with this role change (or remove) this item: their own as a contributor, anyone's as an editor */
export const mayEdit = (role: Role | null, createdBy: string | null, me: string) => can(role, 'editOwn', { mine: !createdBy || createdBy === me });

/** an invitation: within the household it waits only for the person to accept; outside it, it is a partner who joins
    on their own approval; a child is never added from outside the family (nor a child's research opened to outsiders) */
export function mayJoin(o: { sameHousehold: boolean; inviteeChild?: boolean; ownerChild?: boolean }): { ok: boolean; why?: string; outside: boolean } {
  if (!o.sameHousehold && (o.inviteeChild || o.ownerChild)) return { ok: false, why: 'child_outside_family', outside: true };
  return { ok: true, outside: !o.sameHousehold };
}

/** an invitation for now (the owner's decision, decisions.md): only someone of the owner's own household. Whoever is
    not – not in הָאֹהֶל at all, or of another household – gets the very same answer, so an invitation never tells
    whether an address is registered. (mayJoin above is for later, when partners outside join on their approval.) */
export function inviteCheck(o: { exists: boolean; sameHousehold: boolean }): { ok: boolean; why?: 'not_same_household' } {
  return o.exists && o.sameHousehold ? { ok: true } : { ok: false, why: 'not_same_household' };
}

/** a member as the others see them: by name; the address only for the research's owner (who manages them), and "me" */
export function memberView(m: { email: string; name: string }, viewer: string, viewerIsOwner: boolean) {
  return { name: m.name, me: m.email === viewer, ...(viewerIsOwner ? { email: m.email } : {}) };
}

/** a draft's history keeps a version at most every ten minutes per person (it saves itself as one types) */
export const snapshotDue = (lastAt: number | null, now: number, by: string, lastBy: string | null) => !lastAt || by !== lastBy || now - lastAt >= 10 * 60e3;

/** what a person sees of a note in a shared research: all of it, or only that there is one (a private note not shared) */
export function noteView(n: { title: string; body: string; author: string; shared: boolean }, viewer: string, authorName: string) {
  if (n.shared || n.author === viewer) return { title: n.title, body: n.body, hidden: false };
  return { title: `פתק פרטי של ${authorName}`, body: '', hidden: true };
}
