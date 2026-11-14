// Which apps are gated, and who may open them (pure: tested by server/test-app-access.mjs).
// The catalogue in public/assets/apps.js marks an app access: 'beta' (in development, for the owner's testers) or
// 'secret' (only for whom the owner allowed it). The server keeps its own copy here, because the page is never the judge:
// the test checks that the two agree. A beta app is opened by the leave 'beta'; a secret app by its own address.

export type Access = 'beta' | 'secret';
export type Gate = { access: Access; api: string[] };

/** the gated apps: the page's address → its access and the API prefixes that belong to it only */
export const GATED: Record<string, Gate> = {
  '/mail/': { access: 'beta', api: ['/api/mail/'] },
  '/pc/': { access: 'beta', api: [] },              // a guide page, with no API of its own
};

/** the leave that opens this app: 'beta' for a beta app, the address itself for a secret one, null for an open app */
export function leaveFor(href: string): string | null {
  const g = GATED[href];
  return g ? (g.access === 'beta' ? 'beta' : href) : null;
}

/** may a person with these leaves open the app? The owner may open everything */
export function mayOpen(href: string, owner: boolean, leaves: readonly string[]): boolean {
  const k = leaveFor(href);
  return !k || owner || leaves.includes(k);
}

/** the leaves the owner can give: 'beta', and each secret app's address */
export function grantable(): string[] {
  return ['beta', ...Object.keys(GATED).filter((h) => GATED[h].access === 'secret')];
}

/** the gated app an API path belongs to, or null */
export function appOfPath(path: string): string | null {
  for (const [href, g] of Object.entries(GATED)) if (g.api.some((p) => path.startsWith(p))) return href;
  return null;
}
