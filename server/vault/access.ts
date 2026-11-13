// The family tree on a trusted device (the owner's decision, batch 2 item 4; docs/decisions.md). Two levels:
//   * 'tree'  – a trusted session (one that once unlocked the vault, for 30 days from its last use) opens these freely,
//              with no idle lock: the tree, its people and links, relationships, roles, the forest, the non-private details.
//   * 'fresh' – always a fresh unlock (a passkey, or a Google sign-in from the last 10 minutes; then 15 minutes idle,
//              2 hours at most): documents and files, private items, privacy, linking trees, every delete, export.
// An untrusted session needs a fresh unlock for everything, as before. The table below is the only place a route's
// level is decided; server/vault/test-access.mjs checks it and that every handler reads it.

export type Level = 'tree' | 'fresh';
export const TRUST_DAYS = 30;
export const TRUST_MS = TRUST_DAYS * 864e5;

export const ACCESS: Record<string, Level> = {
  // the tree, open on a trusted device
  tree: 'tree', personGet: 'tree', personSave: 'tree', linkAdd: 'tree', linkSave: 'tree',
  roles: 'tree', householdSave: 'tree', bridges: 'tree', forest: 'tree', related: 'tree',
  // always a fresh unlock
  personDelete: 'fresh', linkDelete: 'fresh',                                         // any delete
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
