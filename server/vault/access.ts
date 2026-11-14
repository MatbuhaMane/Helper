// The family tree on a trusted device (the owner's decision, batch 2 item 4; docs/decisions.md). Two levels:
//   * 'tree'  – a trusted session (one that once unlocked the vault, for 30 days from its last use) opens these freely,
//              with no idle lock: the tree, its people and links, relationships, roles, the forest, the non-private details.
//   * 'fresh' – always a fresh unlock (a passkey, or a Google sign-in from the last 10 minutes; then 15 minutes idle,
//              2 hours at most): documents and files, private items, privacy, linking trees, deleting a file, export.
//              (Deleting from the tree is soft since 2026-11-13: it opens like an edit.)
// An untrusted session needs a fresh unlock for everything, as before. The table below is the only place a route's
// level is decided; server/vault/test-access.mjs checks it and that every handler reads it.

export type Level = 'tree' | 'fresh';
export const TRUST_DAYS = 30;
export const TRUST_MS = TRUST_DAYS * 864e5;

export const ACCESS: Record<string, Level> = {
  // the tree, open on a trusted device
  tree: 'tree', personGet: 'tree', personSave: 'tree', linkAdd: 'tree', linkSave: 'tree',
  roles: 'tree', householdSave: 'tree', bridges: 'tree', forest: 'tree', related: 'tree',
  forestFor: 'tree',                                                                  // the forest search and the member card (server/family-find.ts): the forest's own level
  // deleting from the tree is soft now, with an undo and the owner's restore (the owner's rule of 2026-11-13), so it opens
  // like an edit; a change to another user's card waits for their yes, answered on their own trusted device
  personDelete: 'tree', linkDelete: 'tree', personRestore: 'tree',
  changesList: 'tree', changeApprove: 'tree', changeDecline: 'tree', changeCancel: 'tree',
  linkMove: 'tree', orderSave: 'tree',                                                // "סידור": a card to another generation (as a link change), the order along a row (ai-features)
  trashList: 'tree', trashRestore: 'tree',                                            // the owner, from the back door (its own biometric entry)
  // always a fresh unlock
  items: 'fresh', itemAdd: 'fresh', itemFile: 'fresh', itemSave: 'fresh', itemDelete: 'fresh', itemRestore: 'fresh',   // documents and files
  privacySave: 'fresh',                                                               // privacy
  bridgeAsk: 'fresh', bridgeApprove: 'fresh', bridgeConsent: 'fresh', bridgeDecline: 'fresh', bridgeRevoke: 'fresh',   // linking trees
  roleSave: 'fresh',                                                                  // who heads what: a change of rights
  auditLog: 'fresh', backups: 'fresh', backupsRun: 'fresh', driveDisconnect: 'fresh', // export and backups
  passkeyList: 'fresh', passkeyRemove: 'fresh',                                       // the keys themselves
};

/** is the session still trusted? (30 days from its last use) */
export const trusted = (until: number | null | undefined, now = Date.now()) => !!until && until > now;

/** a coarse name for a device, from its User-Agent – never the string itself: "Chrome · Windows" */
export function deviceLabel(ua: string | null | undefined): string {
  const s = String(ua || '');
  const browser = /Edg\//.test(s) ? 'Edge' : /OPR\/|Opera/.test(s) ? 'Opera' : /SamsungBrowser/.test(s) ? 'Samsung Internet'
    : /Firefox\//.test(s) ? 'Firefox' : /Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'דפדפן';
  const os = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Windows'
    : /Mac OS X|Macintosh/.test(s) ? 'Mac' : /CrOS/.test(s) ? 'ChromeOS' : /Linux/.test(s) ? 'Linux' : 'מכשיר';
  const app = /Electron\//.test(s) ? ' (האפליקציה למחשב)' : '';
  return `${browser} · ${os}${app}`;
}
