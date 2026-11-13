// חיפוש ביער and the member card (the CEO's tree batch, 2026-11-14). Both read only the viewer's forest as
// /api/vault/forest already shows it (kin.view per card), so neither can show more than the tree does:
// - the search drops anonymous and identity-hidden cards, needs two letters, and is rate-limited per person;
// - the card is one person's view, as this viewer may see them; never an email, files only inside their household.

import { Ctx, HttpError, json } from './core';
import { forestFor, rateLimit } from './vault';
import * as F from './family-find-rules';

/** GET /api/family/find?q=&kin=1&users=1: the people of the viewer's forest whose name answers q */
export async function find(ctx: Ctx) {
  const p = ctx.url.searchParams;
  const q = F.cleanQuery(p.get('q'));
  if (!q) throw new HttpError(400, 'query_too_short');
  const w = await forestFor(ctx);
  await rateLimit(ctx, 'find:' + w.u.email, 40, 60_000);
  const cands: F.Candidate[] = w.people.map((x) => ({
    pid: x.pid, root: x.root, mine: x.household === w.u.household, name: x.name, anonymous: x.anonymous, hidden: x.hidden,
    user: w.user(x), self: x.household === w.u.household && x.member === w.u.email,
  }));
  const isKin = (root: string) => !!w.me && root !== w.me && !!w.kin.pathBetween(w.me, root);
  const found = F.find(cands, q, { kinOnly: p.get('kin') === '1', usersOnly: p.get('users') === '1' }, isKin);
  const houseOf = new Map(w.people.map((x) => [x.pid, x.household]));
  const touched = new Set(found.map((c) => houseOf.get(c.pid)!));
  await w.audit(touched, 'view:find');
  return json({
    people: found.map((c) => {
      const h = houseOf.get(c.pid)!;
      return { id: c.pid, name: c.name, household: w.label(h), title: w.title(h), mine: c.mine, user: c.user, self: c.self,
        relation: w.me && c.root !== w.me ? w.kin.relationName(w.me, c.root) : null };
    }),
  });
}

/** GET /api/family/card?id=: one person's member card, in view mode, as this viewer may see them */
export async function card(ctx: Ctx) {
  const id = (ctx.url.searchParams.get('id') || '').slice(0, 80);
  if (!id) throw new HttpError(404, 'not_found');
  const w = await forestFor(ctx);
  await rateLimit(ctx, 'card:' + w.u.email, 90, 60_000);
  const x = w.people.find((p) => p.pid === id);
  if (!x) throw new HttpError(404, 'not_found');
  const mine = x.household === w.u.household, self = mine && x.member === w.u.email;
  await w.audit(new Set([x.household]), 'view:card');
  return json({
    id: x.pid, name: x.name, sex: x.sex, anonymous: x.anonymous, hidden: x.hidden,
    details: x.details,                                   // already only what kin.view lets this viewer see
    household: w.label(x.household), title: w.title(x.household), mine, self, user: F.showUser(x, w.user(x)),
    photo: mine ? x.photo : null,                         // files (and so the photo) never leave their household
    relation: w.me && x.root !== w.me ? w.kin.relationName(w.me, x.root) : null,
  });
}
